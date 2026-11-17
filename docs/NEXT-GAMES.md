# Next Games: design notes

Two games still to build for Glyph Arcade. Both use the shared glyph engine (`engine/`) and follow the same layout, checks and quality bar as Delve, Inkfire, Wordfall and Burrow.

| Game | Inspired by | One line |
|---|---|---|
| **Joyride** | Top-down open-world crime games (GTA 1/2 era) | Steal cars, take jobs from payphones and shake off the police in a living town drawn in letters. |
| **Bannerfall** | MOBA lane battlers | One hero, three lanes, waves of minions, towers to topple and a rival banner to burn, all in a 15-minute single-player match. |

Both are original games. Do not use real game, studio, city, car brand or character names anywhere in the code, UI or art.

---

## Shared rules for every arcade game

These come from how the existing games are built. Break them only with a good reason.

### Files

```
games/<id>/
  src/rules.js     pure rules, no DOM: newGame, step, save, restore, score, objective
  src/scene.js     <Name>View: the scene shader, sprite frames and palette
  src/app.js       window.<id>: input, sound, particles, HUD, menus, saves
  src/shell.html   page markup and CSS, with the build markers
  test/bot.cjs     a bot that plays a whole run through plain inputs
  test/rules.test.cjs
```

- `rules.js` exposes one global (`window.Joyride`, `window.Bannerfall`) using `(typeof window !== 'undefined' ? window : globalThis)`, so Node tests load it through `vm`.
- The rules run on a fixed 1/60 s step: `step(state, input)` returns an array of events (`{ type: 'crash', ... }`) and the app turns those into sound, particles and toasts. All randomness comes from a seeded generator kept in the state.
- `shell.html` must contain `<!--__LICENSE__-->`, `<!--__META__-->` and `<script>/*__CODE__*/</script>`, and keep the strict Content-Security-Policy (no network, no images, no external fonts). Include the global `[hidden]{display:none!important}` rule.
- Register the game in `tools/build.cjs` (`GAMES`), the `test` script in `package.json`, `tests/browser-smoke.cjs`, `tools/layout-check.cjs`, `tools/capture-previews.cjs`, `README.md` (row and controls table) and `CHANGELOG.md` (`[Unreleased]`).

### Engine limits

- The font has 69 glyphs: space, digits, **uppercase letters only** and the symbols `. , : ; ' \` - = + * # % @ & $ / \ | _ ~ " ! ? < > [ ] ( ) { } ^`. Any lowercase letter in shader art or sprite frames draws as a blank cell. DOM text (HUD, menus) may use lowercase.
- Each screen cell is 8×12 CSS pixels (7×10 on narrow screens). A square world tile is 3×2 cells, as in Burrow.
- Sprites are ASCII frames with a matching colour row per text row (see `FRAMES` and `PALETTE` in `games/burrow/src/scene.js`). The first sprite in the list draws on top.
- Pass `ink: false` for flat top-down scenes. Silhouette ink outlines suit the first-person games.
- Use `GlyphPad` for gamepads and `GlyphQuality` for automatic quality drops.

### Quality bar (the user's own rule)

> Before you publish anything, make sure the game is actually good.

A game is ready only when all of these hold:

1. `npm test`, `npm run build` and `npm run test:browser` all pass.
2. A plain-input bot finishes a full run on at least 3 of 4 seeds, and the reported times fall inside the target length.
3. Someone has actually played it in a browser for at least 10 minutes: the first 60 seconds explain themselves, controls feel responsive, and nothing is confusing, unfair or dull for long.
4. It holds about 60 fps on a normal laptop GPU, and the layout check passes at 360×640, 844×390 and 1280×720.
5. Touch controls work on a phone-sized screen, and a gamepad works if one is plugged in.
6. Nothing is pushed, merged or published without the owner's go-ahead.

---

## Joyride: open-world driving town

### Pitch

A small seeded city seen from above, about 160×160 tiles: four districts, traffic with real lanes and lights, people on the pavements, and a police force that remembers what you did. You arrive with nothing. Three contacts phone in jobs from payphones, and every finished job opens the next. The final job is an armoured-van heist across town with five stars of heat on your tail.

Target: 25–40 minutes to finish the story. Side activities keep the town worth playing after that.

### Core loop

Walk or drive to a ringing payphone (`$`), take a job, do it, get paid, and avoid or shake off the police. Spend the money on repairs, resprays and better cars kept in your garage.

### Town

- Seeded street grid with irregular blocks. Main avenues have two lanes each way, side streets one. Intersections have traffic lights.
- Districts with their own colours and building letters:
  - **Docks**: containers, cranes and water.
  - **Old Town**: tight streets and brick.
  - **Heights**: wide roads, parks and a long bridge.
  - **The Strip**: neon at night and dense traffic.
- Buildings are solid. Parks, pavements and plazas can be driven on but slow you down. Water drowns cars, and on foot you swim slowly.
- Day and night cycle with headlights and lit windows at night. Optional light rain lowers grip.

### Player and cars

