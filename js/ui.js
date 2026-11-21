'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  UI TOOLKIT — DOM helpers, toasts, bottom sheets, dialogs, router, sound.
//  Clicks are routed through `data-act="name"` attributes to the Act registry
//  (see main.js), so markup never contains inline JavaScript.
// ════════════════════════════════════════════════════════════════════════════
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const isNight = () => { const h = new Date().getHours(); return h >= 20 || h < 6; };
const Act = {}; // action registry: Act.name = (data, el, event) => {}

const UI = (() => {
  // ── toast ────────────────────────────────────────────────────────────────
  function toast(msg, tone = 'good') {
    const host = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast toast-' + tone;
    el.textContent = msg;
    host.appendChild(el);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3200);
  }

  // ── loading veil ─────────────────────────────────────────────────────────
  let loadDepth = 0;
  function loading(on, text = 'Loading…') {
    loadDepth = Math.max(0, loadDepth + (on ? 1 : -1));
    const el = $('#loading');
    el.classList.toggle('show', loadDepth > 0);
    if (on) $('#loading-text').textContent = text;
  }
  // Resolve once every image URL has loaded (or failed), or after `ms` at most
  function preload(urls, ms = 5000) {
    return Promise.race([sleep(ms), Promise.all(urls.filter(Boolean).map(src => new Promise(res => {
      const im = new Image(); im.onload = im.onerror = res; im.src = src;
    })))]);
  }
  async function busy(text, fn) {
    loading(true, text);
    try { return await fn(); } finally { loading(false); }
  }

  // ── bottom sheets ────────────────────────────────────────────────────────
  function sheet({title = '', html = '', dismissable = true, cls = ''} = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'layer';
    wrap.innerHTML = `<div class="backdrop"></div>
      <div class="sheet ${cls}" role="dialog" aria-label="${esc(title)}">
        <div class="sheet-grip"></div>
        ${title ? `<div class="sheet-head"><h3>${title}</h3>${dismissable ? '<button class="icon-btn" data-close aria-label="Close">✕</button>' : ''}</div>` : ''}
        <div class="sheet-body">${html}</div>
      </div>`;
    $('#layers').appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    let resolve;
    const done = new Promise(r => { resolve = r; });
    const api = {
      el: wrap, body: $('.sheet-body', wrap), done,
      close(value = null) {
        if (!wrap.isConnected) return;
        wrap.classList.remove('open');
        setTimeout(() => wrap.remove(), 220);
        resolve(value);
      },
      set(html2) { api.body.innerHTML = html2; },
    };
    if (dismissable) {
      $('.backdrop', wrap).addEventListener('click', () => api.close(null));
    }
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(null); });
    return api;
  }

  // options: [{value, label, sub, html, icon, disabled, tone}]
  function choose({title, text = '', options, cancel = 'Cancel', dismissable = true}) {
    const s = sheet({title, dismissable, html: `${text ? `<p class="sheet-text">${text}</p>` : ''}
      <div class="choice-list">${options.map((o, i) => `
        <button class="choice ${o.tone ? 'tone-' + o.tone : ''}" data-i="${i}" ${o.disabled ? 'disabled' : ''}>
          ${o.html || `${o.icon ? `<span class="choice-icon">${o.icon}</span>` : ''}
          <span class="choice-main"><span class="choice-label">${o.label}</span>${o.sub ? `<span class="choice-sub">${o.sub}</span>` : ''}</span>`}
        </button>`).join('')}</div>
      ${cancel && dismissable ? `<button class="btn btn-ghost btn-block" data-close>${cancel}</button>` : ''}`});
    s.body.addEventListener('click', e => {
      const b = e.target.closest('.choice');
      if (b && !b.disabled) s.close(options[+b.dataset.i].value);
    });
    return s.done;
  }

  function confirm(text, {ok = 'OK', danger = false, title = 'Are you sure?'} = {}) {
    const s = sheet({title, html: `<p class="sheet-text">${text}</p>
      <div class="row gap"><button class="btn btn-ghost grow" data-close>Cancel</button>
      <button class="btn ${danger ? 'btn-red' : 'btn-primary'} grow" data-ok>${ok}</button></div>`});
    $('[data-ok]', s.el).addEventListener('click', () => s.close(true));
    return s.done.then(v => v === true);
  }

  function prompt({title, value = '', placeholder = '', max = 12, ok = 'Save', extra = ''}) {
    const s = sheet({title, html: `<input class="input" maxlength="${max}" placeholder="${esc(placeholder)}" value="${esc(value)}">
      ${extra}<div class="row gap" style="margin-top:12px"><button class="btn btn-ghost grow" data-close>Cancel</button>
      <button class="btn btn-primary grow" data-ok>${ok}</button></div>`});
    const inp = $('input', s.el);
    setTimeout(() => inp.focus(), 250);
    const submit = () => s.close(inp.value.trim());
    $('[data-ok]', s.el).addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    $$('[data-val]', s.el).forEach(b => b.addEventListener('click', () => s.close(b.dataset.val)));
    return s.done;
  }

  // ── evolution / celebration scene ────────────────────────────────────────
  function evolutionScene(fromMon, toArt, toName) {
    return new Promise(resolve => {
      const name = Engine.displayName(fromMon);
      const s = sheet({title: '', dismissable: false, cls: 'evo-sheet', html: `
        <div class="evo-stage">
          <div class="evo-rays"></div>
          <img class="evo-from" src="${API.art(fromMon.id, fromMon.shiny)}" alt="">
          <img class="evo-to" src="${toArt}" alt="">
        </div>
        <p class="evo-text">What? <b>${esc(name)}</b> is evolving!</p>
        <button class="btn btn-ghost btn-block evo-stop">Stop evolution</button>`});
      SFX.evolve();
      const stage = $('.evo-stage', s.el);
      let stopped = false, finished = false;
      $('.evo-stop', s.el).addEventListener('click', () => { if (!finished) stopped = true; });
      requestAnimationFrame(() => stage.classList.add('run'));
      setTimeout(() => {
        const stopBtn = $('.evo-stop', s.el);
        finished = true;
        if (stopped) {
          stage.classList.remove('run');
          $('.evo-text', s.el).innerHTML = `Huh? <b>${esc(name)}</b> stopped evolving!`;
        } else {
          stage.classList.add('done');
          $('.evo-text', s.el).innerHTML = `Congratulations! <b>${esc(name)}</b> evolved into <b>${esc(toName)}</b>!`;
          SFX.win();
        }
        stopBtn.textContent = 'Continue';
        stopBtn.classList.replace('btn-ghost', 'btn-primary');
        stopBtn.onclick = () => { s.close(); resolve(!stopped); };
      }, 3600);
    });
  }

  // ── reusable fragments ───────────────────────────────────────────────────
  const typeBadge = t => `<span class="type" style="--tc:${TYPE_COLOR[t] || '#888'}">${t}</span>`;
  const types = ts => `<span class="types">${ts.map(typeBadge).join('')}</span>`;
  const statusBadge = s => s ? `<span class="status" style="--sc:${STATUS_INFO[s].color}">${STATUS_INFO[s].label}</span>` : '';
  const hpColor = pct => pct > 50 ? 'var(--hp-good)' : pct > 20 ? 'var(--hp-mid)' : 'var(--hp-low)';
  function hpBar(mon, showText = true) {
    const pct = Math.max(0, Math.round(mon.hp / mon.stats.hp * 100));
    return `<div class="hp"><div class="hp-fill" style="width:${pct}%;background:${hpColor(pct)}"></div></div>
      ${showText ? `<div class="hp-text">${Math.max(0, mon.hp)} / ${mon.stats.hp}</div>` : ''}`;
  }
  function expPct(mon) {
    if (mon.level >= 100) return 100;
    const a = Engine.expAt(mon.level), b = Engine.expAt(mon.level + 1);
    return Math.max(0, Math.min(100, Math.round((mon.exp - a) / (b - a) * 100)));
  }
  const monImg = (mon, cls = '') =>
    `<img class="mon-img ${cls}" src="${API.art(mon.id, mon.shiny)}" alt="${esc(mon.name)}" loading="lazy" onerror="this.onerror=null;this.src='${API.icon(mon.id)}'">`;
  const coinStr = n => Number(n).toLocaleString();
  function moveChip(m, extra = '') {
    return `<span class="move-chip" style="--tc:${TYPE_COLOR[m.type] || '#888'}">
      <span class="mc-name">${esc(m.name)}</span>
      <span class="mc-meta">${m.type} · ${m.cat === 'status' ? 'status' : (m.power || '—') + ' pow'}${m.maxPp ? ` · ${m.pp}/${m.maxPp} PP` : ''}${extra}</span></span>`;
  }
  function moveDesc(m) {
    const bits = [];
    if (m.ail) bits.push(`${m.ailChance && m.cat !== 'status' ? m.ailChance + '% ' : ''}${m.ail === 'confusion' ? 'confuse' : STATUS_INFO[m.ail]?.name}`);
    if (m.stats.length) bits.push(m.stats.map(([s, c]) => `${c > 0 ? '+' : ''}${c} ${Engine.STAT_LABEL[{'attack':'atk','defense':'def','special-attack':'spa','special-defense':'spd','speed':'spe','accuracy':'acc','evasion':'eva'}[s]] || s}`).join(', '));
    if (m.heal > 0) bits.push(`heals ${m.heal}%`);
    if (m.drain > 0) bits.push(`drains ${m.drain}%`);
    if (m.drain < 0) bits.push('recoil');
    if (m.prio > 0) bits.push('priority');
    if (m.minHits) bits.push(`${m.minHits}–${m.maxHits} hits`);
    if (m.crit) bits.push('high crit');
    return bits.join(' · ');
  }

  // ── router ───────────────────────────────────────────────────────────────
  const Screens = {};
  let current = null, currentParams = {};
  function go(name, params = {}) {
    const sc = Screens[name];
    if (!sc) return;
    current = name; currentParams = params;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === (sc.root || 'main')));
    const tabbar = $('#tabbar');
    tabbar.classList.toggle('hidden', !sc.tab);
    $$('.tab', tabbar).forEach(t => t.classList.toggle('on', t.dataset.arg === sc.tab));
    if (!sc.root) {
      $('#main').scrollTop = 0;
      refresh();
    } else if (sc.render) sc.render(params);
  }
  function refresh() {
    const sc = Screens[current];
    if (!sc || sc.root) return;
    const head = sc.title ? `<header class="topbar"><div class="topbar-title">${typeof sc.title === 'function' ? sc.title(currentParams) : sc.title}</div>
      ${G ? `<div class="pill coin-pill">🪙 ${coinStr(G.coins)}</div>` : ''}</header>` : '';
    $('#main').innerHTML = head + `<div class="page">${sc.render(currentParams)}</div>`;
    sc.after && sc.after($('#main'), currentParams);
  }

  return {toast, loading, busy, preload, sheet, choose, confirm, prompt, evolutionScene, typeBadge, types, statusBadge,
    hpBar, hpColor, expPct, monImg, coinStr, moveChip, moveDesc, Screens, go, refresh, current: () => current};
})();

