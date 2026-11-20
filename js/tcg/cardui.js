'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  CARD RENDERING — full cards, mini cards, in-play cards, card backs.
//  Original frame design; artwork is the official Pokémon artwork via PokéAPI.
// ════════════════════════════════════════════════════════════════════════════
const CardUI = (() => {
  const TRAINER_ART = {'potion':'🧪','super-potion':'⚗️','switch':'🔄','poke-ball':'⚪','nest-ball':'🪺','great-ball':'🔵',
    'energy-search':'🔍','full-heal':'🩹','rare-candy':'🍬','energy-retrieval':'♻️','professors-notes':'📓',
    'helpful-friend':'🤝','pep-talk':'📣','call-out':'📢','pokemon-nurse':'🏥'};
  const ec = t => Cards.ENERGY[t]?.color || '#999';
  const eIcon = (t, cls = '') => `<i class="eic ${cls}" style="--c:${ec(t)}" title="${t}">${Cards.ENERGY[t]?.icon || '?'}</i>`;
  const cost = arr => arr.length ? arr.map(t => eIcon(t)).join('') : '<i class="eic none">—</i>';
  const setLabel = c => c.set === 'PR' ? `PROMO · ${esc(c.promo || '')}` :
    `${c.set} ${String(c.shiny ? c.num - 1000 : c.num).padStart(3, '0')}/${String(Cards.SETS.find(s => s.code === c.set)?.size || 0).padStart(3, '0')}${c.shiny ? ' ✦' : ''}`;
  const art = c => c.kind === 'pokemon' ? API.art(c.species, c.shiny) : null;
  const stageLabel = c => c.stage === 0 ? 'BASIC' : `STAGE ${c.stage}`;

  function full(c, {w = 250, extra = ''} = {}) {
    if (!c) return '';
    if (c.kind === 'energy') {
      return `<div class="tcg-card t-energy" style="--w:${w}px;--ec:${ec(c.type)}">
        <div class="tc-head"><span class="tc-stage">ENERGY</span><b class="tc-name">${c.type} Energy</b></div>
        <div class="tc-energy-big">${Cards.ENERGY[c.type].icon}</div>
        <div class="tc-text">Basic ${c.type} Energy. Attach 1 Energy card to a Pokémon each turn to power its attacks.</div>${extra}</div>`;
    }
    if (c.kind === 'trainer') {
      return `<div class="tcg-card t-trainer r-${c.rarity}" style="--w:${w}px">
        <div class="tc-head"><span class="tc-stage">TRAINER · ${c.sub.toUpperCase()}</span><b class="tc-name">${esc(c.name)}</b></div>
        <div class="tc-art trainer-art"><span>${TRAINER_ART[c.key] || '🎴'}</span></div>
        <div class="tc-text">${esc(c.text)}${c.sub === 'supporter' ? '<em>You may play only 1 Supporter card during your turn.</em>' : ''}</div>
        <div class="tc-meta"><span>${setLabel(c)}</span><span>${Cards.RARITY[c.rarity].sym}</span></div>${extra}</div>`;
    }
    return `<div class="tcg-card t-pokemon r-${c.rarity}" style="--w:${w}px;--ec:${ec(c.type)}">
      <div class="tc-head"><span class="tc-stage">${stageLabel(c)}</span><b class="tc-name">${esc(c.name)}</b>
        <span class="tc-hp"><small>HP</small>${c.hp}</span>${eIcon(c.type)}</div>
      ${c.from ? `<div class="tc-evo">Evolves from ${esc(c.from)}</div>` : ''}
      <div class="tc-art"><img src="${art(c)}" alt=""></div>
      <div class="tc-attacks">${c.attacks.map(a => `<div class="tc-atk">
        <div class="tc-atk-row"><span class="tc-cost">${cost(a.cost)}</span><b>${esc(a.name)}</b><span class="tc-dmg">${a.fx.multi ? a.fx.multi.per + '×' : a.dmg || ''}</span></div>
        ${a.text ? `<p>${esc(a.text)}</p>` : ''}</div>`).join('')}</div>
      <div class="tc-foot">
        <span><small>weakness</small>${c.weak ? eIcon(c.weak, 'sm') + '×2' : '—'}</span>
        <span><small>resistance</small>${c.resist ? eIcon(c.resist, 'sm') + '−30' : '—'}</span>
        <span><small>retreat</small>${c.retreat ? Array(c.retreat).fill(eIcon('Colorless', 'sm')).join('') : '—'}</span>
      </div>
      <div class="tc-meta"><span>${setLabel(c)}</span><span>${Cards.RARITY[c.rarity].sym}</span></div>
      ${['holo', 'secret', 'promo'].includes(c.rarity) ? '<div class="holo-layer"></div>' : ''}${extra}</div>`;
  }

  // Compact card for hands, binders and lists
  function mini(c, {badge = '', cls = '', attrs = ''} = {}) {
    if (!c) return '';
    const body = c.kind === 'pokemon' ? `<img src="${art(c)}" alt="" loading="lazy">`
      : c.kind === 'energy' ? `<span class="mini-icon">${Cards.ENERGY[c.type].icon}</span>`
      : `<span class="mini-icon">${TRAINER_ART[c.key] || '🎴'}</span>`;
    const color = c.kind === 'trainer' ? '#8a93b8' : ec(c.type);
    return `<div role="button" class="mini-card k-${c.kind} r-${c.rarity} ${cls}" style="--ec:${color}" ${attrs}>
      <span class="mc-top">${c.kind === 'pokemon' ? `<small>${c.stage ? 'S' + c.stage : 'B'}</small><b>${c.hp}</b>` : `<small>${c.kind === 'energy' ? 'E' : c.sub === 'supporter' ? 'SUP' : 'ITEM'}</small>`}</span>
      ${body}<span class="mc-name">${esc(c.kind === 'energy' ? c.type : c.name)}</span>${badge}
      ${['holo', 'secret', 'promo'].includes(c.rarity) ? '<i class="holo-layer"></i>' : ''}</div>`;
  }

  // A Pokémon in play (board)
  function inPlay(i, {big = false, attrs = ''} = {}) {
    if (!i) return `<div class="ip empty ${big ? 'big' : ''}"></div>`;
    const c = i.card, left = Math.max(0, c.hp - i.dmg), pct = left / c.hp * 100;
    const st = [i.sp && {par: '⚡PAR', slp: '💤SLP', cnf: '💫CNF'}[i.sp], i.psn && '☠️PSN', i.brn && '🔥BRN'].filter(Boolean);
    return `<div role="button" class="ip ${big ? 'big' : ''} ${i.sp === 'slp' ? 'asleep' : ''} ${i.sp === 'par' ? 'paralyzed' : ''}" style="--ec:${ec(c.type)}" ${attrs} data-uid="${i.uid}">
      <img src="${art(c)}" alt="">
      <span class="ip-name">${esc(c.name)}</span>
      <span class="ip-hp"><span class="ip-bar"><i style="width:${pct}%;background:${UI.hpColor(pct)}"></i></span><b>${left}</b></span>
      <span class="ip-energy">${i.energy.map(e => eIcon(e.type, 'xs')).join('')}</span>
      ${i.dmg ? `<span class="ip-dmg">${i.dmg}</span>` : ''}
      ${st.length ? `<span class="ip-status">${st.join(' ')}</span>` : ''}</div>`;
  }
  const back = (cls = '') => `<span class="card-back ${cls}"></span>`;

  return {full, mini, inPlay, back, eIcon, TRAINER_ART};
})();
