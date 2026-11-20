'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  TCG RULES ENGINE — standard play:
//  60-card decks · 6 prizes · Active + up to 5 Bench · 1 Energy per turn ·
//  1 Supporter per turn (not on the very first turn) · 1 retreat per turn ·
//  no attacking on the first player's first turn · evolution (not on your
//  first turn or on a Pokémon put into play/evolved this turn) · Rare Candy ·
//  weakness ×2 / resistance −30 · Special Conditions + Pokémon Checkup ·
//  win by taking all prizes, KO'ing the last Pokémon, or opponent deck-out.
//
//  Choices are delegated to an `io` object (UI for humans, AI for bots):
//    io.promote(pi) → benchIdx            io.pickCard(pi, title, cards, optional) → idx|null
//    io.pickInst(pi, title, insts, optional) → idx|null      io.coin(heads) / io.log(msg)
// ════════════════════════════════════════════════════════════════════════════
const TCG = (() => {
  const PRIZES = 6, BENCH = 5;
  let uidN = 0;

  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const inst = (card, turn) => ({uid: ++uidN, card, stack: [], energy: [], dmg: 0, sp: null, psn: false, brn: false,
    parTurn: 0, playedTurn: turn, evolvedTurn: -1, lockTurn: -1});
  const hpLeft = i => i.card.hp - i.dmg;
  const inPlay = P => (P.active ? [P.active] : []).concat(P.bench);
  const isBasic = c => c.kind === 'pokemon' && c.stage === 0;

  function create(decks, names, rng = Math.random, aiFlags = [false, true]) {
    const s = {players: [0, 1].map(i => ({name: names[i], deck: shuffle(Cards.deckList(decks[i]).slice(), rng), hand: [], discard: [],
      prizes: [], active: null, bench: [], energyDone: false, supporterDone: false, retreatDone: false, isAI: aiFlags[i], mulligans: 0})),
      cur: 0, turn: 0, winner: null, reason: '', log: [], rng, phase: 'setup'};
    return s;
  }
  const say = (s, io, msg) => { s.log.push(msg); if (s.log.length > 60) s.log.shift(); io && io.log && io.log(msg); };
  const flip = async (s, io) => { const h = s.rng() < .5; say(s, io, `Coin flip: ${h ? 'HEADS' : 'TAILS'}`); if (io && io.coin) await io.coin(h); return h; };

  function draw(s, pi, n = 1) {
    const P = s.players[pi];
    let k = 0;
    for (; k < n && P.deck.length; k++) P.hand.push(P.deck.shift());
    return k;
  }

  // ── setup ────────────────────────────────────────────────────────────────
  function openingHands(s) {
    for (const P of s.players) {
      for (;;) {
        P.hand = []; P.deck = shuffle(P.deck.concat(P.hand), s.rng);
        P.hand = P.deck.splice(0, 7);
        if (P.hand.some(isBasic)) break;
        P.deck = shuffle(P.deck.concat(P.hand), s.rng); P.hand = [];
        P.mulligans++;
        if (P.mulligans > 20) break;
      }
    }
    // each mulligan lets the opponent draw an extra card
    s.players.forEach((P, i) => { const extra = s.players[1 - i].mulligans; if (extra) draw(s, i, extra); });
  }
  function setActive(s, pi, handIdx) {
    const P = s.players[pi], c = P.hand[handIdx];
    if (!c || !isBasic(c) || P.active) return false;
    P.hand.splice(handIdx, 1); P.active = inst(c, 0); return true;
  }
  function benchBasic(s, pi, handIdx) {
    const P = s.players[pi], c = P.hand[handIdx];
    if (!c || !isBasic(c) || P.bench.length >= BENCH) return false;
    P.hand.splice(handIdx, 1); P.bench.push(inst(c, s.turn)); return true;
  }
  async function begin(s, io, first) {
    for (const P of s.players) P.prizes = P.deck.splice(0, PRIZES);
    s.cur = first; s.turn = 1; s.phase = 'play';
    say(s, io, `${s.players[first].name} goes first.`);
    await startTurn(s, io);
  }

  // ── turn structure ───────────────────────────────────────────────────────
  async function startTurn(s, io) {
    const P = s.players[s.cur];
    P.energyDone = P.supporterDone = P.retreatDone = false;
    if (!draw(s, s.cur)) return end(s, 1 - s.cur, `${P.name} has no cards left to draw`);
    say(s, io, `— Turn ${s.turn}: ${P.name} —`);
  }
  function end(s, winner, reason) { s.winner = winner; s.reason = reason; s.phase = 'over'; }

  async function endTurn(s, io) {
    if (s.winner !== null) return;
    await checkup(s, io);
    if (s.winner !== null) return;
    await resolveKOs(s, io);
    if (s.winner !== null) return;
    s.cur = 1 - s.cur; s.turn++;
    await startTurn(s, io);
  }

  async function checkup(s, io) {
    for (const pi of [s.cur, 1 - s.cur]) {
      const a = s.players[pi].active;
      if (!a) continue;
      const nm = a.card.name;
      if (a.psn) { a.dmg += 10; say(s, io, `${nm} takes 10 Poison damage.`); }
      if (a.brn) {
        a.dmg += 20; say(s, io, `${nm} takes 20 Burn damage.`);
        if (await flip(s, io)) { a.brn = false; say(s, io, `${nm} is no longer Burned.`); }
      }
      if (a.sp === 'slp') { if (await flip(s, io)) { a.sp = null; say(s, io, `${nm} woke up!`); } else say(s, io, `${nm} is still Asleep.`); }
      if (a.sp === 'par' && pi === s.cur && a.parTurn < s.turn) { a.sp = null; say(s, io, `${nm} is no longer Paralyzed.`); }
    }
  }

  // Knock Outs: prizes, promotions, win checks
  async function resolveKOs(s, io) {
    for (const pi of [1 - s.cur, s.cur]) {
      const P = s.players[pi], O = s.players[1 - pi];
      for (const x of inPlay(P).filter(i => hpLeft(i) <= 0)) {
        say(s, io, `${x.card.name} was Knocked Out!`);
        P.discard.push(x.card, ...x.stack, ...x.energy);
        if (P.active === x) P.active = null; else P.bench.splice(P.bench.indexOf(x), 1);
        const prize = O.prizes.shift();
        if (prize) { O.hand.push(prize); say(s, io, `${O.name} takes a Prize card (${O.prizes.length} left).`); }
      }
    }
    const [A, B] = s.players;
    const aOut = !A.active && !A.bench.length, bOut = !B.active && !B.bench.length;
    const aWin = !A.prizes.length || bOut, bWin = !B.prizes.length || aOut;
    if (aWin && bWin) return end(s, s.cur, 'took the final Prize card');
    if (aWin) return end(s, 0, !A.prizes.length ? 'took all Prize cards' : `${B.name} has no Pokémon left`);
    if (bWin) return end(s, 1, !B.prizes.length ? 'took all Prize cards' : `${A.name} has no Pokémon left`);
    for (const pi of [1 - s.cur, s.cur]) {
      const P = s.players[pi];
      if (!P.active && P.bench.length) {
        const k = P.bench.length === 1 ? 0 : await io.promote(pi);
        P.active = P.bench.splice(k ?? 0, 1)[0];
        say(s, io, `${P.name} sends out ${P.active.card.name}.`);
      }
    }
  }

  // ── queries ──────────────────────────────────────────────────────────────
  function canPay(cost, energy) {
    const pool = energy.map(e => e.type);
    const rest = [];
    for (const c of cost) {
      if (c === 'Colorless') { rest.push(c); continue; }
      const k = pool.indexOf(c);
      if (k < 0) return false;
      pool.splice(k, 1);
    }
    return pool.length >= rest.length;
  }
  function evoTargets(s, pi, card) {
    if (card.kind !== 'pokemon' || !card.from || s.turn <= 2) return [];
    return inPlay(s.players[pi]).filter(i => i.card.name === card.from && i.playedTurn < s.turn && i.evolvedTurn < s.turn);
  }
  function candyTargets(s, pi, hand) {
    if (s.turn <= 2) return [];
    const st2 = hand.filter(c => c.kind === 'pokemon' && c.stage === 2);
    return inPlay(s.players[pi]).filter(i => i.card.stage === 0 && i.playedTurn < s.turn && i.evolvedTurn < s.turn &&
      st2.some(c => Cards.byName(c.from)?.from === i.card.name));
  }
  function attackBlock(s, pi, a) {
    if (s.turn === 1) return 'You can’t attack on the first turn of the game.';
    if (a.sp === 'slp') return `${a.card.name} is Asleep.`;
    if (a.sp === 'par') return `${a.card.name} is Paralyzed.`;
    if (a.lockTurn === s.turn) return `${a.card.name} can’t attack this turn.`;
    return null;
  }
  const canAttack = (s, pi, k) => {
    const a = s.players[pi].active;
    return !!a && !attackBlock(s, pi, a) && !!a.card.attacks[k] && canPay(a.card.attacks[k].cost, a.energy);
  };
  function canRetreat(s, pi) {
    const P = s.players[pi], a = P.active;
    return !!a && !P.retreatDone && P.bench.length > 0 && a.sp !== 'slp' && a.sp !== 'par' && a.energy.length >= a.card.retreat;
  }
  function canPlayTrainer(s, pi, card) {
    const P = s.players[pi], O = s.players[1 - pi];
    if (card.sub === 'supporter' && (P.supporterDone || s.turn === 1)) return false;
    switch (card.key) {
      case 'potion': case 'super-potion': case 'pokemon-nurse': return inPlay(P).some(i => i.dmg > 0);
      case 'switch': return P.bench.length > 0;
      case 'full-heal': return !!P.active && (!!P.active.sp || P.active.psn || P.active.brn);
      case 'rare-candy': return candyTargets(s, pi, P.hand).length > 0;
      case 'energy-retrieval': return P.discard.some(c => c.kind === 'energy');
      case 'call-out': return O.bench.length > 0;
      case 'poke-ball': case 'great-ball': case 'energy-search': return P.deck.length > 0;
      case 'nest-ball': return P.bench.length < BENCH && P.deck.some(isBasic);
      case 'evolution-incense': return P.deck.some(c => c.kind === 'pokemon' && c.stage > 0);
      case 'energy-switch': return inPlay(P).length > 1 && inPlay(P).some(i => i.energy.length);
      case 'fresh-start': return P.deck.length + P.hand.length > 0;
      case 'professors-notes': case 'helpful-friend': case 'pep-talk': return P.deck.length > 0;
    }
    return true;
  }

  // ── actions (all return true on success) ─────────────────────────────────
  function playBasic(s, pi, handIdx, io) {
    const c = s.players[pi].hand[handIdx];
    if (!benchBasic(s, pi, handIdx)) return false;
    say(s, io, `${s.players[pi].name} puts ${c.name} on the Bench.`); return true;
  }
  function evolve(s, pi, handIdx, target, io, viaCandy = false) {
    const P = s.players[pi], c = P.hand[handIdx];
    if (!viaCandy && !evoTargets(s, pi, c).includes(target)) return false;
    P.hand.splice(handIdx, 1);
    target.stack.push(target.card); target.card = c; target.evolvedTurn = s.turn;
    target.sp = null; target.psn = false; target.brn = false;
    say(s, io, `${target.stack[target.stack.length - 1].name} evolved into ${c.name}!`); return true;
  }
  function attach(s, pi, handIdx, target, io) {
    const P = s.players[pi], c = P.hand[handIdx];
    if (!c || c.kind !== 'energy' || P.energyDone || !inPlay(P).includes(target)) return false;
    P.hand.splice(handIdx, 1); target.energy.push(c); P.energyDone = true;
    say(s, io, `${P.name} attaches ${c.name} to ${target.card.name}.`); return true;
  }
  function retreat(s, pi, benchIdx, io) {
    const P = s.players[pi], a = P.active;
    if (!canRetreat(s, pi) || !P.bench[benchIdx]) return false;
    // discard energy for the retreat cost (Colorless — prefer surplus types)
    for (let k = 0; k < a.card.retreat; k++) P.discard.push(a.energy.pop());
    a.sp = null; a.psn = false; a.brn = false;
    P.active = P.bench.splice(benchIdx, 1, a)[0];
    P.retreatDone = true;
    say(s, io, `${a.card.name} retreats. ${P.active.card.name} is now Active.`); return true;
  }

  async function playTrainer(s, pi, handIdx, io) {
    const P = s.players[pi], O = s.players[1 - pi], c = P.hand[handIdx];
    if (!c || c.kind !== 'trainer' || !canPlayTrainer(s, pi, c)) return false;
    P.hand.splice(handIdx, 1);
    say(s, io, `${P.name} plays ${c.name}.`);
    if (c.sub === 'supporter') P.supporterDone = true;
    const heal = async (amt, then) => {
      const ts = inPlay(P).filter(i => i.dmg > 0);
      const k = ts.length === 1 ? 0 : await io.pickInst(pi, `Heal which Pokémon?`, ts, false, 'heal');
      const t = ts[k ?? 0];
      const h = Math.min(t.dmg, amt); t.dmg -= h;
      say(s, io, `${t.card.name} is healed ${h} damage.`);
      then && then(t);
    };
    const search = async (filter, title, ctx) => {
      const opts = P.deck.filter(filter);
      if (opts.length) {
        const k = await io.pickCard(pi, title, opts, true, ctx);
        if (k !== null && k !== undefined) { const card = opts[k]; P.deck.splice(P.deck.indexOf(card), 1); P.hand.push(card); say(s, io, `${P.name} puts ${card.name} into their hand.`); }
      } else say(s, io, 'Nothing found.');
      shuffle(P.deck, s.rng);
    };
    switch (c.key) {
      case 'potion': await heal(30); break;
      case 'super-potion': await heal(60, t => { if (t.energy.length) P.discard.push(t.energy.pop()); }); break;
      case 'pokemon-nurse': await heal(999, t => { P.discard.push(...t.energy); t.energy = []; }); break;
      case 'switch': {
        const k = P.bench.length === 1 ? 0 : await io.pickInst(pi, 'Switch in which Pokémon?', P.bench, false, 'switch');
        const a = P.active; a.sp = null; a.psn = false; a.brn = false;
        P.active = P.bench.splice(k ?? 0, 1, a)[0];
        say(s, io, `${P.active.card.name} is now Active.`); break;
      }
      case 'call-out': {
        const k = O.bench.length === 1 ? 0 : await io.pickInst(pi, 'Drag out which Pokémon?', O.bench, false, 'callout');
        const a = O.active; a.sp = null; a.psn = false; a.brn = false;
        O.active = O.bench.splice(k ?? 0, 1, a)[0];
        say(s, io, `${O.active.card.name} is dragged into the Active Spot!`); break;
      }
      case 'full-heal': P.active.sp = null; P.active.psn = false; P.active.brn = false; say(s, io, `${P.active.card.name} recovered.`); break;
      case 'poke-ball':
        if (await flip(s, io)) await search(x => x.kind === 'pokemon', 'Take a Pokémon from your deck', 'pokemon');
        else shuffle(P.deck, s.rng);
        break;
      case 'great-ball': {
        const top = P.deck.slice(0, 7), pk = top.filter(x => x.kind === 'pokemon');
        if (pk.length) {
          const k = await io.pickCard(pi, 'Top 7 cards — take a Pokémon', pk, true, 'pokemon');
          if (k !== null && k !== undefined) { P.deck.splice(P.deck.indexOf(pk[k]), 1); P.hand.push(pk[k]); say(s, io, `${P.name} takes ${pk[k].name}.`); }
        } else say(s, io, 'No Pokémon in the top 7 cards.');
        shuffle(P.deck, s.rng); break;
      }
      case 'nest-ball': {
        const opts = P.deck.filter(isBasic);
        const k = opts.length ? await io.pickCard(pi, 'Put a Basic Pokémon onto your Bench', opts, true, 'basic') : null;
        if (k !== null && k !== undefined) { P.deck.splice(P.deck.indexOf(opts[k]), 1); P.bench.push(inst(opts[k], s.turn)); say(s, io, `${opts[k].name} is placed on the Bench.`); }
        shuffle(P.deck, s.rng); break;
      }
      case 'evolution-incense': await search(x => x.kind === 'pokemon' && x.stage > 0, 'Take an Evolution Pokémon', 'evolution'); break;
      case 'energy-switch': {
        const from = inPlay(P).filter(i => i.energy.length);
        const fi = from.length === 1 ? 0 : await io.pickInst(pi, 'Move Energy from…', from, false, 'eswitch-from');
        const src = from[fi ?? 0];
        const to = inPlay(P).filter(i => i !== src);
        const ti = to.length === 1 ? 0 : await io.pickInst(pi, 'Move it to…', to, false, 'eswitch-to');
        const dst = to[ti ?? 0];
        const ei = src.energy.length === 1 ? 0 : await io.pickCard(pi, 'Which Energy?', src.energy, false, 'energy');
        const [e] = src.energy.splice(ei ?? 0, 1);
        dst.energy.push(e);
        say(s, io, `${e.name} moves from ${src.card.name} to ${dst.card.name}.`);
        break;
      }
      case 'fresh-start':
        for (const [k, Q] of s.players.entries()) { Q.deck = shuffle(Q.deck.concat(Q.hand), s.rng); Q.hand = []; draw(s, k, 4); }
        say(s, io, 'Both players shuffle their hands away and draw 4 cards.');
        break;
      case 'energy-search': await search(x => x.kind === 'energy', 'Take a basic Energy', 'energy'); break;
      case 'energy-retrieval': {
        for (let n = 0; n < 2; n++) {
          const opts = P.discard.filter(x => x.kind === 'energy');
          if (!opts.length) break;
          const k = await io.pickCard(pi, `Retrieve Energy (${n + 1}/2)`, opts, true, 'energy');
          if (k === null || k === undefined) break;
          P.discard.splice(P.discard.indexOf(opts[k]), 1); P.hand.push(opts[k]);
        }
        break;
      }
      case 'rare-candy': {
        const ts = candyTargets(s, pi, P.hand);
        const ti = ts.length === 1 ? 0 : await io.pickInst(pi, 'Rare Candy: choose a Basic Pokémon', ts, false, 'candy');
        const t = ts[ti ?? 0];
        const opts = P.hand.filter(x => x.kind === 'pokemon' && x.stage === 2 && Cards.byName(x.from)?.from === t.card.name);
        const k = opts.length === 1 ? 0 : await io.pickCard(pi, 'Evolve into…', opts, false, 'evolve');
        evolve(s, pi, P.hand.indexOf(opts[k ?? 0]), t, io, true);
        break;
      }
      case 'professors-notes': P.discard.push(...P.hand); P.hand = []; draw(s, pi, 7); say(s, io, `${P.name} draws a fresh hand of ${P.hand.length}.`); break;
      case 'helpful-friend': say(s, io, `${P.name} draws ${draw(s, pi, 3)} cards.`); break;
      case 'pep-talk': P.deck = shuffle(P.deck.concat(P.hand), s.rng); P.hand = []; draw(s, pi, 6); say(s, io, `${P.name} draws 6 cards.`); break;
    }
    P.discard.push(c);
    return true;
  }

  async function attack(s, pi, k, io) {
    if (!canAttack(s, pi, k) || s.cur !== pi) return false;
    const P = s.players[pi], O = s.players[1 - pi], a = P.active, d = O.active, atk = a.card.attacks[k];
    say(s, io, `${a.card.name} uses ${atk.name}!`);
    if (io.attackFx) await io.attackFx(pi, atk);
    let hit = true;
    if (a.sp === 'cnf') {
      say(s, io, `${a.card.name} is Confused…`);
      if (!await flip(s, io)) { a.dmg += 30; say(s, io, `It hurt itself for 30 damage!`); hit = false; }
    }
    if (hit) {
      let dmg = atk.dmg;
      if (atk.fx.multi) {
        let heads = 0;
        for (let n = 0; n < atk.fx.multi.flips; n++) if (await flip(s, io)) heads++;
        dmg = heads * atk.fx.multi.per;
      }
      if (dmg > 0) {
        if (d.card.weak === a.card.type) { dmg *= 2; say(s, io, 'It’s super effective! (Weakness ×2)'); }
        if (d.card.resist === a.card.type) { dmg = Math.max(0, dmg - 30); say(s, io, 'Resistance −30.'); }
      }
      if (dmg > 0) { d.dmg += dmg; say(s, io, `${d.card.name} takes ${dmg} damage.`); if (io.damageFx) await io.damageFx(1 - pi, dmg); }
      else if (atk.dmg > 0 || atk.fx.multi) say(s, io, 'No damage.');
      const fx = atk.fx;
      if (fx.status && hpLeft(d) > 0 && (!fx.coin || await flip(s, io))) {
        if (fx.status === 'psn') d.psn = true;
        else if (fx.status === 'brn') d.brn = true;
        else { d.sp = fx.status; if (fx.status === 'par') d.parTurn = s.turn; }
        say(s, io, `${d.card.name} is now ${{par: 'Paralyzed', slp: 'Asleep', cnf: 'Confused', psn: 'Poisoned', brn: 'Burned'}[fx.status]}!`);
      }
      if (fx.heal) { const h = Math.min(a.dmg, fx.heal); a.dmg -= h; if (h) say(s, io, `${a.card.name} heals ${h} damage.`); }
      if (fx.self) { a.dmg += fx.self; say(s, io, `${a.card.name} takes ${fx.self} recoil damage.`); }
      if (fx.lock) a.lockTurn = s.turn + 2;
    }
    await resolveKOs(s, io);
    await endTurn(s, io);
    return true;
  }

  return {create, openingHands, setActive, benchBasic, begin, endTurn, playBasic, evolve, attach, retreat, playTrainer, attack,
    canPay, canAttack, attackBlock, canRetreat, canPlayTrainer, evoTargets, candyTargets, inPlay, hpLeft, isBasic, BENCH, PRIZES, say};
})();
