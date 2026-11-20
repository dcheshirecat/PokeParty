'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  STATIC GAME DATA — edit this file to tune balance, add routes, gyms, items…
// ════════════════════════════════════════════════════════════════════════════

const TYPES = ['normal','fighting','flying','poison','ground','rock','bug','ghost','steel',
  'fire','water','grass','electric','psychic','ice','dragon','dark','fairy'];
const TYPE_ID = Object.fromEntries(TYPES.map((t, i) => [t, i + 1]));

// Attack-type → defending-type multipliers (only non-1 values listed)
const EFF = {
  normal:{rock:.5,ghost:0,steel:.5},
  fire:{fire:.5,water:.5,grass:2,ice:2,rock:.5,bug:2,dragon:.5,steel:2},
  water:{fire:2,water:.5,grass:.5,ground:2,rock:2,dragon:.5},
  electric:{water:2,electric:.5,grass:.5,ground:0,flying:2,dragon:.5},
  grass:{fire:.5,water:2,grass:.5,poison:.5,ground:2,flying:.5,bug:.5,rock:2,dragon:.5,steel:.5},
  ice:{fire:.5,water:.5,grass:2,ice:.5,ground:2,flying:2,dragon:2,steel:.5},
  fighting:{normal:2,ice:2,poison:.5,flying:.5,psychic:.5,bug:.5,rock:2,ghost:0,dark:2,steel:2,fairy:.5},
  poison:{grass:2,poison:.5,ground:.5,rock:.5,ghost:.5,steel:0,fairy:2},
  ground:{fire:2,electric:2,grass:.5,poison:2,flying:0,bug:.5,rock:2,steel:2},
  flying:{electric:.5,grass:2,fighting:2,bug:2,rock:.5,steel:.5},
  psychic:{fighting:2,poison:2,psychic:.5,dark:0,steel:.5},
  bug:{fire:.5,grass:2,fighting:.5,poison:.5,flying:.5,psychic:2,ghost:.5,dark:2,steel:.5,fairy:.5},
  rock:{fire:2,ice:2,fighting:.5,ground:.5,flying:2,bug:2,steel:.5},
  ghost:{normal:0,psychic:2,ghost:2,dark:.5},
  dragon:{dragon:2,steel:.5,fairy:0},
  dark:{fighting:.5,psychic:2,ghost:2,dark:.5,fairy:.5},
  steel:{fire:.5,water:.5,electric:.5,ice:2,rock:2,steel:.5,fairy:2},
  fairy:{fire:.5,fighting:2,poison:.5,dragon:2,dark:2,steel:.5},
};

const TYPE_COLOR = {
  normal:'#A8A77A',fire:'#F57D31',water:'#6390F0',electric:'#F7CF2E',grass:'#5FBD58',ice:'#7FD6D2',
  fighting:'#D3425F',poison:'#B567CE',ground:'#DD7748',flying:'#89AAE3',psychic:'#FA7179',bug:'#A6B91A',
  rock:'#C9B787',ghost:'#735797',dragon:'#6F35FC',dark:'#5A5465',steel:'#7AA8B8',fairy:'#EC8FE6',
};

const STATUS_INFO = {
  brn:{label:'BRN',color:'#F57D31',name:'burned'},
  par:{label:'PAR',color:'#E8C81E',name:'paralyzed'},
  slp:{label:'SLP',color:'#8C8CA8',name:'asleep'},
  frz:{label:'FRZ',color:'#7FD6D2',name:'frozen'},
  psn:{label:'PSN',color:'#B567CE',name:'poisoned'},
};

const STARTERS = [1,4,7,152,155,158,252,255,258,387,390,393,495,498,501,650,653,656,722,725,728,810,813,816,906,909,912];

