# Changelog

All notable changes to Glyph Arcade are documented in this file.

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
