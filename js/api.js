'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  POKEAPI ACCESS
//  • Tries pokeapi.co first, falls back to PokeAPI's static mirror on GitHub.
//  • Only the fields the game needs are cached (a raw /pokemon response is
//    ~500 KB — caching those used to fill localStorage and break saving).
// ════════════════════════════════════════════════════════════════════════════
const API = (() => {
  const PRIMARY = 'https://pokeapi.co/api/v2/';
  const MIRROR = 'https://raw.githubusercontent.com/PokeAPI/api-data/master/data/api/v2/';
  const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
  const CACHE_KEY = 'pp_cache_v1';
  const MAX_ENTRIES = 1200;
  const SCHEMA = 2; // bump when the trimmed shape changes

  // ── persistent trimmed cache ─────────────────────────────────────────────
  let mem = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw && raw.v === SCHEMA) mem = new Map(Object.entries(raw.d));
  } catch (e) { /* ignore corrupt cache */ }
  try { localStorage.removeItem('pk_cache_v4'); } catch (e) {} // legacy multi-MB cache

  let persistTimer = null;
  function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      while (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value);
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({v: SCHEMA, d: Object.fromEntries(mem)}));
          return;
        } catch (e) {
          // Quota hit — drop the oldest half. Save games always win over cache.
          const drop = Math.ceil(mem.size / 2);
          [...mem.keys()].slice(0, drop).forEach(k => mem.delete(k));
        }
      }
    }, 600);
  }
  function put(k, v) { mem.delete(k); mem.set(k, v); persist(); }

  // ── network ──────────────────────────────────────────────────────────────
  let preferMirror = false;
  async function fetchJSON(url, ms = 12000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, {signal: ctl.signal});
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }
  async function get(path) {
    const urls = [PRIMARY + path, MIRROR + path + '/index.json'];
    if (preferMirror) urls.reverse();
    let err;
    for (let i = 0; i < urls.length; i++) {
      try {
        const d = await fetchJSON(urls[i], i === 0 ? 8000 : 15000);
        if (i > 0) preferMirror = !preferMirror; // remember what worked
        return d;
      } catch (e) { err = e; }
    }
    throw err;
  }
  const inflight = new Map();
  function cached(key, loader) {
    if (mem.has(key)) return Promise.resolve(mem.get(key));
    if (inflight.has(key)) return inflight.get(key);
    const p = loader().then(v => { put(key, v); inflight.delete(key); return v; },
                            e => { inflight.delete(key); throw e; });
    inflight.set(key, p);
    return p;
  }

  const idOf = url => parseInt(String(url).split('/').filter(Boolean).pop(), 10);
  const enName = (names, fallback) =>
    (names || []).find(n => n.language && n.language.name === 'en')?.name || pretty(fallback);
  const pretty = s => String(s).split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const STAT_KEYS = {'hp':'hp','attack':'atk','defense':'def','special-attack':'spa','special-defense':'spd','speed':'spe'};
  const AIL = {paralysis:'par', sleep:'slp', freeze:'frz', burn:'brn', poison:'psn', confusion:'confusion'};

  // ── evolution chains ─────────────────────────────────────────────────────
  function evoMethod(det) {
    if (!det) return {method:'level', level:30};
    const trig = det.trigger && det.trigger.name;
    if (trig === 'level-up') {
      if (det.min_level) return {method:'level', level:det.min_level};
      // friendship / time-of-day / move-known / held item → simplified to a level
      return {method:'level', level:24};
    }
    if (trig === 'use-item') {
      const it = det.item && det.item.name;
      return {method:'item', item: ITEMS[it] ? it : 'evo-gem'};
    }
    if (trig === 'trade') return {method:'item', item:'link-cable'};
    return {method:'level', level:32};
  }
  function chain(id) {
    return cached('c' + id, async () => {
      const d = await get('evolution-chain/' + id);
      const edges = [];
      const depth = {};
      (function walk(n, dep) {
        const from = idOf(n.species.url);
        depth[from] = dep;
        for (const nx of n.evolves_to) {
          const to = idOf(nx.species.url);
          const dets = nx.evolution_details || [];
          const det = dets.find(x => x.trigger?.name === 'level-up' && x.min_level) ||
                      dets.find(x => x.trigger?.name === 'use-item') ||
                      dets.find(x => x.trigger?.name === 'trade') || dets[0];
          if (to <= 1025) edges.push({from, to, ...evoMethod(det)});
          walk(nx, dep + 1);
        }
      })(d.chain, 0);
      return {root: idOf(d.chain.species.url), edges, depth};
    });
  }

  // ── species (pokemon + species + chain, trimmed) ─────────────────────────
  function species(id) {
    id = Number(id);
    return cached('s' + id, async () => {
      const [p, s] = await Promise.all([get('pokemon/' + id), get('pokemon-species/' + id)]);
      const bs = {};
      p.stats.forEach(st => { bs[STAT_KEYS[st.stat.name]] = st.base_stat; });
      const learn = new Map(), tms = [];
      for (const m of p.moves) {
        const mid = idOf(m.move.url);
        let lv = null;
        for (const v of m.version_group_details) {
          if (v.move_learn_method.name === 'level-up') lv = v.level_learned_at; // latest group wins
        }
        if (lv !== null) learn.set(mid, lv);
        if (m.version_group_details.some(v => v.move_learn_method.name === 'machine')) tms.push(mid);
      }
      let evo = {root:id, edges:[], depth:{}};
      try { if (s.evolution_chain) evo = await chain(idOf(s.evolution_chain.url)); } catch (e) {}
      return {
        id, name: enName(s.names, s.name), types: p.types.map(t => t.type.name), bs,
        baseExp: p.base_experience || 60, capture: s.capture_rate ?? 45,
        legendary: !!(s.is_legendary || s.is_mythical),
        learnset: [...learn.entries()].sort((a, b) => a[1] - b[1]),
        tms: tms.slice(0, 80),
        evos: evo.edges.filter(e => e.from === id).map(({to, method, level, item}) => ({to, method, level, item})),
        base: evo.root, stage: evo.depth[id] || 0,
        flavor: ((s.flavor_text_entries || []).filter(f => f.language.name === 'en').pop()?.flavor_text || '').replace(/[\f\n\r]/g, ' '),
        genus: (s.genera || []).find(g => g.language.name === 'en')?.genus || '',
      };
    });
  }

  // ── moves ────────────────────────────────────────────────────────────────
  function move(id) {
    return cached('m' + id, async () => {
      const d = await get('move/' + id);
      const meta = d.meta || {};
      return {
        id: d.id, key: d.name, name: enName(d.names, d.name), type: d.type.name,
        power: d.power || 0, acc: d.accuracy ?? null, pp: d.pp || 10, cat: d.damage_class?.name || 'status',
        prio: d.priority || 0, target: d.target?.name || 'selected-pokemon',
        ail: AIL[meta.ailment?.name] || null, ailChance: meta.ailment_chance || 0,
        flinch: meta.flinch_chance || 0, drain: meta.drain || 0, heal: meta.healing || 0,
        crit: meta.crit_rate || 0, minHits: meta.min_hits || null, maxHits: meta.max_hits || null,
        stats: (d.stat_changes || []).map(sc => [sc.stat.name, sc.change]),
        statChance: meta.stat_chance || 0, mcat: meta.category?.name || '',
      };
    });
  }
  const moves = ids => Promise.all(ids.map(id => move(id).catch(() => null))).then(a => a.filter(Boolean));

  // ── type pools for routes ────────────────────────────────────────────────
  function typePool(type) {
    return cached('t' + type, async () => {
      const d = await get('type/' + TYPE_ID[type]);
      return d.pokemon.map(x => idOf(x.pokemon.url)).filter(id => id <= 1025);
    });
  }

  // ── sprites (URL patterns — no request needed) ───────────────────────────
  const art = (id, shiny) => `${SPRITES}other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`;
  const icon = id => `${SPRITES}${id}.png`;

  return {species, move, moves, typePool, art, icon, pretty, cacheSize: () => mem.size,
    clearCache: () => { mem.clear(); try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }};
})();
