'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  TCG AI — heuristic opponent. Plays one turn through the public engine API.
// ════════════════════════════════════════════════════════════════════════════
const TCGAI = (() => {
  const E = () => TCG;

  function missing(cost, energy) {
    // energy types still needed to pay `cost` with what's attached
    const pool = energy.map(e => e.type), need = [];
    let colorless = 0;
    for (const c of cost) {
      if (c === 'Colorless') { colorless++; continue; }
      const k = pool.indexOf(c);
      if (k >= 0) pool.splice(k, 1); else need.push(c);
    }
    for (let i = pool.length; i < colorless; i++) need.push('Colorless');
    return need;
  }
  function expectedDamage(a, atk, d) {
    let dmg = atk.fx.multi ? atk.fx.multi.flips * atk.fx.multi.per / 2 : atk.dmg;
    if (dmg > 0 && d.card.weak === a.card.type) dmg *= 2;
    if (dmg > 0 && d.card.resist === a.card.type) dmg = Math.max(0, dmg - 30);
    return dmg;
  }
  const value = i => i.card.hp + i.card.stage * 40 + i.energy.length * 25;
  const strongest = c => c.attacks[c.attacks.length - 1];

  // io callbacks used while the AI resolves card effects
  function io(s, pi, base = {}) {
    return {
      ...base,
      promote: async (who = pi) => {
        const B = s.players[who].bench, foe = s.players[1 - who].active;
        let best = 0, bv = -1;
        B.forEach((b, k) => {
          const ready = b.card.attacks.some(a => E().canPay(a.cost, b.energy));
          const v = value(b) + (ready ? 200 : 0) + (foe && foe.card.weak === b.card.type ? 80 : 0) - b.dmg;
          if (v > bv) { bv = v; best = k; }
        });
        return best;
      },
      pickCard: async (p, title, cards, optional, ctx) => {
        if (!cards.length) return null;
        const P = s.players[pi];
        const pokes = c => (P.deck.concat(P.hand).some(x => x.from === c.name) ? 100 : 0) + c.hp;
        if (ctx === 'basic') return cards.reduce((b, c, i) => (pokes(c) > pokes(cards[b]) ? i : b), 0);
        if (ctx === 'energy') {
          const want = neededTypes(s, pi);
          const k = cards.findIndex(c => want.includes(c.type));
          return k >= 0 ? k : 0;
        }
        // prefer evolutions of things in play, then basics if the bench has room, then the biggest card
        const names = E().inPlay(P).map(i => i.card.name);
        let k = cards.findIndex(c => c.kind === 'pokemon' && c.from && names.includes(c.from));
        if (k < 0 && P.bench.length < 5) k = cards.findIndex(c => c.kind === 'pokemon' && c.stage === 0);
        if (k < 0) k = cards.reduce((b, c, i) => (c.hp || 0) > (cards[b].hp || 0) ? i : b, 0);
        return k;
      },
      pickInst: async (p, title, insts, optional, ctx) => {
        if (ctx === 'heal') return insts.reduce((b, x, i) => x.dmg > insts[b].dmg ? i : b, 0);
        if (ctx === 'callout') {
          const a = s.players[pi].active;
          const score = d => {
            const dm = Math.max(...a.card.attacks.map(at => expectedDamage(a, at, d)));
            return (dm >= E().hpLeft(d) ? 1000 : 0) + value(d) - E().hpLeft(d);
          };
          return insts.reduce((b, x, i) => score(x) > score(insts[b]) ? i : b, 0);
        }
        if (ctx === 'eswitch-from') { // take from a benched Pokémon with surplus, never from a ready Active
          const a = s.players[pi].active;
          const k = insts.findIndex(x => x !== a);
          return k >= 0 ? k : 0;
        }
        if (ctx === 'eswitch-to') { const a = s.players[pi].active; const k = insts.indexOf(a); return k >= 0 ? k : 0; }
        if (ctx === 'switch') return insts.reduce((b, x, i) => value(x) - x.dmg > value(insts[b]) - insts[b].dmg ? i : b, 0);
        return insts.reduce((b, x, i) => value(x) > value(insts[b]) ? i : b, 0);
      },
    };
  }

  function neededTypes(s, pi) {
    const P = s.players[pi];
    const out = [];
    for (const i of E().inPlay(P)) out.push(...missing(strongest(i.card).cost, i.energy));
    return out.length ? out : ['Colorless'];
  }

  async function takeTurn(s, pi, baseIO, pause = async () => {}) {
    const P = s.players[pi], O = s.players[1 - pi];
    const myIO = baseIO.promote ? baseIO : dispatch(s, {}, baseIO);
    const T = E();
    const handIdx = pred => P.hand.findIndex(pred);
    const play = async key => {
      const k = handIdx(c => c.kind === 'trainer' && c.key === key);
      if (k >= 0 && T.canPlayTrainer(s, pi, P.hand[k])) { await T.playTrainer(s, pi, k, myIO); await pause(); return true; }
      return false;
    };
    if (s.winner !== null) return;

    const a = () => P.active;
    const benchAll = async () => {
      for (let k; (k = handIdx(c => T.isBasic(c))) >= 0 && P.bench.length < T.BENCH;) { T.playBasic(s, pi, k, myIO); await pause(); }
    };
    const evolveAll = async () => {
      while (T.candyTargets(s, pi, P.hand).length && await play('rare-candy'));
      for (let guard = 0; guard < 10; guard++) {
        const k = handIdx(c => c.kind === 'pokemon' && T.evoTargets(s, pi, c).length);
        if (k < 0) break;
        const tgt = T.evoTargets(s, pi, P.hand[k]).sort((a, b) => b.energy.length - a.energy.length)[0];
        T.evolve(s, pi, k, tgt, myIO); await pause();
      }
    };

    // 1. Develop the board with what's in hand
    await benchAll(); await evolveAll();
    // 2. Search items, then draw power when the hand is thin
    while (P.bench.length < 4 && await play('nest-ball'));
    if (P.bench.length < 4 || P.hand.some(c => c.stage > 0)) { await play('great-ball'); await play('poke-ball'); }
    if (!P.hand.some(c => c.kind === 'energy')) { await play('energy-search') || await play('energy-retrieval'); }
    if (P.hand.length <= 3) await play('professors-notes') || await play('pep-talk') || await play('helpful-friend');
    else if (P.hand.length <= 6) await play('helpful-friend') || await play('pep-talk');
    if (!P.hand.some(c => c.kind === 'pokemon' && c.stage > 0) && T.inPlay(P).some(i => i.card.stage < 2)) await play('evolution-incense');
    if (!P.supporterDone && P.hand.length <= 3 && O.hand.length >= 6) await play('fresh-start');
    // 3. Develop again with the new cards
    await benchAll(); await evolveAll();
    // Energy Switch: pull energy onto the Active if that turns on an attack
    if (a() && !a().card.attacks.some(x => T.canPay(x.cost, a().energy)) && P.bench.some(b => b.energy.length)) {
      const need = missing(strongest(a().card).cost, a().energy);
      if (need.length === 1 && P.bench.some(b => b.energy.some(e => need[0] === 'Colorless' || e.type === need[0]))) await play('energy-switch');
    }

    // 5. Healing / conditions
    if (a() && (a().sp || a().psn || a().brn) && a().sp !== 'cnf') await play('full-heal');
    if (a() && a().dmg >= 40 && T.hpLeft(a()) <= 60) await play('super-potion') || await play('potion');
    if (a() && a().dmg >= a().card.hp / 2 && a().energy.length <= 1) await play('pokemon-nurse');

    // 6. Attach energy where it gets an attack online soonest
    if (!P.energyDone) {
      const cands = T.inPlay(P).map(i => ({i, need: missing(strongest(i.card).cost, i.energy),
        needLow: missing(i.card.attacks[0].cost, i.energy)}));
      const pickEnergy = need => handIdx(c => c.kind === 'energy' && (need.includes(c.type) || need.includes('Colorless')));
      let done = false;
      const order = cands.sort((x, y) => (x.i === a() ? -1 : 0) - (y.i === a() ? -1 : 0) ||
        (x.need.length || 99) - (y.need.length || 99) || y.i.card.stage - x.i.card.stage);
      for (const c of order) {
        if (!c.need.length) continue;
        const k = pickEnergy(c.need);
        if (k >= 0) { T.attach(s, pi, k, c.i, myIO); done = true; await pause(); break; }
      }
      if (!done) {
        const k = handIdx(c => c.kind === 'energy');
        if (k >= 0 && order.length) { T.attach(s, pi, k, order[0].i, myIO); await pause(); }
      }
    }

    // 7. Retreat / switch if the active can't do anything useful
    const usable = i => i.card.attacks.some(x => T.canPay(x.cost, i.energy));
    if (a() && !usable(a()) || (a() && a().sp && a().sp !== 'cnf')) {
      const ready = P.bench.findIndex(usable);
      if (ready >= 0) {
        if (T.canRetreat(s, pi) && a().card.retreat <= 1) { T.retreat(s, pi, ready, myIO); await pause(); }
        else if (P.hand.some(c => c.key === 'switch')) await play('switch');
      }
    }

    // 8. Gust a weak benched target if we can KO it
    if (a() && O.bench.length && !P.supporterDone && P.hand.some(c => c.key === 'call-out')) {
      const best = Math.max(0, ...a().card.attacks.filter(x => T.canPay(x.cost, a().energy)).map(x => x.dmg));
      if (best && O.bench.some(d => best >= T.hpLeft(d)) && !(best >= T.hpLeft(O.active))) await play('call-out');
    }

    // 9. Attack with the best option
    if (a() && O.active && s.winner === null) {
      let bestK = -1, bestV = -1;
      a().card.attacks.forEach((x, k) => {
        if (!T.canAttack(s, pi, k)) return;
        const dm = expectedDamage(a(), x, O.active);
        const v = dm + (dm >= T.hpLeft(O.active) ? 500 : 0) + (x.fx.status ? 15 : 0) - (x.fx.self || 0) * .5;
        if (v > bestV) { bestV = v; bestK = k; }
      });
      if (bestK >= 0) { await T.attack(s, pi, bestK, myIO); return; }
    }
    await T.endTurn(s, myIO);
  }

  // Setup for an AI player: best basic active, rest benched
  function setup(s, pi) {
    const P = s.players[pi];
    const basics = P.hand.map((c, k) => ({c, k})).filter(x => TCG.isBasic(x.c));
    const best = basics.reduce((b, x) => x.c.hp > b.c.hp ? x : b, basics[0]);
    TCG.setActive(s, pi, best.k);
    for (let k; (k = P.hand.findIndex(TCG.isBasic)) >= 0 && P.bench.length < TCG.BENCH;) TCG.benchBasic(s, pi, k);
  }

  // An io that routes each choice to the AI or to `human` depending on who is choosing
  function dispatch(s, human = {}, base = {}) {
    const ai = who => io(s, who, base);
    const route = name => (who, ...rest) => s.players[who].isAI ? ai(who)[name](who, ...rest) : human[name](who, ...rest);
    return {...base, promote: route('promote'), pickCard: route('pickCard'), pickInst: route('pickInst')};
  }

  return {takeTurn, setup, io, dispatch, missing, expectedDamage};
})();