// ── ROUTES ─────────────────────────────────────────────────────────────────
// lv: wild level range · types: encounter pool · badges: badges needed to enter
// legendChance: chance a legendary is allowed when rolled
const ROUTES = [
  {id:'meadow',  name:'Sunny Meadow',      emoji:'🌼', badges:0,  lv:[2,6],   types:['normal','grass','bug','flying'],         sky:['#7cc6ff','#bfe6ff'], ground:'#6cbf4f'},
  {id:'forest',  name:'Whisperwood',       emoji:'🌲', badges:0,  lv:[4,9],   types:['bug','grass','poison','normal'],          sky:['#2f6b4f','#79b78a'], ground:'#3f7d3a'},
  {id:'cliffs',  name:'Pebble Pass',       emoji:'⛰️', badges:1,  lv:[8,14],  types:['rock','ground','fighting'],               sky:['#c79a6b','#f0d4a8'], ground:'#a8835a'},
  {id:'shore',   name:'Azure Shore',       emoji:'🌊', badges:2,  lv:[12,19], types:['water','flying','normal'],                sky:['#3aa0e8','#a7e0ff'], ground:'#e8d39a'},
  {id:'works',   name:'Sparkworks',        emoji:'⚡', badges:3,  lv:[17,25], types:['electric','steel','normal'],              sky:['#47506b','#9aa5c4'], ground:'#6b7385'},
  {id:'ruins',   name:'Twilight Ruins',    emoji:'🏚️', badges:4,  lv:[22,30], types:['ghost','dark','psychic','poison'],        sky:['#2b1d4a','#6e4f9c'], ground:'#4a3b5e'},
  {id:'volcano', name:'Cinder Volcano',    emoji:'🌋', badges:5,  lv:[28,37], types:['fire','rock','ground','dragon'],          sky:['#5a1f1f','#d9663a'], ground:'#5e3a2e'},
  {id:'summit',  name:'Frostpeak Summit',  emoji:'🏔️', badges:7,  lv:[35,45], types:['ice','dragon','flying','steel'],          sky:['#9fc4e8','#e8f4ff'], ground:'#f2f7ff'},
  {id:'glade',   name:'Fairy Glade',       emoji:'✨', badges:8,  lv:[42,52], types:['fairy','psychic','grass'],                sky:['#e68fd0','#ffd6f2'], ground:'#9ad48a'},
  {id:'trench',  name:'Abyssal Trench',    emoji:'🌀', badges:11, lv:[50,62], types:['water','dark','dragon'],                  sky:['#0b2346','#215b8a'], ground:'#1d3a52'},
  {id:'road',    name:"Champion's Road",   emoji:'🏆', badges:15, lv:[60,75], types:'all',                                      sky:['#3d3466','#a58fd9'], ground:'#6b5f8a'},
  {id:'rift',    name:'Mystic Rift',       emoji:'🌌', badges:20, lv:[72,90], types:['dragon','psychic','ghost','steel','fairy'],sky:['#0a0a1f','#3b2a7a'], ground:'#272047', legendChance:.04},
];

