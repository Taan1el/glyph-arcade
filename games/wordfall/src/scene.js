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

    vec3 ground3 = mix(vec3(0.02, 0.03, 0.06), vec3(0.035, 0.055, 0.09), float(cy) / max(1.0, float(grid.y)));
    float column = float(cx);
    float fall = floor(float(cy) * 0.5 - u_time * (2.0 + 4.0 * hash21(vec2(column, 1.0))));
    float rain = hash21(vec2(column, fall));
    if (rain > 0.962) {
      uint letter = 65u + uint(floor(hash21(vec2(fall, column)) * 26.0));
      writeCell(letter, 1u, 3u, 1.0, vec3(0.12, 0.19, 0.28), ground3);
    } else if (hash21(vec2(column, floor(float(cy) * 0.7)) * 2.1) > 0.992) {
      writeCell(46u, 1u, 3u, 1.0, vec3(0.18, 0.24, 0.34), ground3);
    } else {
      writeCell(32u, 1u, 3u, 1.0, ground3, ground3);
    }

    // Beveled steel pillars flanking the 9-lane well
    if (cy >= u_top - 1 && cy <= ground + 4) {
      int pLeft = left - 1 - cx, pRight = cx - right;
      int px = (pLeft >= 0 && pLeft < 3) ? pLeft : (pRight >= 0 && pRight < 3) ? pRight : -1;
      if (px >= 0) {
        bool inner = px == 0;
        bool rivet = px == 1 && (cy % 6 == 0);
        vec3 col = inner ? vec3(0.46, 0.60, 0.74) : rivet ? vec3(0.75, 0.68, 0.44) : (px == 1 ? vec3(0.26, 0.34, 0.44) : vec3(0.15, 0.20, 0.26));
        uint g = inner ? 124u : rivet ? 79u : (cy % 2 == 0 ? 35u : 61u);
        writeCell(g, 2u, 3u, 1.0, col, col * 0.36);
        return;
      }
    }
    if (cx < left || cx >= right) return;

    // Subtle vertical lane tracks inside the drop zone
    int lOff = (cx - left) % laneWidth;
    if (cy >= u_top && cy < ground && cx > left && lOff == 0 && (cy % 4 == 0)) {
      writeCell(58u, 1u, 3u, 1.0, vec3(0.15, 0.24, 0.34), ground3);
    }

    // Drawn multi-cell Catcher Hopper & steel track plinth along bottom
    if (cy >= ground - 1 && cy <= ground + 4) {
      int laneIdx = (cx - left) / laneWidth;
      int lx = (cx - left) - laneIdx * laneWidth;
      bool inPad = lx >= 2 && lx < laneWidth - 2;
      bool arm = inPad && (lx < 5 || lx >= laneWidth - 5);
      if (laneIdx == u_player) {
        if (cy == ground - 1 && arm) {
          vec3 gold = vec3(1.0, 0.88, 0.42);
          writeCell(lx < 5 ? 92u : 47u, 3u, 3u, 1.0, gold, gold * 0.35);
          return;
        }
        if (cy == ground && inPad) {
          vec3 gold = vec3(1.0, 0.86, 0.38);
          uint g = arm ? 35u : 61u;
          writeCell(g, 3u, 3u, 1.0, gold, gold * 0.42);
          return;
        }
        if (cy == ground + 1 && inPad) {
          vec3 amber = vec3(0.95, 0.66, 0.22);
          uint g = (lx % 4 == 0) ? 42u : 61u;
          writeCell(g, 3u, 3u, 1.0, amber, amber * 0.40);
          return;
        }
        if (cy == ground + 2 && lx >= 4 && lx < laneWidth - 4) {
          vec3 thr = vec3(0.38, 0.86, 1.0);
          writeCell(lx % 3 == 0 ? 42u : 45u, 4u, 3u, 1.0, thr, thr * 0.32);
          return;
        }
      }
      if (cy == ground + 2 || cy == ground + 3) {
        bool topRim = cy == ground + 2;
        vec3 baseCol = topRim ? vec3(0.24, 0.32, 0.42) : vec3(0.14, 0.19, 0.26);
        uint g = topRim ? (lOff == 0 ? 43u : 95u) : (cx % 3 == 0 ? 35u : 45u);
        writeCell(g, 2u, 3u, 1.0, baseCol, baseCol * 0.45);
        return;
      }
      if (cy == ground + 4) {
        vec3 rimCol = vec3(0.10, 0.14, 0.20);
        writeCell(61u, 2u, 3u, 1.0, rimCol, rimCol * 0.5);
        return;
      }
    }

    // Soft catcher guidance ticks rising 3 cells in the active lane
    if (cy >= ground - 4 && cy < ground - 1) {
      int laneIdx = (cx - left) / laneWidth;
      int lx = (cx - left) - laneIdx * laneWidth;
      if (laneIdx == u_player && (lx == 2 || lx == laneWidth - 3) && ((cy + int(u_time * 6.0)) % 2 == 0)) {
        writeCell(58u, 2u, 3u, 1.0, vec3(0.65, 0.52, 0.22), ground3);
      }
    }

    for (int i = 0; i < u_count; i++) {
      uvec4 sprite = texelFetch(u_sprites, ivec2(i, 0), 0);
      int x = left + int(sprite.g) * laneWidth + (laneWidth - 5 * scale) / 2;
      int y = u_top + int(float(sprite.b) / 255.0 * float(height - 7 * scale));
      int dx = cx - x, dy = cy - y;
      bool hitMain = dx >= 0 && dy >= 0 && dx < 5 * scale && dy < 7 * scale && glyphBit(sprite.r, dx / scale, dy / scale);
      if (hitMain) {
        vec3 colour = sprite.a == 1u ? vec3(1.0, 0.84, 0.34) : vec3(0.46, 0.74, 0.88);
        if (sprite.a == 1u) {
          float pulse = 0.92 + 0.14 * sin(u_time * 7.0 - float(dy) * 0.45);
          colour *= pulse;
        }
        // Lit from above, with a darker rim on each stroke, so the big letters look solid.
        float shade = 1.24 - 0.46 * float(dy) / float(7 * scale);
        bool rim = !glyphBit(sprite.r, (dx + 1) / scale, dy / scale) || !glyphBit(sprite.r, dx / scale, (dy + 1) / scale);
        bool hi = !glyphBit(sprite.r, max(0, dx - 1) / scale, dy / scale) || !glyphBit(sprite.r, dx / scale, max(0, dy - 1) / scale);
        if (scale > 1) colour *= rim ? shade * 0.68 : hi ? shade * 1.15 : shade;
        else colour *= shade;
        writeCell(sprite.r, 4u, 3u, 1.0, colour, colour * 0.42);
        return;
      }
      // 1-cell dark extruded drop shadow to the bottom-right
      int sdx = dx - 1, sdy = dy - 1;
      if (sdx >= 0 && sdy >= 0 && sdx < 5 * scale && sdy < 7 * scale && glyphBit(sprite.r, sdx / scale, sdy / scale)) {
        vec3 shadowCol = sprite.a == 1u ? vec3(0.32, 0.22, 0.06) : vec3(0.10, 0.18, 0.26);
        writeCell(35u, 1u, 3u, 1.0, shadowCol, shadowCol * 0.6);
        return;
      }
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
      this.bottom = 7 + Math.ceil(reservedBottom / cellSize[1]);
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