// ── SOUND (tiny synth — no audio files needed) ─────────────────────────────
const SFX = (() => {
  let ctx = null;
  function tone(f, type = 'sine', dur = .12, vol = .12, delay = 0) {
    if (!Store.settings.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + delay;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* audio unavailable */ }
  }
  const seq = (notes, type = 'sine', step = .1, dur = .16, vol = .12) => notes.forEach((f, i) => tone(f, type, dur, vol, i * step));
  return {
    tap: () => tone(660, 'triangle', .05, .06),
    encounter: () => seq([440, 554, 659, 880], 'square', .08, .1, .06),
    hit: () => tone(180, 'sawtooth', .12, .14),
    crit: () => { tone(240, 'sawtooth', .1, .16); tone(120, 'square', .16, .12, .06); },
    super: () => { tone(520, 'square', .08, .1); tone(260, 'sawtooth', .16, .14, .05); },
    weak: () => tone(150, 'triangle', .18, .1),
    faint: () => seq([400, 300, 200, 120], 'sawtooth', .1, .18, .1),
    status: () => seq([300, 360, 300], 'triangle', .07, .1, .08),
    statUp: () => seq([440, 560, 700], 'sine', .06, .1, .08),
    statDown: () => seq([500, 380, 260], 'sine', .06, .1, .08),
    heal: () => seq([523, 659, 784, 1046], 'sine', .07, .14, .09),
    throw: () => { tone(700, 'sine', .08, .08); tone(350, 'sine', .1, .08, .1); },
    shake: () => tone(160, 'square', .08, .08),
    caught: () => seq([523, 659, 784, 1046, 1318], 'square', .09, .14, .07),
    escape: () => seq([500, 300], 'sine', .1, .14, .1),
    levelup: () => seq([523, 659, 784, 1046], 'square', .07, .12, .07),
    evolve: () => seq([330, 392, 440, 523, 587, 659, 784, 880], 'sine', .14, .2, .1),
    win: () => seq([523, 659, 784, 659, 784, 1046], 'square', .11, .16, .07),
    lose: () => seq([440, 392, 330, 262], 'triangle', .2, .3, .12),
    shiny: () => seq([1046, 1318, 1568, 2093], 'sine', .07, .16, .09),
    buy: () => seq([784, 1046], 'square', .08, .1, .06),
  };
})();