// ── TRAINER CLASSES (route trainers are generated from these) ────────────────
const SHOWDOWN = 'https://play.pokemonshowdown.com/sprites/trainers/';
const TRAINER_CLASSES = [
  {cls:'Youngster',    sprite:'youngster',    emoji:'👦', types:['normal','bug','flying']},
  {cls:'Lass',         sprite:'lass',         emoji:'👧', types:['normal','fairy','grass']},
  {cls:'Bug Catcher',  sprite:'bugcatcher',   emoji:'🧒', types:['bug']},
  {cls:'Hiker',        sprite:'hiker',        emoji:'⛰️', types:['rock','ground']},
  {cls:'Swimmer',      sprite:'swimmerf',     emoji:'🏊', types:['water']},
  {cls:'Fisherman',    sprite:'fisherman',    emoji:'🎣', types:['water']},
  {cls:'Bird Keeper',  sprite:'birdkeeper',   emoji:'🐦', types:['flying']},
  {cls:'Sailor',       sprite:'sailor',       emoji:'⚓', types:['water','fighting']},
  {cls:'Scientist',    sprite:'scientist',    emoji:'🔬', types:['electric','steel','poison']},
  {cls:'Psychic',      sprite:'psychic-f',    emoji:'🔮', types:['psychic']},
  {cls:'Black Belt',   sprite:'blackbelt',    emoji:'🥋', types:['fighting']},
  {cls:'Hex Maniac',   sprite:'hexmaniac',    emoji:'🕯️', types:['ghost','dark']},
  {cls:'Picnicker',    sprite:'picnicker',    emoji:'🧺', types:['grass','normal']},
  {cls:'Kindler',      sprite:'kindler',      emoji:'🔥', types:['fire']},
  {cls:'Skier',        sprite:'skier',        emoji:'⛷️', types:['ice']},
  {cls:'Beauty',       sprite:'beauty',       emoji:'💄', types:['fairy','normal','grass']},
  {cls:'Dragon Tamer', sprite:'dragontamer',  emoji:'🐉', types:['dragon']},
  {cls:'Ace Trainer',  sprite:'acetrainer-m', emoji:'🌟', types:null},
  {cls:'Veteran',      sprite:'veteran',      emoji:'🎖️', types:null},
];
const TRAINER_NAMES = ['Joey','Amy','Max','Bob','Lily','Mike','Nina','Jin','Rex','Kai','Mia','Theo','Ivy','Leo','Zoe','Finn','Ruby','Sam','Tess','Owen','Ada','Rio','Uma','Cole'];
const TRAINER_QUOTES = [
  "I've been waiting for a trainer like you!",'Prepare yourself!',"Let's see what you've got!",
  'My Pokémon will not lose!',"You won't get past me!",'Our eyes met — that means we battle!',
  "I trained all week for this!","Don't hold back!",
];

