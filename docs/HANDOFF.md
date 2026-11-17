# Handoff Log

## Lockwork - 2026-11-17
Branch: `feature/lockwork`  Last commit: `4162995`
Status: feature-complete
What works:
- Pure rules in `games/lockwork/src/rules.js`: 15×12 grid across 30 authored vaults in 5 chapters (`Copper Hall`, `The Splitters`, `Phase Chambers`, `Pulse Mechanics`, `Clockwork Finale`), rotatable mirrors (`/` `\`), 3-way/split conduits (`TT`), crates (`+==+`), weight plates (`[__]`) linked to shutter gates (`####`), cross bridges (`++`), pushable conduits (`--` `||`), beam-suppressed inverters (`+!!+`), alternating pulse coils (`<Q>`), delay capacitors, BFS optimal solver `hint()`, unlimited undo history, 3 difficulties (`Relaxed`, `Standard`, `Master`), and deterministic `save`/`restore`.
- Scene shader and ASCII frames in `games/lockwork/src/scene.js`: 4×3-cell tiles drawn in uppercase letters, digits and symbols, animated beams/coils/receptors, shutter states, capacitor bars, and green hint highlight.
- App and shell in `games/lockwork/src/app.js` and `games/lockwork/src/shell.html`: keyboard (`WASD`/Arrows, `E`/`Space` rotate/wait, `Z` undo, `R` reset, `H` hint, `L`/`Tab` vaults, `P`/`Esc` pause), mouse/touch click-to-move-or-rotate and swipe, bottom touch pads on touch devices, `GlyphPad` gamepad support, `GlyphQuality`, WebAudio sound effects, reduced motion, onboarding toast, and `localStorage` persistence.
- Wired into `tools/build.cjs`, `package.json`, `tests/browser-smoke.cjs`, `tools/layout-check.cjs`, `tools/capture-previews.cjs`, `README.md`, and `CHANGELOG.md`.
Known bugs and rough edges (for Claude):
- **Vault Select switcher (`app.js`, from playtest)**: Clicking, `mouse.click`-ing, or pressing `Enter`/`Space` on vault buttons in the `Vaults` modal (including cleared Vault 1 or later Vault 12) closes the modal without switching away from the active vault; also long titles with earned Gold Cogs wrap `*` onto a second line.
- **Vault balance & clarity (`rules.js`, `scene.js`, from playtest)**:
  - Vault 8 (`Cross Bridge`) starts with both crossing beams lighting both receptors at Step 0 without placing or using the `++` bridge.
  - Vault 14 (`Shadow Relay`) starts with its mirror angled away from the Inverter `+!!+`, so the unlit inverter already powers the receptor and exit at Step 0.
  - Vault 10 (`Pipe Fitters`) places a pushable vertical conduit (`||`) inside an active vertical beam (`||`) where both render identically, hiding the conduit until pushed out.
  - Vault 11 (`Double Fork`) loaded at `STEPS 1 / PAR 22` immediately after exiting Vault 10 until `R` reset returned it to `STEPS 0 / PAR 22`; Vaults 1–4 also share very similar right-side exit/receptor placements.
- **Title / modal & mobile UI (`app.js`, `shell.html`, from playtest)**:
  - Before bringing the tab into focus/resizing on initial boot, `.click()` on `"How to play"` and `"New journey"` had no effect (`New journey` briefly reported negative bounding-box coordinates before `Enter` started play).
  - Pressing `Escape` while viewing `"How to play"` from the title screen loaded the vault underneath while leaving `"How to play"` open on top.
  - Narrow desktop/non-touch `390×844` viewports keep bottom touch pads hidden because pads gate on touch capability rather than width.
  - Objective copy says `"All 1 receptors lit! Step onto the green exit {O}."` (plural `"1 receptors"` and `{O}` vs 2-char exit glyph).
- **Existing-game check (`burrow` in `tests/browser-smoke.cjs`)**: Pre-existing failure at `tests/browser-smoke.cjs:172` (`Burrow did not dig under the held mouse`) blocks running `npm run test:browser` end-to-end.
Not verified:
- Full `tests/browser-smoke.cjs` single-pass run (blocked at Burrow line 172; Lockwork's own smoke checks passed in an isolated Playwright run).
- Manual browser playthrough of Chapters 4 & 5 (Vaults 16–30, blocked by the Vault Select modal switching bug; all 30/30 vaults solved by the BFS bot in Node tests).
- Physical gamepad controller hardware test.
Commands run and results:
- `node games/lockwork/test/rules.test.cjs` -> `5/5 Lockwork rules checks passed` in `7.6s` (`All 30 vaults solved: Standard 30/30 Gold Cogs, Master 30/30, seeded variant 30/30`).
- `npm test` -> exit `0` elapsed `229s` (MIT license pass, Delve `12/12`, Inkfire `10/10`, Wordfall `12/12`, Burrow `20/20`, Joyride `11/11`, Bannerfall `13/13`, Ricochet `8/8`, Lockwork `5/5`).
- `npm run build` -> built all 8 `dist/*.html` (`dist/lockwork.html` `95727` bytes) and `dist/index.html`.
- `node tools/layout-check.cjs` -> `PASS Touch HUD has no overlaps and every tap target is at least 44px` across all 8 games (`360×640`, `844×390`, `1280×720`).
- `npm run previews` -> wrote all 8 previews including `dist/previews/lockwork.png`, rebuilt `dist/index.html`.
- Lockwork browser smoke checks (`lockwork-smoke.cjs`) -> desktop boot + 30-vault select + hint + save (`{"mode":"play","moved":true,"hint":true,"cells":19}`) and mobile touch boot (`{"touch":true,"cells":19}`), zero console/page errors.
- Browser playtest (`http://127.0.0.1:8765/lockwork.html`, Standard) -> played Vaults 1–15 across Chapters 1–3, cleared 14 vaults (`13` Gold Cogs), tested Undo/Hint/Reset/Pause/Save and quit/Continue/Difficulty selector and `390×844` viewport, 0 console/page errors.

## Ricochet - 2026-11-17
Branch: `feature/ricochet`  Last commit: `7aefa98`
Status: feature-complete
What works:
- Pure rules in `games/ricochet/src/rules.js`: 28×16 court with 45° corner wedges, 3 shield segments per endzone (`###` -> `---` -> open, 2-bounce bank breaks 2 shields, open bullseye pocket `[$]` scores 2 points), 4 sub-step disc physics, curve spin, wall-bank speed scaling up to `MAX_SPEED`, hold-to-charge + overcharge fumble, frame-window parry, 4 courts (`Foundry`, `Twin Pillar`, `Conveyor`, `Prism Finals`), 4 archetypes (`Striker`, `Spinner`, `Bastion`, `Phantom`), 3 difficulties (`Easy`, `Normal`, `Hard`), and `save`/`restore`.
- Scene shader and ASCII frames in `games/ricochet/src/scene.js`: letter-drawn court tiles, animated conveyors, 45°-rotating prisms, dotted aim line, charge bar, bouncing/critical disc halos, and archetype sprites.
- App and shell in `games/ricochet/src/app.js` and `games/ricochet/src/shell.html`: keyboard (`WASD`/Arrows, `J`/`Enter`, `K`/`E`, `Space`/`Shift`, `P`/`Esc`), mouse aim & click/right-click, mobile touch pad + Throw/Spin/Dash buttons, `GlyphPad` gamepad support, `GlyphQuality`, synthesised WebAudio SFX + continuous charge hum, reduced motion, first-60-seconds onboarding toast, and `localStorage` save/best scores.
- Wired into `tools/build.cjs`, `package.json`, `tests/browser-smoke.cjs`, `tools/layout-check.cjs`, `tools/capture-previews.cjs`, `README.md`, and `CHANGELOG.md`.
Known bugs and rough edges (for Claude):
- **Initial layout / sizing (`shell.html`, from 10-min browser playtest)**: At initial `776×695` load before resizing to `1280×800`, the playtester reported `body` collapsing and `.card` sitting off-screen (`CAPTURE_EMPTY` until viewport resize); check `html, body { width: 100%; height: 100%; }` or initial viewport sizing in `shell.html`.
- **Keyboard vs. mouse aiming (`app.js`, `rules.js`)**: Holding `S` while tapping `J`/`K` steers the throw steep into the side wall, whereas tapping `J` without vertical input fires flat straight into the rival; consider smoothing keyboard aim elevation and surfacing an explicit aim/charge cue.
- **Court 1/4 Normal AI tuning & overcharge window (`rules.js`)**: `Bastion` AI on Normal catches/parries `BANK x1`/`BANK x2` and spin throws very consistently (`0–5` set 1 in playtest), and the `1.25s` overcharge fumble window feels unforgiving; consider softening Normal AI reaction/catch reach slightly and giving a visual/audio warning pulse before overcharge fumble.
- **Minor HUD text (`shell.html`)**: `#court-name` and `#rally-badge` sit in a flex row without a literal separator in textContent (`"1/4 · Foundry CourtBANK x1"` for screen readers).
- **Existing-game check (`burrow` in `tests/browser-smoke.cjs`)**: Same pre-existing failure at `tests/browser-smoke.cjs:172` (`Burrow did not dig under the held mouse`) blocks running `npm run test:browser` end-to-end; Ricochet's own desktop/mobile smoke checks and `tools/layout-check.cjs` passed independently.
Not verified:
- Full `tests/browser-smoke.cjs` single-pass run (blocked earlier at Burrow line 172; Ricochet's own smoke checks passed in an isolated Playwright script).
- Physical gamepad controller hardware test.
Commands run and results:
- `node games/ricochet/test/rules.test.cjs` -> `8/8 Ricochet rules checks passed` in `0.3s` (bot tournament on Easy: `striker won c4 8.1m score:17433 | spinner won c4 6.1m score:19383 | bastion lost c1 7.6m score:1800 | phantom won c4 6.9m score:19568`).
- `npm test` -> exit `0` in `223s` (MIT license verified, Delve `12/12`, Inkfire `10/10`, Wordfall `12/12`, Burrow `20/20`, Joyride `11/11`, Bannerfall `13/13`, Ricochet `8/8`).
- `npm run build` -> built all 7 `dist/*.html` (`dist/ricochet.html` `101328` bytes) and `dist/index.html`.
- `node tools/layout-check.cjs` -> `PASS Touch HUD has no overlaps and every tap target is at least 44px` across all 7 games (`360×640`, `844×390`, `1280×720`).
- `npm run previews` -> generated `dist/previews/ricochet.png` and all 6 others, rebuilt `dist/index.html`.
- Ricochet browser smoke checks (isolated Playwright script) -> passed portal card presence, desktop boot/move/throw/pause/save/continue (`cells: 18`), and mobile touch boot (`cells: 15`) with zero console/page errors.
- 10-minute browser playtest (`http://127.0.0.1:8765/ricochet.html`, Spinner, Normal) -> reached Court `1/4 · Foundry Court` (`SETS 0 - 1`, `0 : 2` in Set 2), exercised charge throws, `BANK x1`/`x2`, corner wedges, spin shots, dash, `PERFECT PARRY!`, pause/help/resume, zero console/network errors.

## Bannerfall - 2026-11-17
Branch: `feature/bannerfall-2`  Last commit: `0c049e2`
Status: feature-complete
What works:
- Full match loop in `games/bannerfall/src/rules.js`: 96×64 mirrored 3-lane map, all 4 heroes (`Warden`, `Ranger`, `Ember`, `Shade`) with Q/W/E/R abilities, XP/levels 1–10 with ability rank scaling, last-hit gold, 10-item base shop, 4s recall interrupted by damage, outer/inner tower protection and hero-aggro switching, jungle camps, river Colossus at 6:00 with push buff, fog of war, 3 difficulties, ally pings, and deterministic `save`/`restore`.
- AI stalemate resolved (`landHit` minion damage uses base `MINIONS[kind].hp` so late/Colossus-buffed waves tank towers; `holdPoint` advances with fallen towers; `flowTo` caches BFS fields by 2×2 coarse key; `moveToward` caches repaths; local intrinsic bindings in `rules.js` cut `vm` overhead).
- Rebuilt `games/bannerfall/src/shell.html` to match all `app.js` HUD/modal IDs and `tools/layout-check.cjs` tap-target (`>= 44px`) and non-overlap rules at `360×640`, `844×390`, and `1280×720`.
- Wired touch tap-to-move/attack, drag-from-ability-button aiming, optional WASD movement mode (`#wasd` in Controls), keyboard/mouse/gamepad (`GlyphPad`), adaptive quality (`GlyphQuality`), WebAudio sound, and `localStorage` save/continue.
Known bugs and rough edges (for Claude):
- **HUD/modal polish (`shell.html`, `app.js`, from 10-min browser playtest at 776×695)**:
  - Ability cards truncate names (`Piercin...`, `Snare T...`, `Arrow S...`), and active cooldown digits sit directly over the `Q`/`W` key letter and ability name.
  - Top-left item line truncates horizontally (`Hunting Bow · Leather Vest · Swift Bo...`), hiding the 4th+ item.
  - Top-left HUD/kill-feed sits over the playable corner near blue base, and opening Shop (`S`) or Scoreboard (`Tab`) overlaps the top HUD buttons and log underneath.
  - Grammar polish: `"1 kills, 13 deaths, 1 assists"` on the end screen and `"ready in 1 seconds"` in ability `aria-label`.
- **Feed & callouts (`rules.js`, `app.js`)**:
  - Tower-destruction log lines use the victim tower's team colour instead of the acting team's colour (e.g., `"Blue destroyed the red outer bottom tower."` renders with a red border).
  - Both teams can spawn identical heroes (e.g., `"Shade (Blue) took down Shade."`).
  - `"Warden: Colossus up in the river!"` repeats every 45s even after the hero who spoke recently died.
- **Readability & controls (`scene.js`, `app.js`, `rules.js`)**:
  - Pressing keyboard `Tab` in the browser playtest did not visibly open the Scoreboard (clicking the `Tab` button worked; check focus/key handling when canvas or buttons have focus).
  - Green Ranger `(R-` and green HP bars blend against dark green jungle `@#%&` tiles, and stacked waves (`[[]][[#]]`) or overlapping damage numbers are hard to parse or target individually.
  - Casting `W` (`Snare Trap`) outside its 7-tile range clamps or silently fails on some inputs; ability rank-up is automatic on level-up with no choice/toast; `Healing Potion` doesn't state in the shop text that it activates immediately instead of using a bag slot.
  - Normal mid-lane bot (`Ember`) snowballs hard early if the player falls behind; match ended at 9:49 while player Ranger was Level 5 (never reaching Level 6 for `R`).
  - No death location marker while dead; late-game 13s death timers + Colossus buff end the base very abruptly.
- **Existing-game check (`burrow` in `tests/browser-smoke.cjs`)**:
  - `npm run test:browser` fails earlier in `tests/browser-smoke.cjs:172` with `Error: Burrow did not dig under the held mouse, or the save lost the dirt` before reaching Joyride/Bannerfall (left untouched per ground rules).
Not verified:
- Full `npm run test:browser` end-to-end pass in a single invocation because `tests/browser-smoke.cjs` stops at Burrow line 172 (Bannerfall's own smoke path, shop, scoreboard, touch tap, and drag-to-aim were verified in an isolated Playwright run, and `tools/layout-check.cjs` passed across all 6 games).
- Gamepad hardware input was not manually tested with a physical controller.
Commands run and results:
- `node games/bannerfall/test/rules.test.cjs` -> `13/13 Bannerfall rules checks passed` in `27.8s` (`20 AI matches (mean 11.4m) hero win rates: warden:17/28 (61%) | ranger:15/29 (52%) | ember:12/30 (40%) | shade:16/33 (48%)`; player bot vs Easy: `warden won 9.3m 3/1 | ranger won 9.5m 1/8 | ember won 8.0m 2/6 | shade won 7.5m 1/3`).
- `npm test` -> exit `0` in `342s` (`MIT license verified`, Delve `12/12`, Inkfire `10/10`, Wordfall `12/12`, Burrow `20/20`, Joyride `11/11`, Bannerfall `13/13`).
- `npm run build` -> built all 6 `dist/*.html` (`dist/bannerfall.html` `169610` bytes) and `dist/index.html`.
- `node tools/layout-check.cjs` -> `PASS Touch HUD has no overlaps and every tap target is at least 44px` (`360×640`, `844×390`, `1280×720` across all 6 games).
- Bannerfall browser smoke checks (isolated Playwright script) -> passed boot, move, `KeyQ`, pause, save/continue, base shop buy, 6-row scoreboard, touch tap-to-move, and drag-from-ability-button aim.
- 10-minute browser playtest (`http://127.0.0.1:8765/bannerfall.html`, Ranger, Normal, seed `33d1fm`) -> Defeat at `9:49`, Level 5, `1/13/1`, `11` CS, `BLUE 11 : 22 RED`, zero console/page errors.

## Planning - 2026-11-17
Branch: `plan/future-games`  Last commit: `295da51` (base on `feature/bannerfall`)
Status: planned
What works:
- Added `docs/FUTURE-GAMES.md` with a ranked build order, engine notes, and full design specs for six new games (`Ricochet`, `Lockwork`, `Irongrid`, `Pulsebeat`, `Nightshift`, `Skyhook`).
- License check, Delve (`12/12`), Inkfire (`10/10`), Wordfall (`12/12`), Burrow (`20/20`), and the first 10 Joyride unit checks pass in `npm test`.
Known bugs and rough edges (for Claude):
- Full `npm test` does not finish within 3 minutes on `feature/bannerfall`: after passing `check-license`, Delve, Inkfire, Wordfall, Burrow, and the first 10 Joyride checks (`PASS Garage repairs extinguish a burning vehicle`), the test run stalls for >2m29s in the long multi-seed bot simulations (Joyride's 4-seed 45-minute bot test followed by Bannerfall's 3 AI-only + 4 player-bot match tests).
- `GlyphEngine.prototype.setTexture` currently calls `gl.texImage2D` on every call even when texture dimensions are unchanged; switching same-size updates to `gl.texSubImage2D` will avoid per-frame texture reallocation for `u_sprites`, `u_map`, and `u_light`.
Not verified:
- `games/bannerfall/test/rules.test.cjs` completion and browser smoke tests (`npm run test:browser`), as `npm test` was stopped at the 3-minute mark per instructions.
Commands run and results:
- `git switch feature/bannerfall` -> switched cleanly (`295da51 start Bannerfall, still unfinished`).
- `npm test` -> passed `check-license.cjs`, `delve` (12/12), `inkfire` (10/10), `wordfall` (12/12), `burrow` (20/20), and 10 `joyride` checks; stopped after 3 minutes while still running the remaining bot tests.
- `git switch -c plan/future-games` -> created branch from `feature/bannerfall`.
