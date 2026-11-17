# Handoff Log

## Bannerfall - 2026-11-17
Branch: `feature/bannerfall-2`  Last commit: `0f83330`
Status: building
What works:
- Core data structures in `games/bannerfall/src/rules.js` (96×64 mirrored 3-lane map, 4 heroes with Q/W/E/R definitions, 10 shop items, minion waves, towers, jungle camps, Colossus, fog of war vision, save/restore).
- Scene shader and ASCII unit/structure frames in `games/bannerfall/src/scene.js`.
Gaps compared with `docs/NEXT-GAMES.md` spec (recorded before coding):
1. **AI stalemate & test timeout (`rules.js`, `bot.cjs`, `rules.test.cjs`)**:
   - Towers deal `target.maxHp * 0.42` to minions (`landHit`), completely cancelling both late-game minion HP scaling and the +40% Colossus minion HP buff, so waves never tank towers long enough late in the match.
   - When a friendly wave dies (`front === null`), `think()` sends heroes all the way back to `holdPoint` (their own standing tower) instead of holding near midfield or continuing to pressure an exposed structure, causing endless walk-back stalemates.
   - `flowTo()` clears its entire BFS cache whenever `map.flows.size > 160`, causing repeated full-grid BFS searches every frame when units chase moving targets.
   - `rules.test.cjs` is missing the spec's 20-match AI-only hero balance check ("across 20 AI-only matches, no single hero wins more than 70%").
2. **`shell.html` and `app.js` mismatch**:
   - `games/bannerfall/src/shell.html` comes from an incompatible draft and is missing most DOM IDs required by `app.js` (`#heroes`, `#hero-note`, `#who`, `#hp`, `#hp-bar`, `#mana`, `#mana-bar`, `#xp-bar`, `#gold`, `#score`, `#items`, `#arm`, `#best`, `#end-score`, `#shop-list`, `#shop-note`, `#shop-gold`, `#board`, `#board-body`, `#board-btn`, `#board-close`, `#shop-close`, `#end-again`, `#end-menu`), causing `app.js` to throw on boot.
3. **Touch, WASD, drag-to-aim, ability rank-up, and ally pings**:
   - `app.js` does not wire up the `#touch` d-pad/action buttons, drag-from-ability-button aiming, or optional WASD movement mode (`#wasd`).
   - HUD layout in `shell.html` is not tuned for `tools/layout-check.cjs` across `360×640`, `844×390`, and `1280×720` (where `.stats`, `#minimap`, `#log`, `#objective`, `#hotbar`, `#touch .pad`, `#touch .side` must not overlap and all tap targets must be `>= 44px`).
   - `tests/browser-smoke.cjs` reads `bannerfall.state.player` and `bannerfall.state.towers`, which are not exposed on `state`.
   - Allies do not emit simple callout pings (such as `"Help mid"` or `"Colossus up"`) to the event log, and level-ups do not expose ability rank progression.
Known bugs and rough edges (for Claude):
- Tracked below as implementation completes.
Not verified:
- Full `npm test`, `npm run build`, and `npm run test:browser` (pending fixes below).
Commands run and results:
- `git switch -c feature/bannerfall-2 plan/future-games` -> switched to new branch.

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
