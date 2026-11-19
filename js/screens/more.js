'use strict';
// ── MORE: Daily · Wonder Trade · Daycare · Achievements · Trainer Card · Settings

const back = (label) => `<button class="back-btn" data-act="go" data-arg="more" aria-label="Back">‹</button>${label}`;
const today = () => new Date().toDateString();

UI.Screens.more = {
  title: '☰ More',
  tab: 'more',
  render() {
    const qDone = G.quests.list.filter(q => q.done).length;
    const gift = G.giftDate !== today();
    const egg = G.daycare.egg;
    const item = (arg, icon, title, sub, badge = '') => `<button class="menu-item" data-act="go" data-arg="${arg}">
      <span class="mi-icon">${icon}</span><span class="grow"><b>${title}</b><small>${sub}</small></span>${badge}<span class="chev">›</span></button>`;
    return `<div class="menu">
      ${item('dex', '📖', 'Pokédex', `${caughtCount(G)} caught · ${Object.keys(G.dex).length} seen`)}
      ${item('daily', '📅', 'Daily rewards', `Quests ${qDone}/${G.quests.list.length} · streak ${G.streak.count} days`, gift ? '<span class="dot-badge">🎁</span>' : '')}
      ${item('wonder', '🔄', 'Wonder Trade', 'Trade for a surprise Pokémon')}
      ${item('daycare', '🥚', 'Daycare', egg ? (egg.ready ? 'Your egg is ready to hatch!' : 'An egg is incubating…') : 'Leave two Pokémon to find an egg', egg?.ready ? '<span class="dot-badge">🐣</span>' : '')}
      ${item('achievements', '🏅', 'Achievements', `${G.achievements.length}/${ACHIEVEMENTS.length} unlocked`)}
      ${item('card', '🪪', 'Trainer card', 'Your name, avatar and records')}
      ${item('settings', '⚙️', 'Settings & save', `Slot ${Store.slot() + 1} · sound, speed`)}
    </div>`;
  },
};

// ── DAILY ──────────────────────────────────────────────────────────────────
UI.Screens.daily = {
  title: () => back('📅 Daily rewards'), tab: 'more',
  render() {
    Store.ensureQuests();
    const claimed = G.giftDate === today();
    return `<div class="streak-card"><span class="streak-flame">🔥</span>
        <div class="grow"><b>${G.streak.count}-day streak</b><div class="muted small">Best: ${G.streak.best} days. Come back tomorrow for more Poké Balls and coins!</div></div></div>
      <h4 class="section">Today's quests</h4>
      ${G.quests.list.map(q => {
        const d = QUEST_POOL.find(x => x.id === q.id);
        if (!d) return '';
        const reward = Object.entries(d.reward).map(([k, v]) => k === 'coins' ? `🪙${v}` : `${ITEMS[k].emoji}×${v}`).join(' ');
        return `<div class="quest ${q.done ? 'done' : ''}"><span class="q-icon">${d.icon}</span>
          <div class="grow"><b>${d.text}</b><div class="xp"><div class="xp-fill" style="width:${q.progress / d.target * 100}%"></div></div>
          <small class="muted">${q.progress}/${d.target} · Reward: ${reward}</small></div>${q.done ? '✅' : ''}</div>`;
      }).join('')}
      <h4 class="section">Mystery Gift</h4>
      <div class="gift-card ${claimed ? 'claimed' : ''}">
        <div class="gift-box">🎁</div>
        ${claimed ? '<p class="muted">You already opened today’s gift. See you tomorrow!</p>'
          : '<p>A gift is waiting for you!</p><button class="btn btn-purple btn-block" data-act="gift">Open gift</button>'}
      </div>`;
  },
};

