# Changelog

All notable changes to Glyph Arcade are documented in this file.

## [Unreleased]

### Added
- **Fine letters and drawn sprites across the arcade**: Every game now draws at 4x6 pixel letters, four times the detail at the same view distance. Tiles carry real texture (bevelled blocks, roofs and kerbs, canopy and lanes, court panels, brass walls), and heroes, creatures, cars, athletes, rigs and clockwork are shaded sprites instead of ASCII figures. Joyride's cars are rendered from their outline at 16 headings.
- **Engine**: `engine/glyph-sprites.js` shares sprite drawing between the 2D games, with team tints and health bars, and `GlyphArt.team()` marks team pixels.
- **Irongrid (`games/irongrid/`)**: A turn-based tactical grid & deck-drafting game across four hazard sectors (`Rust Flats` supply train, `Flooded Quarry` collapsing dam, `Storm Ridge` lightning strikes, `The Hive Core` Brood Queen finale), featuring 3 steam-walker rigs (`Titan`, `Howitzer`, `Aegis`), 12 Command Cards, directional enemy telegraphs, knockback collisions/drowning, spawn fissure blocking, live action previews, and saved campaigns.
- **Lockwork (`games/lockwork/`)**: A 30-vault clockwork signal-routing puzzle across five chapters (`Copper Hall`, `The Splitters`, `Phase Chambers`, `Chronos Works`, `Grand Mainspring`), with sliding conduits, rotatable mirrors and T-splitters, pressure gates, phase inverters, delay capacitors, pulse coils, dual-colour filters, unlimited undo, live BFS hints, and saved progress.
- **Ricochet (`games/ricochet/`)**: A 1v1 overhead disc court sport on the shared engine across four tournament courts (`Foundry`, `Twin Pillar`, `Conveyor`, `Prism Finals`), four archetypes (`Striker`, `Spinner`, `Bastion`, `Phantom`), curve spin, wall bank speedups, frame-window parries, shield segments, bullseye pockets, and saved tournaments.
- **Bannerfall (`games/bannerfall/`)**: A single-player glyph lane battler with four heroes, waves, towers, shops, jungle objectives and saved matches. Local development build; playtest evidence tracked separately.
- **Joyride (`games/joyride/`)**: A top-down open-world driving game on the shared engine, with rules, scene, app, shell, 9 rule checks, a road-graph bot that finishes all 13 jobs across town, a preview image and a smoke test.
  - Seeded 160×160 towns with four districts (Heights, The Strip, Old Town, Docks), two-way avenues and side streets, traffic lights, pedestrians, and a day/night cycle with headlights and rain.
  - Seven car types with speed-sensitive steering, lateral grip, handbrake drifts, crash damage, fire and explosions, plus Respray shop, Garage, 10 hidden packages, 5 stunt ramps and Taxi fares.
  - Wanted heat (0–5 stars) with chasing cruisers, ramming/boxing tactics, roadblocks, spike strips, and a radar search circle.
  - Twelve contact jobs across six mission types (Delivery, Checkpoints, Getaway, Tail, Wreck, Pickup rush) leading into the Docks armoured-van heist finale.
- **Burrow (`games/burrow/`)**: A side-view digging and building game on the shared engine, with rules, scene, app, shell, 20 rule checks, a plain-input bot that plays from the first tree to the final boss, a preview image and a smoke test.
  - Seeded 320×150 worlds with surface groves, caves, copper, iron and crystal, water, lava, and an obsidian altar chamber under the spawn.
  - Tiered picks, swords and armour, workbench crafting, doors, ladders and torches, and an objective line that always names the next step.
  - Flood-filled block and sky light, a day and night cycle, night creatures, flowing liquids that turn to obsidian when they meet, and falling sand.
  - The Maw, a segmented serpent boss that charges, bites and swims clear.
  - Keyboard and mouse, touch, and gamepad controls, three difficulties, and an automatic world save.

### Changed
- **Lockwork**: All 30 vaults are new. They come from a generator that builds a real beam route and then breaks it, and each one is kept only if the game's own solver proves it starts locked and needs several mechanism moves. Five old vaults were solved before the first step. Par is the solver's best plus two.
- **Lockwork**: The vault picker switches vaults again, a held key no longer spills into the next vault, Esc leaves the help screen, hints search deeper and say they are working, and the board sizes itself to the space the HUD leaves free.
- **Bannerfall**: Matches run about 13 to 18 minutes instead of 10. Levels come faster, so level 6 arrives around minute 5, and structures take a real siege: the banner has more health and mends when left alone.
- **Bannerfall**: Wider ability cards with corner cooldowns, wrapped item lists, the shop and scoreboard dim the battle, `Tab` toggles the scoreboard, kill lines name both teams, the log uses the acting team's colour, the Colossus is called out once per rise, and the view stays on the spot where you fell.
- **Ricochet**: A charge warns at full power and fumbles only after 1.6 seconds, the hold limit no longer fumbles a charge in progress, keyboard aim is a moderate angle, and Normal rivals react a little slower.
- **Joyride**: The player's car always burns before it explodes, a destroyed car no longer drags the respawn back to the wreck, traffic stops in time for people on foot, and a stalled car gets two seconds, with a warning, before police bust it.
- **Engine**: Same-size texture uploads refill the texture instead of reallocating it every frame.
- **Tooling**: `tools/layout-check.cjs` also covers objective bars and hotbars, and the Burrow smoke test waits for the dig instead of a fixed delay.

## [0.4.0] - 2026-11-02

### Changed
- **Delve**: Monsters and items are now drawn characters with idle and attack poses (`games/delve/src/art.js`), shaded in coloured letters. Damage numbers, torches and the map still use single letters.
- **Engine**: The atlas shading function moved to `GlyphArt.SHADER`, shared by Delve and Inkfire.