- **On foot:** walk, sprint (Shift) and enter the nearest car (E). Taking an occupied car pulls the driver out and is a crime.
- **Car feel matters most:**
  - Throttle, brake and reverse, with steering that weakens at speed.
  - Grip and slide, and a handbrake (Space) that kicks the tail out for drifts.
  - Speed and impact scale crash damage.
- **Car types:**

  | Car | Character |
  |---|---|
  | Compact | Nimble and fragile |
  | Sedan | Average |
  | Van | Slow and tough |
  | Sports | Fast with light grip |
  | Taxi | Starts taxi fares |
  | Police cruiser | Fast; stealing one adds heat |
  | Armoured van | Finale only |

- **Damage:** 100 HP per car. Smoke shows below 40 and fire below 15, then the car explodes after a few seconds. Explosions hurt anything nearby.
- **Health and fail states:**
  - On foot you have 100 HP.
  - Wasted (killed): respawn at the hospital, minus 10% of your cash.
  - Busted (caught on foot or boxed in while stopped): respawn at the police station, minus 10% of your cash and your current car.
  - Neither ends the run.

### Heat (wanted level, 0 to 5 stars)

| Crime | Heat |
|---|---|
| Taking an occupied car in view of police or people | +1 |
| Hitting a pedestrian, ramming police, or stealing a cruiser | +1 |
| Some jobs | Set heat directly |

| Stars | Police response |
|---|---|
| 1 | One cruiser follows. |
| 2–3 | Cruisers try to ram and box you in. |
| 4 | Roadblocks at intersections ahead of you. |
| 5 | Spike strips and heavy vans. |

To cool off, break line of sight and stay outside the search circle shown on the minimap. Stars drop one at a time after a few seconds unseen. A **respray shop** clears all heat for $500 but only works when no cruiser can see you.

### Jobs (12 plus the finale)

Three contacts, four jobs each, unlocked in order. Every job type should feel different:

| Type | What you do |
|---|---|
| **Delivery** | Bring a specific car to a drop point with at least X% health. |
| **Checkpoint run** | Hit a chain of markers before the timer runs out. |
| **Getaway** | Pick up a crew at a site, which sets 3 stars, then lose the heat and drop them off. |
| **Tail** | Follow a target car without getting too close or losing it. |
| **Wreck** | Destroy N marked rival cars. |
| **Pickup rush** | Collect parcels spread across a district within a time limit. |

**Finale:** steal the armoured van, which starts 5 stars, then reach the docks freighter. Win screen with time, cash, deaths, busts and a score.

### Side activities

- Taxi fares, paid by speed and kept tips.
- 10 hidden packages (`?`).
- 5 stunt ramps with a payout.
- A garage that stores up to 3 cars.

### Traffic and people

- Traffic drives a lane graph, stops at red lights, brakes behind other cars, honks when blocked, and swerves or panics near crashes.
- Pedestrians walk the pavements, wait at crossings, and scatter from fast cars and explosions.
- Cars and people spawn only off-screen and despawn far away. Cap each group (for example 40 cars and 50 people) to keep the step cheap.

### Presentation

- Top-down camera that leads ahead of a fast car and zooms out slightly at speed by using smaller cells.
- Cars are small ASCII frames in 8 headings, roughly 3×3 or 5×2 cells. Example north-facing car: `[=]`, `|#|`, `[=]`.
- Road markings use `-`, `=`, `|` and `:`. Pavements are `.`, grass `"` and water `~`. Roofs use dense letters such as `#`, `%` and `@`, tinted by district.
- Tyre marks fade over time. Sparks, smoke and fire are particles.
- Police lights flash red and blue on cruisers and tint the screen edge slightly at high heat.
- HUD:
  - cash
  - heat stars
  - car health bar
  - current job line, which always names the next step
  - minimap with markers and the police search circle
  - speedometer
- Sound is synthesised in WebAudio:
  - engine pitch follows speed
  - tyre squeal
  - crash noise
  - siren
  - payphone ring
  - short success stings

### Controls

| Input | Action |
|---|---|
| W/S or ↑/↓ | Throttle and brake/reverse; walk on foot |
| A/D or ←/→ | Steer |
| Space | Handbrake |
| E / Enter | Enter or leave a car, answer a payphone |
| Shift | Sprint on foot |
| H | Horn |
| M | Full map |
| P / Esc | Pause |
| Touch | Left stick to steer, right buttons for gas, brake, handbrake and enter |
| Gamepad | Left stick steers, RT/LT gas and brake, A handbrake, Y enter, Start pause |

### Tone and limits

Cars are the only weapons: no guns and no gore. People fall over and get up again, or run away. Keep the jobs cheeky rather than grim.

### Rules API (suggested)

`WIDTH, HEIGHT, STEP, CARS, JOBS, DIFFICULTIES, newGame(seed, difficulty), step(state, input), tileAt, roadAt, objective(state), score(state), save, restore`.

Input: `{ up, down, left, right, handbrake, enter, sprint, horn }`.

### Tests to write

