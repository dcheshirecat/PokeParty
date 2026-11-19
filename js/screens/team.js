'use strict';
// ── TEAM & PC · POKÉMON SUMMARY · ITEMS ON POKÉMON · MOVE TUTOR ─────────────

const STAT_ROWS = [['hp','HP'],['atk','Attack'],['def','Defense'],['spa','Sp. Atk'],['spd','Sp. Def'],['spe','Speed']];

UI.Screens.team = {
  title: '🎒 Team & PC',
  tab: 'team',
  render() {
    const card = (m, i) => {
      const evoHint = m.evoReady ? '<span class="tag tag-gold">Can evolve!</span>' : '';
      return `<button class="mon-card" style="--tc:${TYPE_COLOR[m.types[0]]}" data-act="monSheet" data-where="team" data-arg="${i}">
        ${UI.monImg(m, 'mc-img')}
        <div class="grow">
          <div class="row between"><b class="mc-name">${esc(Engine.displayName(m))}${m.shiny ? ' ✨' : ''}</b><span class="muted small">Lv.${m.level}</span></div>
          <div class="row gap-s">${UI.types(m.types)} ${UI.statusBadge(m.status)} ${evoHint}</div>
          ${UI.hpBar(m)}
          <div class="xp"><div class="xp-fill" style="width:${UI.expPct(m)}%"></div></div>
        </div></button>`;
    };
    const box = G.pc.length
      ? `<div class="pc-grid">${G.pc.map((m, i) => `<button class="pc-tile" data-act="monSheet" data-where="pc" data-arg="${i}">
          ${UI.monImg(m)}<span>${esc(Engine.displayName(m))}</span><small>Lv.${m.level}${m.shiny ? ' ✨' : ''}</small></button>`).join('')}</div>`
      : '<p class="empty-note">Your PC box is empty. Pokémon you catch with a full party go here.</p>';
    return `<h4 class="section">Party <span class="muted">${G.team.length}/6</span></h4>
      <div class="mon-list">${G.team.map(card).join('')}</div>
      <h4 class="section">PC Box <span class="muted">${G.pc.length}</span></h4>${box}`;
  },
  async after() {
    // Mark Pokémon that can evolve by level right now (species data is cached)
    let changed = false;
    for (const m of G.team) {
      const ready = Progress.levelReady(await Progress.evoOptions(m), m).length > 0;
      if (!!m.evoReady !== ready) { m.evoReady = ready; changed = true; }
    }
    if (changed && UI.current() === 'team') UI.refresh();
  },
};

const listOf = where => where === 'pc' ? G.pc : G.team;

Act.monSheet = d => openMonSheet(d.where, +d.arg);

