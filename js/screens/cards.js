'use strict';
// ── CARDS: hub · packs · binder · decks · deck editor · trading ────────────

const cardsBack = label => `<button class="back-btn" data-act="go" data-arg="cards" aria-label="Back">‹</button>${label}`;

UI.Screens.cards = {
  title: '🃏 Cards', tab: 'cards',
  render() {
    const t = Collection.T();
    if (!t.started) {
      return `<div class="info-card"><div class="big-emoji">🃏</div><h3>Welcome to the Card League!</h3>
        <p class="muted">Collect cards from booster packs, build 60-card decks and duel with real trading card game rules. Choose a starter deck to begin — you'll also get 2 free booster packs.</p></div>
        <div class="starter-decks">${STARTER_DECKS.map(st => {
          const ace = Cards.byName(st.ace);
          return `<button class="starter-deck" data-act="starterDeck" data-arg="${st.type}" style="--ec:${Cards.ENERGY[st.type].color}">
            ${CardUI.mini(ace)}<b>${st.icon} ${st.name}</b><small>${st.type} deck</small></button>`;
        }).join('')}</div>`;
    }
    const deck = Collection.activeDeck();
    const errs = deck ? Cards.validate(deck.cards) : ['No deck'];
    const packs = Object.values(t.packs).reduce((a, b) => a + b, 0);
    const beaten = new Set(t.ladder);
    const nextIdx = TCG_LADDER.findIndex(o => !beaten.has(o.id));
    return `<div class="tcg-summary">
        <div><b>${Collection.unique()}</b><small>unique cards</small></div>
        <div><b>${Collection.total()}</b><small>total cards</small></div>
        <div><b>${t.stats.wins}–${t.stats.losses}</b><small>duel record</small></div>
      </div>
      <div class="deck-banner ${errs.length ? 'bad' : ''}" data-act="go" data-arg="decks">
        <span>🗂️</span><div class="grow"><b>${esc(deck?.name || 'No deck')}</b><small>${errs.length ? '⚠️ ' + esc(errs[0]) : 'Ready to duel · 60 cards'}</small></div><span class="chev">›</span></div>
      <div class="tcg-grid">
        <button class="tcg-tile" data-act="go" data-arg="packs"><span>📦</span><b>Booster packs</b><small>${packs ? packs + ' unopened' : 'Buy & open'}</small>${packs ? `<i class="dot-badge">${packs}</i>` : ''}</button>
        <button class="tcg-tile" data-act="go" data-arg="binder"><span>📒</span><b>Binder</b><small>Your collection</small></button>
        <button class="tcg-tile" data-act="go" data-arg="decks"><span>🗂️</span><b>Decks</b><small>${t.decks.length} deck${t.decks.length === 1 ? '' : 's'}</small></button>
        <button class="tcg-tile" data-act="go" data-arg="trade"><span>💱</span><b>Trade</b><small>Sell & trade up</small></button>
      </div>
      <h4 class="section">Card Duel ladder <button class="link" data-act="tcgRules">How to play</button></h4>
      <div class="ladder">${TCG_LADDER.map((o, i) => {
        const won = beaten.has(o.id), open = i <= nextIdx || nextIdx < 0;
        return `<div class="ladder-row ${won ? 'won' : open ? 'open' : 'locked'}">
          <span class="lr-emoji">${open ? o.emoji : '🔒'}</span>
          <div class="grow"><b>${o.name}</b> <small class="muted">${o.title}</small>
            <div class="row gap-s">${o.types.map(t => CardUI.eIcon(t, 'sm')).join('')}<small class="muted">${'★'.repeat(i + 1)}</small></div></div>
          ${open ? `<button class="btn ${won ? 'btn-ghost' : 'btn-primary'} btn-sm" data-act="ladderDuel" data-arg="${i}">${won ? 'Rematch' : 'Duel'}</button>` : ''}
        </div>`;
      }).join('')}</div>
      <button class="btn btn-ghost btn-block" data-act="quickDuel">🎲 Quick duel vs. a random deck</button>
      <p class="muted small center-note">Gym Leaders also accept card duels — find them on the Gyms tab.</p>`;
  },
};

