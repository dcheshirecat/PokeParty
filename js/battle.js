'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  BATTLE — turn flow + animation. Game rules live in engine.js; this file
//  decides who acts when, plays the resulting events, and pays out rewards.
// ════════════════════════════════════════════════════════════════════════════
const Battle = (() => {
  let B = null;
  const el = id => document.getElementById(id);
  const spd = () => Store.settings.speed || 1;

  // ── timing: every pause can be skipped by tapping the arena/text box ────
  let skip = null;
  function wait(ms) {
    return new Promise(res => {
      const done = () => { clearTimeout(t); if (skip === done) skip = null; res(); };
      const t = setTimeout(done, ms / spd());
      skip = done;
    });
  }
  const tick = ms => sleep(ms / spd()); // non-skippable (animation sync)
  async function say(text, extra = 0) {
    const box = el('b-text-inner');
    box.textContent = text;
    box.parentElement.classList.remove('pop'); void box.offsetWidth; box.parentElement.classList.add('pop');
    await wait(750 + Math.min(900, text.length * 14) + extra);
  }

  // ── sides ────────────────────────────────────────────────────────────────
  function sideName(key, mon) {
    if (key === 'p') return Engine.displayName(mon);
    return (B.kind === 'wild' ? 'Wild ' : 'Foe ') + mon.name;
  }
  function setActive(key, mon) {
    const S = key === 'p' ? B.P : B.E;
    S.mon = mon; S.vol = Engine.newVol(); S.name = sideName(key, mon);
    B.disp[key] = mon.hp;
    renderSide(key);
    renderDots();
  }
  const alive = list => list.filter(m => m.hp > 0);

  // ── rendering ────────────────────────────────────────────────────────────
  function renderArena() {
    const a = el('arena');
    const r = B.route;
    const theme = B.theme || {sky: r.sky, ground: r.ground};
    a.style.setProperty('--sky1', theme.sky[0]);
    a.style.setProperty('--sky2', theme.sky[1]);
    a.style.setProperty('--ground', theme.ground);
    a.classList.toggle('night', isNight() && B.kind === 'wild');
    el('b-place').textContent = B.label;
    renderDots();
  }
  function renderDots() {
    const dots = list => list.map(m => `<i class="${m.hp > 0 ? (m.status ? 'st' : 'ok') : 'ko'}"></i>`).join('');
    const p = $('#b-info-p .bi-dots'), e = $('#b-info-e .bi-dots');
    if (p) p.innerHTML = G.team.length > 1 ? dots(G.team) : '';
    if (e) e.innerHTML = B.kind === 'wild' ? '' : dots(B.foes);
  }
  function renderSide(key) {
    const S = key === 'p' ? B.P : B.E, m = S.mon;
    const box = el('b-info-' + key);
    const pct = Math.max(0, Math.round(B.disp[key] / m.stats.hp * 100));
    box.innerHTML = `<div class="bi-top"><span class="bi-name">${esc(Engine.displayName(m))}${m.shiny ? ' <span class="shiny-star">✨</span>' : ''}</span>
        <span class="bi-lv">Lv.${m.level}</span></div>
      <div class="bi-row">${UI.statusBadge(m.status)}<div class="hp"><div class="hp-fill" style="width:${pct}%;background:${UI.hpColor(pct)}"></div></div></div>
      ${key === 'p' ? `<div class="bi-hp">${Math.max(0, Math.round(B.disp.p))} / ${m.stats.hp}</div>
        <div class="xp"><div class="xp-fill" style="width:${UI.expPct(m)}%"></div></div>` : ''}<div class="bi-dots"></div>`;
    const img = el('b-img-' + key);
    const src = API.art(m.id, m.shiny);
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      img.onerror = () => { img.onerror = null; img.src = API.icon(m.id); };
      img.src = src;
    }
  }
  function tweenHp(key, to) {
    const S = key === 'p' ? B.P : B.E;
    const from = B.disp[key], max = S.mon.stats.hp, dur = 520 / spd();
    const fill = $('#b-info-' + key + ' .hp-fill'), txt = $('#b-info-' + key + ' .bi-hp');
    const t0 = performance.now();
    return new Promise(res => {
      (function frame(now) {
        const k = Math.min(1, (now - t0) / dur);
        const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
        const pct = Math.max(0, v / max * 100);
        if (fill) { fill.style.width = pct + '%'; fill.style.background = UI.hpColor(pct); }
        if (txt) txt.textContent = `${Math.max(0, Math.round(v))} / ${max}`;
        if (k < 1) requestAnimationFrame(frame); else { B.disp[key] = to; res(); }
      })(t0);
    });
  }
  function anim(target, cls, ms) {
    const node = typeof target === 'string' ? el(target) : target;
    node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls);
    return tick(ms).then(() => node.classList.remove(cls));
  }
  function floatText(key, text, cls) {
    const host = el('b-spr-' + key);
    const n = document.createElement('div');
    n.className = 'float-txt ' + cls;
    n.textContent = text;
    host.appendChild(n);
    setTimeout(() => n.remove(), 1100);
  }

  // ── menu ─────────────────────────────────────────────────────────────────
  function showMenu() {
    const m = B.P.mon, foe = B.E.mon;
    const outOfPp = m.moves.every(x => x.pp <= 0);
    const moves = outOfPp
      ? `<button class="mv mv-struggle" data-bact="move" data-i="-1"><b>Struggle</b><small>No PP left!</small></button>`
      : m.moves.map((mv, i) => {
          const e = Engine.isDamaging(mv) ? Engine.typeEff(mv.type, foe.types) : null;
          const hint = e === null ? (mv.cat === 'status' ? 'Status' : '') : e === 0 ? 'No effect' : e >= 2 ? 'Super effective' : e < 1 ? 'Not very effective' : '';
          return `<button class="mv" style="--tc:${TYPE_COLOR[mv.type]}" data-bact="move" data-i="${i}" ${mv.pp <= 0 ? 'disabled' : ''}>
            <b>${esc(mv.name)}</b><small>${mv.type.toUpperCase()} · ${mv.pp}/${mv.maxPp} PP</small>
            ${hint ? `<em class="${e >= 2 ? 'good' : e !== null && e < 1 ? 'bad' : ''}">${hint}</em>` : ''}</button>`;
        }).join('');
    const balls = BALL_ORDER.reduce((s, id) => s + Store.count(id), 0);
    el('b-panel').innerHTML = `<div class="moves">${moves}</div>
      <div class="b-actions">
        <button class="ba" data-bact="bag"><span>🎒</span>Bag</button>
        <button class="ba" data-bact="switch"><span>🔁</span>Pokémon</button>
        ${B.kind === 'wild' ? `<button class="ba" data-bact="ball" ${balls ? '' : 'disabled'}><span class="mini-ball"></span>Ball <small>${balls}</small></button>
        <button class="ba" data-bact="run"><span>💨</span>Run</button>`
        : `<button class="ba" data-bact="forfeit"><span>🏳️</span>Forfeit</button>`}
      </div>`;
    el('b-panel').classList.remove('locked');
    B.busy = false;
  }
  function lock() { B.busy = true; el('b-panel').classList.add('locked'); }

  // ── event playback ───────────────────────────────────────────────────────
  async function play(events) {
    for (const ev of events) {
      if (!B) return;
      switch (ev.k) {
        case 'msg': await say(ev.text); break;
        case 'use': await anim('b-spr-' + ev.who, 'lunge', 380); break;
        case 'dmg': {
          const key = ev.who;
          if (ev.amount <= 0) break;
          if (ev.crit) SFX.crit(); else if (ev.eff >= 2) SFX.super(); else if (ev.eff < 1) SFX.weak(); else SFX.hit();
          if (key === 'e' && ev.eff >= 2) Store.quest('super');
          floatText(key, '-' + ev.amount, ev.crit || ev.eff >= 2 ? 'big' : '');
          await Promise.all([anim('b-spr-' + key, 'hit', 420), tweenHp(key, Math.max(0, B.disp[key] - ev.amount))]);
          break;
        }
        case 'heal':
          SFX.heal();
          floatText(ev.who, '+' + ev.amount, 'heal');
          await Promise.all([anim('b-spr-' + ev.who, 'glow', 500), tweenHp(ev.who, B.disp[ev.who] + ev.amount)]);
          break;
        case 'status': SFX.status(); renderSide(ev.who); await anim('b-spr-' + ev.who, 'st-' + ev.status, 600); break;
        case 'cure': renderSide(ev.who); break;
        case 'stat':
          ev.change > 0 ? SFX.statUp() : SFX.statDown();
          await anim('b-spr-' + ev.who, ev.change > 0 ? 'stat-up' : 'stat-down', 650);
          break;
      }
    }
    renderDots();
  }

  // ── send-outs ────────────────────────────────────────────────────────────
  async function sendOutPlayer(idx, first = false) {
    const mon = G.team[idx];
    B.active = idx;
    setActive('p', mon);
    el('b-spr-p').classList.remove('gone');
    await say(first ? `Go! ${Engine.displayName(mon)}!` : `Go, ${Engine.displayName(mon)}!`);
    await anim('b-spr-p', 'enter', 450);
  }
  async function sendOutFoe(idx) {
    B.foeIdx = idx;
    setActive('e', B.foes[idx]);
    el('b-info-e').classList.remove('hidden');
    el('b-spr-e').classList.remove('gone');
    if (B.kind !== 'wild') await say(`${B.trainer.name} sent out ${B.E.mon.name}!`);
    await anim('b-spr-e', 'enter', 450);
  }
  async function withdraw(key) {
    await anim('b-spr-' + key, 'withdraw', 350);
    el('b-spr-' + key).classList.add('gone');
  }

  // ── start ────────────────────────────────────────────────────────────────
  // opts: {kind, foes, trainer?, skill, route, label, theme?, reward?, gymId?, again?}
  async function start(opts) {
    const first = G.team.findIndex(m => m.hp > 0);
    if (first < 0) { UI.toast('All your Pokémon have fainted — visit the Pokémon Center!', 'bad'); return; }
    B = {...opts, foeIdx: 0, active: first, P: {key: 'p'}, E: {key: 'e'}, disp: {p: 0, e: 0},
      runs: 0, busy: true, over: false};
    B.foes.forEach(f => Store.see(f));
    UI.go('battle');
    el('b-result').classList.remove('show');
    el('b-panel').innerHTML = '';
    el('b-panel').classList.add('locked');
    ['p', 'e'].forEach(k => el('b-spr-' + k).classList.add('gone'));
    el('b-text-inner').textContent = '';
    renderArena();
    // placeholder info until send-out
    el('b-info-p').innerHTML = ''; el('b-info-e').innerHTML = '';
    el('b-info-e').classList.add('hidden'); el('b-info-p').classList.add('hidden');
    SFX.encounter();

    const tp = el('b-trainer');
    if (B.trainer) {
      const img = $('img', tp), fb = $('.tp-emoji', tp);
      fb.textContent = B.trainer.emoji || '🧑';
      img.style.display = ''; fb.style.display = 'none';
      img.onerror = () => { img.style.display = 'none'; fb.style.display = ''; };
      img.src = B.trainer.sprite || '';
      tp.classList.add('show');
      await say(`${B.trainer.title ? B.trainer.title + ' ' : ''}${B.trainer.name} wants to battle!`);
      if (B.trainer.quote) await say(`“${B.trainer.quote}”`);
      tp.classList.remove('show');
      await tick(250);
      el('b-info-e').classList.remove('hidden');
      await sendOutFoe(0);
    } else {
      tp.classList.remove('show');
      el('b-info-e').classList.remove('hidden');
      setActive('e', B.foes[0]);
      el('b-spr-e').classList.remove('gone');
      anim('b-spr-e', 'enter', 450);
      if (B.E.mon.shiny) { SFX.shiny(); anim('b-spr-e', 'sparkle', 1200); }
      await say(`A wild ${B.E.mon.name} appeared!${B.E.mon.shiny ? ' ✨ It’s shiny!' : ''}`);
    }
    el('b-info-p').classList.remove('hidden');
    await sendOutPlayer(first, true);
    showMenu();
  }

  // ── turns ────────────────────────────────────────────────────────────────
  async function takeTurn(playerAct) {
    lock();
    const P = B.P, E = B.E;
    const ei = Engine.aiChoose(E, P, B.skill);
    let order;
    if (playerAct.type === 'move') {
      const pm = P.mon.moves[playerAct.i] || Engine.STRUGGLE, em = E.mon.moves[ei] || Engine.STRUGGLE;
      const pFirst = Engine.goesFirst(P, pm, E, em, Math.random);
      order = pFirst ? [[P, E, playerAct.i], [E, P, ei]] : [[E, P, ei], [P, E, playerAct.i]];
    } else {
      await playerAct.run();          // item / switch / ball already happened
      if (!B || B.over) return;
      order = [[E, P, ei]];
    }
    for (let n = 0; n < order.length; n++) {
      const [A, D, mi] = order[n];
      const actor = A.mon;
      if (actor.hp <= 0) continue;
      await play(Engine.runMove(A, D, mi, Math.random, n === 0));
      const r = await resolveFaints();
      if (r === 'over') return;
      if (r === 'changed') break;  // a replacement came in — the turn ends
    }
    await play(Engine.endOfTurn([P, E]));
    if (await resolveFaints() === 'over') return;
    showMenu();
  }

  async function resolveFaints() {
    let foeNext = null, changed = false;
    if (B.E.mon.hp <= 0) {
      SFX.faint();
      await anim('b-spr-e', 'faint', 600);
      el('b-spr-e').classList.add('gone');
      el('b-info-e').classList.add('hidden');
      await say(`${B.E.name} fainted!`);
      await awardExp(B.E.mon);
      const next = Engine.aiNextFoe(B.foes, B.P.mon, B.skill);
      if (next < 0) { await win(); return 'over'; }
      foeNext = next; changed = true;
    }
    if (B.P.mon.hp <= 0) {
      SFX.faint();
      await anim('b-spr-p', 'faint', 600);
      el('b-spr-p').classList.add('gone');
      await say(`${B.P.name} fainted!`);
      renderDots();
      if (!alive(G.team).length) { await lose(); return 'over'; }
      const idx = await chooseMon(true);
      await sendOutPlayer(idx);
      changed = true;
    }
    if (foeNext !== null) await sendOutFoe(foeNext);
    renderDots();
    return changed ? 'changed' : null;
  }

  // Team-wide Exp. Share: the active Pokémon gets full EXP and every other
  // non-fainted party member gets half, whether or not it battled.
  async function awardExp(foe) {
    const base = Engine.expYield(foe, B.kind !== 'wild');
    const share = Math.max(1, Math.floor(base / 2));
    const active = B.P.mon;
    if (active.hp > 0 && active.level < 100) {
      await say(`${Engine.displayName(active)} gained ${base} Exp. Points!`);
      await Progress.addExp(active, base, async text => { renderSide('p'); await say(text); });
      B.disp.p = active.hp; renderSide('p');
    }
    const rest = G.team.filter(m => m !== active && m.hp > 0 && m.level < 100);
    if (!rest.length) return;
    await say(rest.length === 1 ? `${Engine.displayName(rest[0])} gained ${share} Exp. Points via Exp. Share!`
      : `The rest of your team gained ${share} Exp. Points via Exp. Share!`);
    for (const mon of rest) await Progress.addExp(mon, share, say);
  }

  // ── player actions ───────────────────────────────────────────────────────
  async function chooseMon(forced) {
    const opts = G.team.map((m, i) => ({value: i, disabled: m.hp <= 0 || (i === B.active && B.P.mon.hp > 0),
      html: `${UI.monImg(m, 'choice-mon')}<span class="choice-main"><span class="choice-label">${esc(Engine.displayName(m))} <small>Lv.${m.level}</small> ${UI.statusBadge(m.status)}</span>
        <span class="choice-sub">${UI.hpBar(m)}</span></span>${i === B.active ? '<span class="tag">In battle</span>' : ''}`}));
    const v = await UI.choose({title: forced ? 'Choose your next Pokémon' : 'Switch Pokémon', options: opts,
      cancel: forced ? null : 'Cancel', dismissable: !forced});
    return v;
  }

  async function actSwitch() {
    const idx = await chooseMon(false);
    if (idx === null || idx === undefined) return;
    await takeTurn({type: 'switch', run: async () => {
      await say(`Come back, ${B.P.name}!`);
      await withdraw('p');
      await sendOutPlayer(idx);
    }});
  }

  async function actBag() {
    const usable = Object.keys(G.bag).filter(id => ['heal', 'cure', 'revive'].includes(ITEMS[id]?.kind) && Store.count(id) > 0);
    if (!usable.length) { UI.toast('No usable items in your bag', 'info'); return; }
    const id = await UI.choose({title: '🎒 Bag', options: usable.map(id => ({value: id, icon: ITEMS[id].emoji,
      label: `${ITEMS[id].name} <small>×${Store.count(id)}</small>`, sub: ITEMS[id].desc}))});
    if (!id) return;
    const it = ITEMS[id];
    const valid = m => it.kind === 'revive' ? m.hp <= 0 : m.hp > 0 && (it.kind === 'cure' ? !!m.status
      : m.hp < m.stats.hp || (it.cure && m.status));
    const ti = await UI.choose({title: `Use ${it.name} on…`, options: G.team.map((m, i) => ({value: i, disabled: !valid(m),
      html: `${UI.monImg(m, 'choice-mon')}<span class="choice-main"><span class="choice-label">${esc(Engine.displayName(m))} <small>Lv.${m.level}</small> ${UI.statusBadge(m.status)}</span>
        <span class="choice-sub">${UI.hpBar(m)}</span></span>`}))});
    if (ti === null) return;
    const target = G.team[ti];
    await takeTurn({type: 'item', run: async () => {
      Store.useItem(id);
      await say(`You used a ${it.name}!`);
      const isActive = target === B.P.mon;
      if (it.kind === 'revive') {
        target.hp = Math.max(1, Math.floor(target.stats.hp * it.frac));
        SFX.heal();
        await say(`${Engine.displayName(target)} was revived!`);
      } else {
        if (it.heal) {
          const h = Math.min(it.heal, target.stats.hp - target.hp);
          target.hp += h;
          if (isActive) await play([{k: 'heal', who: 'p', amount: h}]); else SFX.heal();
          if (h > 0) await say(`${Engine.displayName(target)} recovered ${h} HP!`);
          Store.quest('item');
        }
        if ((it.cure || it.kind === 'cure') && target.status) {
          target.status = null; target.sleep = 0;
          if (isActive) renderSide('p');
          await say(`${Engine.displayName(target)} was cured of its status!`);
        }
      }
      renderDots();
      Store.save();
    }});
  }

  async function actBall() {
    const owned = BALL_ORDER.filter(id => Store.count(id) > 0);
    if (!owned.length) { UI.toast('You have no Poké Balls!', 'bad'); return; }
    let id = owned[0];
    if (owned.length > 1) {
      id = await UI.choose({title: 'Throw which ball?', options: owned.map(b => ({value: b, icon: ITEMS[b].emoji,
        label: `${ITEMS[b].name} <small>×${Store.count(b)}</small>`, sub: ITEMS[b].desc}))});
      if (!id) return;
    }
    let caught = false;
    await takeTurn({type: 'ball', run: async () => {
      Store.useItem(id);
      const it = ITEMS[id], foe = B.E.mon;
      const dusk = it.dusk && (isNight() || ['ruins', 'rift'].includes(B.route.id)) ? it.dusk : 1;
      const p = Engine.catchChance(foe, it.ball * dusk);
      const success = Math.random() < p;
      const shakes = success ? 3 : Math.min(2, Math.floor(Math.random() * 3 * Math.min(1, p * 1.6)));
      await say(`You threw a ${it.name}!`);
      const ball = el('b-ball');
      ball.className = 'ball-fx ' + id; SFX.throw();
      await anim(ball, 'throw', 700);
      ball.classList.add('landed');
      await anim('b-spr-e', 'absorb', 450);
      el('b-spr-e').classList.add('gone');
      for (let s = 0; s < shakes; s++) { await tick(380); SFX.shake(); await anim(ball, 'shake', 520); }
      await tick(300);
      if (success) {
        ball.classList.add('caught'); SFX.caught();
        await say(`Gotcha! ${foe.name} was caught!`, 300);
        caught = true; B.over = true;
      } else {
        ball.className = 'ball-fx';
        el('b-spr-e').classList.remove('gone');
        SFX.escape();
        await anim('b-spr-e', 'enter', 400);
        await say(['Oh no! The Pokémon broke free!', 'Aww! It appeared to be caught!', 'Aargh! Almost had it!'][shakes]);
      }
    }});
    if (caught) await caughtFlow();
  }

  async function caughtFlow() {
    const mon = B.E.mon;
    B.over = true;
    mon.status = mon.status === 'frz' ? null : mon.status;
    const where = Store.receive(mon);
    G.stats.catches++;
    Store.quest('catch');
    const nick = await UI.prompt({title: `Give ${esc(mon.name)} a nickname?`, placeholder: mon.name, ok: 'Save nickname',
      extra: `<button class="btn btn-ghost btn-block" style="margin-top:8px" data-val="">No thanks</button>`});
    if (nick) mon.nick = nick.slice(0, 12);
    el('b-ball').className = 'ball-fx';
    await finish({title: '✨ Gotcha!', tone: 'good',
      lines: [`${esc(Engine.displayName(mon))} ${where === 'team' ? 'joined your party!' : 'was sent to the PC.'}`],
      buttons: [['again', '🌿 Explore again'], ['done', 'Done']]});
  }

  async function actRun() {
    let ok = false;
    await takeTurn({type: 'run', run: async () => {
      B.runs++;
      if (Math.random() < Engine.runChance(B.P, B.E, B.runs)) {
        ok = true; B.over = true;
        SFX.escape();
        await say('Got away safely!');
      } else await say("Can't escape!");
    }});
    if (ok) await finish({title: '💨 Got away!', tone: 'muted', lines: [], buttons: [['again', '🌿 Explore again'], ['done', 'Done']]});
  }

  async function actForfeit() {
    const ok = await UI.confirm('Forfeiting counts as a loss — you will lose some coins.', {ok: 'Forfeit', danger: true});
    if (!ok) return;
    lock();
    await say('You forfeited the match…');
    await lose(true);
  }

  // ── outcomes ─────────────────────────────────────────────────────────────
  async function win() {
    B.over = true;
    SFX.win();
    const lines = [];
    let buttons = [['done', 'Done']];
    const k = B.kind;
    if (k === 'wild') {
      const coins = rand(25, 45) + B.E.mon.level * 4;
      Store.earn(coins); lines.push(`+${coins} coins`);
      G.stats.wildWins++; Store.quest('wildwin');
      buttons = [['again', '🌿 Explore again'], ['done', 'Done']];
    } else {
      await say(`You defeated ${B.trainer.title ? B.trainer.title + ' ' : ''}${B.trainer.name}!`);
      G.stats.trainerWins++; Store.quest('trainwin');
      if (k === 'gym') {
        const gym = GYMS.find(g => g.id === B.gymId);
        if (!G.badges.includes(gym.id)) {
          G.badges.push(gym.id);
          lines.push(`<span class="big-badge">${gym.badge}</span> You earned the <b>${gym.name.replace(' Gym', '')} Badge</b>!`);
          const newRoute = ROUTES.find(r => r.badges === G.badges.length);
          if (newRoute) lines.push(`🗺️ New area unlocked: <b>${newRoute.emoji} ${newRoute.name}</b>`);
        }
        Store.quest('gym');
      }
      if (k === 'league') {
        G.league.progress++;
        if (G.league.progress >= LEAGUE.members.length) {
          G.league.progress = 0; G.league.champion = true; G.league.clears++;
          lines.push('🏆 <b>You are the Pokémon League Champion!</b>');
          G.team.forEach(Engine.healFull);
        } else buttons = [['next', `⚔️ Face ${LEAGUE.members[G.league.progress].name}`], ['done', 'Save & leave']];
      }
      if (k === 'legend') { G.league.legend = true; lines.push('🏔️ <b>You defeated the Legend!</b>'); }
      if (k === 'trainer') buttons = [['again', '⚔️ Find another'], ['done', 'Done']];
      lines.unshift(Store.grant(B.reward || {}));
    }
    Daycare.step();
    await finish({title: k === 'wild' ? '🎉 Victory!' : k === 'gym' ? '🏅 Gym cleared!' : '🏆 Victory!', tone: 'good', lines, buttons});
  }

  async function lose(forfeit = false) {
    B.over = true;
    SFX.lose();
    if (!forfeit) await say('You are out of usable Pokémon!');
    const lost = Math.min(G.coins, Math.round(G.coins * .1));
    G.coins -= lost;
    G.stats.losses++;
    G.team.forEach(Engine.healFull);
    if (B.kind === 'league') G.league.progress = 0;
    await say('You hurried back to the Pokémon Center…');
    await finish({title: '😵 Defeated', tone: 'bad',
      lines: [lost ? `Lost ${lost} coins in the panic.` : '', 'Your team was healed at the Pokémon Center.',
        B.kind === 'league' ? 'The League challenge has been reset.' : ''].filter(Boolean),
      buttons: [['done', 'Continue']]});
  }

  function finish({title, tone, lines, buttons}) {
    Store.save();
    Store.checkAchievements();
    const r = el('b-result');
    r.innerHTML = `<div class="result-card tone-${tone}">
        <h2>${title}</h2>${lines.filter(Boolean).map(l => `<p>${l}</p>`).join('')}
        <div class="row gap">${buttons.map(([v, label], i) => `<button class="btn ${i === 0 ? 'btn-primary' : 'btn-ghost'} grow" data-res="${v}">${label}</button>`).join('')}</div>
      </div>`;
    r.classList.add('show');
    el('b-panel').classList.add('locked');
    return new Promise(res => {
      r.onclick = async e => {
        const b = e.target.closest('[data-res]');
        if (!b) return;
        r.onclick = null;
        r.classList.remove('show');
        const choice = b.dataset.res;
        const opts = B;
        await Progress.runPendingEvolutions(G.team);
        Store.save();
        B = null;
        res();
        if (choice === 'again' && opts.again) opts.again();
        else if (choice === 'next' && opts.next) opts.next();
        else UI.go(opts.returnTo || 'explore');
      };
    });
  }

  // ── input ────────────────────────────────────────────────────────────────
  function onClick(e) {
    if (!B) return;
    if (e.target.closest('#arena') || e.target.closest('#b-text')) { if (skip) skip(); return; }
    const b = e.target.closest('[data-bact]');
    if (!b || B.busy || B.over) return;
    SFX.tap();
    const a = b.dataset.bact;
    if (a === 'move') {
      const i = +b.dataset.i;
      if (i >= 0 && B.P.mon.moves[i].pp <= 0) return;
      takeTurn({type: 'move', i});
    } else if (a === 'switch') actSwitch();
    else if (a === 'bag') actBag();
    else if (a === 'ball') actBall();
    else if (a === 'run') actRun();
    else if (a === 'forfeit') actForfeit();
  }
  function init() {
    el('battle').addEventListener('click', onClick);
    el('b-speed').addEventListener('click', e => {
      e.stopPropagation();
      const s = (Store.settings.speed % 3) + 1;
      Store.setSetting('speed', s);
      el('b-speed').textContent = '▶'.repeat(s);
    });
    el('b-speed').textContent = '▶'.repeat(Store.settings.speed || 1);
  }

  return {start, init, active: () => !!B};
})();
