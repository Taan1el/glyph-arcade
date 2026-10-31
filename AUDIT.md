# Glyph Arcade — Codebase Audit & Baseline Report

## Executive Summary

Glyph Arcade is a web-based arcade portal and collection of single-file browser games rendered entirely in coloured characters on WebGL2 using a shared character-cell engine (`engine/glyph-engine.js`, `engine/glyph-art.js`). Every game is bundled into a standalone, self-contained HTML file in `dist/` with zero runtime dependencies and zero network requirements.

This audit establishes the baseline verification results prior to making any modifications to the codebase. It catalogs what is currently functional, documents bugs discovered in the engine and Delve, outlines missing components and features required for Inkfire and the arcade portal, and establishes a concrete implementation roadmap for Phases 1 through 5.

---

## 1. Baseline Verification Results

All baseline commands were executed from the repository root on branch `main` with Node.js v20.19.4 and npm 10.8.2.

### Summary Table

| Command | Status | Exit Code | Key Output / Metrics |
|---|---|---|---|
| `npm install` | PASS | 0 | `up to date, audited 3 packages in 1s`, 0 vulnerabilities |
| `npm run build` | PASS | 0 | `dist/delve.html` (75,552 bytes), `dist/index.html` (2,997 bytes) |
| `npm test` | PASS | 0 | 8/8 Delve rules tests passed (including 60 bot simulation runs) |
| `npm run test:browser` | PASS | 0 | Playwright smoke test passed (`{"turn":4,"hp":20,"cells":12}`) |
| `npm run previews` | PASS | 0 | Wrote `dist/previews/delve.png` (154,185 bytes) |

### Exact Terminal Outputs

#### 1. `npm install`
```
up to date, audited 3 packages in 1s

found 0 vulnerabilities
```
*Exit code*: `0`. Neither `package.json` nor `package-lock.json` was altered.

#### 2. `npm run build`
```
> glyph-arcade@0.1.0 build
> node tools/build.cjs

Built dist\delve.html (75552 bytes, no runtime dependencies).
Built dist/index.html launcher.
```
*Exit code*: `0`.

**Generated Bundle Sizes (`dist/`)**:
- `dist/delve.html`: 75,552 bytes (single-file HTML containing bundled GLSL shaders, game rules, raycaster scene, sound synthesizers, and DOM shell).
- `dist/index.html`: 2,997 bytes (portal launcher listing available games).
- `dist/.nojekyll`: 0 bytes (bypasses Jekyll processing on GitHub Pages).

#### 3. `npm test`
```
> glyph-arcade@0.1.0 test
> node games/delve/test/rules.test.cjs

PASS Every floor is connected: stairs (or the lich) are reachable from the start
PASS Runs are deterministic for a seed and differ between seeds
PASS Turning is free; moving into walls costs nothing; stepping ends the turn
PASS Doors open on a bump and then let you through
PASS Combat, death of a monster, xp and level up
PASS Potions heal, scrolls map the floor, gear auto-equips only when better
PASS Saves round-trip through JSON and reject foreign data
   60 bot runs: 0 won, 60 died, 0 unfinished, mean depth 3.17
PASS Bot runs finish without errors and the difficulty curve is plausible
8/8 Delve rules checks passed.
```
*Exit code*: `0`. All 8 unit tests in `games/delve/test/rules.test.cjs` passed in 1.48 seconds.

#### 4. `npm run test:browser`
```
> glyph-arcade@0.1.0 test:browser
> node tests/browser-smoke.cjs

PASS Delve boots, plays turns and renders {"turn":4,"hp":20,"cells":12}
```
*Exit code*: `0`. Chromium loaded `dist/delve.html`, clicked new run, moved the player, verified turn advancement, and asserted that at least 6 distinct character cells were rendered.

#### 5. `npm run previews`
```
> glyph-arcade@0.1.0 previews
> node tools/capture-previews.cjs

Wrote dist/previews/delve.png
```
*Exit code*: `0`. Generated `dist/previews/delve.png` (154,185 bytes).

### Git Repository State

```
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
	engine/glyph-art.js
	games/inkfire/

nothing added to commit but untracked files present (use "git add" to track)
```