function openMonSheet(where, idx) {
  const list = listOf(where), m = list[idx];
  if (!m) return;
  const tc = TYPE_COLOR[m.types[0]];
  const best = Math.max(...Object.values(m.stats));
  const ivStars = v => v >= 30 ? '★★★' : v >= 20 ? '★★' : v >= 10 ? '★' : '·';
  const html = `
    <div class="sum-head" style="--tc:${tc}">
      ${UI.monImg(m, 'sum-art')}
      <div class="grow">
        <div class="sum-name">${esc(Engine.displayName(m))}${m.shiny ? ' ✨' : ''}</div>
        ${m.nick ? `<div class="muted small">${esc(m.name)}</div>` : ''}
        <div class="muted small">#${String(m.id).padStart(4, '0')} · Lv.${m.level}</div>
        <div class="row gap-s" style="margin-top:6px">${UI.types(m.types)} ${UI.statusBadge(m.status)}</div>
      </div>
    </div>
    ${UI.hpBar(m)}
    <div class="xp-row"><span class="muted small">EXP</span><div class="xp grow"><div class="xp-fill" style="width:${UI.expPct(m)}%"></div></div>
      <span class="muted small">${m.level < 100 ? (Engine.expAt(m.level + 1) - m.exp).toLocaleString() + ' to next' : 'MAX'}</span></div>
    <h4 class="section">Stats</h4>
    <div class="stat-table">${STAT_ROWS.map(([k, label]) => `
      <div class="st-label">${label}</div>
      <div class="st-bar"><i style="width:${Math.round(m.stats[k] / best * 100)}%"></i></div>
      <div class="st-val">${m.stats[k]}</div>
      <div class="st-iv" title="IV ${m.ivs[k]}">${ivStars(m.ivs[k])}</div>`).join('')}
    </div>
    <p class="muted small">★ = hidden potential (IVs). Higher stars mean stronger stats.</p>
    <h4 class="section">Moves</h4>
    <div class="move-list">${m.moves.map(mv => `<div class="move-item">${UI.moveChip(mv)}<div class="muted small">${esc(UI.moveDesc(mv)) || (mv.acc ? mv.acc + '% accuracy' : 'Never misses')}</div></div>`).join('')}</div>
    <div class="action-grid">
      <button class="btn btn-ghost" data-mact="nick">✏️ Nickname</button>
      <button class="btn btn-ghost" data-mact="item">🎒 Use item</button>
      <button class="btn btn-ghost" data-mact="evolve">✨ Evolve</button>
      <button class="btn btn-ghost" data-mact="tutor">📖 Move tutor</button>
      ${where === 'team' ? `
        <button class="btn btn-ghost" data-mact="up" ${idx === 0 ? 'disabled' : ''}>⬆️ Move up</button>
        <button class="btn btn-ghost" data-mact="lead" ${idx === 0 ? 'disabled' : ''}>⭐ Make leader</button>
        <button class="btn btn-ghost" data-mact="pc" ${G.team.length <= 1 ? 'disabled' : ''}>📦 Send to PC</button>`
      : `<button class="btn btn-ghost" data-mact="party" ${G.team.length >= 6 ? 'disabled' : ''}>🎒 Add to party</button>
        <button class="btn btn-ghost danger" data-mact="release">👋 Release</button>`}
    </div>`;
  const s = UI.sheet({title: 'Summary', html, cls: 'tall'});
  s.body.addEventListener('click', async e => {
    const b = e.target.closest('[data-mact]');
    if (!b) return;
    const a = b.dataset.mact;
    const reopen = (w = where, i = idx) => { s.close(); UI.refresh(); setTimeout(() => openMonSheet(w, i), 240); };
    if (a === 'nick') {
      const n = await UI.prompt({title: 'Nickname', value: m.nick || '', placeholder: m.name,
        extra: m.nick ? `<button class="btn btn-ghost btn-block" style="margin-top:8px" data-val="">Remove nickname</button>` : ''});
      if (n === null) return;
      m.nick = n ? n.slice(0, 12) : null;
      Store.save(); Store.checkAchievements(); reopen();
    } else if (a === 'up' && idx > 0) {
      [G.team[idx - 1], G.team[idx]] = [G.team[idx], G.team[idx - 1]]; Store.save(); reopen('team', idx - 1);
    } else if (a === 'lead' && idx > 0) {
      G.team.unshift(G.team.splice(idx, 1)[0]); Store.save(); reopen('team', 0);
    } else if (a === 'pc') {
      if (G.team.length <= 1) return;
      G.pc.push(G.team.splice(idx, 1)[0]); Store.save(); s.close(); UI.refresh();
    } else if (a === 'party') {
      if (G.team.length >= 6) return;
      G.team.push(G.pc.splice(idx, 1)[0]); Store.save(); s.close(); UI.refresh();
    } else if (a === 'release') {
      if (await UI.confirm(`Release ${esc(Engine.displayName(m))} into the wild? You can't undo this.`, {ok: 'Release', danger: true})) {
        G.pc.splice(idx, 1); Store.save(); s.close(); UI.refresh();
        UI.toast(`Bye-bye, ${Engine.displayName(m)}! 👋`, 'info');
      }
    } else if (a === 'item') {
      s.close();
      await useItemOn(m);
      UI.refresh();
    } else if (a === 'evolve') {
      await evolveMenu(m) && reopen();
    } else if (a === 'tutor') {
      await moveTutor(m) && reopen();
    }
  });
}

// ── items outside battle ───────────────────────────────────────────────────
function itemValidFor(id, m) {
  const it = ITEMS[id];
  if (it.kind === 'revive') return m.hp <= 0;
  if (it.kind === 'cure') return m.hp > 0 && !!m.status;
  if (it.kind === 'heal') return m.hp > 0 && (m.hp < m.stats.hp || (it.cure && !!m.status));
  if (it.kind === 'candy') return m.level < 100;
  return false;
}
async function useItemOn(m, preset) {
  const usable = Object.keys(G.bag).filter(id => ['heal', 'cure', 'revive', 'candy'].includes(ITEMS[id]?.kind));
  const id = preset || await UI.choose({title: `Use an item on ${esc(Engine.displayName(m))}`,
    options: usable.length ? usable.map(id => ({value: id, icon: ITEMS[id].emoji, disabled: !itemValidFor(id, m),
      label: `${ITEMS[id].name} <small>×${Store.count(id)}</small>`, sub: ITEMS[id].desc}))
      : [{value: null, label: 'No usable items', disabled: true}]});
  if (!id || !itemValidFor(id, m) || !Store.useItem(id)) return false;
  const it = ITEMS[id], name = Engine.displayName(m);
  if (it.kind === 'revive') { m.hp = Math.max(1, Math.floor(m.stats.hp * it.frac)); UI.toast(`${name} was revived!`); }
  if (it.kind === 'heal') {
    const h = Math.min(it.heal, m.stats.hp - m.hp); m.hp += h;
    if (it.cure) { m.status = null; m.sleep = 0; }
    UI.toast(`${name} recovered ${h} HP`);
  }
  if (it.kind === 'cure') { m.status = null; m.sleep = 0; UI.toast(`${name} is cured!`); }
  if (it.kind === 'candy') {
    m.exp = Engine.expAt(m.level + 1);
    await Progress.levelUp(m);
    await Progress.runPendingEvolutions([m]);
  }
  SFX.heal();
  Store.save();
  return true;
}

