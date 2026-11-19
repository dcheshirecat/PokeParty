'use strict';
// ── TITLE · STARTER · EXPLORE ───────────────────────────────────────────────

const STARTER_INFO = [
  [1,'Bulbasaur',['grass','poison']],[4,'Charmander',['fire']],[7,'Squirtle',['water']],
  [152,'Chikorita',['grass']],[155,'Cyndaquil',['fire']],[158,'Totodile',['water']],
  [252,'Treecko',['grass']],[255,'Torchic',['fire']],[258,'Mudkip',['water']],
  [387,'Turtwig',['grass']],[390,'Chimchar',['fire']],[393,'Piplup',['water']],
  [495,'Snivy',['grass']],[498,'Tepig',['fire']],[501,'Oshawott',['water']],
  [650,'Chespin',['grass']],[653,'Fennekin',['fire']],[656,'Froakie',['water']],
  [722,'Rowlet',['grass','flying']],[725,'Litten',['fire']],[728,'Popplio',['water']],
  [810,'Grookey',['grass']],[813,'Scorbunny',['fire']],[816,'Sobble',['water']],
  [906,'Sprigatito',['grass']],[909,'Fuecoco',['fire']],[912,'Quaxly',['water']],
];
const REGIONS = ['Kanto','Johto','Hoenn','Sinnoh','Unova','Kalos','Alola','Galar','Paldea'];

// ── TITLE ──────────────────────────────────────────────────────────────────
UI.Screens.title = {
  render() {
    const slots = Array.from({length: Store.SLOTS}, (_, i) => {
      const d = Store.peek(i);
      if (!d || d.v !== 1) return `<div class="slot empty">
          <div class="slot-num">Slot ${i + 1}</div>
          <button class="btn btn-primary btn-block" data-act="newGame" data-arg="${i}">✨ New Adventure</button>
        </div>`;
      const caught = Object.values(d.dex || {}).filter(x => x.c).length;
      return `<div class="slot">
          <div class="slot-head"><span class="slot-avatar">${esc(d.avatar)}</span>
            <div class="grow"><div class="slot-name">${esc(d.name)}</div>
            <div class="slot-meta">🏅 ${d.badges.length} · 📖 ${caught} · 🏆 ${d.stats.trainerWins}</div></div>
            <button class="icon-btn danger" data-act="deleteSlot" data-arg="${i}" aria-label="Delete">🗑</button></div>
          <div class="slot-team">${d.team.map(m => `<img src="${API.icon(m.id)}" alt="">`).join('')}</div>
          <button class="btn btn-primary btn-block" data-act="continue" data-arg="${i}">▶ Continue</button>
        </div>`;
    }).join('');
    return `<div class="title-hero">
        <div class="logo-ball"></div>
        <h1 class="logo">Pokémon<span>Journey</span></h1>
        <p class="tagline">Catch · Battle · Evolve · Become Champion</p>
      </div>
      <div class="slots">${slots}</div>
      <p class="fineprint">Fan-made game. Pokémon data from PokéAPI.</p>`;
  },
};

Act.newGame = async d => {
  const name = await UI.prompt({title: "What's your name, trainer?", value: 'Trainer', placeholder: 'Your name'});
  if (name === null) return;
  Store.create(+d.arg, name || 'Trainer');
  UI.go('starter');
};
Act.continue = d => {
  if (!Store.load(+d.arg)) { UI.toast('That save could not be loaded', 'bad'); return; }
  enterWorld();
};
Act.deleteSlot = async d => {
  const ok = await UI.confirm(`Delete save slot ${+d.arg + 1}? This cannot be undone.`, {ok: 'Delete', danger: true});
  if (ok) { Store.remove(+d.arg); UI.refresh(); }
};
function enterWorld() {
  const s = Store.checkStreak();
  Store.ensureQuests();
  UI.go('explore');
  if (s) setTimeout(() => UI.toast(`🔥 Day ${s.count} streak! +${s.balls} Poké Balls, +${s.coins} coins`, 'gold'), 400);
}

// ── STARTER ────────────────────────────────────────────────────────────────
UI.Screens.starter = {
  title: 'Choose your partner',
  render() {
    return `<p class="lead">Every great journey starts with a partner. Who will join you?</p>` +
      REGIONS.map((r, gi) => `<h4 class="section">${r}</h4><div class="starter-row">` +
        STARTER_INFO.slice(gi * 3, gi * 3 + 3).map(([id, name, ts]) => `
          <button class="starter" style="--tc:${TYPE_COLOR[ts[0]]}" data-act="pickStarter" data-arg="${id}">
            <img src="${API.art(id)}" alt="${name}" loading="lazy"><b>${name}</b>${UI.types(ts)}
          </button>`).join('') + `</div>`).join('');
  },
};
Act.pickStarter = async d => {
  const [id, name, ts] = STARTER_INFO.find(s => s[0] === +d.arg);
  const ok = await UI.confirm(`<img class="confirm-art" src="${API.art(id)}" alt="">${UI.types(ts)}<br>Do you want <b>${name}</b> as your partner?`,
    {ok: `Choose ${name}!`, title: name});
  if (!ok) return;
  try {
    const mon = await UI.busy(`${name} is getting ready…`, () => Factory.make(id, 5, {ivs: Engine.randIVs(Math.random, 12)}));
    Store.receive(mon);
    Store.save();
    SFX.levelup();
    enterWorld();
    UI.toast(`${name} is your partner! Your journey begins 🎉`, 'gold');
  } catch (e) {
    UI.toast('Could not reach PokéAPI — check your connection', 'bad');
  }
};