Act.tcgRules = () => Duel.showRules();
Act.starterDeck = async d => {
  const st = STARTER_DECKS.find(s => s.type === d.arg);
  if (!await UI.confirm(`Start with the <b>${st.icon} ${st.name}</b> ${st.type} deck?`, {ok: 'Choose this deck', title: 'Starter deck'})) return;
  Collection.chooseStarter(d.arg);
  Store.save();
  SFX.levelup();
  UI.toast('Starter deck added! You also got 2 Kanto Classics packs 📦', 'gold');
  UI.refresh();
};

// ── duels ──────────────────────────────────────────────────────────────────
function needDeck() {
  const deck = Collection.activeDeck();
  if (!deck || Cards.validate(deck.cards).length) {
    UI.toast('Your active deck isn’t legal yet — fix it in Decks', 'bad');
    UI.go('decks');
    return null;
  }
  return deck;
}
Act.ladderDuel = d => {
  const deck = needDeck(); if (!deck) return;
  const o = TCG_LADDER[+d.arg], t = Collection.T();
  Duel.start({deck: deck.cards, opp: {name: o.name, emoji: o.emoji, deck: Cards.buildDeck({types: o.types, quality: o.q})},
    onEnd: win => {
      if (!win) return ['Tweak your deck and try again!'];
      const first = !t.ladder.includes(o.id);
      if (first) t.ladder.push(o.id);
      const coins = 150 + +d.arg * 75;
      Store.earn(coins);
      Collection.givePacks(first ? 2 : 1);
      return [`+${coins} coins`, `📦 +${first ? 2 : 1} booster pack${first ? 's' : ''}`, first && +d.arg < TCG_LADDER.length - 1 ? `🔓 ${TCG_LADDER[+d.arg + 1].name} wants to duel!` : ''];
    }});
};
Act.quickDuel = () => {
  const deck = needDeck(); if (!deck) return;
  const type = pick(Cards.BASIC_ENERGY);
  Duel.start({deck: deck.cards, opp: {name: `${pick(TRAINER_NAMES)}`, emoji: Cards.ENERGY[type].icon, deck: Cards.buildDeck({types: [type], quality: .45})},
    onEnd: win => win ? (Store.earn(120), ['+120 coins']) : []});
};
Act.gymDuel = d => {
  const deck = needDeck(); if (!deck) return;
  const g = GYMS[+d.arg], t = Collection.T();
  const type = Cards.TYPE_TO_ENERGY[g.type];
  const types = type === 'Colorless' ? ['Colorless', 'Fighting'] : [type];
  Duel.start({deck: deck.cards, opp: {name: g.leader, emoji: g.badge, deck: Cards.buildDeck({types, quality: Math.min(1, .3 + +d.arg * .035)})},
    onEnd: win => {
      if (!win) return [];
      const first = !t.gymDuels.includes(g.id);
      if (first) {
        t.gymDuels.push(g.id);
        if (g.promo) Collection.add(g.promo);
        Collection.givePacks(1);
        return [g.promo ? `🌟 Promo card: <b>${esc(Cards.get(g.promo).name)}</b> (${esc(g.leader)}’s)` : '', '📦 +1 booster pack'];
      }
      Store.earn(200);
      return ['+200 coins'];
    }});
};