// ── GYMS ───────────────────────────────────────────────────────────────────
// Ordered by difficulty — each one requires the previous badge.
const gymSprite = s => SHOWDOWN + s + '.png';
const GYMS = [
  // Kanto
  {id:'boulder', badge:'🪨', region:'Kanto', city:'Pewter',     leader:'Brock',    sprite:'brock',    type:'rock',     team:[[74,10],[95,12]]},
  {id:'cascade', badge:'💧', region:'Kanto', city:'Cerulean',   leader:'Misty',    sprite:'misty',    type:'water',    team:[[120,15],[121,17]]},
  {id:'thunder', badge:'⚡', region:'Kanto', city:'Vermilion',  leader:'Lt. Surge',sprite:'lt.surge', type:'electric', team:[[100,20],[25,20],[26,22]]},
  {id:'rainbow', badge:'🌈', region:'Kanto', city:'Celadon',    leader:'Erika',    sprite:'erika',    type:'grass',    team:[[114,24],[71,25],[45,27]]},
  {id:'soul',    badge:'💗', region:'Kanto', city:'Fuchsia',    leader:'Koga',     sprite:'koga',     type:'poison',   team:[[109,30],[89,30],[110,32]]},
  {id:'marsh',   badge:'🟡', region:'Kanto', city:'Saffron',    leader:'Sabrina',  sprite:'sabrina',  type:'psychic',  team:[[64,34],[122,35],[65,37]]},
  {id:'volcano', badge:'🌋', region:'Kanto', city:'Cinnabar',   leader:'Blaine',   sprite:'blaine',   type:'fire',     team:[[78,40],[38,40],[126,41],[59,42]]},
  {id:'earth',   badge:'🌍', region:'Kanto', city:'Viridian',   leader:'Giovanni', sprite:'giovanni', type:'ground',   team:[[51,44],[31,45],[34,45],[112,47]]},
  // Johto
  {id:'zephyr',  badge:'🪶', region:'Johto', city:'Violet',     leader:'Falkner',  sprite:'falkner',  type:'flying',   team:[[164,48],[18,50],[227,51]]},
  {id:'hive',    badge:'🐝', region:'Johto', city:'Azalea',     leader:'Bugsy',    sprite:'bugsy',    type:'bug',      team:[[168,51],[123,52],[214,52],[212,54]]},
  {id:'plain',   badge:'🌸', region:'Johto', city:'Goldenrod',  leader:'Whitney',  sprite:'whitney',  type:'normal',   team:[[36,54],[203,55],[241,57]]},
  {id:'fog',     badge:'🌫️', region:'Johto', city:'Ecruteak',   leader:'Morty',    sprite:'morty',    type:'ghost',    team:[[93,56],[200,57],[354,57],[94,60]]},
  {id:'storm',   badge:'🌀', region:'Johto', city:'Cianwood',   leader:'Chuck',    sprite:'chuck',    type:'fighting', team:[[62,60],[237,60],[57,61],[68,63]]},
  {id:'glacier', badge:'❄️', region:'Johto', city:'Mahogany',   leader:'Pryce',    sprite:'pryce',    type:'ice',      team:[[87,62],[221,63],[473,66]]},
  {id:'rising',  badge:'🐲', region:'Johto', city:'Blackthorn', leader:'Clair',    sprite:'clair',    type:'dragon',   team:[[148,65],[334,65],[230,66],[149,69]]},
  // Hoenn
  {id:'stone',   badge:'💎', region:'Hoenn', city:'Rustboro',   leader:'Roxanne',  sprite:'roxanne',  type:'rock',     team:[[76,70],[476,70],[346,71],[348,72]]},
  {id:'knuckle', badge:'🥊', region:'Hoenn', city:'Dewford',    leader:'Brawly',   sprite:'brawly',   type:'fighting', team:[[297,72],[308,72],[286,73],[448,74]]},
  {id:'dynamo',  badge:'🔋', region:'Hoenn', city:'Mauville',   leader:'Wattson',  sprite:'wattson',  type:'electric', team:[[82,73],[101,73],[310,75],[462,76]]},
  {id:'heat',    badge:'🔥', region:'Hoenn', city:'Lavaridge',  leader:'Flannery', sprite:'flannery', type:'fire',     team:[[219,75],[324,75],[323,75],[257,78]]},
  {id:'balance', badge:'⚖️', region:'Hoenn', city:'Petalburg',  leader:'Norman',   sprite:'norman',   type:'normal',   team:[[327,77],[288,77],[217,78],[289,80]]},
  {id:'feather', badge:'🌬️', region:'Hoenn', city:'Fortree',    leader:'Winona',   sprite:'winona',   type:'flying',   team:[[277,79],[279,79],[227,80],[357,80],[334,82]]},
  {id:'mind',    badge:'🔮', region:'Hoenn', city:'Mossdeep',   leader:'Tate & Liza',sprite:'tate',   type:'psychic',  team:[[337,81],[338,81],[344,82],[376,84]]},
  {id:'rain',    badge:'🌧️', region:'Hoenn', city:'Sootopolis', leader:'Wallace',  sprite:'wallace',  type:'water',    team:[[321,83],[272,83],[340,83],[130,84],[350,86]]},
];
GYMS.forEach((g, i) => {
  g.minBadges = i;
  g.coins = Math.round((300 + i * 140) / 10) * 10;
  g.name = g.city + ' Gym';
});

// ── POKÉMON LEAGUE — a gauntlet: no healing between battles (items allowed) ─
const LEAGUE = {
  badges: 8,
  members: [
    {name:'Elite Frost', title:'Elite Four', sprite:'lorelei',   emoji:'🧊', type:'ice',      team:[[87,48],[91,48],[124,49],[131,51]]},
    {name:'Elite Brawn', title:'Elite Four', sprite:'bruno',     emoji:'🥋', type:'fighting', team:[[106,49],[107,49],[62,50],[68,52]]},
    {name:'Elite Shade', title:'Elite Four', sprite:'agatha',    emoji:'👻', type:'ghost',    team:[[93,50],[429,51],[94,51],[477,53]]},
    {name:'Elite Wyrm',  title:'Elite Four', sprite:'lance',     emoji:'🐉', type:'dragon',   team:[[148,52],[142,52],[130,53],[149,55]]},
    {name:'Gary',        title:'Champion',   sprite:'blue',      emoji:'👑', type:'mixed',    team:[[18,55],[65,55],[112,55],[103,56],[59,56],[9,58]]},
  ],
  reward: 5000,
};
const LEGEND = {name:'RED', title:'Legend', sprite:'red', emoji:'🏔️', badges:16,
  team:[[25,89],[103,85],[112,85],[59,85],[131,88],[143,90]], reward:8000};