Act.gift = async () => {
  if (G.giftDate === today()) return;
  const total = GIFT_TABLE.reduce((s, g) => s + g.weight, 0);
  let r = Math.random() * total, g = GIFT_TABLE[0];
  for (const x of GIFT_TABLE) { r -= x.weight; if (r <= 0) { g = x; break; } }
  try {
    let msg;
    if (g.pokemon) {
      const mon = await UI.busy('Unwrapping…', async () => {
        const route = ROUTES.filter(Store.routeUnlocked).pop();
        const m = await Factory.wild(route);
        if (g.shinyBoost && Math.random() < .5) m.shiny = true;
        return m;
      });
      const where = Store.receive(mon);
      msg = `${mon.shiny ? '✨ A SHINY ' : 'A '}${mon.name} (Lv.${mon.level})! ${where === 'pc' ? 'Sent to your PC.' : 'It joined your party.'}`;
      if (mon.shiny) SFX.shiny(); else SFX.caught();
    } else {
      const n = rand(g.min, g.max);
      msg = g.coins ? (Store.earn(n), `${n} coins!`) : (Store.addItem(g.item, n), `${n}× ${ITEMS[g.item].emoji} ${ITEMS[g.item].name}!`);
      SFX.buy();
    }
    G.giftDate = today();
    Store.save(); Store.checkAchievements();
    await UI.choose({title: '🎁 Mystery Gift', text: `<div class="gift-reveal">You received<br><b>${msg}</b></div>`, options: [], cancel: 'Awesome!'});
    UI.refresh();
  } catch (e) { UI.toast('Gift delivery failed — try again', 'bad'); }
};

// ── WONDER TRADE ───────────────────────────────────────────────────────────
UI.Screens.wonder = {
  title: () => back('🔄 Wonder Trade'), tab: 'more',
  render() {
    return `<div class="info-card"><div class="big-emoji spin-slow">🔄</div>
      <p>Send one of your Pokémon off and receive a random Pokémon from a trainer somewhere in the world. You never know what you'll get — shiny odds are 4× better than in the wild!</p>
      <p class="muted small">Trades completed: ${G.stats.trades}</p>
      <button class="btn btn-blue btn-block" data-act="wonderTrade">Choose a Pokémon to send</button></div>`;
  },
};
Act.wonderTrade = async () => {
  const all = [...G.team.map((m, i) => ({m, where: 'team', i})), ...G.pc.map((m, i) => ({m, where: 'pc', i}))];
  const i = await UI.choose({title: 'Send which Pokémon?', options: all.map(({m, where}, k) => ({value: k,
    disabled: where === 'team' && G.team.length <= 1,
    html: `${UI.monImg(m, 'choice-mon')}<span class="choice-main"><span class="choice-label">${esc(Engine.displayName(m))} <small>Lv.${m.level}${m.shiny ? ' ✨' : ''}</small></span>
      <span class="choice-sub">${where === 'team' ? 'Party' : 'PC'}</span></span>`}))});
  if (i === null) return;
  const sent = all[i];
  if (!await UI.confirm(`Send ${esc(Engine.displayName(sent.m))} away? You won't get it back.`, {ok: 'Trade!'})) return;
  const s = UI.sheet({title: 'Wonder Trade', dismissable: false, html: '<div class="trading"><div class="big-emoji spin">🔄</div><p class="muted">Searching for a partner…</p></div>'});
  try {
    const level = Math.max(3, Math.min(100, sent.m.level + rand(-4, 6)));
    const [mon] = await Promise.all([(async () => {
      let id, sp;
      for (let t = 0; t < 5; t++) { id = rand(1, 1025); sp = await API.species(id); if (!sp.legendary || Math.random() < .05) break; }
      return Factory.make(await Factory.matureId(id, level), level, {shiny: Math.random() < 1 / 100});
    })(), sleep(1800)]);
    (sent.where === 'team' ? G.team : G.pc).splice(sent.i, 1);
    const where = Store.receive(mon);
    G.stats.trades++;
    Store.quest('wonder');
    Store.save(); Store.checkAchievements();
    if (mon.shiny) SFX.shiny(); else SFX.caught();
    s.set(`<div class="trade-result"><img src="${API.art(mon.id, mon.shiny)}" alt="" class="${mon.shiny ? 'shiny-glow' : ''}">
      <h3>${mon.shiny ? '✨ ' : ''}${esc(mon.name)} <small>Lv.${mon.level}</small></h3>${UI.types(mon.types)}
      <p class="muted">${mon.shiny ? 'Whoa — it’s shiny! ' : ''}${where === 'pc' ? 'It was sent to your PC.' : 'It joined your party!'}</p>
      <button class="btn btn-primary btn-block" data-close>Welcome aboard!</button></div>`);
    s.el.addEventListener('click', e => { if (e.target.closest('[data-close]')) s.close(); });
  } catch (e) { s.close(); UI.toast('Trade failed — try again', 'bad'); }
};