// ── packs ──────────────────────────────────────────────────────────────────
UI.Screens.packs = {
  title: () => cardsBack('📦 Booster packs'), tab: 'cards',
  render() {
    const t = Collection.T();
    return `<p class="lead">Each pack has 10 cards: 5 commons, 3 uncommons, a bonus card (rare chance of a ✦ Shiny Secret) and a guaranteed ★ Rare — sometimes a ★H Holo!</p>` +
      Cards.SETS.map(set => {
        const pr = Collection.setProgress(set.code), n = t.packs[set.code] || 0;
        return `<div class="set-card" style="--sc:${set.color}">
          <div class="pack-art"><span>${set.icon}</span><b>${set.name}</b></div>
          <div class="grow"><b>${set.name}</b><div class="muted small">${pr.owned}/${pr.total} collected</div>
            <div class="xp"><div class="xp-fill" style="width:${pr.owned / pr.total * 100}%"></div></div>
            <div class="row gap-s" style="margin-top:10px">
              <button class="btn btn-green btn-sm" data-act="buyPack" data-arg="${set.code}" ${G.coins < Cards.PACK_PRICE ? 'disabled' : ''}>Buy · 🪙${Cards.PACK_PRICE}</button>
              <button class="btn btn-primary btn-sm" data-act="openPack" data-arg="${set.code}" ${n ? '' : 'disabled'}>Open${n ? ` (${n})` : ''}</button>
            </div></div></div>`;
      }).join('');
  },
};
Act.buyPack = d => { if (Collection.buyPack(d.arg)) { SFX.buy(); Store.save(); UI.refresh(); } };
Act.openPack = async d => {
  const cards = Collection.openPack(d.arg);
  if (!cards) return;
  Store.save(); Store.checkAchievements();
  const order = cards.slice(); // rare is last already
  const set = Cards.SETS.find(s => s.code === d.arg);
  const s = UI.sheet({title: '', dismissable: false, cls: 'tall pack-sheet', html: `
    <div class="pack-open">
      <div class="pack-big" style="--sc:${set.color}"><span>${set.icon}</span><b>${set.name}</b><small>Tap to open</small></div>
      <div class="reveal"></div>
      <p class="muted small reveal-hint"></p>
    </div>`});
  const stage = $('.pack-open', s.el), reveal = $('.reveal', s.el), hint = $('.reveal-hint', s.el);
  let i = -1, opened = false;
  const showNext = () => {
    i++;
    if (i >= order.length) return summary();
    const {card, isNew} = order[i];
    const special = ['rare', 'holo', 'secret'].includes(card.rarity);
    reveal.innerHTML = `<div class="flip-in ${special ? 'special' : ''}">${CardUI.full(card, {w: 250})}${isNew ? '<span class="new-tag">NEW</span>' : ''}</div>`;
    hint.textContent = `${i + 1} / ${order.length} · ${Cards.RARITY[card.rarity].label} — tap for next`;
    card.rarity === 'secret' ? SFX.shiny() : special ? SFX.caught() : SFX.tap();
  };
  const summary = () => {
    stage.innerHTML = `<h3 style="text-align:center;margin-bottom:10px">You pulled</h3><div class="mini-grid">${order.map(({card, isNew}) =>
      CardUI.mini(card, {badge: isNew ? '<span class="new-tag sm">NEW</span>' : ''})).join('')}</div>
      <button class="btn btn-primary btn-block" data-close>Add to binder</button>`;
    s.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) { s.close(); UI.refresh(); } });
  };
  stage.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return;
    if (!opened) { opened = true; $('.pack-big', s.el).classList.add('torn'); SFX.throw(); setTimeout(showNext, 450); return; }
    if (i >= 0 && i < order.length) showNext();
  });
};

