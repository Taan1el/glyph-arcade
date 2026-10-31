# Glyph Arcade

Small browser games drawn entirely in coloured letters. Every game builds into **one self-contained offline HTML file**: no installs, no network requests, and no external image or font files. All games share a two-pass WebGL2 character-cell engine (`engine/glyph-engine.js`, `engine/glyph-art.js`).

![Delve: a skeleton, goblin and bat drawn as giant letters in a dungeon room](docs/delve-preview.png)

## Games

| Game | Genre & Overview |
|---|---|
| **Delve** | A first-person, turn-based roguelike across five seeded dungeon floors with permadeath, equipment upgrades, potions, mapping scrolls, and a lich on floor 5. Every monster and item is a giant 3D letter built out of small ones. |
| **Inkfire** | A fast-paced, real-time first-person arena shooter. Navigate a procedurally generated sector, collect Red and Blue keycards, wield four distinct weapons, detonate slime barrels, defeat the cybernetic Titan, and reach the exit pad. |
| [Next Stop](https://github.com/Taan1el/next-stop) | A rural steam railway in coloured letters ([play](https://taan1el.github.io/next-stop/)). Lives in its own repository. |

## How to Play

### Delve Controls

| Key / Input | Action |
|---|---|
| `W` / `S`, `↑` / `↓` | Step forward / back. Walking into a monster attacks it; walking into a door opens its portcullis. |
| `A` / `D` | Sidestep left / right. |
| `Q` / `E`, `←` / `→` | Turn left / right (free action; all other actions advance the turn). |
| `1` / `2` | Drink a healing potion / read a scroll of mapping. |
| `Enter` / `.` | Descend when standing on stairs (`>`). |
| `Space` · `M` · `Esc` | Wait one turn · toggle large minimap · open help / menu. |

### Inkfire Controls

| Key / Input | Action |
|---|---|
| `W` / `S`, `↑` / `↓` | Move forward / backward. |
| `A` / `D` | Strafe left / right. |
| `Q` / `E`, `←` / `→`, Mouse | Turn left / right (click the viewport to enable mouse-look). |
| `Space` / `F` / Left Click | Fire equipped weapon. |
| `1` / `2` / `3` / `4` | Switch weapon: Pistol, Shotgun, Chaingun, Rocket Launcher. |
| `E` / `Enter` | Open nearby door (colored doors require matching Red or Blue keycard). |
| `P` / `Esc` · `M` | Pause / resume game · toggle large radar map. |

Both games include on-screen touch controls for mobile and tablet devices, persistent high scores and active run saves in `localStorage`, and a mute toggle for Web Audio sound effects.

## How to Run, Build, and Test

Requires **Node.js 20** or newer.

```sh
npm install          # Install dev dependencies (Playwright)
npm run build        # Bundle dist/delve.html, dist/inkfire.html, dist/index.html, and PWA assets
npm test             # Verify MIT license and run headless rule & bot test suites for all games
npx playwright install chromium
npm run test:browser # Boot the portal and every game in headless Chromium and fail on any console/page error
npm run previews     # Capture dist/previews/delve.png and dist/previews/inkfire.png
```

Once built, open `dist/index.html` (or any `dist/<game>.html`) directly in a browser, or serve `dist/` with any static HTTP server to enable the offline PWA service worker.

## How to Add a Game in Under 10 Steps

1. **Create the game folder**: Add `games/<id>/src/` and `games/<id>/test/`.
2. **Write pure rules (`games/<id>/src/rules.js`)**: Implement deterministic game state creation, step/turn functions, scoring, and `restore()` validation with zero DOM dependencies, and attach your module to `global.<GameName>`.
3. **Add unit tests (`games/<id>/test/rules.test.cjs`)**: Test map/level generation, determinism, rules edge cases, save/restore round-trips, and a headless bot run using Node's `vm` and `assert/strict`.
4. **Build the scene renderer (`games/<id>/src/scene.js`)**: Instantiate `new GlyphEngine(canvas, { sceneSource, uniforms, far })` (and optionally `GlyphArt.Atlas` for procedural sprites) to write character cells via `writeCell(...)` in your GLSL fragment shader. See [`engine/README.md`](engine/README.md) for the full engine API.
5. **Create the app loop (`games/<id>/src/app.js`)**: Connect keyboard/touch inputs, Web Audio sound effects, HUD updates, pause/mute, and `localStorage` persistence to your rules and scene.
6. **Create the HTML shell (`games/<id>/src/shell.html`)**: Include the three bundler markers (`<!--__LICENSE__-->`, `<!--__META__-->`, and `<script>/*__CODE__*/</script>`) along with your HUD and modal cards.
7. **Register the game (`tools/build.cjs` & `package.json`)**: Add an entry to `GAMES` in `tools/build.cjs` listing your `parts` and `shell`, and add your test file to `"test"` in `package.json`.
8. **Add preview & smoke checks (`tools/capture-previews.cjs` & `tests/browser-smoke.cjs`)**: Stage a preview screenshot in `tools/capture-previews.cjs` and add a gameplay smoke assertion in `tests/browser-smoke.cjs`, then run `npm run build && npm test && npm run previews && npm run test:browser`.

## License

MIT licensed. See [`LICENSE`](LICENSE).
