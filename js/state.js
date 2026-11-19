'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  GAME STATE & SAVES
//  `G` is the active save. Everything that persists lives on it.
// ════════════════════════════════════════════════════════════════════════════
let G = null;

const Store = (() => {
  const SLOTS = 3;
  const KEY = slot => 'pp_save_v1_' + slot;
  const SETTINGS_KEY = 'pp_settings_v1';
  let slot = 0;

  function fresh(name) {
    const today = new Date().toDateString();
    return {
      v: 1, name: name || 'Trainer', avatar: '🧢', color: 'blue', joined: today,
      team: [], pc: [], bag: {...START_BAG}, coins: 500, dex: {}, badges: [],
      route: ROUTES[0].id,
      league: {champion: false, legend: false, progress: 0, clears: 0},
      stats: {wildWins: 0, trainerWins: 0, losses: 0, catches: 0, evolutions: 0, trades: 0, eggs: 0, coinsEarned: 0, shinies: 0},
      streak: {count: 1, last: today, best: 1},
      daycare: {slots: [null, null], steps: 0, egg: null},
      quests: {date: null, list: []},
      giftDate: null, achievements: [],
    };
  }

  function save() {
    if (!G) return true;
    try { localStorage.setItem(KEY(slot), JSON.stringify(G)); return true; }
    catch (e) {
      // Free cache space and retry once — never lose progress silently.
      API.clearCache();
      try { localStorage.setItem(KEY(slot), JSON.stringify(G)); return true; }
      catch (e2) { UI.toast('⚠️ Could not save — storage is full', 'bad'); return false; }
    }
  }
  function peek(s) { try { return JSON.parse(localStorage.getItem(KEY(s)) || 'null'); } catch (e) { return null; } }
  function load(s) {
    const d = peek(s);
    if (!d || d.v !== 1) return false;
    G = Object.assign(fresh(), d);
    slot = s;
    return true;
  }
  function create(s, name) { slot = s; G = fresh(name); save(); }
  function remove(s) { try { localStorage.removeItem(KEY(s)); } catch (e) {} }

  // ── settings (shared by all slots) ──────────────────────────────────────
  let settings = {sound: true, speed: 1};
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) {}
  function setSetting(k, v) {
    settings[k] = v;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // ── daily streak ─────────────────────────────────────────────────────────
  function checkStreak() {
    const today = new Date().toDateString();
    if (G.streak.last === today) return null;
    const diff = Math.round((new Date(today) - new Date(G.streak.last)) / 86400000);
    G.streak.count = diff === 1 ? G.streak.count + 1 : 1;
    G.streak.last = today;
    G.streak.best = Math.max(G.streak.best, G.streak.count);
    const bonus = Math.min(G.streak.count, 7);
    addItem('poke-ball', bonus);
    earn(bonus * 100);
    save();
    return {count: G.streak.count, balls: bonus, coins: bonus * 100};
  }

  // ── bag & coins ──────────────────────────────────────────────────────────
  const count = id => G.bag[id] || 0;
  function addItem(id, n = 1) { G.bag[id] = (G.bag[id] || 0) + n; }
  function useItem(id, n = 1) {
    if (count(id) < n) return false;
    G.bag[id] -= n;
    if (G.bag[id] <= 0) delete G.bag[id];
    return true;
  }
  function earn(n) { G.coins += n; G.stats.coinsEarned += n; }
  function grant(reward) {
    const parts = [];
    for (const [k, v] of Object.entries(reward)) {
      if (k === 'coins') { earn(v); parts.push(`+${v.toLocaleString()} coins`); }
      else if (ITEMS[k]) { addItem(k, v); parts.push(`${ITEMS[k].emoji} ${ITEMS[k].name} ×${v}`); }
    }
    return parts.join(' · ');
  }

  // ── Pokédex & party ──────────────────────────────────────────────────────
  function see(mon) {
    const e = G.dex[mon.id] || (G.dex[mon.id] = {n: mon.name, t: mon.types, c: false});
    e.n = mon.name; e.t = mon.types;
  }
  function register(mon) { see(mon); G.dex[mon.id].c = true; if (mon.shiny) G.dex[mon.id].s = true; }
  // Adds a Pokémon to the party (or PC when full). Returns 'team' | 'pc'.
  function receive(mon) {
    register(mon);
    if (mon.shiny) G.stats.shinies++;
    if (G.team.length < 6) { G.team.push(mon); return 'team'; }
    G.pc.push(mon); return 'pc';
  }
  const badgeCount = () => G.badges.length;
  const avgLevel = () => G.team.length ? Math.round(G.team.reduce((s, p) => s + p.level, 0) / G.team.length) : 5;
  const topLevel = () => Math.max(5, ...G.team.map(p => p.level));
  const routeUnlocked = r => badgeCount() >= r.badges;
  const currentRoute = () => ROUTES.find(r => r.id === G.route && routeUnlocked(r)) || ROUTES[0];

  // ── daily quests ─────────────────────────────────────────────────────────
  function ensureQuests() {
    const today = new Date().toDateString();
    if (G.quests.date === today && G.quests.list.length) return;
    const pool = QUEST_POOL.slice().sort(() => Math.random() - .5), used = new Set(), list = [];
    for (const q of pool) {
      if (list.length >= 3) break;
      if (q.type === 'gym' && badgeCount() >= GYMS.length) continue;
      if (!used.has(q.type)) { used.add(q.type); list.push({id: q.id, progress: 0, done: false}); }
    }
    G.quests = {date: today, list};
  }
  function quest(type, amt = 1) {
    ensureQuests();
    for (const q of G.quests.list) {
      const def = QUEST_POOL.find(d => d.id === q.id);
      if (!def || def.type !== type || q.done) continue;
      q.progress = Math.min(def.target, q.progress + amt);
      if (q.progress >= def.target) {
        q.done = true;
        const txt = grant(def.reward);
        setTimeout(() => UI.toast(`📋 Quest complete: ${def.text}! ${txt}`, 'gold'), 300);
      }
    }
  }

  // ── achievements ─────────────────────────────────────────────────────────
  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter(a => !G.achievements.includes(a.id) && a.check(G));
    fresh.forEach((a, i) => {
      G.achievements.push(a.id);
      setTimeout(() => UI.toast(`🏅 Achievement unlocked: ${a.name}`, 'gold'), 900 + i * 1400);
    });
    if (fresh.length) save();
  }

  return {SLOTS, save, load, peek, create, remove, settings, setSetting, checkStreak, count, addItem, useItem,
    earn, grant, see, register, receive, badgeCount, avgLevel, topLevel, routeUnlocked, currentRoute,
    ensureQuests, quest, checkAchievements, slot: () => slot};
})();
