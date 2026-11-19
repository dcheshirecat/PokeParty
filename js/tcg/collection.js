'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  CARD COLLECTION — what the player owns, packs, decks, trading, opponents.
//  Stored on the save as G.tcg.
// ════════════════════════════════════════════════════════════════════════════

// The Card Duel ladder: each duelist unlocks after beating the previous one.
const TCG_LADDER = [
  {id:'mina', name:'Mina',  title:'Sprout Club',        types:['Grass'],             q:.15, emoji:'🌱', sprite:'lass'},
  {id:'theo', name:'Theo',  title:'Tidepool Duelist',   types:['Water'],             q:.25, emoji:'🌊', sprite:'fisherman'},
  {id:'kai',  name:'Kai',   title:'Circuit Duelist',    types:['Lightning'],         q:.35, emoji:'⚡', sprite:'scientist'},
  {id:'ruby', name:'Ruby',  title:'Ember Duelist',      types:['Fire'],              q:.45, emoji:'🔥', sprite:'kindler'},
  {id:'owen', name:'Owen',  title:'Boulder Duelist',    types:['Fighting'],          q:.55, emoji:'🪨', sprite:'hiker'},
  {id:'ivy',  name:'Ivy',   title:'Mystic Duelist',     types:['Psychic'],           q:.65, emoji:'🔮', sprite:'psychic-f'},
  {id:'rex',  name:'Rex',   title:'Steel & Shadow',     types:['Darkness', 'Metal'], q:.8,  emoji:'🌑', sprite:'hexmaniac'},
  {id:'ada',  name:'Ada',   title:'Card Grandmaster',   types:['Dragon', 'Psychic'], q:1,   emoji:'👑', sprite:'acetrainerf'},
];
const STARTER_DECKS = [
  {type:'Grass', name:'Overgrowth', icon:'🍃', ace:'Bulbasaur'},
  {type:'Fire',  name:'Blaze',      icon:'🔥', ace:'Charmander'},
  {type:'Water', name:'Torrent',    icon:'💧', ace:'Squirtle'},
];

// Gym Leader promo cards: the leader's ace (first one the card sets cover)
GYMS.forEach(g => {
  const ace = [...g.team].reverse().find(([id]) => Cards.speciesById[id]);
  if (ace) g.promo = Cards.registerPromo(g.id, ace[0], `${g.leader}'s`)?.id || null;
});

