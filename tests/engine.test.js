// Run with:  node --test tests/
// Loads the browser scripts into a sandbox and exercises the battle engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({console, Math, Date});
for (const f of ['js/data.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, {filename: f});
}
const {Engine, GYMS, ROUTES, ITEMS, LEAGUE} = vm.runInContext('({Engine, GYMS, ROUTES, ITEMS, LEAGUE})', ctx);

// deterministic rng helpers
const fixed = v => () => v;
const seq = arr => { let i = 0; return () => arr[i++ % arr.length]; };

const move = (o = {}) => ({id: 1, key: 'tackle', name: 'Tackle', type: 'normal', power: 40, acc: 100, pp: 35, maxPp: 35,
  cat: 'physical', prio: 0, target: 'selected-pokemon', ail: null, ailChance: 0, flinch: 0, drain: 0, heal: 0, crit: 0,
  minHits: null, maxHits: null, stats: [], statChance: 0, mcat: 'damage', ...o});
const species = (o = {}) => ({id: 1, name: 'Testmon', types: ['normal'], bs: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80},
  capture: 45, baseExp: 100, learnset: [], ...o});
const ivs = {hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15};
const mon = (spOpts = {}, level = 50, moves = [move()]) => Engine.createMon(species(spOpts), level, moves, {ivs});
const side = (key, m) => ({key, name: key === 'p' ? 'Player' : 'Foe', mon: m, vol: Engine.newVol()});

test('stats follow the standard formula', () => {
  const m = mon();
  // HP = floor((2*80+15)*50/100)+50+10 = 147 ; other = floor(175*50/100)+5 = 92
  assert.equal(m.stats.hp, 147);
  assert.equal(m.stats.atk, 92);
  assert.equal(m.hp, 147);
});

test('type effectiveness multiplies across dual types', () => {
  assert.equal(Engine.typeEff('electric', ['water', 'flying']), 4);
  assert.equal(Engine.typeEff('ground', ['flying']), 0);
  assert.equal(Engine.typeEff('fire', ['water', 'rock']), .25);
});

test('faster Pokémon moves first; priority beats speed', () => {
  const fast = side('p', mon({bs: {hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 130}}));
  const slow = side('e', mon());
  assert.equal(Engine.goesFirst(fast, move(), slow, move(), fixed(.9)), true);
  assert.equal(Engine.goesFirst(fast, move(), slow, move({prio: 1}), fixed(.9)), false);
  slow.mon.status = 'par';
  assert.equal(Engine.speedOf(slow) < Engine.speedOf(fast), true);
});

test('STAB and super effectiveness raise damage', () => {
  const A = side('p', mon({types: ['fire']})), D = side('e', mon({types: ['grass']}));
  const plain = Engine.damage(A, D, move(), fixed(.5), {noCrit: true}).dmg;
  const stabSuper = Engine.damage(A, D, move({type: 'fire'}), fixed(.5), {noCrit: true}).dmg;
  assert.ok(stabSuper >= plain * 2.9, `${stabSuper} vs ${plain}`);
});

test('runMove produces damage events and reduces HP', () => {
  const A = side('p', mon()), D = side('e', mon());
  const ev = Engine.runMove(A, D, 0, fixed(.5));
  const dmg = ev.find(e => e.k === 'dmg');
  assert.ok(dmg && dmg.amount > 0);
  assert.equal(D.mon.hp, D.mon.stats.hp - dmg.amount);
  assert.equal(A.mon.moves[0].pp, 34);
});

