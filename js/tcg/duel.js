'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  CARD DUEL SCREEN — board UI for the TCG engine. Player is always index 0.
// ════════════════════════════════════════════════════════════════════════════
const Duel = (() => {
  let D = null; // {s, opp, io, busy, onEnd}
  const el = id => document.getElementById(id);
  const ME = 0, OPP = 1;

  // ── rendering ────────────────────────────────────────────────────────────
  function render() {
    if (!D) return;
    const s = D.s, me = s.players[ME], op = s.players[OPP];
    const prizes = n => Array.from({length: TCG.PRIZES}, (_, k) => `<i class="prize ${k < n ? '' : 'taken'}"></i>`).join('');
    const myTurn = s.cur === ME && s.phase === 'play' && !D.busy;
    el('d-opp-info').innerHTML = `<span class="d-who">${D.opp.emoji} <b>${esc(op.name)}</b></span>
      <span class="d-stat">🂠 ${op.deck.length}</span><span class="d-stat">✋ ${op.hand.length}</span>
      <button class="d-stat" data-d="discard" data-side="1">🗑 ${op.discard.length}</button><span class="prizes">${prizes(op.prizes.length)}</span>`;
    el('d-opp-bench').innerHTML = Array.from({length: TCG.BENCH}, (_, k) => CardUI.inPlay(op.bench[k], {attrs: `data-d="bench" data-side="1" data-i="${k}"`})).join('');
    el('d-opp-active').innerHTML = CardUI.inPlay(op.active, {big: true, attrs: 'data-d="active" data-side="1"'});
    el('d-my-active').innerHTML = CardUI.inPlay(me.active, {big: true, attrs: 'data-d="active" data-side="0"'});
    el('d-my-bench').innerHTML = Array.from({length: TCG.BENCH}, (_, k) => CardUI.inPlay(me.bench[k], {attrs: `data-d="bench" data-side="0" data-i="${k}"`})).join('');
    const flags = [`${me.energyDone ? '✅' : '⬜'} Energy`, `${me.supporterDone ? '✅' : '⬜'} Supporter`];
    el('d-my-info').innerHTML = `<span class="prizes">${prizes(me.prizes.length)}</span>
      <span class="d-stat">🂠 ${me.deck.length}</span><button class="d-stat" data-d="discard" data-side="0">🗑 ${me.discard.length}</button>
      <span class="d-flags">${myTurn ? flags.join(' · ') : s.cur === OPP ? 'Opponent’s turn…' : ''}</span>
      <button class="btn btn-primary btn-sm" data-d="end" ${myTurn ? '' : 'disabled'}>End turn</button>`;
    el('d-hand').innerHTML = me.hand.map((c, k) => CardUI.mini(c, {cls: playable(c) && myTurn ? 'can' : '', attrs: `data-d="hand" data-i="${k}"`})).join('')
      || '<span class="muted small">No cards in hand</span>';
    el('d-turn').textContent = s.phase === 'play' ? `Turn ${s.turn} · ${s.cur === ME ? 'Your turn' : esc(op.name) + '’s turn'}` : '';
    el('d-log').textContent = s.log.slice(-2).join('  ·  ');
  }
  function playable(c) {
    const s = D.s, P = s.players[ME];
    if (c.kind === 'energy') return !P.energyDone;
    if (c.kind === 'trainer') return TCG.canPlayTrainer(s, ME, c);
    if (TCG.isBasic(c)) return P.bench.length < TCG.BENCH;
    return TCG.evoTargets(s, ME, c).length > 0;
  }
  const flash = (sel, cls, ms = 450) => { const n = $(sel); if (!n) return; n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); setTimeout(() => n.classList.remove(cls), ms); };

  // ── io for human choices ─────────────────────────────────────────────────
  const instOpt = (x, k) => ({value: k, html: `${CardUI.inPlay(x)}<span class="choice-main"><span class="choice-label">${esc(x.card.name)}</span>
    <span class="choice-sub">${x.card.hp - x.dmg}/${x.card.hp} HP · ${x.energy.length} energy</span></span>`});
  const humanIO = {
    promote: async who => UI.choose({title: 'Choose your new Active Pokémon', options: D.s.players[who].bench.map(instOpt), cancel: null, dismissable: false}),
    pickCard: async (who, title, cards, optional) => {
      const v = await UI.choose({title, options: cards.map((c, k) => ({value: k, html: `${CardUI.mini(c)}<span class="choice-main"><span class="choice-label">${esc(c.name)}</span>
        <span class="choice-sub">${c.kind === 'pokemon' ? `${c.stage ? 'Stage ' + c.stage : 'Basic'} · ${c.hp} HP` : c.kind}</span></span>`})),
        cancel: optional ? 'Take nothing' : null, dismissable: optional});
      return v;
    },
    pickInst: async (who, title, insts, optional) => UI.choose({title, options: insts.map(instOpt), cancel: optional ? 'Cancel' : null, dismissable: optional}),
  };
  const baseIO = {
    log: () => render(),
    coin: async heads => {
      const c = el('d-coin');
      c.className = 'coin show ' + (heads ? 'heads' : 'tails');
      c.textContent = heads ? 'HEADS' : 'TAILS';
      SFX.shake();
      await sleep(850);
      c.className = 'coin';
    },
    attackFx: async pi => { SFX.hit(); flash(`#${pi === ME ? 'd-my-active' : 'd-opp-active'} .ip`, 'lunge-up', 380); await sleep(350); },
    damageFx: async (pi, dmg) => { render(); flash(`#${pi === ME ? 'd-my-active' : 'd-opp-active'} .ip`, 'hit', 420); await sleep(450); },
  };

  // ── flow ─────────────────────────────────────────────────────────────────
  // opts: {opp:{name,emoji,deck}, deck, onEnd(win) → [lines]}
  async function start(opts) {
    const s = TCG.create([opts.deck, opts.opp.deck], [G.name, opts.opp.name], Math.random, [false, true]);
    D = {s, opp: opts.opp, onEnd: opts.onEnd, busy: true};
    D.io = TCGAI.dispatch(s, humanIO, baseIO);
    UI.go('duel');
    el('d-result').classList.remove('show');
    TCG.openingHands(s);
    TCGAI.setup(s, OPP);
    render();
    const mull = s.players.map(p => p.mulligans);
    if (mull[0]) UI.toast(`You had no Basic Pokémon — mulligan ×${mull[0]}`, 'info');
    if (mull[1]) UI.toast(`${opts.opp.name} mulliganed ×${mull[1]} — you drew ${mull[1]} extra`, 'info');

    // choose Active, then Bench
    const P = s.players[ME];
    const basics = () => P.hand.map((c, k) => ({c, k})).filter(x => TCG.isBasic(x.c));
    const a = await UI.choose({title: 'Setup: choose your Active Pokémon', text: 'Your opponent is setting up too. Cards are face-down until both players are ready.',
      options: basics().map(x => ({value: x.k, html: `${CardUI.mini(x.c)}<span class="choice-main"><span class="choice-label">${esc(x.c.name)}</span><span class="choice-sub">${x.c.hp} HP</span></span>`})),
      cancel: null, dismissable: false});
    TCG.setActive(s, ME, a);
    render();
    while (basics().length && P.bench.length < TCG.BENCH) {
      const b = await UI.choose({title: 'Setup: add Basic Pokémon to your Bench?', options: [
        ...basics().map(x => ({value: x.k, html: `${CardUI.mini(x.c)}<span class="choice-main"><span class="choice-label">${esc(x.c.name)}</span><span class="choice-sub">${x.c.hp} HP</span></span>`})),
        {value: -1, label: 'Done — start the duel', tone: 'muted'}], cancel: null, dismissable: false});
      if (b < 0) break;
      TCG.benchBasic(s, ME, b);
      render();
    }
    const heads = Math.random() < .5;
    await baseIO.coin(heads);
    UI.toast(heads ? 'Heads — you go first!' : `Tails — ${opts.opp.name} goes first.`, 'info');
    await TCG.begin(s, D.io, heads ? ME : OPP);
    D.busy = false;
    render();
    await afterAction();
  }

  async function afterAction() {
    if (!D) return;
    render();
    if (D.s.winner !== null) return finish();
    if (D.s.cur === OPP) {
      D.busy = true; render();
      await sleep(600);
      await TCGAI.takeTurn(D.s, OPP, D.io, async () => { render(); await sleep(650 / (Store.settings.speed || 1)); });
      D.busy = false;
      render();
      if (D.s.winner !== null) return finish();
      if (!$('#toasts .toast:not(.out)')) UI.toast('Your turn!', 'info');
    }
  }

  async function finish() {
    const s = D.s, win = s.winner === ME;
    win ? SFX.win() : SFX.lose();
    const t = Collection.T();
    win ? t.stats.wins++ : t.stats.losses++;
    const lines = (D.onEnd && D.onEnd(win)) || [];
    Store.save(); Store.checkAchievements();
    const r = el('d-result');
    r.innerHTML = `<div class="result-card tone-${win ? 'good' : 'bad'}"><h2>${win ? '🏆 You win!' : '😵 You lost'}</h2>
      <p>${esc(/has no|conceded/.test(s.reason) ? s.reason.replace('wins — ', '') : s.players[s.winner].name + ' ' + s.reason)}.</p>${lines.map(l => `<p>${l}</p>`).join('')}
      <div class="row gap"><button class="btn btn-primary grow" data-d="leave">Back to Cards</button></div></div>`;
    r.classList.add('show');
  }

  // ── input ────────────────────────────────────────────────────────────────
  async function onClick(e) {
    if (!D) return;
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const a = b.dataset.d, s = D.s, P = s.players[ME];
    if (a === 'leave') { D = null; UI.go('cards'); return; }
    if (a === 'menu') {
      const v = await UI.choose({title: 'Duel menu', options: [{value: 'log', icon: '📜', label: 'Battle log'},
        {value: 'rules', icon: '📘', label: 'How to play'}, {value: 'concede', icon: '🏳️', label: 'Concede', tone: ''}]});
      if (v === 'log') UI.sheet({title: '📜 Log', html: `<div class="d-loglist">${s.log.map(l => `<p>${esc(l)}</p>`).join('')}</div>`});
      if (v === 'rules') showRules();
      if (v === 'concede' && await UI.confirm('Concede this duel? It counts as a loss.', {ok: 'Concede', danger: true})) {
        s.winner = OPP; s.reason = 'wins — you conceded'; s.phase = 'over'; finish();
      }
      return;
    }
    if (a === 'discard') {
      const pl = s.players[+b.dataset.side];
      UI.sheet({title: `🗑 ${esc(pl.name)}’s discard pile (${pl.discard.length})`, html: `<div class="mini-grid">${pl.discard.map(c => CardUI.mini(c)).join('') || '<p class="muted">Empty</p>'}</div>`});
      return;
    }
    const side = +b.dataset.side;
    const myTurn = s.cur === ME && s.phase === 'play' && !D.busy;
    if (a === 'end') {
      if (!myTurn) return;
      const canAtk = P.active && P.active.card.attacks.some((_, k) => TCG.canAttack(s, ME, k));
      if (canAtk && !await UI.confirm('You can still attack this turn. End your turn anyway?', {ok: 'End turn'})) return;
      D.busy = true;
      await TCG.endTurn(s, D.io);
      D.busy = false;
      return afterAction();
    }
    if (a === 'hand') return handCard(+b.dataset.i, myTurn);
    if (a === 'active' || a === 'bench') {
      const pl = s.players[side], x = a === 'active' ? pl.active : pl.bench[+b.dataset.i];
      if (!x) return;
      return inspect(x, side === ME && a === 'active' && myTurn, side);
    }
  }

  function instInfo(x) {
    return `<div class="inst-info"><span>Damage: <b>${x.dmg}</b></span><span>Energy: ${x.energy.map(e => CardUI.eIcon(e.type, 'sm')).join('') || '—'}</span>
      ${x.stack.length ? `<span>Evolved from ${x.stack.map(c => esc(c.name)).join(' → ')}</span>` : ''}</div>`;
  }

  async function inspect(x, canAct, side) {
    const s = D.s;
    let html = `<div class="card-zoom">${CardUI.full(x.card, {w: 230})}</div>${instInfo(x)}`;
    if (canAct) {
      const block = TCG.attackBlock(s, ME, x);
      html += `<div class="choice-list">${x.card.attacks.map((atk, k) => {
        const ok = TCG.canAttack(s, ME, k);
        return `<button class="choice" data-atk="${k}" ${ok ? '' : 'disabled'}><span class="choice-main"><span class="choice-label">⚔️ ${esc(atk.name)} ${atk.dmg ? '· ' + atk.dmg : ''}</span>
          <span class="choice-sub">${ok ? 'Attack (ends your turn)' : block || 'Not enough Energy attached'}</span></span></button>`;
      }).join('')}
      <button class="choice" data-retreat ${TCG.canRetreat(s, ME) ? '' : 'disabled'}><span class="choice-main"><span class="choice-label">↩️ Retreat</span>
        <span class="choice-sub">${TCG.canRetreat(s, ME) ? `Discard ${x.card.retreat} Energy to switch` : s.players[ME].retreatDone ? 'Already retreated this turn' : 'Can’t retreat now'}</span></span></button></div>`;
    }
    const sh = UI.sheet({title: side === OPP ? 'Opponent’s Pokémon' : 'Your Pokémon', html, cls: 'tall'});
    if (!canAct) return;
    sh.body.addEventListener('click', async e => {
      const atk = e.target.closest('[data-atk]'), ret = e.target.closest('[data-retreat]');
      if (atk && !atk.disabled) {
        sh.close(); D.busy = true; render();
        await TCG.attack(s, ME, +atk.dataset.atk, D.io);
        D.busy = false;
        afterAction();
      } else if (ret && !ret.disabled) {
        sh.close();
        const k = await UI.choose({title: 'Switch in which Pokémon?', options: s.players[ME].bench.map(instOpt)});
        if (k === null) return;
        TCG.retreat(s, ME, k, D.io); afterAction();
      }
    });
  }

  async function handCard(k, myTurn) {
    const s = D.s, P = s.players[ME], c = P.hand[k];
    if (!c) return;
    const acts = [];
    if (myTurn) {
      if (c.kind === 'energy') {
        TCG.inPlay(P).forEach(x => acts.push({label: `Attach to ${esc(x.card.name)}${x === P.active ? ' (Active)' : ''}`, disabled: P.energyDone,
          sub: P.energyDone ? 'You already attached Energy this turn' : `${x.energy.length} Energy attached`, run: () => TCG.attach(s, ME, k, x, D.io)}));
      } else if (c.kind === 'trainer') {
        const ok = TCG.canPlayTrainer(s, ME, c);
        acts.push({label: `Play ${esc(c.name)}`, disabled: !ok, sub: ok ? c.sub === 'supporter' ? 'Supporter (1 per turn)' : 'Item'
          : c.sub === 'supporter' && P.supporterDone ? 'Already played a Supporter this turn' : c.sub === 'supporter' && s.turn === 1 ? 'Can’t play a Supporter on the first turn' : 'No valid effect right now',
          run: () => TCG.playTrainer(s, ME, k, D.io)});
      } else if (TCG.isBasic(c)) {
        acts.push({label: 'Put onto your Bench', disabled: P.bench.length >= TCG.BENCH, sub: P.bench.length >= TCG.BENCH ? 'Bench is full' : `${P.bench.length}/${TCG.BENCH} on Bench`,
          run: () => TCG.playBasic(s, ME, k, D.io)});
      } else {
        const ts = TCG.evoTargets(s, ME, c);
        ts.forEach(x => acts.push({label: `Evolve ${esc(x.card.name)}${x === P.active ? ' (Active)' : ''}`, run: () => { TCG.evolve(s, ME, k, x, D.io); SFX.evolve(); }}));
        if (!ts.length) acts.push({label: 'Can’t evolve yet', disabled: true, sub: s.turn <= 2 ? 'No evolving on your first turn'
          : `Needs ${esc(c.from)} in play since last turn` + (c.stage === 2 ? ' (or use Rare Candy)' : '')});
      }
    }
    const sh = UI.sheet({title: 'Card', cls: 'tall', html: `<div class="card-zoom">${CardUI.full(c, {w: 240})}</div>
      <div class="choice-list">${acts.map((x, i) => `<button class="choice" data-act-i="${i}" ${x.disabled ? 'disabled' : ''}>
        <span class="choice-main"><span class="choice-label">${x.label}</span>${x.sub ? `<span class="choice-sub">${x.sub}</span>` : ''}</span></button>`).join('')}</div>`});
    sh.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-act-i]');
      if (!b || b.disabled) return;
      sh.close();
      D.busy = true;
      await acts[+b.dataset.actI].run();
      D.busy = false;
      SFX.tap();
      afterAction();
    });
  }

  function showRules() {
    UI.sheet({title: '📘 How to play', cls: 'tall', html: `<div class="rules">
      <p><b>Goal:</b> take all 6 of your Prize cards (one for each Pokémon you Knock Out), or leave your opponent with no Pokémon in play, or make them unable to draw.</p>
      <p><b>Each turn:</b> draw a card, then do any of these in any order:</p>
      <ul><li>Put Basic Pokémon onto your Bench (up to 5).</li><li>Evolve Pokémon (not on your first turn, nor one that came into play this turn).</li>
      <li>Attach <b>one</b> Energy card from your hand.</li><li>Play any number of Items and <b>one</b> Supporter.</li>
      <li>Retreat your Active Pokémon once by discarding Energy equal to its retreat cost.</li></ul>
      <p>Then <b>attack</b> to end your turn. The player who goes first can’t attack or play a Supporter on their first turn.</p>
      <p><b>Weakness</b> doubles damage; <b>Resistance</b> reduces it by 30.</p>
      <p><b>Special Conditions:</b> Asleep (flip each turn to wake), Paralyzed (can’t attack or retreat for a turn), Confused (flip to attack — tails hurts itself for 30),
      Poisoned (10 damage between turns), Burned (20 damage between turns, flip to recover). Retreating or evolving cures them.</p>
      <p><b>Tap</b> any card to see it in full. Tap your Active Pokémon to attack or retreat.</p></div>`});
  }

  function init() { el('duel').addEventListener('click', onClick); }
  // Test hook: let the AI play the human's turn (used by automated tests)
  async function autoTurn() {
    if (!D || D.s.cur !== ME || D.busy || D.s.winner !== null) return;
    D.busy = true;
    await TCGAI.takeTurn(D.s, ME, D.io);
    D.busy = false;
    await afterAction();
  }

  return {start, init, showRules, autoTurn, active: () => !!D, state: () => D && D.s};
})();
