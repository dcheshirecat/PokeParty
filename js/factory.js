'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  FACTORY — builds Pokémon / opponents from API data.
//  PROGRESS — experience, level-ups, move learning and evolution.
// ════════════════════════════════════════════════════════════════════════════
const Factory = (() => {
  async function make(id, level, opts = {}) {
    const sp = await API.species(id);
    const mv = await API.moves(Engine.candidateMoveIds(sp, level));
    return Engine.createMon(sp, level, Engine.chooseMoves(sp, level, mv), opts);
  }

  // Follow level-based evolutions so wild/trainer Pokémon match their level
  async function matureId(id, level) {
    let sp = await API.species(id);
    for (let i = 0; i < 2; i++) {
      const next = sp.evos.filter(e => e.method === 'level' ? e.level <= level : level >= 40);
      if (!next.length) break;
      sp = await API.species(pick(next).to);
    }
    return sp.id;
  }
  const maxStageFor = level => level < 16 ? 0 : level < 32 ? 1 : 2;

  async function poolFor(types) {
    if (types === 'all' || !types) return null;
    const lists = await Promise.all(types.map(t => API.typePool(t).catch(() => [])));
    const ids = [...new Set(lists.flat())];
    return ids.length ? ids : null;
  }

  async function speciesFrom(pool, level, legendChance = 0) {
    let sp = null;
    for (let tries = 0; tries < 6; tries++) {
      const id = pool ? pick(pool) : rand(1, 1025);
      try { sp = await API.species(id); } catch (e) { if (tries === 5) throw e; continue; }
      if (sp.legendary && !(legendChance && Math.random() < legendChance)) { sp = null; continue; }
      if (sp.stage > maxStageFor(level) && tries < 5) continue;
      break;
    }
    if (!sp) sp = await API.species(rand(1, 151));
    return sp.legendary ? sp.id : matureId(sp.id, level);
  }

  async function wild(route) {
    const level = rand(route.lv[0], route.lv[1]);
    let types = route.types;
    if (isNight() && types !== 'all' && Math.random() < .3) types = ['ghost', 'dark'];
    const id = await speciesFrom(await poolFor(types), level, route.legendChance || 0);
    return make(id, level, {shiny: Math.random() < 1 / 400});
  }

  async function routeTrainer(route) {
    const idx = ROUTES.indexOf(route);
    const rTypes = route.types === 'all' ? TYPES : route.types;
    const fits = TRAINER_CLASSES.filter(c => !c.types || c.types.some(t => rTypes.includes(t)));
    const cls = pick(fits);
    const types = cls.types ? cls.types.filter(t => rTypes.includes(t)) : route.types;
    const pool = await poolFor(types.length ? types : route.types);
    const size = idx < 2 ? rand(1, 2) : idx < 5 ? rand(2, 3) : idx < 9 ? rand(3, 4) : rand(4, 5);
    const [lo, hi] = route.lv;
    const team = [];
    for (let i = 0; i < size; i++) {
      const level = Math.round(lo + (hi - lo) * (.45 + .55 * Math.random()));
      team.push(await make(await speciesFrom(pool, level), level, {ivs: Engine.randIVs(Math.random, 8)}));
    }
    const top = Math.max(...team.map(m => m.level));
    return {
      kind: 'trainer', name: `${cls.cls} ${pick(TRAINER_NAMES)}`, sprite: SHOWDOWN + cls.sprite + '.png', emoji: cls.emoji,
      quote: pick(TRAINER_QUOTES), team, skill: 1,
      reward: {coins: Math.round(top * 22 * (1 + size * .25) / 10) * 10,
        ...(Math.random() < .35 ? {[pick(['potion', 'poke-ball', 'super-potion', 'great-ball'])]: 1} : {})},
    };
  }

  async function fixedTeam(list, ivFloor = 15) {
    const team = [];
    for (const [id, lv] of list) team.push(await make(id, lv, {ivs: Engine.randIVs(Math.random, ivFloor)}));
    return team;
  }

  return {make, wild, routeTrainer, fixedTeam, matureId};
})();