// ── binder ─────────────────────────────────────────────────────────────────
UI.Screens.binder = {
  title: () => cardsBack('📒 Binder'), tab: 'cards',
  render(p) {
    const tab = p.set || 'KAN';
    const seg = `<div class="seg">${Cards.SETS.map(st => `<button class="${tab === st.code ? 'on' : ''}" data-act="go" data-arg="binder" data-set="${st.code}">${st.icon} ${st.code}</button>`).join('')}
      <button class="${tab === 'SPECIAL' ? 'on' : ''}" data-act="go" data-arg="binder" data-set="SPECIAL">✦ Special</button></div>`;
    if (tab === 'SPECIAL') {
      const special = Object.keys(Collection.T().cards).map(Cards.get).filter(c => c && (c.shiny || c.set === 'PR'));
      const promos = GYMS.filter(g => g.promo).map(g => Cards.get(g.promo));
      return seg + `<h4 class="section">Gym Leader promos <span class="muted">${promos.filter(c => Collection.count(c.id)).length}/${promos.length}</span></h4>
        <div class="binder">${promos.map(c => Collection.count(c.id) ? CardUI.mini(c, {attrs: `data-act="cardZoom" data-arg="${c.id}"`, badge: count(c.id)})
          : `<div class="slot-empty"><small>${esc(GYMS.find(g => g.promo === c.id).leader)}</small><span>?</span></div>`).join('')}</div>
        <h4 class="section">Shiny Secrets <span class="muted">${special.filter(c => c.shiny).length} found</span></h4>
        ${special.filter(c => c.shiny).length ? `<div class="binder">${special.filter(c => c.shiny).map(c => CardUI.mini(c, {attrs: `data-act="cardZoom" data-arg="${c.id}"`, badge: count(c.id)})).join('')}</div>`
          : '<p class="empty-note">Shiny Secret rares hide in about 1 in 25 packs. Good luck!</p>'}`;
    }
    const list = Cards.BY_SET[tab], pr = Collection.setProgress(tab);
    return seg + `<div class="dex-progress"><div class="row between"><b>${Cards.SETS.find(s => s.code === tab).name}</b><span class="muted">${pr.owned}/${pr.total}</span></div>
      <div class="xp big"><div class="xp-fill" style="width:${pr.owned / pr.total * 100}%"></div></div></div>
      <div class="binder">${list.map(c => Collection.count(c.id)
        ? CardUI.mini(c, {attrs: `data-act="cardZoom" data-arg="${c.id}"`, badge: count(c.id)})
        : `<div class="slot-empty"><small>#${c.num}</small>${c.kind === 'pokemon' ? `<img src="${API.art(c.species)}" alt="" loading="lazy">` : '<span>?</span>'}</div>`).join('')}</div>`;
  },
};
const count = id => { const n = Collection.count(id); return n > 1 ? `<span class="count-badge">×${n}</span>` : ''; };

Act.cardZoom = d => {
  const c = Cards.get(d.arg), n = Collection.count(d.arg);
  const v = Cards.RARITY[c.rarity].sell;
  const s = UI.sheet({title: `${esc(c.name)} <small class="muted">${Cards.RARITY[c.rarity].label}</small>`, cls: 'tall', html: `<div class="card-zoom">${CardUI.full(c, {w: 270})}</div>
    <p class="muted center-note">You own ${n}.</p>
    ${n > 1 && v ? `<button class="btn btn-ghost btn-block" data-sell>Sell one duplicate · +🪙${v}</button>` : ''}`});
  const b = $('[data-sell]', s.el);
  b && b.addEventListener('click', () => { const got = Collection.sellOne(c.id); Store.save(); UI.toast(`Sold for ${got} coins`); s.close(); UI.refresh(); });
};

// ── decks ──────────────────────────────────────────────────────────────────
UI.Screens.decks = {
  title: () => cardsBack('🗂️ Decks'), tab: 'cards',
  render() {
    const t = Collection.T();
    return `<div class="menu">${t.decks.map((d, i) => {
      const errs = Cards.validate(d.cards);
      return `<div class="deck-row ${i === t.active ? 'active' : ''}">
        <div class="grow"><b>${esc(d.name)}</b>${i === t.active ? ' <span class="tag tag-gold">Active</span>' : ''}
          <div class="muted small">${errs.length ? '⚠️ ' + esc(errs.join(' · ')) : '✅ Legal 60-card deck'}</div>
          <div class="row gap-s" style="margin-top:4px">${[...new Set(Object.keys(d.cards).map(Cards.get).filter(c => c && c.kind !== 'trainer').map(c => c.type))].map(t => CardUI.eIcon(t, 'sm')).join('')}</div></div>
        <div class="deck-btns">
          ${i !== t.active ? `<button class="btn btn-ghost btn-sm" data-act="deckActive" data-arg="${i}">Use</button>` : ''}
          <button class="btn btn-primary btn-sm" data-act="go" data-arg="deckedit" data-i="${i}">Edit</button>
        </div></div>`;
    }).join('')}</div>
    ${t.decks.length < 5 ? '<button class="btn btn-green btn-block" data-act="newDeck">＋ New deck</button>' : ''}
    <p class="muted small center-note">Deck rules: exactly 60 cards · max 4 copies of a card (basic Energy unlimited) · at least 1 Basic Pokémon.</p>`;
  },
};
Act.deckActive = d => { Collection.T().active = +d.arg; Store.save(); UI.refresh(); };
Act.newDeck = async () => {
  const how = await UI.choose({title: 'New deck', options: [
    ...Cards.BASIC_ENERGY.map(t => ({value: t, html: `${CardUI.eIcon(t)}<span class="choice-main"><span class="choice-label">Auto-build: ${t}</span><span class="choice-sub">Built from cards you own</span></span>`})),
    {value: 'empty', icon: '📄', label: 'Empty deck', sub: 'Build it card by card'}]});
  if (!how) return;
  const t = Collection.T();
  t.decks.push({name: how === 'empty' ? `Deck ${t.decks.length + 1}` : `${how} Deck`, cards: how === 'empty' ? {} : Collection.autoBuild([how])});
  Store.save();
  UI.go('deckedit', {i: t.decks.length - 1});
};

