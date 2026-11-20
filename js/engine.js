'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  BATTLE ENGINE — pure game mechanics, no DOM. Every random roll goes
//  through the `rng` argument so the engine is deterministic under test.
//
//  A "side" is {key:'p'|'e', name, mon, vol}. `vol` holds volatile battle
//  state that resets on switch-out (stat stages, confusion, flinch…).
//  runMove/endOfTurn return a list of events that the battle UI animates:
//    {k:'msg',text} {k:'use',who,move} {k:'dmg',who,amount,eff,crit}
//    {k:'heal',who,amount} {k:'status',who,status} {k:'cure',who}
//    {k:'stat',who,stat,change}
// ════════════════════════════════════════════════════════════════════════════
const Engine = (() => {
  const STAT_MAP = {'attack':'atk','defense':'def','special-attack':'spa','special-defense':'spd',
    'speed':'spe','accuracy':'acc','evasion':'eva'};
  const STAT_LABEL = {atk:'Attack',def:'Defense',spa:'Sp. Atk',spd:'Sp. Def',spe:'Speed',acc:'accuracy',eva:'evasiveness'};
  const SELF_TARGETS = new Set(['user','users-field','user-and-allies','all-allies','ally','user-or-ally','entire-field','opponents-field']);
  const STRUGGLE = {id:165,key:'struggle',name:'Struggle',type:'normal',power:50,acc:null,pp:1,maxPp:1,cat:'physical',
    prio:0,target:'selected-pokemon',ail:null,ailChance:0,flinch:0,drain:-25,heal:0,crit:0,minHits:null,maxHits:null,stats:[],statChance:0,mcat:'damage'};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ── stats & levels ───────────────────────────────────────────────────────
  const typeEff = (mt, dts) => dts.reduce((m, t) => m * (EFF[mt]?.[t] ?? 1), 1);
  const calcStat = (base, iv, lv, isHp) =>
    isHp ? Math.floor((2 * base + iv) * lv / 100) + lv + 10 : Math.floor((2 * base + iv) * lv / 100) + 5;
  const expAt = lv => lv <= 1 ? 0 : lv ** 3;
  const stageMult = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
  const accMult = s => s >= 0 ? (3 + s) / 3 : 3 / (3 - s);
  const newVol = () => ({stages:{atk:0,def:0,spa:0,spd:0,spe:0,acc:0,eva:0}, confused:0, flinch:false, recharge:false});

  function refresh(mon) {
    const b = mon.bs, iv = mon.ivs || {}, lv = mon.level;
    const oldMax = mon.stats ? mon.stats.hp : null;
    mon.stats = {hp: calcStat(b.hp, iv.hp || 0, lv, true)};
    for (const k of ['atk','def','spa','spd','spe']) mon.stats[k] = calcStat(b[k], iv[k] || 0, lv, false);
    if (oldMax === null) mon.hp = mon.stats.hp;
    else if (mon.hp > 0) mon.hp = clamp(mon.hp + (mon.stats.hp - oldMax), 1, mon.stats.hp);
    return mon;
  }
  function randIVs(rng = Math.random, floor = 0) {
    const iv = {};
    for (const k of ['hp','atk','def','spa','spd','spe']) iv[k] = floor + Math.floor(rng() * (32 - floor));
    return iv;
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function createMon(sp, level, moveList, opts = {}) {
    const mon = {
      uid: uid(), id: sp.id, name: sp.name, nick: null, types: [...sp.types], bs: {...sp.bs},
      ivs: opts.ivs || randIVs(opts.rng), level, exp: expAt(level), status: null, sleep: 0,
      shiny: !!opts.shiny, capture: sp.capture, baseExp: sp.baseExp,
      moves: moveList.slice(0, 4).map(m => ({...m, pp: m.pp, maxPp: m.pp})),
    };
    return refresh(mon);
  }
  function evolveInto(mon, sp) {
    Object.assign(mon, {id: sp.id, name: sp.name, types: [...sp.types], bs: {...sp.bs},
      capture: sp.capture, baseExp: sp.baseExp});
    return refresh(mon);
  }
  function healFull(mon) {
    mon.hp = mon.stats.hp; mon.status = null; mon.sleep = 0;
    mon.moves.forEach(m => { m.pp = m.maxPp; });
  }
  const displayName = mon => mon.nick || mon.name;

  // ── move helpers ─────────────────────────────────────────────────────────
  const isDamaging = m => m.cat !== 'status' && (m.power > 0 || FIXED_DAMAGE[m.key] !== undefined);
  const targetsSelf = m => SELF_TARGETS.has(m.target);
  const isUseful = m => isDamaging(m) || m.heal > 0 || !!m.ail || m.stats.length > 0;

  // Pick a sensible 4-move set from the moves a species knows at `level`
  function chooseMoves(sp, level, moveObjs) {
    const pool = moveObjs.filter(m => !MOVE_BLACKLIST.has(m.key) && isUseful(m));
    const score = m => (m.power || 60) * ((m.acc ?? 100) / 100) * (sp.types.includes(m.type) ? 1.5 : 1)
      * (RECHARGE_MOVES.has(m.key) ? .55 : 1) * (m.minHits ? 2.2 : 1);
    const dmg = pool.filter(isDamaging).sort((a, b) => score(b) - score(a));
    const status = pool.filter(m => !isDamaging(m))
      .sort((a, b) => (b.ail ? 2 : b.heal ? 1.5 : 1) - (a.ail ? 2 : a.heal ? 1.5 : 1));
    const picks = [];
    for (const m of dmg) {                         // best move of each type first
      if (picks.length >= 3) break;
      if (!picks.some(p => p.type === m.type)) picks.push(m);
    }
    for (const m of dmg) { if (picks.length >= 3) break; if (!picks.includes(m)) picks.push(m); }
    if (status.length) picks.push(status[0]);
    for (const m of dmg) { if (picks.length >= 4) break; if (!picks.includes(m)) picks.push(m); }
    for (const m of status) { if (picks.length >= 4) break; if (!picks.includes(m)) picks.push(m); }
    return picks.length ? picks.slice(0, 4) : [{...STRUGGLE, key:'tackle', id:33, name:'Tackle', power:40, acc:100, pp:35, drain:0}];
  }
  // The level-up moves (ids) that should be fetched for a species at `level`
  function candidateMoveIds(sp, level, max = 14) {
    const ids = [];
    for (let i = sp.learnset.length - 1; i >= 0 && ids.length < max; i--) {
      const [mid, lv] = sp.learnset[i];
      if (lv <= level && !ids.includes(mid)) ids.push(mid);
    }
    return ids;
  }
  const movesLearnedAt = (sp, level) => sp.learnset.filter(([, lv]) => lv === level).map(([id]) => id);

  // ── damage ───────────────────────────────────────────────────────────────
  function damage(A, D, move, rng, {noCrit = false, avgRoll = false} = {}) {
    const e = typeEff(move.type, D.mon.types);
    if (e === 0) return {dmg: 0, eff: 0, crit: false};
    const fixed = FIXED_DAMAGE[move.key];
    if (fixed !== undefined) {
      const d = fixed === 'level' ? A.mon.level : fixed === 'half' ? Math.max(1, Math.floor(D.mon.hp / 2)) : fixed;
      return {dmg: d, eff: 1, crit: false};
    }
    const special = move.cat === 'special';
    const as = special ? 'spa' : 'atk', ds = special ? 'spd' : 'def';
    const critChance = [1 / 24, 1 / 8, 1 / 2, 1][clamp(move.crit || 0, 0, 3)];
    const crit = !noCrit && rng() < critChance;
    let aStage = A.vol.stages[as], dStage = D.vol.stages[ds];
    if (crit) { aStage = Math.max(0, aStage); dStage = Math.min(0, dStage); }
    const atk = A.mon.stats[as] * stageMult(aStage);
    const def = Math.max(1, D.mon.stats[ds] * stageMult(dStage));
    const base = Math.floor(Math.floor(Math.floor(2 * A.mon.level / 5 + 2) * (move.power || 50) * atk / def) / 50) + 2;
    const roll = avgRoll ? .925 : .85 + rng() * .15;
    const mod = (crit ? 1.5 : 1) * roll * (A.mon.types.includes(move.type) ? 1.5 : 1) * e
      * (A.mon.status === 'brn' && !special ? .5 : 1);
    return {dmg: Math.max(1, Math.floor(base * mod)), eff: e, crit};
  }

  function speedOf(side) {
    return side.mon.stats.spe * stageMult(side.vol.stages.spe) * (side.mon.status === 'par' ? .5 : 1);
  }
  // Returns true if side A acts before side D this turn
  function goesFirst(A, aMove, D, dMove, rng) {
    const pa = aMove ? aMove.prio : 0, pd = dMove ? dMove.prio : 0;
    if (pa !== pd) return pa > pd;
    const sa = speedOf(A), sd = speedOf(D);
    return sa === sd ? rng() < .5 : sa > sd;
  }

  // ── status ───────────────────────────────────────────────────────────────
  function canHaveStatus(mon, st) {
    if (mon.status || mon.hp <= 0) return false;
    const t = mon.types;
    if (st === 'brn' && t.includes('fire')) return false;
    if (st === 'par' && t.includes('electric')) return false;
    if (st === 'psn' && (t.includes('poison') || t.includes('steel'))) return false;
    if (st === 'frz' && t.includes('ice')) return false;
    return true;
  }
  const STATUS_MSG = {brn:'was burned!', par:'is paralyzed! It may be unable to move!', slp:'fell asleep!',
    frz:'was frozen solid!', psn:'was poisoned!'};
  function inflict(T, ail, rng, ev) {
    if (ail === 'confusion') {
      if (T.vol.confused > 0 || T.mon.hp <= 0) return false;
      T.vol.confused = 2 + Math.floor(rng() * 4);
      ev.push({k:'msg', text:`${T.name} became confused!`});
      return true;
    }
    if (!canHaveStatus(T.mon, ail)) return false;
    T.mon.status = ail;
    if (ail === 'slp') T.mon.sleep = 1 + Math.floor(rng() * 3);
    ev.push({k:'status', who:T.key, status:ail}, {k:'msg', text:`${T.name} ${STATUS_MSG[ail]}`});
    return true;
  }
  function changeStage(T, apiStat, change, ev) {
    const s = STAT_MAP[apiStat] || apiStat;
    if (!(s in T.vol.stages)) return false;
    const cur = T.vol.stages[s];
    if ((change > 0 && cur >= 6) || (change < 0 && cur <= -6)) {
      ev.push({k:'msg', text:`${T.name}'s ${STAT_LABEL[s]} won't go any ${change > 0 ? 'higher' : 'lower'}!`});
      return false;
    }
    T.vol.stages[s] = clamp(cur + change, -6, 6);
    const verb = change >= 3 ? 'rose drastically' : change === 2 ? 'rose sharply' : change > 0 ? 'rose'
      : change <= -2 ? 'harshly fell' : 'fell';
    ev.push({k:'stat', who:T.key, stat:s, change}, {k:'msg', text:`${T.name}'s ${STAT_LABEL[s]} ${verb}!`});
    return true;
  }
  function heal(T, amount, ev) {
    const h = Math.min(amount, T.mon.stats.hp - T.mon.hp);
    if (h <= 0) return 0;
    T.mon.hp += h;
    ev.push({k:'heal', who:T.key, amount:h});
    return h;
  }
  function hurt(T, amount, ev, extra = {}) {
    const d = Math.min(T.mon.hp, Math.max(0, amount));
    T.mon.hp -= d;
    ev.push({k:'dmg', who:T.key, amount:d, eff:1, crit:false, ...extra});
    return d;
  }

  // ── a single move use ────────────────────────────────────────────────────
  // moveIdx < 0 or an empty move → Struggle. `first`: attacker moved first (flinch).
  function runMove(A, D, moveIdx, rng = Math.random, first = true) {
    const ev = [], say = text => ev.push({k:'msg', text});
    const mon = A.mon;
    if (mon.hp <= 0) return ev;
    if (A.vol.recharge) { A.vol.recharge = false; say(`${A.name} must recharge!`); return ev; }

    if (mon.status === 'slp') {
      mon.sleep = (mon.sleep || 1) - 1;
      if (mon.sleep > 0) { say(`${A.name} is fast asleep.`); return ev; }
      mon.status = null; ev.push({k:'cure', who:A.key}); say(`${A.name} woke up!`);
    }
    if (mon.status === 'frz') {
      if (rng() < .25) { mon.status = null; ev.push({k:'cure', who:A.key}); say(`${A.name} thawed out!`); }
      else { say(`${A.name} is frozen solid!`); return ev; }
    }
    if (A.vol.flinch) { A.vol.flinch = false; say(`${A.name} flinched and couldn't move!`); return ev; }
    if (mon.status === 'par' && rng() < .25) { say(`${A.name} is paralyzed! It can't move!`); return ev; }
    if (A.vol.confused > 0) {
      A.vol.confused--;
      if (A.vol.confused === 0) say(`${A.name} snapped out of its confusion!`);
      else {
        say(`${A.name} is confused!`);
        if (rng() < 1 / 3) {
          const self = damage(A, A, {...STRUGGLE, type:'???', power:40, key:'confusion-hit'}, rng, {noCrit:true});
          say('It hurt itself in its confusion!');
          hurt(A, self.dmg, ev);
          return ev;
        }
      }
    }

    let move = mon.moves[moveIdx];
    if (moveIdx < 0 || !move || move.pp <= 0) {
      move = STRUGGLE;
      if (moveIdx >= 0 || mon.moves.every(m => m.pp <= 0)) say(`${A.name} has no moves left!`);
    } else move.pp--;

    say(`${A.name} used ${move.name}!`);
    ev.push({k:'use', who:A.key, move});

    const self = targetsSelf(move) && !isDamaging(move);
    if (!self && D.mon.hp <= 0) { say('But there was no target…'); return ev; }
    if (!self && move.acc != null) {
      const st = clamp(A.vol.stages.acc - D.vol.stages.eva, -6, 6);
      if (rng() * 100 >= move.acc * accMult(st)) { say(`${A.name}'s attack missed!`); return ev; }
    }

    if (isDamaging(move)) {
      const hits = move.minHits && move.maxHits
        ? move.minHits + Math.floor(rng() * (move.maxHits - move.minHits + 1)) : 1;
      let total = 0, landed = 0, lastEff = 1;
      for (let h = 0; h < hits && D.mon.hp > 0; h++) {
        const r = damage(A, D, move, rng);
        lastEff = r.eff;
        if (r.eff === 0) break;
        landed++;
        total += hurt(D, r.dmg, ev, {eff: r.eff, crit: r.crit});
        if (r.crit) say('A critical hit!');
      }
      if (lastEff === 0) { say(`It doesn't affect ${D.name}…`); return ev; }
      if (lastEff >= 2) say("It's super effective!");
      else if (lastEff < 1) say("It's not very effective…");
      if (hits > 1) say(`Hit ${landed} time${landed === 1 ? '' : 's'}!`);

      if (move.drain > 0 && total > 0) {
        if (heal(A, Math.max(1, Math.floor(total * move.drain / 100)), ev)) say(`${D.name} had its energy drained!`);
      } else if (move.drain < 0 && total > 0) {
        const base = move.key === 'struggle' ? mon.stats.hp : total;
        hurt(A, Math.max(1, Math.floor(base * -move.drain / 100)), ev);
        say(`${A.name} is damaged by recoil!`);
      }
      if (SELF_KO_MOVES.has(move.key) && mon.hp > 0) hurt(A, mon.hp, ev);
      if (RECHARGE_MOVES.has(move.key)) A.vol.recharge = true;

      // secondary effects
      if (D.mon.hp > 0 && move.ail && move.ailChance > 0 && rng() * 100 < move.ailChance) inflict(D, move.ail, rng, ev);
      if (D.mon.hp > 0 && first && move.flinch > 0 && rng() * 100 < move.flinch) D.vol.flinch = true;
      if (move.stats.length && rng() * 100 < (move.statChance || 100)) {
        const toSelf = move.mcat === 'damage-raise';
        const T = toSelf ? A : D;
        if (T.mon.hp > 0) move.stats.forEach(([s, c]) => changeStage(T, s, c, ev));
      }
      return ev;
    }

    // status move
    let did = false;
    if (move.heal > 0) {
      if (heal(A, Math.floor(mon.stats.hp * move.heal / 100), ev)) { say(`${A.name} restored its HP!`); did = true; }
      else { say(`${A.name}'s HP is full!`); did = true; }
    }
    if (move.ail && !targetsSelf(move)) {
      if (inflict(D, move.ail, rng, ev)) did = true;
      else if (!move.stats.length) { say('But it failed!'); did = true; }
    }
    if (move.stats.length && (move.statChance === 0 || rng() * 100 < move.statChance)) {
      for (const [s, c] of move.stats) {
        const T = targetsSelf(move) ? A : c > 0 ? A : D;
        changeStage(T, s, c, ev);
      }
      did = true;
    }
    if (!did) say('But nothing happened!');
    return ev;
  }

  // ── end of turn residual damage ──────────────────────────────────────────
  function endOfTurn(sides) {
    const ev = [];
    for (const S of sides) {
      S.vol.flinch = false;
      const m = S.mon;
      if (m.hp <= 0) continue;
      if (m.status === 'brn' || m.status === 'psn') {
        const d = Math.max(1, Math.floor(m.stats.hp / (m.status === 'brn' ? 16 : 8)));
        hurt(S, d, ev);
        ev.push({k:'msg', text:`${S.name} is hurt by its ${m.status === 'brn' ? 'burn' : 'poison'}!`});
      }
    }
    return ev;
  }

  // ── AI ───────────────────────────────────────────────────────────────────
  // skill: 0 = wild (loose), 1 = trainer, 2 = gym/league (sharp)
  function scoreMove(A, D, m) {
    if (isDamaging(m)) {
      if (typeEff(m.type, D.mon.types) === 0) return 0;
      const est = damage(A, D, m, () => .5, {noCrit:true, avgRoll:true}).dmg * (m.minHits ? 3 : 1);
      let s = Math.min(1, est / Math.max(1, D.mon.hp)) * 100 * ((m.acc ?? 100) / 100);
      if (est >= D.mon.hp) s += 40 + (m.prio > 0 ? 25 : 0);
      if (RECHARGE_MOVES.has(m.key) && est < D.mon.hp) s *= .6;
      if (m.drain < 0) s *= .9;
      return s;
    }
    const hpFrac = A.mon.hp / A.mon.stats.hp;
    let s = 2;
    if (m.heal > 0) s = hpFrac < .45 ? 75 : 0;
    if (m.ail === 'confusion' && D.vol.confused === 0) s = Math.max(s, 22);
    else if (m.ail && canHaveStatus(D.mon, m.ail)) s = Math.max(s, m.ail === 'slp' || m.ail === 'par' ? 42 : 34);
    if (m.stats.length) {
      const up = m.stats.some(([, c]) => c > 0), [st] = m.stats[0];
      const key = STAT_MAP[st];
      if (up && hpFrac > .6 && (A.vol.stages[key] ?? 0) < 2) s = Math.max(s, 30);
      if (!up && (D.vol.stages[key] ?? 0) > -2) s = Math.max(s, 14);
    }
    return s;
  }
  function aiChoose(A, D, skill = 1, rng = Math.random) {
    const opts = A.mon.moves.map((m, i) => ({i, m})).filter(o => o.m.pp > 0);
    if (!opts.length) return -1;
    const scored = opts.map(o => ({i: o.i, s: scoreMove(A, D, o.m)}));
    if (skill >= 1 && rng() < (skill >= 2 ? .92 : .75)) return scored.reduce((a, b) => b.s > a.s ? b : a).i;
    const w = scored.map(o => Math.pow(o.s + 8, skill === 0 ? 1 : 1.6));
    let r = rng() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < scored.length; k++) { r -= w[k]; if (r <= 0) return scored[k].i; }
    return scored[scored.length - 1].i;
  }
  // Pick the next foe whose types fare best against the player's active Pokémon
  function aiNextFoe(team, playerMon, skill) {
    const alive = team.map((m, i) => ({m, i})).filter(o => o.m.hp > 0);
    if (!alive.length) return -1;
    if (skill < 2) return alive[0].i;
    const rate = m => Math.max(...m.moves.map(mv => isDamaging(mv) ? typeEff(mv.type, playerMon.types) : 0), .5)
      / Math.max(...playerMon.types.map(t => typeEff(t, m.types)), .25);
    return alive.reduce((a, b) => rate(b.m) > rate(a.m) ? b : a).i;
  }

  // ── catching, running, experience ────────────────────────────────────────
  const CASUAL = 2.2; // friendlier than the main series
  function catchChance(mon, ballMult) {
    if (ballMult >= 255) return 1;
    const M = mon.stats.hp, H = Math.max(1, mon.hp);
    const bonus = {slp:2.5, frz:2.5, par:1.5, brn:1.5, psn:1.5}[mon.status] || 1;
    const a = ((3 * M - 2 * H) * (mon.capture || 45) * ballMult * bonus) / (3 * M) * CASUAL;
    return clamp(a / 255, 0, 1);
  }
  function runChance(P, E, attempts) {
    const ps = speedOf(P), es = Math.max(1, speedOf(E));
    if (ps >= es) return 1;
    return clamp((ps * 128 / es + 30 * attempts) / 256, 0, 1);
  }
  const expYield = (foe, trainer) => Math.max(1, Math.floor((foe.baseExp || 60) * foe.level / 5 * (trainer ? 1.5 : 1)));

  return {typeEff, calcStat, expAt, refresh, randIVs, createMon, evolveInto, healFull, displayName, newVol,
    isDamaging, chooseMoves, candidateMoveIds, movesLearnedAt, damage, goesFirst, speedOf, canHaveStatus,
    runMove, endOfTurn, aiChoose, aiNextFoe, scoreMove, catchChance, runChance, expYield, STAT_LABEL, STRUGGLE};
})();