## [0.3.1] - 2026-11-02

### Fixed
- **Delve**: Starting a new run after dying no longer leaves most of the screen dissolved.
- **Delve and Inkfire**: A new run starts with an empty combat log.

## [0.3.0] - 2026-11-02

### Added
- **Wordfall (`games/wordfall/`)**: A two-minute lane game on the shared engine, with rules, scene, app, shell, 12 rule checks, a preview image and a smoke test.
- **Difficulty**: Easy, Normal and Hard on every title screen.
- **Gamepad support**: `engine/glyph-input.js`, wired into all three games.
- **Adaptive quality**: `engine/glyph-quality.js` lowers resolution when frames run long.
- **Tooling**: `tools/balance.cjs` (`npm run balance`), `tests/balance.test.cjs` (`npm run test:balance`), `tools/perf.cjs` (`npm run perf`), and `tools/layout-check.cjs`, which fails on overlapping HUD panels or tap targets under 44px.
- **Reports**: `PLAYTEST.md` and `PERF.md`.

### Changed
- **Touch layout**: Left thumb moves, right thumb turns and acts, in both Delve and Inkfire. Safe-area insets, overscroll and text selection are handled on phones.
- **Inkfire balance**: Retuned weapons, monsters and pickups. Normal bots now win 37%, die 60.5% and time out 2.5% over 200 seeds.
- **Delve balance**: Weaker lich and a shared `botAction` on the rules module.
- **Portal**: The Next Stop card is now clearly marked as an external site.
- **Service worker**: The cache name is a hash of the shipped files, and the asset list is generated at build time, so players never keep stale files.
- **Reduced motion**: Full-screen flashes are softer and the title camera holds still.

### Fixed
- **Inkfire**: Lifting one thumb no longer releases every held touch control.
- **Inkfire**: `E` now turns right as documented; it was captured by the use action.
- **Inkfire**: Touch players can reach every weapon, including the launcher.
- **Delve**: Holding a touch movement button now keeps walking.
- **Accessibility**: Delve's mute button reports its state to screen readers.

## [0.2.0] - 2026-10-31

### Added
- **Inkfire (`games/inkfire/`)**: Complete real-time first-person arena shooter built on the shared glyph engine and `GlyphArt` sprite atlas (`src/rules.js`, `src/scene.js`, `src/app.js`, `src/shell.html`, `test/rules.test.cjs`).
  - Procedural 40×40 sector generator with guaranteed-solvable Red and Blue keycard door progression and exit elevator.
  - Four weapons (`pistol`, `shotgun`, `chaingun`, `launcher`), five enemy species (`trooper`, `spitter`, `brute`, `wisp`, and the boss `titan`), and chain-reacting explosive slime barrels.
  - Keyboard, mouse pointer-lock, and mobile touch controls, pause menu, Web Audio synthesizer with mute persistence, and automatic run/score saving in `localStorage`.
- **PWA & Offline Support (`site/`)**: Added `site/manifest.webmanifest`, `site/icon.svg`, and an offline cache-first service worker (`site/sw.js`) bundled into `dist/`.
- **Engine Documentation (`engine/README.md`)**: Documented the two-pass WebGL2 character-cell architecture, GLSL helper functions, `GlyphEngine`, and `GlyphArt`.
- **Quality & Verification Tooling**:
  - Added `tools/check-license.cjs` to verify MIT license preservation across repository files and built game bundles.
  - Extended `tests/browser-smoke.cjs` to verify the arcade portal at 360px viewport width, `dist/delve.html`, and `dist/inkfire.html`.
  - Extended `tools/capture-previews.cjs` (`npm run previews`) to generate preview images for both Delve and Inkfire.
  - Added `AUDIT.md` recording baseline checks, bug analyses, and phase completion logs.

### Fixed
- **Delve (`games/delve/`)**:
  - Fixed skeleton archer and lich ranged attack cooldown decrement order in `games/delve/src/rules.js` so archers rest 1 turn and the lich rests 2 turns between shots.
  - Fixed portcullis door raising animation bypass in `games/delve/src/scene.js` so bumped doors animate smoothly over 380ms.
  - Removed unused `state.bolts` property in `games/delve/src/rules.js`.
- **Glyph Engine (`engine/`)**:
  - Fixed horizontal row boundary wrapping in `GlyphArt.Canvas.finish()` (`engine/glyph-art.js`) when computing top-left highlights and bottom-right shadows.
  - Added `webglcontextrestored` handling and eliminated per-frame allocations in `GlyphEngine.render()`, `DelveView.draw()`, and `DelveApp.frame()`.
- **Arcade Portal (`site/index.html`)**:
  - Improved footer and card text contrast to meet WCAG AA standards, added visible `:focus-visible` keyboard outlines, added a skip-to-games link, clamped responsive header typography from 360px wide up, and added `prefers-reduced-motion` support.
- **CI Workflow (`.github/workflows/pages.yml`)**:
  - Updated GitHub Pages workflow to run `npm run build`, `npm test`, and `npm run test:browser` prior to deployment.

## [0.1.0] - Initial Baseline
- Shared WebGL2 character-cell engine (`engine/glyph-engine.js`) and sprite atlas builder (`engine/glyph-art.js`).
- **Delve** first-person turn-based roguelike (`games/delve/`) and initial Inkfire sprite definitions (`games/inkfire/src/art.js`).
- Single-file HTML bundler (`tools/build.cjs`), Playwright preview capture (`tools/capture-previews.cjs`), and browser smoke test (`tests/browser-smoke.cjs`).
