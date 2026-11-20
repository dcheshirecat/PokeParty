'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  TRADING CARD GAME — card definitions
//  Pokémon cards are generated deterministically from TCG_SPECIES (built by
//  tools/build_tcg_data.py), so every player gets identical cards.
// ════════════════════════════════════════════════════════════════════════════
const Cards = (() => {
  const ENERGY = {
    Grass:     {color:'#4caf50', icon:'🍃'}, Fire:     {color:'#f2622e', icon:'🔥'},
    Water:     {color:'#3d8bfd', icon:'💧'}, Lightning:{color:'#f5c518', icon:'⚡'},
    Psychic:   {color:'#a35bd6', icon:'🌀'}, Fighting: {color:'#c0672e', icon:'✊'},
    Darkness:  {color:'#3f4458', icon:'🌑'}, Metal:    {color:'#8a9bab', icon:'⚙️'},
    Dragon:    {color:'#b39124', icon:'🐉'}, Colorless:{color:'#d9d9d9', icon:'⭐'},
  };
  const BASIC_ENERGY = Object.keys(ENERGY).filter(e => !['Colorless', 'Dragon'].includes(e));
  const TYPE_TO_ENERGY = {grass:'Grass', bug:'Grass', fire:'Fire', water:'Water', ice:'Water', electric:'Lightning',
    psychic:'Psychic', ghost:'Psychic', poison:'Psychic', fairy:'Psychic', fighting:'Fighting', rock:'Fighting',
    ground:'Fighting', dark:'Darkness', steel:'Metal', dragon:'Dragon', normal:'Colorless', flying:'Colorless'};
  const ENERGY_REP = {Grass:['grass','bug'], Fire:['fire'], Water:['water','ice'], Lightning:['electric'], Psychic:['psychic','ghost'],
    Fighting:['fighting','ground','rock'], Darkness:['dark'], Metal:['steel'], Dragon:['dragon']};
  const LOCK_MOVES = new Set(['Hyper Beam','Giga Impact','Blast Burn','Hydro Cannon','Frenzy Plant','Rock Wrecker','Roar of Time']);
  const STATUS_NAME = {par:'Paralyzed', slp:'Asleep', cnf:'Confused', psn:'Poisoned', brn:'Burned', frz:'Paralyzed'};
  const RARITY = {
    common:  {sym:'●', label:'Common',   sell:10},
    uncommon:{sym:'◆', label:'Uncommon', sell:25},
    rare:    {sym:'★', label:'Rare',     sell:80},
    holo:    {sym:'★H', label:'Holo Rare',sell:250},
    secret:  {sym:'✦', label:'Shiny Secret', sell:600},
    promo:   {sym:'P', label:'Promo',    sell:0},
  };
  const SETS = [
    {code:'KAN', name:'Kanto Classics', range:[1, 151],   color:'#e94b3c', icon:'🔴',
      trainers:['potion', 'switch', 'poke-ball', 'nest-ball', 'professors-notes', 'energy-search']},
    {code:'JOH', name:'Johto Journey',  range:[152, 251], color:'#d4a017', icon:'🟡',
      trainers:['super-potion', 'great-ball', 'helpful-friend', 'full-heal', 'rare-candy']},
    {code:'HOE', name:'Hoenn Horizons', range:[252, 386], color:'#2e86de', icon:'🔵',
      trainers:['energy-retrieval', 'pep-talk', 'call-out', 'pokemon-nurse']},
    // Trainer cards are reprinted across later sets, as in the real game
    {code:'SIN', name:'Sinnoh Summit',    range:[387, 493],  color:'#8e7cc3', icon:'💎',
      trainers:['evolution-incense', 'potion', 'professors-notes', 'switch']},
    {code:'UNO', name:'Unova Lights',     range:[494, 649],  color:'#4a4a4a', icon:'⚫',
      trainers:['energy-switch', 'nest-ball', 'helpful-friend', 'energy-search']},
    {code:'KAL', name:'Kalos Bloom',      range:[650, 721],  color:'#2a9d8f', icon:'🌸',
      trainers:['fresh-start', 'great-ball', 'super-potion', 'full-heal']},
    {code:'ALO', name:'Alola Tides',      range:[722, 809],  color:'#f4a261', icon:'🌺',
      trainers:['rare-candy', 'poke-ball', 'pep-talk', 'energy-retrieval']},
    {code:'GAL', name:'Galar Highlands',  range:[810, 905],  color:'#c1121f', icon:'🛡️',
      trainers:['call-out', 'evolution-incense', 'potion', 'nest-ball']},
    {code:'PAL', name:'Paldea Frontier',  range:[906, 1025], color:'#7b2cbf', icon:'🧭',
      trainers:['pokemon-nurse', 'energy-switch', 'professors-notes', 'fresh-start']},
  ];
  const PACK_PRICE = 600;

  // ── Trainer cards ────────────────────────────────────────────────────────
  const TRAINERS = {
    'potion':          {name:'Potion',           sub:'item',      rarity:'common',   text:'Heal 30 damage from 1 of your Pokémon.'},
    'super-potion':    {name:'Super Potion',     sub:'item',      rarity:'uncommon', text:'Heal 60 damage from 1 of your Pokémon. If you do, discard an Energy from it.'},
    'switch':          {name:'Switch',           sub:'item',      rarity:'common',   text:'Switch your Active Pokémon with 1 of your Benched Pokémon.'},
    'poke-ball':       {name:'Poké Ball',        sub:'item',      rarity:'common',   text:'Flip a coin. If heads, search your deck for a Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.'},
    'great-ball':      {name:'Great Ball',       sub:'item',      rarity:'uncommon', text:'Look at the top 7 cards of your deck. You may put a Pokémon you find there into your hand. Shuffle the other cards back into your deck.'},
    'nest-ball':       {name:'Nest Ball',        sub:'item',      rarity:'uncommon', text:'Search your deck for a Basic Pokémon and put it onto your Bench. Then, shuffle your deck.'},
    'energy-search':   {name:'Energy Search',    sub:'item',      rarity:'common',   text:'Search your deck for a basic Energy card, reveal it, and put it into your hand. Then, shuffle your deck.'},
    'full-heal':       {name:'Full Heal',        sub:'item',      rarity:'common',   text:'Your Active Pokémon recovers from all Special Conditions.'},
    'rare-candy':      {name:'Rare Candy',       sub:'item',      rarity:'rare',     text:'Choose 1 of your Basic Pokémon in play. If you have a Stage 2 card in your hand that evolves from that Pokémon, put that card onto the Basic Pokémon to evolve it, skipping the Stage 1. You can’t use this card during your first turn or on a Basic Pokémon that was put into play this turn.'},
    'energy-retrieval':{name:'Energy Retrieval', sub:'item',      rarity:'uncommon', text:'Put up to 2 basic Energy cards from your discard pile into your hand.'},
    'professors-notes':{name:"Professor's Notes",sub:'supporter', rarity:'uncommon', text:'Discard your hand and draw 7 cards.'},
    'helpful-friend':  {name:'Helpful Friend',   sub:'supporter', rarity:'common',   text:'Draw 3 cards.'},
    'pep-talk':        {name:'Pep Talk',         sub:'supporter', rarity:'uncommon', text:'Shuffle your hand into your deck. Then, draw 6 cards.'},
    'call-out':        {name:'Call Out',         sub:'supporter', rarity:'rare',     text:'Switch in 1 of your opponent’s Benched Pokémon to the Active Spot.'},
    'evolution-incense':{name:'Evolution Incense',sub:'item',     rarity:'uncommon', text:'Search your deck for an Evolution Pokémon, reveal it, and put it into your hand. Then, shuffle your deck.'},
    'energy-switch':   {name:'Energy Switch',    sub:'item',      rarity:'uncommon', text:'Move a basic Energy from 1 of your Pokémon to another of your Pokémon.'},
    'fresh-start':     {name:'Fresh Start',      sub:'supporter', rarity:'uncommon', text:'Each player shuffles their hand into their deck and draws 4 cards.'},
    'pokemon-nurse':   {name:'Pokémon Nurse',    sub:'supporter', rarity:'uncommon', text:'Heal all damage from 1 of your Pokémon. Then, discard all Energy from that Pokémon.'},
  };

  const round10 = n => Math.max(10, Math.round(n / 10) * 10);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function typeEff(atk, defTypes) { return defTypes.reduce((m, t) => m * ((EFF[atk] || {})[t] ?? 1), 1); }

  // ── Pokémon card generation ──────────────────────────────────────────────
  const speciesById = {};
  TCG_SPECIES.forEach(r => {
    const [id, name, t1, t2, hp, atk, def, spa, spd, spe, from, leg, baby, stage, m1, m2] = r;
    speciesById[id] = {id, name, types: t2 ? [t1, t2] : [t1], bs: {hp, atk, def, spa, spd, spe}, from, leg: !!leg, baby: !!baby, stage, m1, m2};
  });

  function attackFrom(moveId, sp, tier, cardType) {
    const mv = TCG_MOVES[moveId] || ['Tackle', 'normal', 40, '', 0, 0, 0, 0];
    const [name, , power, ail, ailChance, drain, minHits, maxHits] = mv;
    const stage = sp.leg ? 2 : sp.stage;
    const bst = Object.values(sp.bs).reduce((a, b) => a + b, 0);
    let cost, dmg;
    if (tier === 0) {
      cost = stage === 0 ? 1 : 2;
      dmg = round10(10 + power * .35 + stage * 10);
    } else {
      cost = stage === 0 ? (bst >= 450 ? 3 : 2) : stage === 1 ? 3 : (power >= 100 ? 4 : 3);
      dmg = round10(cost * (18 + stage * 6) * clamp(power / 80, .75, 1.4));
    }
    const typed = cardType === 'Colorless' || cardType === 'Dragon' ? 0 : cost === 1 ? 1 : cost === 2 ? 1 : 2;
    const costArr = [...Array(typed).fill(cardType), ...Array(cost - typed).fill('Colorless')];
    const fx = {}, text = [];
    if (minHits && maxHits) {
      fx.multi = {flips: Math.min(4, Math.max(2, maxHits - 1)), per: round10(dmg / 2)};
      text.push(`Flip ${fx.multi.flips} coins. This attack does ${fx.multi.per} damage for each heads.`);
      dmg = 0;
    }
    if (ail && ailChance !== 0) {
      fx.status = ail === 'frz' ? 'par' : ail;
      fx.coin = ailChance < 50;
      text.push(`${fx.coin ? 'Flip a coin. If heads, the' : 'The'} Defending Pokémon is now ${STATUS_NAME[ail]}.`);
    }
    if (drain > 0) { fx.heal = round10(dmg * drain / 100); text.push(`Heal ${fx.heal} damage from this Pokémon.`); }
    if (drain < 0) { fx.self = round10(dmg * -drain / 100); text.push(`This Pokémon also does ${fx.self} damage to itself.`); }
    if (LOCK_MOVES.has(name)) { fx.lock = true; text.push('During your next turn, this Pokémon can’t attack.'); }
    return {name, cost: costArr, dmg, fx, text: text.join(' ')};
  }

  function pokemonCard(sp, set, num) {
    const type = TYPE_TO_ENERGY[sp.types[0] === 'normal' && sp.types[1] && sp.types[1] !== 'flying' ? sp.types[1] : sp.types[0]];
    const bst = Object.values(sp.bs).reduce((a, b) => a + b, 0);
    const stage = sp.stage;
    const hp = clamp(round10(20 + sp.bs.hp * .6 + bst * .08 + stage * 20 + (sp.leg ? 10 : 0)), 40, 250);
    let weak = null, resist = null, wBest = 1, rBest = 1;
    for (const [e, reps] of Object.entries(ENERGY_REP)) {
      const m = Math.max(...reps.map((t, i) => typeEff(t, sp.types) * (i ? .99 : 1)));
      if (m > wBest) { wBest = m; weak = e; }
      if (m < rBest && m <= .5) { rBest = m; resist = e; }
    }
    const retreat = clamp(Math.round((sp.bs.hp + sp.bs.def) / 80 + (stage ? .5 : 0) - sp.bs.spe / 80), 0, 4);
    const attacks = [attackFrom(sp.m1, sp, 0, type)];
    if (sp.m2) attacks.push(attackFrom(sp.m2, sp, 1, type));
    const rarity = sp.leg ? 'holo' : (stage === 2 || bst >= 500) ? 'rare' : (stage === 1 || bst >= 420) ? 'uncommon' : 'common';
    const from = sp.from ? speciesById[sp.from]?.name || null : null;
    return {id: `${set.code}-${String(num).padStart(3, '0')}`, set: set.code, num, kind: 'pokemon', name: sp.name, species: sp.id,
      stage, from, type, hp, attacks, weak, resist, retreat, rarity, legendary: sp.leg};
  }

  // ── build all sets ───────────────────────────────────────────────────────
  const ALL = {}, BY_SET = {}, BY_NAME = {};
  for (const set of SETS) {
    const list = [];
    let num = 1;
    for (let id = set.range[0]; id <= set.range[1]; id++) {
      if (!speciesById[id]) continue;
      list.push(pokemonCard(speciesById[id], set, num++));
    }
    for (const key of set.trainers) {
      const t = TRAINERS[key];
      list.push({id: `${set.code}-${String(num).padStart(3, '0')}`, set: set.code, num: num++, kind: 'trainer', key, ...t});
    }
    set.size = list.length;
    BY_SET[set.code] = list;
    list.forEach(c => { ALL[c.id] = c; if (c.kind === 'pokemon' && !BY_NAME[c.name]) BY_NAME[c.name] = c; });
  }
  for (const e of BASIC_ENERGY) {
    ALL['E-' + e] = {id: 'E-' + e, kind: 'energy', type: e, name: `${e} Energy`, rarity: 'common', basic: true};
  }

  function get(id) {
    if (ALL[id]) return ALL[id];
    // shiny secret rares: "KAN-025S"
    if (id.endsWith('S') && ALL[id.slice(0, -1)]) {
      const base = ALL[id.slice(0, -1)];
      const c = {...base, id, shiny: true, rarity: 'secret', num: base.num + 1000};
      ALL[id] = c;
      return c;
    }
    // gym promos: "PR-boulder"
    if (id.startsWith('PR-')) return ALL[id] || null;
    return null;
  }
  function registerPromo(key, speciesId, label) {
    const id = 'PR-' + key;
    if (ALL[id]) return ALL[id];
    const sp = speciesById[speciesId];
    if (!sp) return null;
    const c = {...pokemonCard(sp, {code: 'PR'}, 0), id, set: 'PR', rarity: 'promo', promo: label};
    ALL[id] = c;
    return c;
  }

  // ── packs ────────────────────────────────────────────────────────────────
  function openPack(setCode, rng = Math.random) {
    const list = BY_SET[setCode];
    const of = r => list.filter(c => c.rarity === r);
    const pickR = arr => arr[Math.floor(rng() * arr.length)];
    const cards = [];
    for (let i = 0; i < 5; i++) cards.push(pickR(of('common')));
    for (let i = 0; i < 3; i++) cards.push(pickR(of('uncommon')));
    // bonus slot: shiny secret 4%, otherwise common/uncommon
    if (rng() < .04) { const b = pickR(list.filter(c => c.kind === 'pokemon')); cards.push(get(b.id + 'S')); }
    else cards.push(pickR(rng() < .7 ? of('common') : of('uncommon')));
    const holos = of('holo');
    cards.push(holos.length && rng() < .22 ? pickR(holos) : pickR(of('rare')));
    return cards;
  }

  // ── deck building ────────────────────────────────────────────────────────
  // pool: {cardId: copiesAvailable} or null for "every card" (AI decks)
  function buildDeck({types, pool = null, quality = .5, rng = Math.random, size = 60}) {
    const avail = id => pool ? (pool[id] || 0) : 4;
    const pokes = Object.values(ALL).filter(c => c.kind === 'pokemon' && !c.shiny && c.set !== 'PR' && avail(c.id) > 0);
    const inType = c => types.includes(c.type);
    const basics = pokes.filter(c => c.stage === 0 && inType(c));
    const nameAvail = name => pokes.filter(c => c.name === name);
    const lines = basics.map(b => {
      const s1 = pokes.filter(c => c.from === b.name);
      const s2 = s1.length ? pokes.filter(c => c.from === s1[0].name) : [];
      const top = s2[0] || s1[0] || b;
      const power = top.hp + Math.max(...top.attacks.map(a => a.dmg)) * 1.5 + (top.legendary ? 40 : 0);
      return {b, s1: s1[0], s2: s2[0], score: power * (0.6 + quality) + rng() * 120 * (1.2 - quality)};
    }).sort((a, z) => z.score - a.score);
    const deck = {};
    // max 4 copies per card *name* (reprints share the limit)
    const byName = {};
    const add = (c, n) => {
      if (!c) return 0;
      const k = Math.min(n, avail(c.id) - (deck[c.id] || 0), 4 - (byName[c.name] || 0));
      if (k > 0) { deck[c.id] = (deck[c.id] || 0) + k; byName[c.name] = (byName[c.name] || 0) + k; }
      return Math.max(0, k);
    };
    let pc = 0;
    for (const L of lines) {
      if (pc >= 18) break;
      if (L.s2) pc += add(L.b, 4) + add(L.s1, 3) + add(L.s2, 2 + (quality > .6 ? 1 : 0));
      else if (L.s1) pc += add(L.b, 3) + add(L.s1, 3);
      else pc += add(L.b, L.b.legendary ? 1 : 2);
    }
    // real decks run ~10–12 Basics: top up with extra basics of the deck's type (then Colorless ones)
    const basicCount = () => Object.entries(deck).reduce((n, [id, k]) => n + (ALL[id].stage === 0 ? k : 0), 0);
    const extras = pokes.filter(c => c.stage === 0 && !c.legendary && (inType(c) || c.type === 'Colorless'))
      .sort((a, z) => (inType(z) - inType(a)) || (z.hp - a.hp));
    for (const c of extras) { if (basicCount() >= 11 || pc >= 24) break; pc += add(c, 2); }
    const hasStage2 = Object.keys(deck).some(id => ALL[id].stage === 2);
    const trainerPlan = [['professors-notes', 4], ['nest-ball', 4], ['poke-ball', 2], ['helpful-friend', 3], ['potion', 2], ['switch', 2],
      ['great-ball', 2], ['energy-search', 1], ['rare-candy', hasStage2 ? 3 : 0], ['call-out', quality > .5 ? 2 : 1],
      ['evolution-incense', 2], ['super-potion', 1], ['full-heal', 1], ['energy-retrieval', 1], ['pep-talk', 2], ['pokemon-nurse', 1]];
    let tc = 0;
    for (const [key, n] of trainerPlan) {
      if (tc >= 18 || !n) continue;
      const cards = Object.values(ALL).filter(c => c.kind === 'trainer' && c.key === key);
      let want = n; // spread the wanted copies over whichever printings are available
      for (const c of cards) { if (tc >= 18 || want <= 0) break; const k = add(c, Math.min(want, 18 - tc)); tc += k; want -= k; }
    }
    const count = Object.values(deck).reduce((a, b) => a + b, 0);
    const need = size - count;
    const eTypes = types.filter(t => BASIC_ENERGY.includes(t));
    // Dragon / Colorless decks: run the energy their Pokémon's secondary types like, else Lightning
    const usedTypes = eTypes.length ? eTypes : ['Lightning'];
    const energy = {};
    usedTypes.forEach((t, i) => { energy[t] = Math.floor(need / usedTypes.length) + (i < need % usedTypes.length ? 1 : 0); });
    // Dragon/Colorless decks need some typed energy for their costs
    for (const [t, n] of Object.entries(energy)) deck['E-' + t] = n;
    return deck;
  }

  function deckList(deck) {
    const out = [];
    for (const [id, n] of Object.entries(deck)) { const c = get(id); if (c) for (let i = 0; i < n; i++) out.push(c); }
    return out;
  }
  function validate(deck) {
    const errors = [];
    const total = Object.values(deck).reduce((a, b) => a + b, 0);
    if (total !== 60) errors.push(`Deck has ${total}/60 cards`);
    const names = {};
    for (const [id, n] of Object.entries(deck)) {
      const c = get(id);
      if (!c || c.kind === 'energy') continue;
      names[c.name] = (names[c.name] || 0) + n;
    }
    for (const [name, n] of Object.entries(names)) if (n > 4) errors.push(`Max 4 copies of ${name} (has ${n})`);
    if (!Object.keys(deck).some(id => get(id)?.kind === 'pokemon' && get(id).stage === 0 && deck[id] > 0)) errors.push('Needs at least 1 Basic Pokémon');
    return errors;
  }

  return {ENERGY, BASIC_ENERGY, TYPE_TO_ENERGY, RARITY, SETS, TRAINERS, PACK_PRICE, ALL, BY_SET, get, byName: n => BY_NAME[n],
    openPack, buildDeck, deckList, validate, registerPromo, speciesById};
})();
