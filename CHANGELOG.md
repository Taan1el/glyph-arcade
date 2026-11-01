# Changelog

All notable changes to Glyph Arcade are documented in this file.

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
