'use strict';
// ── GYMS · POKÉMON LEAGUE · LEGEND ─────────────────────────────────────────

UI.Screens.gyms = {
  title: '🏟️ Gyms & League',
  tab: 'gyms',
  render() {
    const n = Store.badgeCount();
    const regions = [...new Set(GYMS.map(g => g.region))];
    const caseHtml = regions.map(r => `<div class="badge-region"><small>${r}</small><div class="badge-row">${
      GYMS.filter(g => g.region === r).map(g => `<span class="badge-slot ${G.badges.includes(g.id) ? 'earned' : ''}" title="${g.name}">${g.badge}</span>`).join('')}</div></div>`).join('');

    const gymRow = (g, i) => {
      const earned = G.badges.includes(g.id), next = !earned && n >= g.minBadges, locked = !earned && !next;
      const top = Math.max(...g.team.map(t => t[1]));
      return `<div class="gym-row ${earned ? 'earned' : next ? 'next' : 'locked'}" style="--tc:${TYPE_COLOR[g.type]}">
        <div class="gym-badge">${locked ? '🔒' : g.badge}</div>
        <div class="grow"><b>${g.name}</b><div class="muted small">${g.leader} · ${UI.typeBadge(g.type)} · ${g.team.length} Pokémon up to Lv.${top}</div></div>
        <div class="gym-btns">${next ? `<button class="btn btn-primary btn-sm" data-act="gym" data-arg="${i}">Challenge</button>`
          : earned ? `<button class="btn btn-ghost btn-sm" data-act="gym" data-arg="${i}" data-rematch="1">Rematch</button>` : ''}
        ${!locked && G.tcg?.started ? `<button class="btn btn-ghost btn-sm" data-act="gymDuel" data-arg="${i}" title="Card duel">🃏 Card duel${G.tcg.gymDuels.includes(g.id) ? ' ✓' : ''}</button>` : ''}</div>
      </div>`;
    };

    const L = G.league, leagueOpen = n >= LEAGUE.badges;
    const leagueCard = `<div class="league-card ${leagueOpen ? '' : 'locked'}">
      <div class="row between"><h3>🏆 Pokémon League</h3>${L.champion ? '<span class="tag tag-gold">Champion</span>' : ''}</div>
      <p class="muted small">${leagueOpen ? 'Beat the Elite Four and the Champion back-to-back. No Pokémon Center between battles — bring items!'
        : `Earn ${LEAGUE.badges} badges to enter.`}</p>
      <div class="league-steps">${LEAGUE.members.map((m, i) => `<div class="ls ${i < L.progress ? 'done' : i === L.progress && leagueOpen ? 'cur' : ''}">
        <span>${m.emoji}</span><small>${m.title === 'Champion' ? 'Champ' : m.name.replace('Elite ', '')}</small></div>`).join('')}</div>
      ${leagueOpen ? `<button class="btn btn-gold btn-block" data-act="league">${L.progress ? `Continue — battle ${L.progress + 1} of ${LEAGUE.members.length}` : L.champion ? 'Defend your title' : 'Enter the League'}</button>` : ''}
    </div>`;

    const legendOpen = L.champion && n >= LEGEND.badges;
    const legendCard = `<div class="league-card legend ${legendOpen ? '' : 'locked'}">
      <div class="row between"><h3>🏔️ The Legend</h3>${L.legend ? '<span class="tag tag-gold">Defeated</span>' : ''}</div>
      <p class="muted small">${legendOpen ? 'A silent trainer waits at the top of the mountain. Lv. 85–90.'
        : `Become Champion and earn ${LEGEND.badges} badges to find the Legend.`}</p>
      ${legendOpen ? '<button class="btn btn-purple btn-block" data-act="legend">Climb the mountain</button>' : ''}
    </div>`;

    const nextIdx = GYMS.findIndex(g => !G.badges.includes(g.id));
    const nextCard = nextIdx >= 0 ? `<h4 class="section" style="margin-top:4px">Next challenge</h4>${gymRow(GYMS[nextIdx], nextIdx)}` : '';
    return `${nextCard}<div class="badge-case"><div class="row between"><b>Badge case</b><span class="muted">${n}/${GYMS.length}</span></div>${caseHtml}</div>
      ${leagueCard}${legendCard}
      ${regions.map(r => `<h4 class="section">${r} Gyms</h4>` + GYMS.map((g, i) => g.region === r ? gymRow(g, i) : '').join('')).join('')}`;
  },
};

async function startBoss({kind, who, team, ivFloor, skill, reward, theme, label, next, gymId}) {
  if (!G.team.some(m => m.hp > 0)) { UI.toast('Heal your team first!', 'bad'); return; }
  try {
    const foes = await UI.busy(`${who.name} is getting ready…`, () => Factory.fixedTeam(team, ivFloor));
    Battle.start({kind, foes, skill, reward, gymId, label, next, returnTo: 'gyms',
      route: theme, theme,
      trainer: {name: who.name, title: who.title, sprite: SHOWDOWN + who.sprite + '.png', emoji: who.emoji, quote: who.quote}});
  } catch (e) { console.error(e); UI.toast('Connection problem — try again', 'bad'); }
}

Act.gym = async d => {
  const g = GYMS[+d.arg], rematch = !!d.rematch;
  if (!rematch && Store.badgeCount() < g.minBadges) return;
  const ok = await UI.confirm(`${g.leader} specializes in ${UI.typeBadge(g.type)} Pokémon.<br>${rematch ? 'Rematches pay half the prize money.' : 'Win to earn the ' + g.badge + ' badge!'}`,
    {ok: '⚔️ Battle!', title: g.name});
  if (!ok) return;
  startBoss({kind: 'gym', gymId: g.id, team: g.team, ivFloor: rematch ? 20 : 15, skill: 2,
    who: {name: g.leader, title: 'Gym Leader', sprite: g.sprite, emoji: g.badge,
      quote: rematch ? 'Back for more? This time I won’t hold back!' : `Welcome to the ${g.name}! Show me your strength!`},
    reward: {coins: rematch ? Math.round(g.coins / 2) : g.coins}, theme: battleTheme(g.type), label: `🏟️ ${g.name}`});
};

Act.league = () => {
  const i = G.league.progress, m = LEAGUE.members[i], last = i === LEAGUE.members.length - 1;
  startBoss({kind: 'league', team: m.team, ivFloor: 22, skill: 2,
    who: {...m, quote: last ? 'So you made it this far. Let me show you what a true Champion can do!' : `I am ${m.name} of the Elite Four. You won't get past me!`},
    reward: {coins: last ? LEAGUE.reward : 900 + i * 300, ...(last ? {} : {'hyper-potion': 1})},
    theme: last ? {id: 'arena', sky: ['#ffcc33', '#2a1d5e'], ground: '#3a2f6e'} : battleTheme(m.type),
    label: `🏆 League · ${i + 1}/${LEAGUE.members.length}`, next: Act.league});
};

Act.legend = () => startBoss({kind: 'legend', team: LEGEND.team, ivFloor: 31, skill: 2,
  who: {...LEGEND, quote: '…'}, reward: {coins: LEGEND.reward, 'master-ball': 1},
  theme: {id: 'arena', sky: ['#dfe9f5', '#7d8aa3'], ground: '#f2f5fb'}, label: '🏔️ Mountain Summit'});