// ── ITEMS ──────────────────────────────────────────────────────────────────
// kind: ball | heal | revive | cure | candy | evo · badges: shop unlock
const ITEMS = {
  'poke-ball':    {name:'Poké Ball',    emoji:'⚪', kind:'ball', ball:1,   price:200,  badges:0, desc:'A standard ball for catching Pokémon.'},
  'great-ball':   {name:'Great Ball',   emoji:'🔵', kind:'ball', ball:1.5, price:600,  badges:1, desc:'Better catch rate than a Poké Ball.'},
  'ultra-ball':   {name:'Ultra Ball',   emoji:'🟡', kind:'ball', ball:2,   price:1200, badges:3, desc:'High-performance ball.'},
  'dusk-ball':    {name:'Dusk Ball',    emoji:'🌑', kind:'ball', ball:1,   price:1000, badges:3, desc:'3× catch rate at night or in the Ruins/Rift.', dusk:3},
  'master-ball':  {name:'Master Ball',  emoji:'🟣', kind:'ball', ball:255, price:9999, badges:8, desc:'Never fails.'},
  'potion':       {name:'Potion',       emoji:'💊', kind:'heal', heal:50,  price:150,  badges:0, desc:'Restores 50 HP.'},
  'super-potion': {name:'Super Potion', emoji:'🧪', kind:'heal', heal:100, price:400,  badges:1, desc:'Restores 100 HP.'},
  'hyper-potion': {name:'Hyper Potion', emoji:'⚗️', kind:'heal', heal:220, price:900,  badges:3, desc:'Restores 220 HP.'},
  'full-restore': {name:'Full Restore', emoji:'💖', kind:'heal', heal:9999,price:2200, badges:6, desc:'Fully restores HP and cures status.', cure:true},
  'full-heal':    {name:'Full Heal',    emoji:'🩹', kind:'cure',           price:300,  badges:1, desc:'Cures any status condition.'},
  'revive':       {name:'Revive',       emoji:'💫', kind:'revive', frac:.5,price:600,  badges:2, desc:'Revives a fainted Pokémon to half HP.'},
  'max-revive':   {name:'Max Revive',   emoji:'🌟', kind:'revive', frac:1, price:2000, badges:5, desc:'Revives a fainted Pokémon to full HP.'},
  'rare-candy':   {name:'Rare Candy',   emoji:'🍬', kind:'candy',          price:1800, badges:4, desc:'Raises a Pokémon by one level.'},
  'fire-stone':   {name:'Fire Stone',   emoji:'🔥', kind:'evo', price:2500, badges:2, desc:'Evolves certain Pokémon.'},
  'water-stone':  {name:'Water Stone',  emoji:'💧', kind:'evo', price:2500, badges:2, desc:'Evolves certain Pokémon.'},
  'thunder-stone':{name:'Thunder Stone',emoji:'⚡', kind:'evo', price:2500, badges:2, desc:'Evolves certain Pokémon.'},
  'leaf-stone':   {name:'Leaf Stone',   emoji:'🍃', kind:'evo', price:2500, badges:2, desc:'Evolves certain Pokémon.'},
  'moon-stone':   {name:'Moon Stone',   emoji:'🌙', kind:'evo', price:2500, badges:2, desc:'Evolves certain Pokémon.'},
  'sun-stone':    {name:'Sun Stone',    emoji:'☀️', kind:'evo', price:2500, badges:4, desc:'Evolves certain Pokémon.'},
  'ice-stone':    {name:'Ice Stone',    emoji:'🧊', kind:'evo', price:2500, badges:4, desc:'Evolves certain Pokémon.'},
  'shiny-stone':  {name:'Shiny Stone',  emoji:'💠', kind:'evo', price:3000, badges:5, desc:'Evolves certain Pokémon.'},
  'dusk-stone':   {name:'Dusk Stone',   emoji:'🌘', kind:'evo', price:3000, badges:5, desc:'Evolves certain Pokémon.'},
  'dawn-stone':   {name:'Dawn Stone',   emoji:'🌅', kind:'evo', price:3000, badges:5, desc:'Evolves certain Pokémon.'},
  'link-cable':   {name:'Link Cable',   emoji:'🔗', kind:'evo', price:3500, badges:4, desc:'Evolves Pokémon that normally evolve by trading.'},
  'evo-gem':      {name:'Evolution Gem',emoji:'🔮', kind:'evo', price:4000, badges:6, desc:'Evolves Pokémon that need a special item.'},
};
const BALL_ORDER = ['poke-ball','great-ball','ultra-ball','dusk-ball','master-ball'];
const START_BAG = {'poke-ball':10, 'potion':5};

