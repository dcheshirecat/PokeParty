# Pokémon Journey

A fan-made, mobile-first Pokémon adventure that runs in any browser and builds into an Android APK.

Catch Pokémon across 12 areas, battle generated trainers, earn 23 Gym badges, take on the Elite Four and Champion back to back, and hunt shinies. It also has a Pokédex, Wonder Trade, a Daycare with eggs, daily quests, mystery gifts and achievements.

It also includes a **trading card game** (the Cards tab): collect cards from booster packs, keep a binder, build 60-card decks, and duel an AI ladder and the Gym Leaders using standard TCG rules.

## Play

Open `index.html` in a browser. There is no build step and nothing to install. Pokémon data and sprites come from [PokéAPI](https://pokeapi.co). If pokeapi.co is unreachable, the game falls back to PokéAPI's static mirror on GitHub.

Pushing to `main` runs the GitHub Action, which tests the engine and builds the APK (download it from the run's artifacts).

## Project layout

```
index.html            page shell (menu container, battle scene, tab bar)
css/style.css         all styling and animations
js/data.js            ← tune the game here: routes, gyms, league, items, quests, achievements
js/api.js             PokéAPI access with a small trimmed cache and mirror fallback
js/engine.js          pure battle rules (damage, status, stat stages, AI, catching)
js/state.js           save slots, bag, Pokédex, quests, achievements
js/ui.js              toasts, bottom sheets, dialogs, router, sound effects
js/factory.js         builds wild/trainer/gym Pokémon; EXP, level-ups, move learning, evolution
js/battle.js          battle flow and animation
js/screens/*.js       one file per screen group (home, team, shop, dex, gyms, more)
js/main.js            boot and click routing
js/tcg/data-species.js  GENERATED card source data (run tools/build_tcg_data.py)
js/tcg/cards.js       card sets, card generation, trainer cards, packs, deck builder
js/tcg/engine.js      TCG rules engine
js/tcg/ai.js          card-duel AI
js/tcg/collection.js  owned cards, packs, decks, trading, duel ladder
js/tcg/cardui.js      card rendering (full card, mini card, in-play card)
js/tcg/duel.js        duel board screen
tools/build_tcg_data.py  rebuilds js/tcg/data-species.js from PokéAPI CSV data
tests/*.test.js       engine and card-game tests
```

Scripts are plain `<script>` files loaded in order (no modules), so they work from `file://` inside the Android WebView. Buttons use `data-act="name"` attributes, which `main.js` routes to `Act.name(...)` handlers.

## Battle mechanics

- Turn order uses move priority, then Speed. Paralysis halves Speed.
- The damage formula includes STAB, type effectiveness, critical hits and a random roll, and burn halves physical damage.
- Status conditions: burn, paralysis, sleep, freeze, poison and confusion, with type immunities.
- Stat stages run from −6 to +6, plus accuracy and evasion.
- Moves can be multi-hit, draining, recoil, healing, recharge or flinch moves, and Struggle is used when PP runs out.
- Trainer AI scores every move. Gym Leaders and the League pick strong moves almost every turn and send out good type matchups.
- Catch chance uses each species' real catch rate, current HP, status and ball type.
- Pokémon learn moves on level-up (with a prompt to forget one when they already know four). They evolve by level, by stones or other items, or with a Link Cable for trade evolutions.

## Card game

**Rules.** Decks are 60 cards with at most 4 copies of any card (basic Energy is unlimited) and at least one Basic Pokémon. Each player has 6 Prize cards, an Active Pokémon and up to 5 on the Bench. On your turn you may attach one Energy, play any number of Items and one Supporter, and retreat once. Evolution follows Basic → Stage 1 → Stage 2, and Rare Candy skips Stage 1. Weakness doubles damage and Resistance reduces it by 30. The special conditions are Asleep, Paralyzed, Confused, Poisoned and Burned, resolved during Pokémon Checkup between turns. The player going first can't attack or play a Supporter on their first turn. You win by taking all your Prize cards, leaving the opponent with no Pokémon in play, or when they can't draw.

**Cards.** There are three sets: Kanto Classics, Johto Journey and Hoenn Horizons (Pokémon #1–386 plus Trainer cards). Each Pokémon's HP, energy type, weakness, resistance, retreat cost and two attacks are derived from its real stats and level-up moves, so cards differ by species. Rarities are Common, Uncommon, Rare, Holo Rare, Shiny Secret, and Gym Leader promos.

**Collecting.** Packs cost 600 coins and contain 5 commons, 3 uncommons, a bonus card and a guaranteed rare. You can sell copies beyond 4, or trade 5 duplicates up to the next rarity.

To change how cards are generated (HP, damage, rarity), edit `js/tcg/cards.js`. To change which species and moves exist, edit `tools/build_tcg_data.py` and run it.

## Tests

```
node --test tests/*.test.js
```

## Signing the APK

By default, each CI build signs the APK with a newly generated key. Android then refuses to install the new build over the old one, so you have to uninstall first. To keep one key across builds, create a keystore once:

```
keytool -genkeypair -alias pokemon-key -keyalg RSA -keysize 2048 -validity 10000 -keystore release.keystore
base64 -w0 release.keystore      # on macOS: base64 -i release.keystore
```

Then add these repository secrets (Settings → Secrets and variables → Actions):

- `KEYSTORE_BASE64` — the base64 output
- `KEYSTORE_PASS`, `KEY_PASS` — the passwords you chose
- `KEY_ALIAS` — `pokemon-key`, unless you used a different alias

Keep `release.keystore` somewhere safe and never commit it.