// ── EXPLORE ────────────────────────────────────────────────────────────────
UI.Screens.explore = {
  title: '🗺️ Explore',
  tab: 'explore',
  render() {
    const r = Store.currentRoute();
    const hurt = G.team.some(m => m.hp < m.stats.hp || m.status);
    const fainted = !G.team.some(m => m.hp > 0);
    const qDone = G.quests.list.filter(q => q.done).length;
    const giftReady = G.giftDate !== new Date().toDateString();
    const nextRoute = ROUTES.find(x => !Store.routeUnlocked(x));
    return `
      <div class="trainer-strip">
        <span class="ts-avatar">${esc(G.avatar)}</span>
        <div class="grow"><b>${esc(G.name)}</b><div class="muted small">🏅 ${G.badges.length}/${GYMS.length} badges · 🔥 ${G.streak.count}-day streak</div></div>
        <button class="pill pill-btn" data-act="go" data-arg="daily">📋 ${qDone}/${G.quests.list.length}${giftReady ? ' · 🎁' : ''}</button>
      </div>

      <div class="route-card" style="--sky1:${r.sky[0]};--sky2:${r.sky[1]};--ground:${r.ground}">
        <div class="route-scene"><span class="route-emoji">${r.emoji}</span>${isNight() ? '<span class="night-tag">🌙 Night</span>' : ''}</div>
        <div class="route-info">
          <div class="row between"><h2>${r.name}</h2><span class="pill">Lv ${r.lv[0]}–${r.lv[1]}</span></div>
          <div class="route-types">${r.types === 'all' ? '<span class="muted small">All types appear here</span>' : UI.types(r.types)}</div>
          <div class="grid2">
            <button class="btn btn-green btn-lg" data-act="wild" ${fainted ? 'disabled' : ''}>🌿 Wild Pokémon</button>
            <button class="btn btn-blue btn-lg" data-act="trainer" ${fainted ? 'disabled' : ''}>⚔️ Trainer</button>
          </div>
          <button class="btn btn-ghost btn-block" data-act="routes">🧭 Travel to another area</button>
          ${nextRoute ? `<p class="muted small center-note">Next area unlocks at ${nextRoute.badges} badge${nextRoute.badges === 1 ? '' : 's'}</p>` : ''}
        </div>
      </div>

      <div class="center-card ${hurt ? 'needs' : ''}">
        <div class="cc-icon">🏥</div>
        <div class="grow"><b>Pokémon Center</b><div class="muted small">${fainted ? 'Your team has fainted — heal up!' : hurt ? 'Some of your Pokémon are hurt.' : 'Your team is in perfect health.'}</div></div>
        <button class="btn ${hurt ? 'btn-primary' : 'btn-ghost'}" data-act="heal" ${hurt ? '' : 'disabled'}>Heal</button>
      </div>

      <h4 class="section">Your party <button class="link" data-act="go" data-arg="team">Manage ›</button></h4>
      <div class="party-list">${G.team.map((m, i) => `
        <button class="party-row" data-act="monSheet" data-where="team" data-arg="${i}">
          ${UI.monImg(m, 'pr-img')}
          <div class="grow"><div class="row between"><b>${esc(Engine.displayName(m))}${m.shiny ? ' ✨' : ''}</b><span class="muted small">Lv.${m.level} ${UI.statusBadge(m.status)}</span></div>${UI.hpBar(m, false)}</div>
        </button>`).join('')}</div>`;
  },
};

function battleTheme(type) {
  const c = TYPE_COLOR[type] || '#6c5ce7';
  return {id: 'arena', sky: [c, '#141633'], ground: '#2a2d55'};
}
Act.wild = async () => {
  const route = Store.currentRoute();
  try {
    const foe = await UI.busy('Searching the tall grass…', () => Factory.wild(route));
    Battle.start({kind: 'wild', foes: [foe], skill: 0, route, label: `${route.emoji} ${route.name}`, again: Act.wild});
  } catch (e) { console.error(e); UI.toast('Connection problem — try again', 'bad'); }
};
Act.trainer = async () => {
  const route = Store.currentRoute();
  try {
    const t = await UI.busy('Looking for a challenger…', () => Factory.routeTrainer(route));
    Battle.start({kind: 'trainer', foes: t.team, trainer: t, skill: t.skill, reward: t.reward, route,
      label: `${route.emoji} ${route.name}`, again: Act.trainer});
  } catch (e) { console.error(e); UI.toast('Connection problem — try again', 'bad'); }
};
Act.heal = () => {
  G.team.forEach(Engine.healFull);
  Store.save();
  SFX.heal();
  UI.toast('Your Pokémon are fighting fit! 💖', 'good');
  UI.refresh();
};
Act.routes = async () => {
  const id = await UI.choose({title: '🧭 Where to?', options: ROUTES.map(r => {
    const open = Store.routeUnlocked(r);
    return {value: r.id, disabled: !open, icon: r.emoji, tone: r.id === G.route ? 'on' : '',
      label: `${r.name} <small>Lv ${r.lv[0]}–${r.lv[1]}</small>`,
      sub: open ? (r.types === 'all' ? 'Every type' : r.types.join(' · ')) : `🔒 Requires ${r.badges} badge${r.badges === 1 ? '' : 's'}`};
  })});
  if (!id) return;
  G.route = id;
  Store.save();
  UI.refresh();
};