UI.Screens.deckedit = {
  title: () => `<button class="back-btn" data-act="go" data-arg="decks" aria-label="Back">‹</button>✏️ Edit deck`, tab: 'cards',
  render(p) {
    const t = Collection.T(), i = +p.i, deck = t.decks[i];
    if (!deck) return '<p class="empty-note">Deck not found.</p>';
    const view = p.view || 'pokemon';
    const size = Collection.deckSize(deck), errs = Cards.validate(deck.cards);
    const seg = `<div class="seg">${[['pokemon', 'Pokémon'], ['trainer', 'Trainers'], ['energy', 'Energy'], ['list', 'In deck']].map(([v, l]) =>
      `<button class="${view === v ? 'on' : ''}" data-act="go" data-arg="deckedit" data-i="${i}" data-view="${v}">${l}</button>`).join('')}</div>`;
    const row = (c, owned) => {
      const n = deck.cards[c.id] || 0;
      return `<div class="de-row">${CardUI.mini(c, {attrs: `data-act="cardZoom" data-arg="${c.id}"`})}
        <div class="grow"><b>${esc(c.kind === 'energy' ? c.name : c.name)}</b><div class="muted small">${c.kind === 'pokemon'
          ? `${c.stage ? 'Stage ' + c.stage : 'Basic'} · ${c.hp} HP · ${c.type}` : c.kind === 'trainer' ? c.sub : 'Basic Energy'} · ${owned === Infinity ? '∞' : 'own ' + owned}</div></div>
        <div class="stepper"><button data-act="deckStep" data-i="${i}" data-id="${c.id}" data-n="-1" ${n ? '' : 'disabled'}>−</button><b>${n}</b>
        <button data-act="deckStep" data-i="${i}" data-id="${c.id}" data-n="1" ${n < Math.min(owned, c.kind === 'energy' ? 60 : 4) ? '' : 'disabled'}>＋</button></div></div>`;
    };
    let list;
    if (view === 'energy') list = Cards.BASIC_ENERGY.map(e => row(Cards.get('E-' + e), Infinity));
    else if (view === 'list') list = Object.keys(deck.cards).map(Cards.get).filter(Boolean)
      .sort((a, b) => ({pokemon: 0, trainer: 1, energy: 2}[a.kind] - {pokemon: 0, trainer: 1, energy: 2}[b.kind]))
      .map(c => row(c, c.kind === 'energy' ? Infinity : Collection.count(c.id)));
    else list = Object.entries(Collection.T().cards).map(([id, n]) => [Cards.get(id), n]).filter(([c]) => c && c.kind === view)
      .sort(([a], [b]) => a.kind === 'pokemon' ? (a.type.localeCompare(b.type) || a.species - b.species) : a.name.localeCompare(b.name))
      .map(([c, n]) => row(c, n));
    return `<div class="deck-head ${errs.length ? 'bad' : 'ok'}"><div class="grow"><b class="deck-name" data-act="deckRename" data-i="${i}">${esc(deck.name)} ✏️</b>
        <div class="small">${size}/60 cards · ${errs.length ? '⚠️ ' + esc(errs[0]) : '✅ Legal'}</div></div>
        <button class="btn btn-ghost btn-sm" data-act="deckAuto" data-i="${i}">🪄 Auto</button></div>
      ${seg}<div class="de-list">${list.join('') || '<p class="empty-note">Nothing here yet — open some packs!</p>'}</div>
      <button class="btn btn-ghost btn-block danger" data-act="deckDelete" data-i="${i}">🗑 Delete deck</button>`;
  },
};
Act.deckStep = d => {
  const deck = Collection.T().decks[+d.i];
  const n = (deck.cards[d.id] || 0) + +d.n;
  if (n <= 0) delete deck.cards[d.id]; else deck.cards[d.id] = n;
  Store.save();
  const y = $('#main').scrollTop; UI.refresh(); $('#main').scrollTop = y;
};
Act.deckRename = async d => {
  const deck = Collection.T().decks[+d.i];
  const n = await UI.prompt({title: 'Deck name', value: deck.name, max: 20});
  if (n) { deck.name = n; Store.save(); UI.refresh(); }
};
Act.deckAuto = async d => {
  const deck = Collection.T().decks[+d.i];
  const types = await UI.choose({title: '🪄 Auto-build from your cards', text: 'Replaces this deck with the best list your collection allows.',
    options: Cards.BASIC_ENERGY.map(t => ({value: t, html: `${CardUI.eIcon(t)}<span class="choice-label">${t}</span>`}))});
  if (!types) return;
  deck.cards = Collection.autoBuild([types]);
  Store.save(); UI.refresh();
};
Act.deckDelete = async d => {
  const t = Collection.T();
  if (t.decks.length <= 1) { UI.toast('You need at least one deck', 'bad'); return; }
  if (!await UI.confirm(`Delete “${esc(t.decks[+d.i].name)}”? Your cards stay in your binder.`, {ok: 'Delete', danger: true})) return;
  t.decks.splice(+d.i, 1);
  t.active = Math.min(t.active, t.decks.length - 1);
  Store.save(); UI.go('decks');
};

