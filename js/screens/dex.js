'use strict';
// ── POKÉDEX ─────────────────────────────────────────────────────────────────

UI.Screens.dex = {
  title: '📖 Pokédex',
  tab: 'dex',
  render(p) {
    const filter = p.filter || 'all';
    const ids = Object.keys(G.dex).map(Number).sort((a, b) => a - b);
    const caught = ids.filter(id => G.dex[id].c).length;
    const shown = ids.filter(id => filter === 'all' || (filter === 'caught' ? G.dex[id].c : !G.dex[id].c));
    const chip = (f, label) => `<button class="${filter === f ? 'on' : ''}" data-act="go" data-arg="dex" data-filter="${f}">${label}</button>`;
    return `<div class="dex-progress">
        <div class="row between"><b>${caught} caught</b><span class="muted">${ids.length} seen · 1025 total</span></div>
        <div class="xp big"><div class="xp-fill" style="width:${caught / 1025 * 100}%"></div></div>
      </div>
      <div class="seg">${chip('all', 'All')}${chip('caught', 'Caught')}${chip('seen', 'Seen only')}</div>
      <input class="input" id="dex-search" placeholder="Search by name or number…" autocomplete="off">
      ${shown.length ? `<div class="dex-grid">${shown.map(id => {
        const e = G.dex[id];
        return `<button class="dex-tile ${e.c ? '' : 'unseen'}" data-act="dexEntry" data-arg="${id}" data-q="${id} ${esc(e.n.toLowerCase())}">
          <img src="${API.art(id, e.s)}" alt="" loading="lazy"><small>#${String(id).padStart(4, '0')}</small>
          <span>${e.c ? esc(e.n) : esc(e.n)}</span>${e.s ? '<i class="dex-shiny">✨</i>' : ''}</button>`;
      }).join('')}</div>` : '<p class="empty-note">Nothing here yet — go explore!</p>'}`;
  },
  after(root) {
    const inp = $('#dex-search', root);
    inp && inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      $$('.dex-tile', root).forEach(t => { t.style.display = !q || t.dataset.q.includes(q) ? '' : 'none'; });
    });
  },
};

Act.dexEntry = async d => {
  const id = +d.arg, e = G.dex[id];
  let sp;
  try { sp = await UI.busy('Opening entry…', () => API.species(id)); }
  catch (err) { UI.toast('Could not load this entry', 'bad'); return; }
  const total = Object.values(sp.bs).reduce((a, b) => a + b, 0);
  const evoNames = await Promise.all(sp.evos.map(async ev => {
    const t = await API.species(ev.to).catch(() => null);
    return t ? `${esc(t.name)} — ${ev.method === 'level' ? 'Lv. ' + ev.level : ITEMS[ev.item].emoji + ' ' + ITEMS[ev.item].name}` : null;
  }));
  UI.sheet({title: `#${String(id).padStart(4, '0')} ${esc(sp.name)}`, cls: 'tall', html: `
    <div class="sum-head" style="--tc:${TYPE_COLOR[sp.types[0]]}">
      <img class="sum-art ${e.c ? '' : 'silhouette'}" src="${API.art(id, e.s)}" alt="">
      <div class="grow"><div class="sum-name">${esc(sp.name)}</div><div class="muted small">${esc(sp.genus)}</div>
        <div class="row gap-s" style="margin-top:6px">${UI.types(sp.types)}</div>
        <div class="muted small" style="margin-top:6px">${e.c ? '✅ Caught' : '👁️ Seen'}${sp.legendary ? ' · 🌟 Legendary' : ''}</div></div>
    </div>
    ${sp.flavor ? `<p class="flavor">${esc(sp.flavor)}</p>` : ''}
    <h4 class="section">Base stats <span class="muted">${total}</span></h4>
    <div class="stat-table no-iv">${STAT_ROWS.map(([k, l]) => `<div class="st-label">${l}</div>
      <div class="st-bar"><i style="width:${Math.min(100, sp.bs[k] / 1.8)}%"></i></div><div class="st-val">${sp.bs[k]}</div>`).join('')}</div>
    <h4 class="section">Evolution</h4>
    <p class="muted">${evoNames.filter(Boolean).join('<br>') || 'Does not evolve further.'}</p>
    <p class="muted small">Catch rate: ${sp.capture}/255</p>`});
};