// ── DAILY QUESTS ───────────────────────────────────────────────────────────
const QUEST_POOL = [
  {id:'catch2',  icon:'🎣', text:'Catch 2 Pokémon',          type:'catch',    target:2, reward:{coins:300}},
  {id:'catch4',  icon:'🎣', text:'Catch 4 Pokémon',          type:'catch',    target:4, reward:{coins:500,'great-ball':2}},
  {id:'wild3',   icon:'🌿', text:'Win 3 wild battles',       type:'wildwin',  target:3, reward:{'poke-ball':4}},
  {id:'wild6',   icon:'🌿', text:'Win 6 wild battles',       type:'wildwin',  target:6, reward:{'poke-ball':5,coins:200}},
  {id:'train2',  icon:'⚔️', text:'Beat 2 trainers',           type:'trainwin', target:2, reward:{coins:400,'super-potion':2}},
  {id:'train4',  icon:'⚔️', text:'Beat 4 trainers',           type:'trainwin', target:4, reward:{coins:700,'revive':1}},
  {id:'evolve1', icon:'✨', text:'Evolve a Pokémon',          type:'evolve',   target:1, reward:{coins:500}},
  {id:'heal1',   icon:'💊', text:'Use a healing item in battle', type:'item',  target:1, reward:{coins:150,'potion':3}},
  {id:'trade1',  icon:'🔄', text:'Make a Wonder Trade',       type:'wonder',   target:1, reward:{coins:300,'great-ball':2}},
  {id:'gym1',    icon:'🏟️', text:'Win a Gym battle',          type:'gym',      target:1, reward:{coins:800,'ultra-ball':2}},
  {id:'level3',  icon:'⬆️', text:'Gain 3 levels',             type:'levelup',  target:3, reward:{'rare-candy':1}},
  {id:'super3',  icon:'💥', text:'Land 3 super-effective hits',type:'super',   target:3, reward:{coins:350}},
];

// ── MYSTERY GIFT ───────────────────────────────────────────────────────────
const GIFT_TABLE = [
  {weight:26, item:'poke-ball',  min:4, max:8},
  {weight:18, coins:true,        min:300, max:900},
  {weight:16, item:'super-potion',min:2, max:4},
  {weight:10, item:'great-ball', min:2, max:5},
  {weight:8,  item:'revive',     min:1, max:2},
  {weight:6,  item:'rare-candy', min:1, max:2},
  {weight:10, pokemon:true},
  {weight:4,  pokemon:true, shinyBoost:true},
  {weight:2,  item:'master-ball',min:1, max:1},
];