const Progress = (() => {
  // `say` is an async narrator: the battle text box, or a toast outside battle.
  const toastSay = async text => UI.toast(text, 'info');

  async function addExp(mon, amount, say = toastSay) {
    if (mon.level >= 100 || mon.hp <= 0) return 0;
    mon.exp += amount;
    let gained = 0;
    while (mon.level < 100 && mon.exp >= Engine.expAt(mon.level + 1)) {
      await levelUp(mon, say);
      gained++;
    }
    if (mon.level >= 100) mon.exp = Engine.expAt(100);
    return gained;
  }

  async function levelUp(mon, say = toastSay) {
    mon.level++;
    if (mon.exp < Engine.expAt(mon.level)) mon.exp = Engine.expAt(mon.level);
    Engine.refresh(mon);
    SFX.levelup();
    await say(`${Engine.displayName(mon)} grew to Lv. ${mon.level}!`);
    Store.quest('levelup');
    await learnNew(mon, say);
  }

  async function learnNew(mon, say = toastSay) {
    let sp;
    try { sp = await API.species(mon.id); } catch (e) { return; }
    const ids = Engine.movesLearnedAt(sp, mon.level).filter(id => !mon.moves.some(m => m.id === id));
    for (const id of ids) {
      let mv;
      try { mv = await API.move(id); } catch (e) { continue; }
      await teach(mon, mv, say);
    }
  }

  async function teach(mon, mv, say = toastSay) {
    const name = Engine.displayName(mon);
    if (mon.moves.length < 4) {
      mon.moves.push({...mv, maxPp: mv.pp});
      await say(`${name} learned ${mv.name}!`);
      return true;
    }
    const choice = await UI.choose({
      title: `${esc(name)} wants to learn ${esc(mv.name)}`,
      text: `${UI.moveChip({...mv, maxPp: 0})}<br>${esc(UI.moveDesc(mv))}<br><br>It already knows four moves. Forget one?`,
      options: [...mon.moves.map((m, i) => ({value: i, html: UI.moveChip(m)})),
        {value: -1, label: `Don't learn ${esc(mv.name)}`, tone: 'muted'}],
      cancel: null, dismissable: false,
    });
    if (choice === null || choice < 0) { await say(`${name} did not learn ${mv.name}.`); return false; }
    const old = mon.moves[choice].name;
    mon.moves[choice] = {...mv, maxPp: mv.pp};
    await say(`1, 2 and… Poof! ${name} forgot ${old} and learned ${mv.name}!`);
    return true;
  }

  // Evolutions available right now. `item` = consider using that item.
  async function evoOptions(mon) {
    let sp;
    try { sp = await API.species(mon.id); } catch (e) { return []; }
    return sp.evos;
  }
  const levelReady = (evos, mon) => evos.filter(e => e.method === 'level' && mon.level >= e.level);

  async function evolve(mon, toId) {
    const sp = await UI.busy('Preparing evolution…', () => API.species(toId));
    const ok = await UI.evolutionScene(mon, API.art(sp.id, mon.shiny), sp.name);
    if (!ok) return false;
    const hpFrac = mon.hp / mon.stats.hp;
    Engine.evolveInto(mon, sp);
    if (hpFrac > 0) mon.hp = Math.max(1, Math.round(mon.stats.hp * hpFrac));
    Store.register(mon);
    G.stats.evolutions++;
    Store.quest('evolve');
    await learnNew(mon);
    Store.save();
    Store.checkAchievements();
    return true;
  }

  // After battles / rare candy: offer any level-based evolutions
  async function runPendingEvolutions(mons) {
    for (const mon of mons) {
      if (mon.hp <= 0 || mon.noEvolve === mon.level) continue;
      const ready = levelReady(await evoOptions(mon), mon);
      if (!ready.length) continue;
      const evolved = await evolve(mon, pick(ready).to);
      if (!evolved) mon.noEvolve = mon.level; // don't nag again until next level
    }
  }

  return {addExp, levelUp, learnNew, teach, evoOptions, levelReady, evolve, runPendingEvolutions};
})();