test('immunity: normal moves do not affect ghosts', () => {
  const A = side('p', mon()), D = side('e', mon({types: ['ghost']}));
  const ev = Engine.runMove(A, D, 0, fixed(.5));
  assert.equal(D.mon.hp, D.mon.stats.hp);
  assert.ok(ev.some(e => e.k === 'msg' && /doesn't affect/.test(e.text)));
});

test('status moves inflict conditions and respect type immunities', () => {
  const tw = move({key: 'thunder-wave', name: 'Thunder Wave', type: 'electric', power: 0, cat: 'status', ail: 'par', acc: 90});
  const A = side('p', mon({}, 50, [tw]));
  const D = side('e', mon());
  Engine.runMove(A, D, 0, fixed(.1));
  assert.equal(D.mon.status, 'par');
  const E = side('e', mon({types: ['electric']}));
  Engine.runMove(A, E, 0, fixed(.1));
  assert.equal(E.mon.status, null);
});

test('sleep prevents moving, then wears off', () => {
  const A = side('p', mon()), D = side('e', mon());
  A.mon.status = 'slp'; A.mon.sleep = 2;
  let ev = Engine.runMove(A, D, 0, fixed(.5));
  assert.ok(ev.some(e => /fast asleep/.test(e.text || '')));
  assert.equal(D.mon.hp, D.mon.stats.hp);
  ev = Engine.runMove(A, D, 0, fixed(.5));
  assert.equal(A.mon.status, null);
  assert.ok(D.mon.hp < D.mon.stats.hp);
});

test('stat stage moves change stages and are capped at ±6', () => {
  const sd = move({key: 'swords-dance', name: 'Swords Dance', power: 0, cat: 'status', acc: null, target: 'user', stats: [['attack', 2]]});
  const A = side('p', mon({}, 50, [sd])), D = side('e', mon());
  for (let i = 0; i < 4; i++) Engine.runMove(A, D, 0, fixed(.5));
  assert.equal(A.vol.stages.atk, 6);
  const growl = move({key: 'growl', name: 'Growl', power: 0, cat: 'status', target: 'all-opponents', stats: [['attack', -1]]});
  const B = side('p', mon({}, 50, [growl]));
  Engine.runMove(B, D, 0, fixed(.5));
  assert.equal(D.vol.stages.atk, -1);
});

test('damage-raise moves lower the user’s own stats (Close Combat)', () => {
  const cc = move({key: 'close-combat', type: 'fighting', power: 120, stats: [['defense', -1], ['special-defense', -1]], statChance: 100, mcat: 'damage-raise'});
  const A = side('p', mon({}, 50, [cc])), D = side('e', mon());
  Engine.runMove(A, D, 0, fixed(.5));
  assert.equal(A.vol.stages.def, -1);
  assert.equal(D.vol.stages.def, 0);
});

test('drain heals and recoil hurts the user', () => {
  const giga = move({key: 'giga-drain', type: 'grass', cat: 'special', power: 75, drain: 50});
  const A = side('p', mon({}, 50, [giga])), D = side('e', mon());
  A.mon.hp = 10;
  Engine.runMove(A, D, 0, fixed(.5));
  assert.ok(A.mon.hp > 10);
  const dbl = move({key: 'double-edge', power: 120, drain: -33});
  const C = side('p', mon({}, 50, [dbl]));
  Engine.runMove(C, side('e', mon()), 0, fixed(.5));
  assert.ok(C.mon.hp < C.mon.stats.hp);
});

test('multi-hit moves hit several times', () => {
  const ds = move({key: 'double-slap', power: 15, minHits: 2, maxHits: 5});
  const A = side('p', mon({}, 50, [ds])), D = side('e', mon());
  const ev = Engine.runMove(A, D, 0, fixed(.99));
  assert.equal(ev.filter(e => e.k === 'dmg').length, 5);
});

test('burn and poison deal residual damage', () => {
  const A = side('p', mon()), D = side('e', mon());
  A.mon.status = 'brn'; D.mon.status = 'psn';
  Engine.endOfTurn([A, D]);
  assert.equal(A.mon.stats.hp - A.mon.hp, Math.floor(A.mon.stats.hp / 16));
  assert.equal(D.mon.stats.hp - D.mon.hp, Math.floor(D.mon.stats.hp / 8));
});

test('out of PP → Struggle with recoil', () => {
  const A = side('p', mon({}, 50, [move({pp: 0})])), D = side('e', mon());
  A.mon.moves[0].pp = 0;
  const ev = Engine.runMove(A, D, -1, fixed(.5));
  assert.ok(ev.some(e => /Struggle/.test(e.text || '')));
  assert.ok(A.mon.hp < A.mon.stats.hp);
});

test('AI prefers a super-effective KO over a weak move', () => {
  const weak = move({key: 'tackle'}), strong = move({key: 'water-gun', name: 'Water Gun', type: 'water', cat: 'special', power: 90});
  const A = side('e', mon({}, 50, [weak, strong])), D = side('p', mon({types: ['fire']}));
  assert.equal(Engine.aiChoose(A, D, 2, fixed(.1)), 1);
});

test('catch chance grows with low HP, status and better balls', () => {
  const m = mon({capture: 45});
  const full = Engine.catchChance(m, 1);
  m.hp = 1;
  const low = Engine.catchChance(m, 1);
  m.status = 'slp';
  const lowSleep = Engine.catchChance(m, 1);
  assert.ok(full < low && low < lowSleep);
  assert.equal(Engine.catchChance(m, 255), 1);
  assert.ok(Engine.catchChance(m, 2) > lowSleep);
});

test('chooseMoves builds a varied 4-move set and skips blacklisted moves', () => {
  const sp = species({types: ['fire']});
  const pool = [move({key: 'ember', type: 'fire', power: 40}), move({key: 'flamethrower', type: 'fire', power: 90}),
    move({key: 'bite', type: 'dark', power: 60}), move({key: 'scratch', power: 40}),
    move({key: 'growl', power: 0, cat: 'status', stats: [['attack', -1]]}), move({key: 'explosion', power: 250})];
  const picks = Engine.chooseMoves(sp, 30, pool);
  assert.equal(picks.length, 4);
  assert.ok(picks.some(p => p.key === 'flamethrower'));
  assert.ok(!picks.some(p => p.key === 'explosion'));
  assert.ok(picks.some(p => p.key === 'growl'));
});

test('level-up keeps HP proportional', () => {
  const m = mon({}, 10);
  m.hp = 5; m.level = 11;
  Engine.refresh(m);
  assert.ok(m.hp > 5 && m.hp <= m.stats.hp);
});

test('game data is consistent', () => {
  GYMS.forEach((g, i) => {
    assert.equal(g.minBadges, i);
    assert.ok(g.team.length >= 2);
  });
  for (let i = 1; i < GYMS.length; i++) {
    const top = g => Math.max(...g.team.map(t => t[1]));
    assert.ok(top(GYMS[i]) >= top(GYMS[i - 1]), `${GYMS[i].id} should be at least as strong as ${GYMS[i - 1].id}`);
  }
  for (let i = 1; i < ROUTES.length; i++) assert.ok(ROUTES[i].badges >= ROUTES[i - 1].badges);
  assert.ok(LEAGUE.members.length === 5);
  Object.values(ITEMS).forEach(it => assert.ok(it.price > 0 && it.name));
});