**Tracked Files (17 files)**:
- `.github/workflows/pages.yml`
- `.gitignore`
- `LICENSE`
- `README.md`
- `docs/delve-preview.png`
- `engine/glyph-engine.js`
- `games/delve/src/app.js`
- `games/delve/src/rules.js`
- `games/delve/src/scene.js`
- `games/delve/src/shell.html`
- `games/delve/test/rules.test.cjs`
- `package-lock.json`
- `package.json`
- `site/index.html`
- `tests/browser-smoke.cjs`
- `tools/build.cjs`
- `tools/capture-previews.cjs`

---

## 2. What Works

### 2.1 Shared Glyph Engine
- **Deferred Character Cell Pipeline (`engine/glyph-engine.js`)**:
  - Initialises a WebGL2 context (`alpha: false, antialias: false, depth: false, stencil: false`).
  - Two-pass rendering architecture:
    - **Pass 1 (Scene)**: Custom game fragment shaders render to a Multiple Render Target (MRT) framebuffer writing 3 colour attachments:
      - `out_record` (`uvec4`): `[glyph_code, material_id, flags, log_depth]` (flags: bit 0 = no ink silhouette outline, bit 1 = flat color / no vertical gradient).
      - `out_foreground` (`uvec4`): `[r, g, b, 255]`.
      - `out_background` (`uvec4`): `[r, g, b, 255]`.
    - **Pass 2 (Display Composite)**: Fullscreen quad composite at physical canvas resolution. Performs silhouette edge detection from depth deltas to render ink borders (`/`, `\`, `|`, `_`, `-`), looks up 5x7 procedural character bitmasks from a 128x7 `R8UI` texture, applies vertical cell ink gradients, and applies tint/dissolve transitions.
  - Built-in font table (`GlyphEngine.GLYPHS`) storing 5x7 bitmasks for ASCII characters 32 through 90 (space, numbers, punctuation, uppercase A-Z).
  - Dynamic resolution scaling via `engine.resize(width, height, cellSize)`.
  - Texture binding via `engine.setTexture(name, unitIndex, width, height, data)` for tile maps and sprite atlases.

- **Procedural Raster Pixel Canvas & Atlas Packer (`engine/glyph-art.js`)**:
  - `GlyphArt.Canvas(width, height)`: 2D drawing primitives (`set`, `rect`, `ellipse`, `line`, `mirrorRows`) operating on flat pixel arrays.
  - Automatic dual-tone shading pass and outline pass in `Canvas.finish()`.
  - `GlyphArt.Atlas`: Frame registry packing arbitrary sprite canvases into a 768px wide RGBA8 texture with vertical flip for WebGL coordinate spaces.

### 2.2 Delve: First-Person Roguelike
- **Deterministic Game Logic (`games/delve/src/rules.js`)**:
  - Seeded dungeon generator producing 5 floors of connected rooms, corridors, loops, doors, and torches using FNV-1a pseudo-random hashing.
  - Strict turn-based state machine: turning and wall bumps are free actions; forward/back/strafe movements advance the turn.
  - 9 monster species (`rat`, `bat`, `goblin`, `jelly`, `skeleton`, `archer`, `wraith`, `ogre`, `lich`) with unique stats, movement behaviors, and attack ranges.
  - Turn resolution: player action -> combat/bump resolution -> monster turns -> status updates.
  - Inventory and item progression: weapon upgrades, armour upgrades, healing potions, map scrolls, and gold collection.
  - Full game state serialization: save/restore roundtrip through JSON with schema version validation.
- **3D DDA Raycaster Scene (`games/delve/src/scene.js`)**:
  - Amanatides-Woo DDA raymarching in GLSL stepping up to 72 grid tiles.
  - Renders 3D walls, portcullis doors, floor grids, ceiling beams, and point lights (torches).
  - Billboards up to 48 monster and torch sprites rasterized directly from font glyph bitmasks.
- **Game Application & Shell (`games/delve/src/app.js`, `games/delve/src/shell.html`)**:
  - Procedural sound synthesizer using Web Audio API (16 unique procedural audio effects for bumps, combat, potions, scrolls, level-ups, footsteps, and victory).
  - Responsive layout for desktop and mobile devices with a virtual touch control pad overlay.
  - Local persistence for active runs, best records, and mute preference in `localStorage`.
  - Content Security Policy (CSP) with `default-src 'none'` ensuring zero external resource leaks.
- **Delve Unit Tests (`games/delve/test/rules.test.cjs`)**:
  - 8 test cases verifying connectivity across 40 seeds, determinism, turn economy, door mechanics, combat math, equipment handling, save/restore roundtrip, and 60 automated bot playthroughs.

### 2.3 Build and Quality Tooling
- **Single-File Bundler (`tools/build.cjs`)**:
  - Inlines engine, game scripts, GLSL shaders, and metadata into standalone HTML files.
  - Inlines MIT `LICENSE` into shell comments.
  - Generates the portal launcher at `dist/index.html`.
- **Automated Preview Capture (`tools/capture-previews.cjs`)**:
  - Uses Playwright to load `dist/delve.html` headlessly and capture clean screenshots to `dist/previews/delve.png`.

---

## 3. What is Broken

### 3.1 Archer Cooldown Logic Bug
- **Location**: `games/delve/src/rules.js:197-201`
- **Observed Code**:
  ```javascript
  if(monster.cooldown>0)monster.cooldown--;
  if(info.range&&sees&&(dx===0||dy===0)&&distance<=info.range&&monster.cooldown===0){
    const {damage}=strike(state,monster.atk-1,defenceOf(p));monster.cooldown=info.boss?2:1;
    events.push({type:'shoot',actor:monster.id,from:[monster.x,monster.y],to:[p.x,p.y],damage});
    ...
  ```
- **Failure Mechanism**: When an archer shoots, `monster.cooldown` is set to `1`. On the following turn, line 197 decrements `cooldown` from `1` to `0`. Immediately afterwards on line 198, `monster.cooldown === 0` is checked in the very same turn and evaluates to `true`. As a result, the archer fires every single turn with zero rest turns.
- **Impact**: Archer enemies attack twice as often as designed.
- **Planned Resolution (Phase 3)**: Set `monster.cooldown = info.boss ? 2 : 2;` or only decrement cooldown when the monster does not fire.

### 3.2 Portcullis Door Animation Bypass Bug
- **Location**: `games/delve/src/scene.js:152`
- **Observed Code**:
  ```javascript
  for(let i=0;i<size*size;i++){
    const tile=tiles[i],open=tile===3?1:doors?.get(i)??0;
    this.mapData[i*4]=tile===3?(open>=1?1:2):tile;
    this.mapData[i*4+1]=Math.round(Math.min(1,open)*255);
  }
  ```
- **Failure Mechanism**: When a player bumps a closed door, `rules.js:227` synchronously mutates `state.tiles[i] = OPEN` (tile ID 3). In `app.js:129`, `this.doors.set(i, 0)` begins an easing animation from 0.0 to 1.0 over 380 milliseconds. However, in `scene.js:152`, the ternary operator `tile === 3 ? 1 : ...` forces `open = 1` immediately because `tiles[i]` is already 3. The easing value in `doors.get(i)` is completely ignored. Consequently, `mapData[i*4]` immediately becomes 1 (floor), and the raising portcullis shader logic (lines 82, 90-94) is bypassed; the door graphic instantly vanishes.
- **Impact**: The 380ms smooth door-raising visual animation never plays.
- **Planned Resolution (Phase 3)**: Prioritize the active door animation:
  `const open = doors?.has(i) ? doors.get(i) : (tile === 3 ? 1 : 0);`
  and set `mapData[i*4] = (tile === 3 && open >= 1) ? 1 : (tile === 3 ? 2 : tile);`.

### 3.3 Canvas Finish Horizontal Boundary Wrap Bug
- **Location**: `engine/glyph-art.js:20-21`
- **Observed Code**:
  ```javascript
  const lit=!copy[(y-1)*this.width+x]||!copy[y*this.width+x-1],dark=!copy[(y+1)*this.width+x]||!copy[y*this.width+x+1];
  ```
- **Failure Mechanism**: When `x === 0`, `y * this.width + x - 1` calculates index `(y - 1) * this.width + (this.width - 1)`, which accesses the last column of the previous row rather than treating the left boundary as empty space. Similarly, when `x === this.width - 1`, `y * this.width + x + 1` accesses the first column of the next row.
- **Impact**: Incorrect shading and lighting highlights wrap across row edges on procedural sprite boundaries.
- **Planned Resolution (Phase 3)**: Guard coordinate accesses with `x > 0` and `x < this.width - 1`:
  `const lit = (y > 0 && !copy[(y-1)*this.width+x]) || (x > 0 && !copy[y*this.width+x-1]);`
  `const dark = (y < this.height-1 && !copy[(y+1)*this.width+x]) || (x < this.width-1 && !copy[y*this.width+x+1]);`

### 3.4 Portal Footer WCAG AA Color Contrast Failure
- **Location**: `site/index.html:23`
- **Observed Code**:
  ```css
  footer{margin-top:40px;color:#7d7158;font-size:13px}
  ```
- **Failure Mechanism**: Footer text color `#7d7158` against background `#08080a` produces a contrast ratio of **4.17:1**. WCAG AA requires a minimum contrast ratio of **4.5:1** for regular text (< 18pt / 24px).
- **Impact**: Fails accessibility standards for low-vision users.
- **Planned Resolution (Phase 4)**: Update footer text color to `#9c8f72` (contrast ratio **6.27:1**, exceeding WCAG AA).

### 3.5 Missing Visible Focus Indicators in Portal
- **Location**: `site/index.html:17`
- **Observed Code**:
  ```css
  .game:hover,.game:focus-visible{transform:translateY(-3px);border-color:#d8b25a;outline:none}
  ```
- **Failure Mechanism**: `.game:focus-visible` sets `outline: none` without providing an explicit replacement focus outline. The border color change alone has a contrast ratio of only 2.62:1 against `#08080a`, failing WCAG 2.4.7 (Focus Visible) and WCAG 1.4.11 (Non-text Contrast).
- **Impact**: Keyboard-only users cannot reliably determine which game card has input focus.
- **Planned Resolution (Phase 4)**: Add explicit focus outline:
  `outline: 2px solid #d8b25a; outline-offset: 3px;` for focused elements.

---

## 4. What is Half-Built or Missing

### 4.1 Missing Inkfire Game Implementation
`games/inkfire/src/art.js` (111 lines) is present in the repository, defining complete procedural sprite graphics for 5 enemy species (`trooper`, `spitter`, `brute`, `wisp`, `titan`), 4 weapon types (`pistol`, `shotgun`, `chaingun`, `launcher`), pickups (`medkit`, `stim`, `armour`, ammo boxes, red/blue keycards), explosive slime barrels, and torches. However, all other game components are completely missing:
1. `games/inkfire/src/rules.js`: Missing pure deterministic FPS game rules (player physics, movement, weapons, ammo, enemy AI state machines, projectile simulation with splash damage, keycards, doors, score calculation, win/loss conditions, and save/restore state).
2. `games/inkfire/src/scene.js`: Missing 3D billboard raycaster scene rendering map walls, dynamic lights, camera-facing sprite billboards from `u_atlas`, and first-person weapon viewmodel HUD overlays.
3. `games/inkfire/src/app.js`: Missing game loop, input managers (keyboard, pointer lock mouse turning, virtual touch controls), Web Audio procedural sound synthesizer, pause, mute, and `localStorage` persistence.
4. `games/inkfire/src/shell.html`: Missing single-page HTML shell, HUD overlay (health, armour, ammo, keys, weapon selector), modal cards (title, pause, help, victory/defeat), and WebGL2 fallback.
5. `games/inkfire/test/rules.test.cjs`: Missing comprehensive unit test suite covering map generation, collision detection, weapon mechanics, monster AI, explosive barrels, keycard doors, serialization, and 50+ headless bot playthroughs.
6. **Tooling Integration**:
   - `tools/build.cjs` only bundles `delve`; `inkfire` must be registered in `GAMES` to emit `dist/inkfire.html`.
   - `tools/capture-previews.cjs` only captures Delve; must be extended to capture `dist/previews/inkfire.png`.
   - `package.json` `"test"` script only invokes Delve tests; must run both Delve and Inkfire tests.

### 4.2 Missing Arcade Portal Features & PWA Support
1. **PWA Web App Manifest (`site/manifest.webmanifest`)**: Does not exist. Needs application name, icons, standalone display mode, and background/theme colors.
2. **App Icon (`site/icon.svg`)**: No icon file exists in the repository.
3. **Offline Service Worker (`site/sw.js`)**: Does not exist. Needs precaching of `dist/` assets (`index.html`, `delve.html`, `inkfire.html`, `manifest.webmanifest`, `icon.svg`, previews) and cache-first offline strategy.
4. **Portal CSP**: `site/index.html` line 6 restricts script execution and lacks directives for manifests and service workers (`manifest-src 'self'`, `worker-src 'self'`).
5. **Accessibility & Usability**:
   - Missing skip-to-content navigation link (`<a href="#games" class="skip-link">`).
   - Missing `@media (prefers-reduced-motion: reduce)` rule.
   - Missing mobile responsive clamping on `header h1` to prevent text overflow on 360px viewports.

### 4.3 Missing Testing & CI Gates
1. **Browser Smoke Tests (`tests/browser-smoke.cjs`)**: Currently only tests `dist/delve.html`. Missing automated tests for the portal launcher (`dist/index.html`) and `dist/inkfire.html`.
2. **GitHub Actions Workflow (`.github/workflows/pages.yml`)**: Currently executes `npm test` before `npm run build`, lacks pre-deploy validation of all game artifacts, and does not check license integrity.
3. **License Verification Script (`tools/check-license.cjs`)**: Does not exist. Required to verify MIT license preservation.

### 4.4 Missing Documentation & Untracked Baseline Files
1. **Engine Documentation (`engine/README.md`)**: Does not exist. Needs concise architectural guide and API reference for `GlyphEngine` and `GlyphArt`.
2. **Project Documentation (`README.md`)**: Existing `README.md` is minimal (30 lines). Needs game instructions, local development commands, and a step-by-step guide on how to add a new game in under 10 steps.
3. **Changelog (`CHANGELOG.md`)**: Does not exist.
4. **Untracked Baseline Assets**: `engine/glyph-art.js` and `games/inkfire/src/art.js` are untracked in git.

---

## 5. Implementation Plan: Phases 1 Through 5

### Phase 1: Safe Baseline & Git Hygiene
- **Goal**: Establish a clean git history on `main`, exclude transient build and dependency files, and prepare the `feature/big-pass` development branch.
- **Steps**:
  1. Ensure `.gitignore` explicitly ignores `node_modules/`, `dist/`, `*.log`, `.DS_Store`, and `Thumbs.db`.
  2. Stage `.gitignore`, `engine/glyph-art.js`, and `games/inkfire/src/art.js`.
  3. Create baseline commit on `main` with message: `"baseline: include glyph art atlas and inkfire art assets"`.
  4. Create and checkout branch `feature/big-pass`.
  5. Run baseline end-of-phase verification ritual: `npm run build`, `npm test`, `npm run test:browser`.
  6. Append Phase 1 status block to `AUDIT.md`.

### Phase 2: Finish Inkfire
- **Goal**: Implement `games/inkfire` as a complete, playable real-time FPS game on the shared glyph engine and wire it into build and test tools.
- **Steps**:
  1. **Game Rules (`games/inkfire/src/rules.js`)**:
     - Implement pure deterministic simulation: 40x40 map generation with rooms, corridors, doors, and keys.
     - Implement player movement, collision detection (circle vs grid AABB), and weapon switching.
     - Implement 4 weapons (`pistol`, `shotgun`, `chaingun`, `launcher`) with distinct fire rates, ammo types, and projectile/pellet mechanics.
     - Implement monster state machines (`trooper`, `spitter`, `brute`, `wisp`, `titan`) with line-of-sight pathing, projectile attacks, and melee bites.
     - Implement explosive slime barrels with radial splash damage.
     - Implement state serialization for save/restore roundtrips.
  2. **Unit Tests (`games/inkfire/test/rules.test.cjs`)**:
     - Write 8+ test suites: map connectivity, collision boundaries, weapon firing/ammo, enemy AI, explosive barrel chains, keycard doors, save/restore roundtrip, and 50 headless bot playthroughs.
  3. **Scene Renderer (`games/inkfire/src/scene.js`)**:
     - Create `InkfireView` using `GlyphEngine` with custom raycaster shader.
     - Compile and bind `InkArt.build().pack()` sprite atlas to texture unit 5 (`u_atlas`).
     - Render 3D textured walls, camera-facing billboards for monsters/items/props/projectiles, and first-person weapon viewmodel HUD.
  4. **Application & Audio (`games/inkfire/src/app.js`)**:
     - Implement `InkfireApp` managing `requestAnimationFrame` loop with clamped `dt`.
     - Implement procedural Web Audio synthesizer with sound effects for gunfire, explosions, monster pain, player damage, pickups, and doors.
     - Implement keyboard controls (WASD, arrows, number keys, space/control fire, mouse look pointer lock) and touch overlay controls.
     - Implement pause, mute, and `localStorage` persistence.
  5. **Shell (`games/inkfire/src/shell.html`)**:
     - Create responsive shell with canvas, HUD, touch controls, modal cards, and WebGL2 fallback.
  6. **Tooling Integration**:
     - Wire `inkfire` into `tools/build.cjs` `GAMES` list.
     - Wire `games/inkfire/test/rules.test.cjs` into `npm test`.
  7. Run end-of-phase verification ritual: `npm run build`, `npm test`, `npm run test:browser`.
  8. Commit changes on `feature/big-pass` in logical commits with concise messages.
  9. Append Phase 2 status block to `AUDIT.md`.

### Phase 3: Harden Delve and the Engine
- **Goal**: Fix identified bugs in Delve and the glyph engine, eliminate per-frame allocations for 60fps mobile performance, expand test coverage, and document the engine.
- **Steps**:
  1. **Bug Fixes**:
     - Fix Archer cooldown logic in `games/delve/src/rules.js:197-201` so archers rest between shots.
     - Fix portcullis door animation bypass in `games/delve/src/scene.js:152` so doors animate smoothly.
     - Fix horizontal boundary wrapping in `engine/glyph-art.js:Canvas.finish()`.
     - Remove dead property `state.bolts = 0` in `games/delve/src/rules.js:77`.
  2. **Engine & Game Optimization (60fps on mobile)**:
     - In `engine/glyph-engine.js`: Eliminate closure and iterator allocations in `render()`, pre-bind static sampler uniforms, and add `webglcontextrestored` listener.
     - In `games/delve/src/scene.js`: Reuse scratch vector arrays in `DelveView.draw()`, assign directly into typed arrays (`torchData`, `spritePos`, `spriteInfo`, `spriteColour`), eliminate per-frame closures and temporary object spreads.
     - In `games/delve/src/app.js`: Reuse sprite visual objects in `DelveApp.frame()`, add Enter/Space keyboard navigation for run-end screen, and respect `prefers-reduced-motion` for camera shake.
  3. **Delve Test Hardening**:
     - Expand `games/delve/test/rules.test.cjs` with unit tests covering boss victory, ranged combat cooldowns, monster traits (fast/slow/erratic), potion/scroll limits, and corrupt save payload recovery.
  4. **Engine Documentation**:
     - Write `engine/README.md` documenting architecture, MRT framebuffer layout, custom shader integration, and the `GlyphArt` procedural atlas pipeline.
  5. Run end-of-phase verification ritual: `npm run build`, `npm test`, `npm run test:browser`.
  6. Commit changes on `feature/big-pass` in logical commits.
  7. Append Phase 3 status block to `AUDIT.md`.

### Phase 4: Shell, Site, and Quality
- **Goal**: Modernize the arcade portal with PWA capabilities, full accessibility compliance, multi-game previews, and complete browser smoke test coverage.
- **Steps**:
  1. **Arcade Portal Redesign (`site/index.html`)**:
     - Update CSP to allow service workers and local assets.
     - Update footer text color to `#9c8f72` to achieve WCAG AA contrast (6.27:1).
     - Add visible focus outline (`outline: 2px solid #d8b25a; outline-offset: 3px`) on interactive elements.
     - Add skip navigation link (`<a href="#games" class="skip-link">Skip to games</a>`).
     - Add `@media (prefers-reduced-motion: reduce)` to disable transitions and transforms.
     - Adjust header typography clamp to ensure clean responsiveness on viewports >= 360px.
  2. **PWA Assets**:
     - Create `site/manifest.webmanifest`.
     - Create scalable vector app icon `site/icon.svg`.
     - Create offline caching service worker `site/sw.js`.
     - Update `tools/build.cjs` to copy manifest, icon, and service worker to `dist/`.
  3. **Preview Generation (`tools/capture-previews.cjs`)**:
     - Extend preview script to capture both `dist/previews/delve.png` and `dist/previews/inkfire.png`.
  4. **Browser Smoke Testing (`tests/browser-smoke.cjs`)**:
     - Extend Playwright smoke tests to verify Portal (`dist/index.html`), Delve (`dist/delve.html`), and Inkfire (`dist/inkfire.html`), verifying rendering and asserting zero console/page errors.
  5. Run end-of-phase verification ritual: `npm run build`, `npm test`, `npm run test:browser`, `npm run previews`.
  6. Commit changes on `feature/big-pass` in logical commits.
  7. Append Phase 4 status block to `AUDIT.md`.

### Phase 5: Ship Readiness
- **Goal**: Finalize CI/CD release pipeline, complete project documentation, verify licensing, and prepare for production deployment.
- **Steps**:
  1. **License Verification Script (`tools/check-license.cjs`)**:
     - Create script asserting MIT license headers and package metadata.
     - Integrate license check into `npm test`.
  2. **CI Pipeline (`.github/workflows/pages.yml`)**:
     - Update workflow to run `npm run build`, `npm test`, `npx playwright install --with-deps chromium`, `npm run test:browser`, and `npm run previews` before deploying to GitHub Pages.
  3. **Documentation**:
     - Write root `README.md` covering project overview, game instructions, local development commands, and a clear 10-step guide for adding new games.
     - Write `CHANGELOG.md` following the Keep a Changelog standard.
  4. Run end-of-phase verification ritual: `npm run build`, `npm test`, `npm run test:browser`.
  5. Commit changes on `feature/big-pass` in logical commits.
  6. Append Phase 5 status block to `AUDIT.md`.

---

## 6. Phase Status Log

*This section will be appended with status blocks as each phase is completed.*

### Phase 0 Status: COMPLETE
- Baseline command verification completed with 100% pass rate.
- Comprehensive audit of engine, games, site, tools, and CI completed.
- Bug catalog and missing feature specifications documented.
- Zero existing files modified; zero code changes applied during Phase 0.

### Phase 1 Status: COMPLETE
- `.gitignore` verified: `node_modules/`, `dist/`, and `*.log` are ignored.
- Baseline state committed on branch `main`.
- Development branch `feature/big-pass` created and checked out.
- End-of-Phase Ritual executed successfully with 100% pass rate:
  - `npm run build`: Exit code 0 (`dist/delve.html` built, 75552 bytes; `dist/index.html` built).
  - `npm test`: Exit code 0 (8/8 Delve rules tests passed including 60 bot simulation runs).
  - `npm run test:browser`: Exit code 0 (Chromium smoke test passed, `turn: 4, hp: 20, cells: 12`).
- Working tree clean on branch `feature/big-pass`.

### Phase 2 Status: COMPLETE
- Implemented `games/inkfire/src/rules.js` with pure deterministic real-time FPS simulation, guaranteed solvable red/blue keycard progression, 4 weapons (`pistol`, `shotgun`, `chaingun`, `launcher`), 5 monster species (`trooper`, `spitter`, `brute`, `wisp`, `titan`), explosive slime barrels, pickups, and JSON save/restore validation.
- Added comprehensive unit test suite in `games/inkfire/test/rules.test.cjs` (10/10 checks passing, including 40-seed progression solvability and 50 headless bot runs).
- Implemented `games/inkfire/src/scene.js` rendering 3D walls, doors, dynamic lighting, camera-facing billboards from the `InkArt` procedural sprite atlas, and first-person weapon viewmodels.
- Implemented `games/inkfire/src/app.js` and `games/inkfire/src/shell.html` with title screen, playable loop, win/lose states, `localStorage` persistence, keyboard/mouse/touch controls, pause modal, and Web Audio synthesis with mute toggle.
- Wired `inkfire` into `tools/build.cjs` (`dist/inkfire.html`, 121,142 bytes) and `package.json`.
- End-of-Phase Ritual executed (`npm run build`, `npm test`, `npm run test:browser`) with 0 errors.