// ── DAYCARE ────────────────────────────────────────────────────────────────
const Daycare = (() => {
  const EGG_AT = 12, HATCH_AT = 10;
  function step() {
    const dc = G.daycare;
    if (!dc.slots[0] || !dc.slots[1]) return;
    if (!dc.egg) {
      if (++dc.steps >= EGG_AT) {
        dc.steps = 0;
        const [a, b] = dc.slots;
        const parent = a.id === 132 ? b : b.id === 132 ? a : pick([a, b]);
        const ivs = {};
        for (const k of Object.keys(a.ivs)) ivs[k] = Math.min(31, Math.max(a.ivs[k], b.ivs[k]) + rand(0, 3));
        dc.egg = {parent: parent.id, ivs, steps: 0, ready: false, ditto: a.id === 132 || b.id === 132};
        setTimeout(() => UI.toast('🥚 The Daycare found an Egg!', 'gold'), 600);
      }
    } else if (!dc.egg.ready && ++dc.egg.steps >= HATCH_AT) {
      dc.egg.ready = true;
      setTimeout(() => UI.toast('🐣 Your Egg is ready to hatch!', 'gold'), 600);
    }
  }
  return {step, EGG_AT, HATCH_AT};
})();

UI.Screens.daycare = {
  title: () => back('🥚 Daycare'), tab: 'more',
  render() {
    const dc = G.daycare;
    const slot = (m, i) => m ? `<div class="dc-slot">${UI.monImg(m)}<b>${esc(Engine.displayName(m))}</b><small class="muted">Lv.${m.level}</small>
        <button class="btn btn-ghost btn-sm" data-act="dcWithdraw" data-arg="${i}">Withdraw</button></div>`
      : `<button class="dc-slot empty" data-act="dcDeposit" data-arg="${i}"><span>＋</span><small>Leave a Pokémon</small></button>`;
    let status = '';
    if (dc.egg) {
      status = dc.egg.ready
        ? `<div class="egg ready"><div class="egg-shape wobble"></div><p><b>The Egg is about to hatch!</b></p><button class="btn btn-gold btn-block" data-act="hatch">Hatch it!</button></div>`
        : `<div class="egg"><div class="egg-shape"></div><p>The Egg is warming up…</p><div class="xp"><div class="xp-fill" style="width:${dc.egg.steps / Daycare.HATCH_AT * 100}%"></div></div>
           <small class="muted">${Daycare.HATCH_AT - dc.egg.steps} more battle wins to hatch</small></div>`;
    } else if (dc.slots[0] && dc.slots[1]) {
      status = `<div class="egg"><p>💕 The two seem to get along!</p><div class="xp"><div class="xp-fill" style="width:${dc.steps / Daycare.EGG_AT * 100}%"></div></div>
        <small class="muted">An Egg appears after ${Daycare.EGG_AT - dc.steps} more battle wins</small></div>`;
    }
    return `<p class="lead">Leave two Pokémon here. Every battle you win brings an Egg closer! Babies inherit the best hidden potential (IVs) of their parents. Ditto can pair with anyone.</p>
      <div class="grid2">${dc.slots.map(slot).join('')}</div>${status}`;
  },
};
Act.dcDeposit = async d => {
  const all = [...G.team.map((m, i) => ({m, where: 'team', i})), ...G.pc.map((m, i) => ({m, where: 'pc', i}))];
  const k = await UI.choose({title: 'Leave which Pokémon?', options: all.map(({m, where}, k) => ({value: k,
    disabled: where === 'team' && G.team.length <= 1,
    html: `${UI.monImg(m, 'choice-mon')}<span class="choice-main"><span class="choice-label">${esc(Engine.displayName(m))} <small>Lv.${m.level}</small></span><span class="choice-sub">${where === 'team' ? 'Party' : 'PC'}</span></span>`}))});
  if (k === null) return;
  const {m, where, i} = all[k];
  (where === 'team' ? G.team : G.pc).splice(i, 1);
  G.daycare.slots[+d.arg] = m;
  G.daycare.steps = 0;
  Store.save(); UI.refresh();
};
Act.dcWithdraw = d => {
  const m = G.daycare.slots[+d.arg];
  if (!m) return;
  G.daycare.slots[+d.arg] = null;
  G.daycare.steps = 0;
  (G.team.length < 6 ? G.team : G.pc).push(m);
  Store.save(); UI.refresh();
  UI.toast(`${Engine.displayName(m)} came back ${G.team.includes(m) ? 'to your party' : 'to the PC'}`);
};
Act.hatch = async () => {
  const egg = G.daycare.egg;
  if (!egg?.ready) return;
  try {
    const mon = await UI.busy('Something is happening…', async () => {
      const sp = await API.species(egg.parent);
      return Factory.make(sp.base || sp.id, 5, {ivs: egg.ivs, shiny: Math.random() < (egg.ditto ? 1 / 64 : 1 / 128)});
    });
    G.daycare.egg = null;
    G.stats.eggs++;
    const where = Store.receive(mon);
    Store.save(); Store.checkAchievements();
    SFX.evolve();
    await UI.choose({title: '🐣 Hatched!', text: `<div class="trade-result"><img src="${API.art(mon.id, mon.shiny)}" alt=""><h3>${mon.shiny ? '✨ ' : ''}${esc(mon.name)}</h3>
      <p class="muted">${where === 'pc' ? 'It was sent to your PC.' : 'It joined your party!'}</p></div>`, options: [], cancel: 'Hello, little one!'});
    UI.refresh();
  } catch (e) { UI.toast('The Egg needs a moment — try again', 'bad'); }
};