// ── ACHIEVEMENTS ───────────────────────────────────────────────────────────
const ACHIEVEMENTS = [
  {id:'first_catch', icon:'🎣', name:'First Catch',     desc:'Catch your first Pokémon',          check:g=>g.stats.catches>=1},
  {id:'caught25',    icon:'📖', name:'Collector',       desc:'Register 25 Pokémon as caught',     check:g=>caughtCount(g)>=25},
  {id:'caught100',   icon:'📚', name:'Pokémaniac',      desc:'Register 100 Pokémon as caught',    check:g=>caughtCount(g)>=100},
  {id:'caught250',   icon:'🗂️', name:'Dex Scholar',     desc:'Register 250 Pokémon as caught',    check:g=>caughtCount(g)>=250},
  {id:'first_win',   icon:'⚔️', name:'First Battle',    desc:'Beat your first trainer',           check:g=>g.stats.trainerWins>=1},
  {id:'wins25',      icon:'🏆', name:'Battle Hardened', desc:'Beat 25 trainers',                  check:g=>g.stats.trainerWins>=25},
  {id:'wins100',     icon:'👑', name:'Elite Trainer',   desc:'Beat 100 trainers',                 check:g=>g.stats.trainerWins>=100},
  {id:'rich',        icon:'💰', name:'High Roller',     desc:'Hold 10,000 coins at once',          check:g=>g.coins>=10000},
  {id:'full_team',   icon:'🎒', name:'Full Squad',      desc:'Have 6 Pokémon in your party',      check:g=>g.team.length>=6},
  {id:'shiny',       icon:'✨', name:'Shiny Hunter',    desc:'Own a shiny Pokémon',               check:g=>allMons(g).some(p=>p.shiny)},
  {id:'streak3',     icon:'🔥', name:'Dedicated',       desc:'Play 3 days in a row',              check:g=>g.streak.best>=3},
  {id:'streak7',     icon:'🌟', name:'True Trainer',    desc:'Play 7 days in a row',              check:g=>g.streak.best>=7},
  {id:'evolved',     icon:'🎊', name:'Evolution!',      desc:'Evolve a Pokémon',                  check:g=>g.stats.evolutions>=1},
  {id:'evolved10',   icon:'🦋', name:'Metamorphosis',   desc:'Evolve 10 Pokémon',                 check:g=>g.stats.evolutions>=10},
  {id:'lv50',        icon:'💪', name:'Powerhouse',      desc:'Raise a Pokémon to Lv. 50',         check:g=>allMons(g).some(p=>p.level>=50)},
  {id:'lv100',       icon:'💯', name:'Maxed Out',       desc:'Raise a Pokémon to Lv. 100',        check:g=>allMons(g).some(p=>p.level>=100)},
  {id:'nickname',    icon:'✏️', name:'Bonded',          desc:'Give a Pokémon a nickname',         check:g=>allMons(g).some(p=>p.nick)},
  {id:'wonder',      icon:'🔄', name:'Wonder Trader',   desc:'Complete a Wonder Trade',           check:g=>g.stats.trades>=1},
  {id:'egg',         icon:'🐣', name:'New Life',        desc:'Hatch a Daycare Egg',               check:g=>g.stats.eggs>=1},
  {id:'badge1',      icon:'🪨', name:'Gym Challenger',  desc:'Earn your first Gym Badge',         check:g=>g.badges.length>=1},
  {id:'badge8',      icon:'🎖️', name:'Kanto Complete',  desc:'Earn 8 Gym Badges',                 check:g=>g.badges.length>=8},
  {id:'badgeAll',    icon:'🏅', name:'Badge Master',    desc:`Earn all ${GYMS.length} Gym Badges`, check:g=>g.badges.length>=GYMS.length},
  {id:'champion',    icon:'🏆', name:'Champion!',       desc:'Conquer the Pokémon League',         check:g=>g.league.champion},
  {id:'legend',      icon:'🏔️', name:'Living Legend',   desc:'Defeat the Legend',                 check:g=>g.league.legend},
  {id:'routes',      icon:'🗺️', name:'Explorer',        desc:'Unlock every route',                check:g=>g.badges.length>=ROUTES[ROUTES.length-1].badges},
  {id:'tcg_pack',    icon:'📦', name:'Pack Rat',        desc:'Open your first booster pack',       check:g=>(g.tcg?.stats.packs||0)>=1},
  {id:'tcg_100',     icon:'🎴', name:'Card Collector',  desc:'Own 100 different cards',            check:g=>Object.keys(g.tcg?.cards||{}).length>=100},
  {id:'tcg_set',     icon:'📒', name:'Set Complete',    desc:'Complete a card set in your binder',  check:g=>!!g.tcg&&typeof Cards!=='undefined'&&Cards.SETS.some(s=>Cards.BY_SET[s.code].every(c=>g.tcg.cards[c.id]))},
  {id:'tcg_win',     icon:'🃏', name:'Duelist',         desc:'Win a card duel',                     check:g=>(g.tcg?.stats.wins||0)>=1},
  {id:'tcg_ladder',  icon:'👑', name:'Card Grandmaster',desc:'Beat every duelist on the ladder',    check:g=>(g.tcg?.ladder||[]).length>=8},
  {id:'tcg_secret',  icon:'✦',  name:'Secret Shine',    desc:'Pull a Shiny Secret rare',            check:g=>Object.keys(g.tcg?.cards||{}).some(id=>id.endsWith('S'))},
  {id:'quests',      icon:'📋', name:'Quest Master',    desc:'Finish all daily quests in one day', check:g=>g.quests.list.length>0&&g.quests.list.every(q=>q.done)},
];
function allMons(g){return g.team.concat(g.pc, g.daycare.slots.filter(Boolean));}
function caughtCount(g){return Object.values(g.dex).filter(d=>d.c).length;}

