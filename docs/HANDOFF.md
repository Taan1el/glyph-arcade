# Handoff Log

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