// ── ACHIEVEMENTS ───────────────────────────────────────────────────────────
UI.Screens.achievements = {
  title: () => back('🏅 Achievements'), tab: 'more',
  render() {
    const done = new Set(G.achievements);
    return `<div class="dex-progress"><div class="row between"><b>${done.size} unlocked</b><span class="muted">of ${ACHIEVEMENTS.length}</span></div>
      <div class="xp big"><div class="xp-fill" style="width:${done.size / ACHIEVEMENTS.length * 100}%"></div></div></div>
      <div class="ach-list">${ACHIEVEMENTS.map(a => `<div class="ach ${done.has(a.id) ? 'got' : ''}"><span class="ach-icon">${done.has(a.id) ? a.icon : '🔒'}</span>
        <div><b>${a.name}</b><small>${a.desc}</small></div></div>`).join('')}</div>`;
  },
};

// ── TRAINER CARD ───────────────────────────────────────────────────────────
function trainerTitle() {
  const n = G.badges.length;
  if (G.league.legend) return '🏔️ Living Legend';
  if (G.league.champion) return '🏆 League Champion';
  return n >= 16 ? '⭐ Master Trainer' : n >= 8 ? '🌟 Ace Trainer' : n >= 4 ? '🔰 Rising Star' : n >= 1 ? '🌱 Gym Challenger' : '🌿 Rookie Trainer';
}
UI.Screens.card = {
  title: () => back('🪪 Trainer card'), tab: 'more',
  render() {
    const caught = caughtCount(G);
    const stat = (v, l) => `<div class="tc-stat"><b>${v}</b><small>${l}</small></div>`;
    return `<div class="trainer-card" style="background:${CARD_COLORS[G.color] || CARD_COLORS.blue}">
        <div class="tc-top"><span class="tc-avatar">${esc(G.avatar)}</span>
          <div><div class="tc-name">${esc(G.name)}</div><div class="tc-title">${trainerTitle()}</div><div class="tc-since">Since ${esc(G.joined)}</div></div></div>
        <div class="tc-badges">${G.badges.length ? GYMS.filter(g => G.badges.includes(g.id)).map(g => `<span>${g.badge}</span>`).join('') : '<small>No badges yet</small>'}</div>
        <div class="tc-team">${G.team.map(m => `<img src="${API.icon(m.id)}" alt="">`).join('')}</div>
      </div>
      <div class="row gap" style="margin:12px 0">
        <button class="btn btn-ghost grow" data-act="editName">✏️ Name</button>
        <button class="btn btn-ghost grow" data-act="editAvatar">🙂 Avatar</button>
        <button class="btn btn-ghost grow" data-act="editColor">🎨 Color</button>
      </div>
      <div class="tc-stats">
        ${stat(caught, 'Caught')}${stat(Object.keys(G.dex).length, 'Seen')}${stat(G.stats.trainerWins, 'Trainers beaten')}
        ${stat(G.stats.wildWins, 'Wild wins')}${stat(G.stats.evolutions, 'Evolutions')}${stat(G.stats.shinies, 'Shinies')}
        ${stat(G.stats.trades, 'Trades')}${stat(G.stats.eggs, 'Eggs hatched')}${stat(UI.coinStr(G.stats.coinsEarned), 'Coins earned')}
      </div>`;
  },
};
Act.editName = async () => {
  const n = await UI.prompt({title: 'Trainer name', value: G.name});
  if (n) { G.name = n.slice(0, 12); Store.save(); UI.refresh(); }
};
Act.editAvatar = async () => {
  const s = UI.sheet({title: 'Choose an avatar', html: `<div class="avatar-grid">${TRAINER_AVATARS.map(a =>
    `<button class="${a === G.avatar ? 'on' : ''}" data-av="${a}">${a}</button>`).join('')}</div>`});
  s.body.addEventListener('click', e => {
    const b = e.target.closest('[data-av]');
    if (!b) return;
    G.avatar = b.dataset.av; Store.save(); s.close(); UI.refresh();
  });
};
Act.editColor = async () => {
  const c = await UI.choose({title: 'Card color', options: Object.entries(CARD_COLORS).map(([k, v]) => ({value: k,
    html: `<span class="color-swatch" style="background:${v}"></span><span class="choice-label">${k[0].toUpperCase() + k.slice(1)}</span>`}))});
  if (c) { G.color = c; Store.save(); UI.refresh(); }
};

