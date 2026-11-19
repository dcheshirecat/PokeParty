# Pokémon Journey

A fan-made, mobile-first Pokémon adventure that runs in any browser and builds into an Android APK.

Catch Pokémon across 12 areas, battle generated trainers, earn 23 Gym badges, take on the Elite Four and Champion back to back, and hunt shinies. It also has a Pokédex, Wonder Trade, a Daycare with eggs, daily quests, mystery gifts and achievements.

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
tests/engine.test.js  engine unit tests
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

## Tests

```
node --test tests/*.test.js
```
