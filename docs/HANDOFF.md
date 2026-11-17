# Handoff Log

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