// ── SETTINGS ───────────────────────────────────────────────────────────────
UI.Screens.settings = {
  title: () => back('⚙️ Settings'), tab: 'more',
  render() {
    const s = Store.settings;
    return `<div class="menu">
      <button class="menu-item" data-act="toggleSound"><span class="mi-icon">${s.sound ? '🔊' : '🔇'}</span><span class="grow"><b>Sound effects</b><small>${s.sound ? 'On' : 'Off'}</small></span></button>
      <button class="menu-item" data-act="cycleSpeed"><span class="mi-icon">⏩</span><span class="grow"><b>Battle speed</b><small>${['Normal', 'Fast', 'Turbo'][s.speed - 1]}</small></span></button>
      <button class="menu-item" data-act="saveNow"><span class="mi-icon">💾</span><span class="grow"><b>Save now</b><small>The game also saves automatically</small></span></button>
      <button class="menu-item" data-act="toTitle"><span class="mi-icon">🏠</span><span class="grow"><b>Back to title</b><small>Switch save slot</small></span></button>
      <button class="menu-item" data-act="clearCache"><span class="mi-icon">🧹</span><span class="grow"><b>Clear download cache</b><small>${API.cacheSize()} entries · re-downloads Pokémon data</small></span></button>
    </div>
    <p class="fineprint">Pokémon Journey · fan-made · data &amp; sprites from PokéAPI</p>`;
  },
};
Act.toggleSound = () => { Store.setSetting('sound', !Store.settings.sound); UI.refresh(); };
Act.cycleSpeed = () => { Store.setSetting('speed', (Store.settings.speed % 3) + 1); UI.refresh(); };
Act.saveNow = () => { if (Store.save()) UI.toast('Game saved 💾'); };
Act.toTitle = () => { Store.save(); G = null; UI.go('title'); };
Act.clearCache = () => { API.clearCache(); UI.toast('Cache cleared'); UI.refresh(); };
