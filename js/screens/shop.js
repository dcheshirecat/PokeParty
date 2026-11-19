'use strict';
// ── SHOP & BAG ──────────────────────────────────────────────────────────────

const ITEM_GROUPS = [
  ['Poké Balls', ['ball']], ['Medicine', ['heal', 'cure', 'revive']], ['Training', ['candy']], ['Evolution', ['evo']],
];

UI.Screens.shop = {
  title: '🛒 Shop',
  tab: 'shop',
  render(p) {
    const tab = p.tab || 'buy';
    const seg = `<div class="seg"><button class="${tab === 'buy' ? 'on' : ''}" data-act="go" data-arg="shop" data-tab="buy">Buy</button>
      <button class="${tab === 'bag' ? 'on' : ''}" data-act="go" data-arg="shop" data-tab="bag">My bag</button></div>`;
    if (tab === 'bag') {
      const owned = Object.keys(G.bag).filter(id => ITEMS[id] && G.bag[id] > 0);
      if (!owned.length) return seg + '<p class="empty-note">Your bag is empty.</p>';
      return seg + ITEM_GROUPS.map(([label, kinds]) => {
        const ids = owned.filter(id => kinds.includes(ITEMS[id].kind));
        if (!ids.length) return '';
        return `<h4 class="section">${label}</h4>` + ids.map(id => {
          const it = ITEMS[id], usable = ['heal', 'cure', 'revive', 'candy', 'evo'].includes(it.kind);
          return `<div class="item-row"><span class="item-emoji">${it.emoji}</span>
            <div class="grow"><b>${it.name}</b> <span class="muted">×${G.bag[id]}</span><div class="muted small">${it.desc}</div></div>
            ${usable ? `<button class="btn btn-ghost btn-sm" data-act="useBagItem" data-arg="${id}">Use</button>` : ''}</div>`;
        }).join('');
      }).join('');
    }
    const badges = Store.badgeCount();
    return seg + ITEM_GROUPS.map(([label, kinds]) => {
      const ids = Object.keys(ITEMS).filter(id => kinds.includes(ITEMS[id].kind));
      return `<h4 class="section">${label}</h4>` + ids.map(id => {
        const it = ITEMS[id], locked = badges < it.badges;
        return `<div class="item-row ${locked ? 'locked' : ''}"><span class="item-emoji">${locked ? '🔒' : it.emoji}</span>
          <div class="grow"><b>${it.name}</b> ${Store.count(id) ? `<span class="muted small">(own ${Store.count(id)})</span>` : ''}
            <div class="muted small">${locked ? `Unlocks with ${it.badges} badge${it.badges === 1 ? '' : 's'}` : it.desc}</div></div>
          ${locked ? '' : `<div class="buy-col"><span class="price">🪙 ${UI.coinStr(it.price)}</span>
            <div class="row gap-s"><button class="btn btn-green btn-sm" data-act="buy" data-arg="${id}" data-n="1" ${G.coins < it.price ? 'disabled' : ''}>Buy</button>
            ${it.price <= 1200 ? `<button class="btn btn-ghost btn-sm" data-act="buy" data-arg="${id}" data-n="5" ${G.coins < it.price * 5 ? 'disabled' : ''}>×5</button>` : ''}</div></div>`}
        </div>`;
      }).join('');
    }).join('');
  },
};

Act.buy = d => {
  const it = ITEMS[d.arg], n = +d.n || 1, cost = it.price * n;
  if (G.coins < cost || Store.badgeCount() < it.badges) return;
  G.coins -= cost;
  Store.addItem(d.arg, n);
  // Classic bonus: a free Premier-style extra ball for bulk ball purchases
  if (it.kind === 'ball' && n >= 5) Store.addItem('poke-ball', 1);
  Store.save();
  SFX.buy();
  UI.toast(`Bought ${n}× ${it.name}${it.kind === 'ball' && n >= 5 ? ' (+1 bonus Poké Ball!)' : ''}`);
  UI.refresh();
};

Act.useBagItem = async d => {
  const id = d.arg, it = ITEMS[id];
  const pool = it.kind === 'evo' ? G.team.concat(G.pc) : G.team;
  const opts = await UI.busy('Checking…', () => Promise.all(pool.map(async (m, i) => {
    let ok = false;
    if (it.kind === 'evo') ok = (await Progress.evoOptions(m)).some(e => e.method === 'item' && e.item === id);
    else ok = itemValidFor(id, m);
    return {value: i, disabled: !ok, html: `${UI.monImg(m, 'choice-mon')}<span class="choice-main"><span class="choice-label">${esc(Engine.displayName(m))} <small>Lv.${m.level}</small></span>
      <span class="choice-sub">${it.kind === 'evo' ? (ok ? 'Compatible!' : 'No effect') : UI.hpBar(m)}</span></span>`};
  })));
  const i = await UI.choose({title: `Use ${it.name} on…`, options: opts});
  if (i === null) return;
  const m = pool[i];
  if (it.kind === 'evo') {
    const e = (await Progress.evoOptions(m)).find(x => x.method === 'item' && x.item === id);
    if (!e) return;
    Store.useItem(id);
    if (!await Progress.evolve(m, e.to)) Store.addItem(id);
    Store.save();
  } else await useItemOn(m, id);
  UI.refresh();
};
