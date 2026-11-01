/* Wordfall scene: giant falling letters, each built from small letters, over a dim
 * rain of glyphs. Everything is drawn per character cell from one sprite texture. */
(function (global) {
  'use strict';

  const SPRITES = 32;
  const SCENE = `
  uniform usampler2D u_sprites;
  uniform int u_count;
  uniform int u_lanes;
  uniform int u_player;
  uniform int u_top;
  uniform int u_bottom;
  void main() {
    ivec2 grid = ivec2(ceil(u_viewport / u_cellSize));
    int cx = int(gl_FragCoord.x), cy = grid.y - 1 - int(gl_FragCoord.y);
    int scale = max(1, min(grid.x / (u_lanes * 6), grid.y / 30));
    int laneWidth = max(5 * scale, min(grid.x / u_lanes, 8 * scale));
    int left = (grid.x - laneWidth * u_lanes) / 2, right = left + laneWidth * u_lanes;
    int ground = grid.y - u_bottom, height = ground - u_top;

    vec3 ground3 = vec3(0.025, 0.03, 0.05);
    float column = float(cx);
    float fall = floor(float(cy) * 0.5 - u_time * (2.0 + 4.0 * hash21(vec2(column, 1.0))));
    float rain = hash21(vec2(column, fall));
    if (rain > 0.965) {
      uint letter = 65u + uint(floor(hash21(vec2(fall, column)) * 26.0));
      writeCell(letter, 1u, 3u, 1.0, vec3(0.1, 0.16, 0.24), ground3);
    } else {
      writeCell(32u, 1u, 3u, 1.0, ground3, ground3);
    }

    if (cy >= u_top && cy <= ground && (cx == left - 1 || cx == right)) {
      writeCell(124u, 2u, 3u, 1.0, vec3(0.3, 0.42, 0.52), ground3);
      return;
    }
    if (cx < left || cx >= right) return;

    if (cy == ground + 1) {
      bool here = (cx - left) / laneWidth == u_player;
      if (here) writeCell(61u, 3u, 3u, 1.0, vec3(1.0, 0.85, 0.4), ground3);
      else writeCell(95u, 2u, 3u, 1.0, vec3(0.2, 0.28, 0.36), ground3);
      return;
    }

    for (int i = 0; i < u_count; i++) {
      uvec4 sprite = texelFetch(u_sprites, ivec2(i, 0), 0);
      int x = left + int(sprite.g) * laneWidth + (laneWidth - 5 * scale) / 2;
      int y = u_top + int(float(sprite.b) / 255.0 * float(height - 7 * scale));
      int dx = cx - x, dy = cy - y;
      if (dx < 0 || dy < 0 || dx >= 5 * scale || dy >= 7 * scale) continue;
      if (!glyphBit(sprite.r, dx / scale, dy / scale)) continue;
      vec3 colour = sprite.a == 1u ? vec3(1.0, 0.8, 0.3) : vec3(0.45, 0.72, 0.85);
      writeCell(sprite.r, 4u, 3u, 1.0, colour, ground3);
      return;
    }
  }`;

  class WordfallView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['sprites', 'count', 'lanes', 'player', 'top', 'bottom'] });
      this.data = new Uint8Array(SPRITES * 4);
      this.engine.setTexture('sprites', 4, SPRITES, 1, this.data);
    }
    resize(width, height, cellSize, reservedBottom = 0) {
      this.engine.resize(width, height, cellSize);
      this.top = Math.ceil(100 / cellSize[1]);
      this.bottom = 3 + Math.ceil(reservedBottom / cellSize[1]);
    }
    draw({ state, time, tint }) {
      const { data } = this;
      const want = state ? global.Wordfall.needed(state) : '';
      const count = state ? Math.min(SPRITES, state.drops.length) : 0;
      for (let i = 0; i < count; i++) {
        const drop = state.drops[i], at = i * 4;
        data[at] = drop.glyph.charCodeAt(0);
        data[at + 1] = drop.lane;
        data[at + 2] = Math.round(Math.min(1, drop.y) * 255);
        data[at + 3] = drop.glyph === want ? 1 : 0;
      }
      this.engine.setTexture('sprites', 4, SPRITES, 1, data);
      this.engine.render((gl, u) => {
        gl.uniform1i(u.count, count);
        gl.uniform1i(u.lanes, global.Wordfall.LANES);
        gl.uniform1i(u.player, state ? state.lane : Math.floor(global.Wordfall.LANES / 2));
        gl.uniform1i(u.top, this.top);
        gl.uniform1i(u.bottom, this.bottom);
      }, { time, ink: false, tint });
    }
    inspect() { return this.engine.inspect(); }
  }

  global.WordfallView = WordfallView;
})(window);