- A seeded town is fully connected by road, and every job's start and end points can be reached.
- Cars accelerate, turn and slide as expected, crashes cause damage, and a destroyed car explodes and leaves a wreck.
- Traffic stops at red lights and never drives through buildings.
- Heat rises from crimes, police chase, and heat cools when unseen. A respray clears heat only when no cruiser can see you.
- Getting busted or wasted costs 10% cash and respawns correctly.
- Each job type can be finished and failed.
- Save and restore round-trip, and the restored state stays deterministic.
- A plain-input bot drives the road graph and finishes the story on at least 3 of 4 seeds within 45 simulated minutes.

---

## Bannerfall: single-player lane battler

### Pitch

A compact battle map with three lanes (top, mid and bottom), jungle between them, and a base at each corner. You and two AI allies fight three AI rivals.

- **Minions:** waves march down each lane every 30 seconds.
- **Defences:** each lane has two towers per side, and each base has a **Banner** behind its last towers.
- **Win:** burn the enemy Banner.
- **Lose:** your own Banner burns.

Target match length: 12–18 minutes.

### Heroes (pick one; the AI picks the others)

| Hero | Role | Basic attack | Q | W | E | R (level 6) |
|---|---|---|---|---|---|---|
| **Warden** | Tank | Melee | Shield bash (stun) | Taunt shout | Charge | Unbreakable wall line |
| **Ranger** | Ranged damage | Long-range arrows | Piercing shot | Trap | Roll | Arrow rain area |
| **Ember** | Mage | Medium range | Fireball | Slow field | Blink | Meteor after a delay |
| **Shade** | Assassin | Melee | Dash strike | Smoke (invisible for a short time) | Poison blade | Execute on low-HP targets |

- Levels run 1 to 10 from XP. Each level raises stats and lets you rank up an ability.
- Gold comes mostly from last hits, plus tower and hero kills.
- Recall (B) takes 4 seconds to return to base. The base shop sells about 10 items across damage, health, speed, cooldown and lifesteal, plus a potion.

### Map and objectives

- **Towers:** they shoot the nearest minion, but switch to an enemy hero who attacks an allied hero in range. Outer towers fall first. Base towers guard the Banner.
- **Jungle:** neutral camps between lanes give gold and XP and respawn after 60 seconds.
- **Colossus:** a neutral boss in the river. After 8 minutes it gives the killing team a push buff, and its minions grow stronger for 90 seconds.
- **Fog of war:** you see only what allies, towers and minions see.

### AI

- Allies and rivals use the same brain:
  - farm the lane and last-hit
  - back off when low or when the enemy outnumbers them
  - recall to buy items
  - group up later in the match
  - take towers and the Colossus
  - use abilities on good targets
- Difficulty sets reaction time, aim error and how well the AI farms.
- Allies call out simple pings, such as "Help mid" and "Colossus up", in the event log.

### Presentation

- Top-down tiles at 3×2 cells. Each side has its own lane colour, with river `~`, jungle trees `%` and `&`, and stone tower bases.
- Minions are single symbols in team colours: `>` and `<` for melee, `*` for ranged. Never use lowercase letters, which draw blank.
- Heroes are 3×3 frames with a letter emblem, such as `W`, `R`, `E` and `S`.
- Small health bars above units are drawn with `-`, `=` and `#`.
- Ability effects are particles and area tints: telegraphed circles of `.` before the meteor lands, `~` for the slow field, and so on.
- HUD:
  - hero portrait letter, HP and mana
  - ability bar with cooldown numbers
  - gold and level
  - kill score
  - timer
  - minimap with fog
  - shop panel at base

### Controls

| Input | Action |
|---|---|
| Right-click | Move, or attack what is under the cursor |
| A + left-click | Attack-move |
| Q/W/E/R | Abilities, aimed at the cursor |
| B | Recall |
| Tab | Scoreboard |
| P / Esc | Pause |
| Shop | Clickable while at base |
| Optional WASD mode | WASD moves; abilities fire toward the cursor |
| Touch | Tap to move or attack, ability buttons on the right, drag from a button to aim |
| Gamepad | Stick moves, A attacks the nearest target, X/Y/B/RB abilities, LB recall |

### Rules API (suggested)

`MAP, HEROES, ITEMS, DIFFICULTIES, newGame(seed, hero, difficulty), step(state, input), objective(state), score(state), save, restore`.

Input: `{ moveX, moveY, target, ability, aimX, aimY, recall, buy }`.

### Tests to write

- The map is symmetric for both sides, and lanes connect the bases.
- Minion waves meet at the middle of each lane when no hero interferes.
- Last hits give gold and XP. Tower aggro switches to a hero who attacks a hero under the tower.
- Each ability does what its description says: stun, slow, blink, execute, and so on.
- Recall cancels when you take damage. You can buy only at base and only with enough gold.
- An AI-only match ends with a winner inside 25 simulated minutes on every seed tested.
- Balance: across 20 AI-only matches, no single hero wins more than 70%.
- A plain-input player bot (one per hero) beats Easy AI on at least 3 of 4 seeds.
- Save and restore round-trip.