const TRAINER_AVATARS = ['🧢','👒','🎩','⛑️','👑','🎓','🧑','👦','👧','🧔','👱','🧙','🧝','🧛','🧜','🥷',
  '🐱','🐶','🐸','🦊','🐺','🦁','🐼','🐨','🦄','🐲','🌟','⚡','🔥','💧','🌿','🌙'];
const CARD_COLORS = {
  blue:'linear-gradient(135deg,#4da3ff,#6c5ce7)', gold:'linear-gradient(135deg,#ffcc33,#ff8a00)',
  green:'linear-gradient(135deg,#3ddc84,#138a4d)', red:'linear-gradient(135deg,#ff6b6b,#b3122e)',
  purple:'linear-gradient(135deg,#b388ff,#6a1b9a)', dark:'linear-gradient(135deg,#566089,#20243f)',
  pink:'linear-gradient(135deg,#ff8fc7,#c2185b)', teal:'linear-gradient(135deg,#4dd0e1,#00796b)',
};

// Moves the auto-moveset picker avoids (unsupported or self-defeating)
const MOVE_BLACKLIST = new Set(['self-destruct','explosion','memento','healing-wish','lunar-dance','final-gambit',
  'destiny-bond','perish-song','transform','mimic','metronome','mirror-move','sketch','assist','copycat',
  'sleep-talk','snore','spit-up','swallow','focus-punch','counter','mirror-coat','bide','dream-eater','fling',
  'natural-gift','last-resort','belch','endeavor','beat-up','present','magnitude','false-swipe','struggle',
  'rest','curse','role-play','skill-swap','power-split','guard-split','pain-split','trump-card','synchronoise',
  'shell-trap','steel-beam','mind-blown','misty-explosion','dragon-energy','water-spout','eruption','fake-out',
  'first-impression','snap-trap','focus-energy','teleport','splash','celebrate','hold-hands']);
const FIXED_DAMAGE = {'seismic-toss':'level','night-shade':'level','psywave':'level','dragon-rage':40,'sonic-boom':20,'super-fang':'half','nature-s-madness':'half','ruination':'half'};
const RECHARGE_MOVES = new Set(['hyper-beam','giga-impact','blast-burn','hydro-cannon','frenzy-plant','rock-wrecker','roar-of-time','prismatic-laser','eternabeam','meteor-assault']);
const SELF_KO_MOVES = new Set(['self-destruct','explosion','memento','final-gambit','misty-explosion']);