const Collection = (() => {
  const T = () => {
    if (!G.tcg) G.tcg = {cards: {}, packs: {}, decks: [], active: 0, ladder: [], gymDuels: [], started: false,
      stats: {wins: 0, losses: 0, packs: 0}};
    return G.tcg;
  };
  const count = id => T().cards[id] || 0;
  function add(id, n = 1) { const c = T().cards; c[id] = (c[id] || 0) + n; }
  function remove(id, n = 1) { const c = T().cards; c[id] = Math.max(0, (c[id] || 0) - n); if (!c[id]) delete c[id]; }
  const unique = () => Object.keys(T().cards).length;
  const total = () => Object.values(T().cards).reduce((a, b) => a + b, 0);
  function setProgress(code) {
    const list = Cards.BY_SET[code];
    return {owned: list.filter(c => count(c.id) > 0).length, total: list.length};
  }

  // ── packs ────────────────────────────────────────────────────────────────
  function buyPack(code) {
    if (G.coins < Cards.PACK_PRICE) return false;
    G.coins -= Cards.PACK_PRICE;
    T().packs[code] = (T().packs[code] || 0) + 1;
    return true;
  }
  function givePacks(n, code) {
    for (let i = 0; i < n; i++) {
      const c = code || pick(Cards.SETS).code;
      T().packs[c] = (T().packs[c] || 0) + 1;
    }
  }
  function openPack(code) {
    if (!T().packs[code]) return null;
    T().packs[code]--;
    if (!T().packs[code]) delete T().packs[code];
    const cards = Cards.openPack(code).map(c => ({card: c, isNew: !count(c.id)}));
    cards.forEach(x => add(x.card.id));
    T().stats.packs++;
    return cards;
  }

  // ── trading ──────────────────────────────────────────────────────────────
  // Copies beyond the 4 a deck can use
  function extras() {
    return Object.entries(T().cards).map(([id, n]) => ({card: Cards.get(id), n: n - 4})).filter(x => x.card && x.n > 0);
  }
  function sellExtras() {
    let coins = 0;
    for (const {card, n} of extras()) { coins += n * Cards.RARITY[card.rarity].sell; remove(card.id, n); }
    Store.earn(coins);
    return coins;
  }
  function sellOne(id) {
    const c = Cards.get(id);
    if (!c || count(id) < 2) return 0;
    remove(id);
    const v = Cards.RARITY[c.rarity].sell;
    Store.earn(v);
    return v;
  }
  const TRADE_UP = {common: 'uncommon', uncommon: 'rare', rare: 'holo'};
  // duplicates (copies beyond the first) of a rarity
  function dupes(rarity) {
    return Object.entries(T().cards).map(([id, n]) => ({card: Cards.get(id), n: n - 1}))
      .filter(x => x.card && x.n > 0 && x.card.rarity === rarity).sort((a, b) => b.n - a.n);
  }
  function tradeUp(rarity) {
    const pool = dupes(rarity);
    if (pool.reduce((a, b) => a + b.n, 0) < 5) return null;
    let left = 5;
    for (const x of pool) { const k = Math.min(left, x.n); remove(x.card.id, k); left -= k; if (!left) break; }
    const target = TRADE_UP[rarity];
    const all = Object.values(Cards.ALL).filter(c => c.rarity === target && c.set !== 'PR' && !c.shiny);
    const got = pick(all);
    const isNew = !count(got.id);
    add(got.id);
    return {card: got, isNew};
  }

  // ── decks ────────────────────────────────────────────────────────────────
  const deckSize = d => Object.values(d.cards).reduce((a, b) => a + b, 0);
  const activeDeck = () => T().decks[T().active] || T().decks[0] || null;
  // pool for building: owned copies (energy unlimited)
  function pool() {
    const p = {...T().cards};
    Cards.BASIC_ENERGY.forEach(e => { p['E-' + e] = 99; });
    return p;
  }
  function autoBuild(types) {
    return Cards.buildDeck({types, pool: pool(), quality: .7});
  }
  function chooseStarter(type) {
    const st = STARTER_DECKS.find(s => s.type === type);
    const commonPool = {};
    Object.values(Cards.ALL).forEach(c => {
      if (c.set !== 'PR' && !c.shiny && (c.rarity === 'common' || c.rarity === 'uncommon')) commonPool[c.id] = 4;
      if (c.kind === 'energy') commonPool[c.id] = 99;
    });
    // make sure the starter line itself is included
    const deck = Cards.buildDeck({types: [type], pool: commonPool, quality: .3});
    const ace = Object.values(Cards.ALL).filter(c => c.kind === 'pokemon' && (c.name === st.ace || c.from === st.ace ||
      Cards.byName(c.from)?.from === st.ace));
    for (const c of ace) if (!deck[c.id]) {
      // swap out energy to make room
      const e = 'E-' + type;
      if (deck[e] > 14) { deck[e]--; deck[c.id] = 1; }
    }
    for (const [id, n] of Object.entries(deck)) if (!id.startsWith('E-')) add(id, n);
    T().decks = [{name: `${st.name} Starter`, cards: deck}];
    T().active = 0;
    T().started = true;
    givePacks(2, 'KAN');
  }

  return {T, count, add, remove, unique, total, setProgress, buyPack, givePacks, openPack, extras, sellExtras, sellOne,
    dupes, tradeUp, TRADE_UP, deckSize, activeDeck, pool, autoBuild, chooseStarter};
})();