// ── evolution menu (level, stones, link cable…) ────────────────────────────
async function evolveMenu(m) {
  const evos = await UI.busy('Checking evolutions…', () => Progress.evoOptions(m));
  if (!evos.length) { UI.toast(`${Engine.displayName(m)} doesn't evolve.`, 'info'); return false; }
  const targets = await UI.busy('Checking evolutions…', () => Promise.all(evos.map(e => API.species(e.to).catch(() => null))));
  const opts = evos.map((e, i) => {
    const sp = targets[i];
    if (!sp) return null;
    const ok = e.method === 'level' ? m.level >= e.level : Store.count(e.item) > 0;
    const how = e.method === 'level' ? `Reaches Lv. ${e.level}${ok ? ' ✓' : ''}`
      : `Use a ${ITEMS[e.item].emoji} ${ITEMS[e.item].name} (${Store.count(e.item)} owned · buy in the Shop)`;
    return {value: i, disabled: !ok, html: `<img class="choice-mon" src="${API.art(sp.id, m.shiny)}" alt="">
      <span class="choice-main"><span class="choice-label">${esc(sp.name)}</span><span class="choice-sub">${how}</span></span>`};
  }).filter(Boolean);
  const i = await UI.choose({title: `Evolve ${esc(Engine.displayName(m))}`, options: opts});
  if (i === null) return false;
  const e = evos[i];
  if (e.method === 'item') {
    if (!await UI.confirm(`Use a ${ITEMS[e.item].name} on ${esc(Engine.displayName(m))}?`, {ok: 'Use it'})) return false;
    Store.useItem(e.item);
  }
  m.noEvolve = null;
  const done = await Progress.evolve(m, e.to);
  if (!done && e.method === 'item') Store.addItem(e.item); // refund if cancelled
  Store.save();
  return done;
}

// ── move tutor: relearn level-up moves for free, TMs for coins ─────────────
const TM_PRICE = 800;
async function moveTutor(m) {
  let list;
  try {
    list = await UI.busy('Loading moves…', async () => {
      const sp = await API.species(m.id);
      const known = new Set(m.moves.map(x => x.id));
      const lvl = sp.learnset.filter(([id, lv]) => lv <= m.level && !known.has(id)).map(([id]) => id);
      const tms = sp.tms.filter(id => !known.has(id) && !lvl.includes(id));
      const [a, b] = await Promise.all([API.moves([...new Set(lvl)].slice(-24)), API.moves(tms.slice(0, 30))]);
      const sort = arr => arr.filter(x => !MOVE_BLACKLIST.has(x.key)).sort((x, y) => (y.power || 0) - (x.power || 0));
      return [...sort(a).map(x => ({mv: x, cost: 0})), ...sort(b).map(x => ({mv: x, cost: TM_PRICE}))];
    });
  } catch (e) { UI.toast('Could not load moves', 'bad'); return false; }
  if (!list.length) { UI.toast('No new moves to learn right now.', 'info'); return false; }
  const i = await UI.choose({title: `📖 Teach ${esc(Engine.displayName(m))} a move`,
    text: `Level-up moves are free. Technical Machines cost 🪙 ${TM_PRICE}. You have 🪙 ${UI.coinStr(G.coins)}.`,
    options: list.map(({mv, cost}, i) => ({value: i, disabled: cost > G.coins,
      html: `<span class="choice-main">${UI.moveChip({...mv, maxPp: 0})}<span class="choice-sub">${esc(UI.moveDesc(mv)) || (mv.acc ? mv.acc + '% acc' : '')}</span></span>
        <span class="tag ${cost ? 'tag-gold' : ''}">${cost ? 'TM · 🪙' + cost : 'Free'}</span>`}))});
  if (i === null) return false;
  const {mv, cost} = list[i];
  const learned = await Progress.teach(m, mv);
  if (learned && cost) G.coins -= cost;
  Store.save();
  return learned;
}