// ── trading ────────────────────────────────────────────────────────────────
UI.Screens.trade = {
  title: () => cardsBack('💱 Trade'), tab: 'cards',
  render() {
    const ex = Collection.extras();
    const exCount = ex.reduce((a, b) => a + b.n, 0), exCoins = ex.reduce((a, b) => a + b.n * Cards.RARITY[b.card.rarity].sell, 0);
    return `<div class="info-card"><div class="big-emoji">🪙</div><b>Sell extras</b>
        <p class="muted small">Copies beyond 4 can’t go in a deck. Sell them all at once (you keep 4 of everything).</p>
        <button class="btn btn-green btn-block" data-act="sellExtras" ${exCount ? '' : 'disabled'}>${exCount ? `Sell ${exCount} cards · +🪙${exCoins}` : 'No extras right now'}</button></div>
      <h4 class="section">Trade-up machine</h4>
      <p class="lead">Feed in 5 duplicate cards (copies beyond your first) of one rarity and get a random card of the next rarity up.</p>
      ${Object.entries(Collection.TRADE_UP).map(([from, to]) => {
        const n = Collection.dupes(from).reduce((a, b) => a + b.n, 0);
        return `<div class="item-row"><span class="item-emoji">${Cards.RARITY[from].sym}</span><div class="grow"><b>${Cards.RARITY[from].label} → ${Cards.RARITY[to].label}</b>
          <div class="muted small">${n} duplicate${n === 1 ? '' : 's'} available</div></div>
          <button class="btn btn-primary btn-sm" data-act="tradeUp" data-arg="${from}" ${n >= 5 ? '' : 'disabled'}>Trade 5</button></div>`;
      }).join('')}`;
  },
};
Act.sellExtras = () => { const c = Collection.sellExtras(); Store.save(); SFX.buy(); UI.toast(`Sold extras for ${c} coins`); UI.refresh(); };
Act.tradeUp = async d => {
  const r = Collection.tradeUp(d.arg);
  if (!r) return;
  Store.save(); Store.checkAchievements(); SFX.caught();
  await UI.choose({title: '💱 Trade complete!', text: `<div class="card-zoom">${CardUI.full(r.card, {w: 240})}</div>${r.isNew ? '<p class="center-note"><span class="new-tag">NEW</span></p>' : ''}`, options: [], cancel: 'Nice!'});
  UI.refresh();
};
