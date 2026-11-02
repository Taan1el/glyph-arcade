# Glyph Engine

The shared rendering engine for Glyph Arcade (`engine/glyph-engine.js` and `engine/glyph-art.js`). It renders 3D or 2D game scenes entirely out of coloured 5×7 character cells using a two-pass WebGL2 pipeline with zero external font or image assets.

## Architecture

1. **Pass 1 — Scene Pass (`columns × rows` resolution)**:
   A game-supplied GLSL fragment shader runs once per character cell and writes three `RGBA8UI` render targets via `writeCell(...)`:
   - `out_record` (`uvec4`): `[glyph_code, material_id, flags, log_depth]`
   - `out_foreground` (`uvec4`): `[r, g, b, 255]`
   - `out_background` (`uvec4`): `[r, g, b, 255]`
2. **Pass 2 — Display Composite (`canvas.width × canvas.height` physical resolution)**:
   Reads the cell buffers, detects depth silhouettes across neighbouring cells to draw oriented ink outlines (`/`, `\`, `|`, `_`, `-`), samples the 5×7 bitmask font texture (`u_masks`), shades each letter, and applies screen-wide `tint` and `dissolve` effects.

## `GlyphEngine` API (`engine/glyph-engine.js`)

### `new GlyphEngine(canvas, { sceneSource, uniforms = [], far = 100 })`
Creates a WebGL2 context and links the scene and display shaders.
- `canvas`: `HTMLCanvasElement`
- `sceneSource`: GLSL ES 3.00 fragment body (automatically receives `SCENE_HEADER` utilities).
- `uniforms`: Array of custom uniform base names (without the `u_` prefix). For example, `'map'` resolves uniform location `u_map` and exposes it as `locations.map`.
- `far`: Far clip distance used for logarithmic depth encoding.

### Built-in GLSL Scene Helpers (`SCENE_HEADER`)
- `uniform vec2 u_viewport`: Logical viewport size in CSS pixels.
- `uniform vec2 u_cellSize`: Size of one character cell in CSS pixels (e.g., `[8, 12]`).
- `uniform float u_time`: Elapsed time in seconds.
- `uniform float u_far`: Far plane distance.
- `float hash21(vec2 p)`: Deterministic 2D hash in `[0, 1)`.
- `bool glyphBit(uint glyph, int column, int row)`: Returns whether bit `(column 0..4, row 0..6)` of ASCII `glyph` is set.
- `float cellAngle()`: Angular height of one character cell for distance-aware detail.
- `void writeCell(uint glyph, uint material, uint flags, float distance, vec3 foreground, vec3 background)`: Writes the cell outputs.
  - `flags` bit `1u`: Disable automatic silhouette ink outlines on this cell.
  - `flags` bit `2u`: Flat foreground colour (disable vertical cell gradient).

### Instance Methods
- `engine.resize(width, height, cellSize = [8, 12])`: Resizes the physical canvas (`devicePixelRatio` clamped to 1..`engine.maxDpr`, default 2) and reallocates the character-cell framebuffer.
- `engine.setTexture(name, unitIndex, width, height, data)`: Uploads a `Uint8Array` as an `RGBA8UI` integer texture (`usampler2D`) and binds it to `TEXTURE0 + unitIndex` on uniform `u_<name>`. Use `unitIndex >= 4` (units `0..3` are reserved by the engine).
- `engine.render(setUniforms, { time = 0, ink = true, tint = [0,0,0,0], dissolve = 0 })`: Executes Pass 1 (`setUniforms(gl, locations)`) followed by Pass 2.
- `engine.inspect()`: Reads back `{ columns, rows, glyphs, materials }` from the cell framebuffer for automated testing.
- `engine.destroy()`: Releases all WebGL programs, textures, framebuffers, and event listeners.

## `GlyphPad` (`engine/glyph-input.js`)

Reads the first connected gamepad using the standard mapping.

- `pad.poll()`: Call once per frame.
- `pad.axis(i)`: Stick value with the deadzone applied (0/1 left stick, 2/3 right stick).
- `pad.held(i)` / `pad.pressed(i)`: Button state, and whether it went down this frame.

## `GlyphQuality` (`engine/glyph-quality.js`)

Steps quality down when frames run long and never steps back up. See [`PERF.md`](../PERF.md).

- `new GlyphQuality(onChange)`: `onChange` should re-run the game's resize.
- `quality.sample(frameMs)`: Call once per frame.
- `quality.setting.maxDpr`: Assign to `engine.maxDpr` before `engine.resize(...)`.
- `quality.cell([w, h])`: Scales a base cell size for the current level.

## `GlyphArt` API (`engine/glyph-art.js`)

Procedural pixel-art helper that packs small sprites into a single `RGBA8UI` texture atlas where each texel becomes a shaded character cell in the scene shader.

- `new GlyphArt.Canvas(width, height)`: Creates a raster grid (up to `48×48`).
  - `.set(x, y, colour)` / `.get(x, y)`
  - `.rect(x, y, w, h, colour)`
  - `.ellipse(cx, cy, rx, ry, colour)`
  - `.line(x0, y0, x1, y1, colour, width = 1)`
  - `.mirrorRows(from, to)`
  - `.finish({ outline = [.06, .05, .05], shade = true })`: Applies top-left highlight shading, bottom-right shadow shading, and a 1px dark outline around non-glowing pixels.
- `GlyphArt.hex('#rrggbb')`: Converts a hex string into `[r, g, b]` floats in `0..1`.
- `GlyphArt.SHADER`: GLSL source for `atlasGlyph(texel, px, py)`, which picks the shading letter for an atlas texel. Include it in a scene shader that samples an atlas.
- `GlyphArt.glow(colour)`: Marks a colour as self-lit (stored with alpha `200` in the atlas).
- `new GlyphArt.Atlas()`:
  - `.add(name, canvas)`: Registers a named sprite frame.
  - `.index(name)`: Returns the integer slot index for shader lookup.
  - `.info(name)`: Returns `{ width, height }` as fractions of `GlyphArt.SLOT` (`48`).
  - `.pack()`: Packs all frames into a 16-column `Uint8Array` (`{ width, height, data, columns }`) ready for `engine.setTexture('atlas', 5, packed.width, packed.height, packed.data)`.
