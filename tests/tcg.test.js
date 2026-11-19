// Card game tests: card generation, deck rules and full AI-vs-AI games.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = vm.createContext({console, Math});
for (const f of ['js/data.js', 'js/tcg/data-species.js', 'js/tcg/cards.js', 'js/tcg/engine.js', 'js/tcg/ai.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, {filename: f});
}
const {Cards, TCG, TCGAI} = vm.runInContext('({Cards, TCG, TCGAI})', ctx);

function seeded(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }

test('three sets with Pokémon and Trainer cards', () => {
  assert.equal(Cards.SETS.length, 3);
  for (const set of Cards.SETS) {
    const list = Cards.BY_SET[set.code];
    assert.ok(list.some(c => c.kind === 'trainer'));
    for (const c of list.filter(c => c.kind === 'pokemon')) {
      assert.ok(c.hp >= 40 && c.hp <= 250, `${c.name} HP ${c.hp}`);
      assert.ok(c.attacks.length >= 1);
      for (const a of c.attacks) assert.ok(a.cost.every(t => t === 'Colorless' || Cards.BASIC_ENERGY.includes(t)), `${c.name} has an unpayable cost`);
      if (c.stage > 0) assert.ok(c.from, `${c.name} needs an evolves-from`);
    }
  }
});

test('evolution lines connect by name', () => {
  const venusaur = Cards.byName('Venusaur');
  assert.equal(venusaur.stage, 2);
  assert.equal(venusaur.from, 'Ivysaur');
  assert.equal(Cards.byName('Ivysaur').from, 'Bulbasaur');
  assert.equal(Cards.byName('Pikachu').stage, 0, 'baby Pokémon do not make Pikachu a Stage 1');
});

test('packs have 10 cards with a rare slot', () => {
  const rng = seeded(7);
  for (let i = 0; i < 50; i++) {
    const p = Cards.openPack('KAN', rng);
    assert.equal(p.length, 10);
    assert.ok(['rare', 'holo'].includes(p[9].rarity));
  }
});

test('deck validation enforces 60 cards, 4 copies, a Basic', () => {
  const ok = Cards.buildDeck({types: ['Water'], rng: seeded(3)});
  assert.deepEqual([...Cards.validate(ok)], []);
  const bad = {...ok, 'KAN-007': 6};
  assert.ok(Cards.validate(bad).length >= 1);
});

test('energy payment respects typed and Colorless costs', () => {
  const e = t => ({type: t});
  assert.equal(TCG.canPay(['Fire', 'Colorless'], [e('Fire'), e('Water')]), true);
  assert.equal(TCG.canPay(['Fire', 'Colorless'], [e('Water'), e('Water')]), false);
  assert.equal(TCG.canPay(['Colorless', 'Colorless'], [e('Grass')]), false);
});

test('weakness doubles damage', async () => {
  const rng = seeded(11);
  const s = TCG.create([Cards.buildDeck({types: ['Water'], rng}), Cards.buildDeck({types: ['Fire'], rng})], ['A', 'B'], rng, [true, true]);
  const squirtle = Cards.byName('Squirtle'), charmander = Cards.byName('Charmander');
  s.players[0].active = {uid: 1, card: squirtle, stack: [], energy: [{type: 'Water'}, {type: 'Water'}, {type: 'Water'}], dmg: 0, sp: null, playedTurn: 0, evolvedTurn: -1, lockTurn: -1};
  s.players[1].active = {uid: 2, card: charmander, stack: [], energy: [], dmg: 0, sp: null, playedTurn: 0, evolvedTurn: -1, lockTurn: -1};
  s.players[1].bench = [{uid: 3, card: charmander, stack: [], energy: [], dmg: 0, sp: null, playedTurn: 0, evolvedTurn: -1, lockTurn: -1}];
  s.players.forEach(P => { P.prizes = P.deck.splice(0, 6); });
  s.cur = 0; s.turn = 3; s.phase = 'play';
  assert.equal(charmander.weak, 'Water');
  const atk = squirtle.attacks[0];
  await TCG.attack(s, 0, 0, TCGAI.dispatch(s));
  const dealt = s.players[1].active === null ? charmander.hp : (s.players[1].discard.length ? charmander.hp : null);
  const expected = atk.dmg * 2;
  // either the defender took double damage, or it was knocked out by it
  const target = [s.players[1].active, ...s.players[1].bench].find(i => i && i.uid === 2);
  if (target) assert.equal(target.dmg, expected); else assert.ok(expected >= charmander.hp || dealt);
});

test('AI vs AI games always finish and conserve cards', async () => {
  const types = Cards.BASIC_ENERGY;
  for (let g = 0; g < 30; g++) {
    const rng = seeded(1000 + g);
    const decks = [0, 1].map(k => Cards.buildDeck({types: [types[(g + k * 3) % types.length]], quality: rng(), rng}));
    const s = TCG.create(decks, ['A', 'B'], rng, [true, true]);
    TCG.openingHands(s); TCGAI.setup(s, 0); TCGAI.setup(s, 1);
    await TCG.begin(s, {}, g % 2);
    for (let t = 0; t < 300 && s.winner === null; t++) {
      await TCGAI.takeTurn(s, s.cur, {});
      for (const P of s.players) {
        const n = P.deck.length + P.hand.length + P.discard.length + P.prizes.length +
          TCG.inPlay(P).reduce((a, i) => a + 1 + i.stack.length + i.energy.length, 0);
        assert.equal(n, 60);
      }
    }
    assert.notEqual(s.winner, null, `game ${g} did not finish`);
  }
});
