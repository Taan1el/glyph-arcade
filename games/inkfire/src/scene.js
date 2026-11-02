/* Inkfire view: 3D raycaster + sprite atlas billboard renderer + weapon HUD
 * built on the shared GlyphEngine and GlyphArt atlas. */
(function (global) {
  'use strict';

  const MAX_SPRITES = 64;
  const MAX_LIGHTS = 16;
  const WALL_HEIGHT = 2.2;
  const SLOT = global.GlyphArt ? global.GlyphArt.SLOT : 48;

  const SCENE = `
  const float H = ${WALL_HEIGHT.toFixed(2)};
  uniform usampler2D u_map;
  uniform usampler2D u_atlas;
  uniform int u_size;
  uniform vec3 u_eye;
  uniform vec3 u_forward;
  uniform vec3 u_right;
  uniform vec3 u_up;
  uniform vec4 u_lights[${MAX_LIGHTS}];
  uniform vec3 u_lightColours[${MAX_LIGHTS}];
  uniform int u_lightCount;
  uniform vec4 u_spritePos[${MAX_SPRITES}];
  uniform vec4 u_spriteInfo[${MAX_SPRITES}];
  uniform int u_spriteCount;
  uniform int u_weaponFrame;
  uniform float u_weaponBobX;
  uniform float u_weaponBobY;
  uniform float u_muzzleFlash;

  uvec4 tile(ivec2 c) {
    if (c.x < 0 || c.y < 0 || c.x >= u_size || c.y >= u_size) return uvec4(0u);
    return texelFetch(u_map, c, 0);
  }

  vec3 calcLight(vec3 p, vec3 n, vec3 base) {
    vec3 total = base * vec3(0.14, 0.14, 0.18);
    vec3 toCam = u_eye - p;
    float camDist = length(toCam);
    float flashBoost = 1.0 + u_muzzleFlash * 1.6;
    total += base * vec3(0.95, 0.85, 0.70) * (0.85 * flashBoost) * max(0.2, dot(n, toCam / max(camDist, 0.01))) / (1.0 + camDist * camDist * 0.14);
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= u_lightCount) break;
      vec3 toL = u_lights[i].xyz - p;
      float d = length(toL);
      float intensity = u_lights[i].w;
      total += base * u_lightColours[i] * intensity * max(0.18, dot(n, toL / max(d, 0.01))) / (1.0 + d * d * 0.22);
    }
    return total;
  }

  float footprint(float t, vec3 n, vec3 rd) {
    return t * cellAngle() / max(0.15, abs(dot(n, -rd)));
  }

  uint wallGlyph(vec2 uv, float fp, uint kind, out float shade) {
    if (kind == 5u) {
      // Exit portal wall trim
      shade = 0.9 + 0.25 * sin(uv.y * 8.0 - u_time * 4.0);
      return fract(uv.y * 3.0) < 0.3 ? 61u : 42u;
    }
    float row = floor(uv.y / 0.45);
    float u = uv.x / 0.9 + mod(row, 2.0) * 0.5;
    vec2 local = vec2(fract(u), fract(uv.y / 0.45));
    float panel = hash21(vec2(floor(u), row));
    shade = 0.80 + 0.28 * panel;
    if (fp < 0.20) {
      bool hSeam = local.y < 0.10;
      bool vSeam = local.x < 0.07;
      if (hSeam && vSeam) { shade *= 0.55; return 43u; }
      if (hSeam) { shade *= 0.62; return 45u; }
      if (vSeam) { shade *= 0.62; return 124u; }
    }
    float detail = hash21(floor(uv * vec2(6.0, 5.0) / max(1.0, fp * 4.0)));
    return panel > 0.85 ? 35u : detail > 0.65 ? 61u : detail > 0.30 ? 58u : 46u;
  }

  uint floorGlyph(vec2 xz, uint kind, float fp, out float shade) {
    if (kind == 5u) {
      shade = 0.95 + 0.2 * sin(u_time * 5.0);
      return 62u; // '>' exit pad
    }
    vec2 local = fract(xz);
    float tileHash = hash21(floor(xz) * 1.3);
    shade = 0.78 + 0.25 * tileHash;
    if (fp < 0.28 && (local.x < 0.06 || local.y < 0.06)) {
      shade *= 0.6;
      return (local.x < 0.06 && local.y < 0.06) ? 43u : local.x < 0.06 ? 124u : 45u;
    }
    float grit = hash21(floor(xz * 5.0 / max(1.0, fp * 5.0)));
    return grit > 0.82 ? 44u : grit > 0.65 ? 58u : 46u;
  }

  ${global.GlyphArt.SHADER}

  void main() {
    vec2 screen = (gl_FragCoord.xy * u_cellSize) / u_viewport * 2.0 - 1.0;
    vec3 rd = normalize(u_forward + u_right * screen.x * (u_viewport.x / u_viewport.y) * 0.78 + u_up * screen.y * 0.78);

    float tPlane = rd.y < -0.0001 ? (0.0 - u_eye.y) / rd.y : rd.y > 0.0001 ? (H - u_eye.y) / rd.y : 1e9;
    ivec2 cell = ivec2(floor(u_eye.xz));
    vec2 dir = rd.xz;
    vec2 delta = abs(1.0 / max(abs(dir), vec2(1e-5)));
    ivec2 stepDir = ivec2(sign(dir));
    vec2 side = (vec2(stepDir) * (vec2(cell) - u_eye.xz) + vec2(stepDir) * 0.5 + 0.5) * delta;

    float tWall = 1e9;
    vec3 wallN = vec3(0.0);
    uint wallKind = 0u;
    float doorOpen = 0.0;

    for (int i = 0; i < 64; i++) {
      float t;
      int axis;
      if (side.x < side.y) {
        t = side.x; side.x += delta.x; cell.x += stepDir.x; axis = 0;
      } else {
        t = side.y; side.y += delta.y; cell.y += stepDir.y; axis = 1;
      }
      if (t > tPlane || t > u_far) break;
      uvec4 data = tile(cell);
      float y = u_eye.y + rd.y * t;
      bool isDoor = (data.r == 2u || data.r == 3u || data.r == 4u);
      float openFrac = float(data.g) / 255.0;
      if (data.r == 0u || (isDoor && y > openFrac * H)) {
        tWall = t;
        wallKind = data.r;
        doorOpen = openFrac;
        wallN = axis == 0 ? vec3(-float(stepDir.x), 0.0, 0.0) : vec3(0.0, 0.0, -float(stepDir.y));
        break;
      }
    }

    float tHit = min(tWall, tPlane);
    vec3 fg = vec3(0.0), bg = vec3(0.0);
    uint glyph = 32u, material = 0u, flags = 0u;
    vec3 fogColour = vec3(0.015, 0.012, 0.018);

    if (tHit < u_far) {
      vec3 p = u_eye + rd * tHit;
      vec3 n;
      vec3 base;
      float shade = 1.0;
      if (tWall < tPlane) {
        n = wallN;
        vec2 uv = vec2(abs(n.x) > 0.5 ? p.z : p.x, p.y);
        float fp = footprint(tHit, n, rd);
        if (wallKind == 2u || wallKind == 3u || wallKind == 4u) {
          material = 3u;
          base = wallKind == 3u ? vec3(0.78, 0.20, 0.16) : wallKind == 4u ? vec3(0.18, 0.42, 0.85) : vec3(0.46, 0.50, 0.56);
          float band = fract((uv.y - doorOpen * H) * 2.5);
          float bar = fract(uv.x * 4.0);
          shade = band < 0.2 ? 1.15 : bar < 0.25 ? 0.95 : 0.70;
          glyph = band < 0.2 ? 61u : bar < 0.25 ? 124u : 35u;
        } else {
          material = 1u;
          base = vec3(0.44, 0.43, 0.48);
          glyph = wallGlyph(uv, fp, wallKind, shade);
        }
      } else if (rd.y < 0.0) {
        n = vec3(0.0, 1.0, 0.0);
        uint kind = tile(ivec2(floor(p.xz))).r;
        float fp = footprint(tHit, n, rd);
        material = kind == 5u ? 5u : 2u;
        base = kind == 5u ? vec3(0.30, 0.85, 0.42) : vec3(0.32, 0.30, 0.34);
        glyph = floorGlyph(p.xz, kind, fp, shade);
      } else {
        n = vec3(0.0, -1.0, 0.0);
        material = 4u;
        base = vec3(0.24, 0.23, 0.28);
        float rib = fract(p.x * 0.5);
        shade = rib < 0.12 ? 1.15 : 0.68;
        glyph = rib < 0.12 ? 61u : 46u;
      }
      vec3 lit = calcLight(p, n, base * shade);
      fg = lit * 1.28 + vec3(0.015);
      bg = lit * 0.32;
    }

    // Camera-facing atlas billboards
    vec3 normal = -normalize(vec3(u_forward.x, 0.0, u_forward.z));
    vec3 across = normalize(vec3(u_right.x, 0.0, u_right.z));
    float tSprite = tHit;

    for (int i = 0; i < ${MAX_SPRITES}; i++) {
      if (i >= u_spriteCount) break;
      vec4 s = u_spritePos[i];
      vec4 info = u_spriteInfo[i];
      float denom = dot(rd, normal);
      if (abs(denom) < 1e-4) continue;
      float t = dot(s.xyz - u_eye, normal) / denom;
      if (t < 0.18 || t >= tSprite) continue;

      vec3 p = u_eye + rd * t;
      float slotSize = s.w;
      float u = dot(p - s.xyz, across) / (slotSize * 0.5) * 0.5 + 0.5;
      float v = (p.y - s.y) / slotSize;
      if (u < 0.0 || u >= 1.0 || v < 0.0 || v >= 1.0) continue;

      int frame = int(info.x);
      int slotX = (frame & 15) * ${SLOT};
      int slotY = (frame >> 4) * ${SLOT};
      int px = clamp(int(floor(u * ${SLOT}.0)), 0, ${SLOT - 1});
      int py = clamp(int(floor(v * ${SLOT}.0)), 0, ${SLOT - 1});
      uvec4 texel = texelFetch(u_atlas, ivec2(slotX + px, slotY + py), 0);
      if (texel.a == 0u) continue;

      tSprite = t;
      tHit = t;
      bool selfLit = texel.a == 200u || info.w > 0.5;
      vec3 base = vec3(texel.rgb) / 255.0;
      vec3 lit = selfLit ? base * 1.25 : calcLight(p, normal, base) * 1.55 + base * 0.14;
      lit = mix(lit, vec3(1.0, 0.92, 0.85), clamp(info.z, 0.0, 1.0));
      fg = lit * 1.25 + vec3(0.02);
      bg = lit * 0.38;
      glyph = atlasGlyph(texel, px, py);
      material = uint(info.y);
      flags = selfLit ? 3u : 0u;
    }

    float fog = 1.0 - exp(-tHit * 0.055);
    fg = mix(fg, fogColour, fog);
    bg = mix(bg, fogColour * 0.6, fog);
    if (tHit >= u_far) {
      glyph = 32u;
      fg = fogColour;
      bg = fogColour * 0.6;
    }

    // First-person weapon viewmodel overlay at bottom center
    if (u_weaponFrame >= 0) {
      vec2 wuv = vec2(
        (screen.x - u_weaponBobX) * 1.35 + 0.5,
        (screen.y + 1.0 - u_weaponBobY) * 1.25
      );
      if (wuv.x >= 0.0 && wuv.x < 1.0 && wuv.y >= 0.0 && wuv.y < 1.0) {
        int slotX = (u_weaponFrame & 15) * ${SLOT};
        int slotY = (u_weaponFrame >> 4) * ${SLOT};
        int px = clamp(int(floor(wuv.x * ${SLOT}.0)), 0, ${SLOT - 1});
        int py = clamp(int(floor(wuv.y * ${SLOT}.0)), 0, ${SLOT - 1});
        uvec4 texel = texelFetch(u_atlas, ivec2(slotX + px, slotY + py), 0);
        if (texel.a > 0u) {
          vec3 wBase = vec3(texel.rgb) / 255.0;
          vec3 wLit = wBase * (0.85 + u_muzzleFlash * 0.75);
          fg = wLit * 1.25 + vec3(0.03);
          bg = wLit * 0.36;
          glyph = atlasGlyph(texel, px, py);
          material = 30u;
          flags = 0u;
          tHit = 0.25;
        }
      }
    }

    writeCell(glyph, material, flags, tHit, fg, bg);
  }`;

  class InkfireView {
    constructor(canvas) {
      this.atlas = global.InkArt.build();
      const packed = this.atlas.pack();
      this.engine = new global.GlyphEngine(canvas, {
        sceneSource: SCENE,
        far: 38,
        uniforms: [
          'map', 'atlas', 'size', 'eye', 'forward', 'right', 'up',
          'lights', 'lightColours', 'lightCount',
          'spritePos', 'spriteInfo', 'spriteCount',
          'weaponFrame', 'weaponBobX', 'weaponBobY', 'muzzleFlash'
        ]
      });
      this.engine.setTexture('atlas', 5, packed.width, packed.height, packed.data);
      this.mapData = null;
      this.size = 0;

      // Preallocated typed arrays to avoid per-frame garbage collection
      this.lights = new Float32Array(MAX_LIGHTS * 4);
      this.lightColours = new Float32Array(MAX_LIGHTS * 3);
      this.spritePos = new Float32Array(MAX_SPRITES * 4);
      this.spriteInfo = new Float32Array(MAX_SPRITES * 4);
      this.eye = new Float32Array(3);
      this.forward = new Float32Array(3);
      this.right = new Float32Array(3);
      this.up = new Float32Array(3);
      this._uniformBinder = this._bindUniforms.bind(this);
      this._activeLights = 0;
      this._activeSprites = 0;
      this._weaponFrame = -1;
      this._weaponBobX = 0;
      this._weaponBobY = 0;
      this._muzzleFlash = 0;
    }

    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
    }

    frameIndex(name) {
      return this.atlas.index(name);
    }

    updateMap(state) {
      const size = state.size;
      if (!this.mapData || this.mapData.length !== size * size * 4) {
        this.mapData = new Uint8Array(size * size * 4);
      }
      const tiles = state.tiles;
      for (let i = 0; i < size * size; i++) {
        this.mapData[i * 4] = tiles[i];
        this.mapData[i * 4 + 1] = 0;
      }
      for (let i = 0; i < state.doors.length; i++) {
        const d = state.doors[i];
        const idx = (d.y * size + d.x) * 4;
        if (d.open >= 0.99) {
          this.mapData[idx] = 1; // Fully open door renders as passable floor
          this.mapData[idx + 1] = 255;
        } else {
          this.mapData[idx] = d.kind;
          this.mapData[idx + 1] = Math.round(Math.min(1, Math.max(0, d.open)) * 255);
        }
      }
      this.size = size;
      this.engine.setTexture('map', 4, size, size, this.mapData);
    }

    _bindUniforms(gl, u) {
      gl.uniform1i(u.map, 4);
      gl.uniform1i(u.atlas, 5);
      gl.uniform1i(u.size, this.size);
      gl.uniform3fv(u.eye, this.eye);
      gl.uniform3fv(u.forward, this.forward);
      gl.uniform3fv(u.right, this.right);
      gl.uniform3fv(u.up, this.up);
      gl.uniform4fv(u.lights, this.lights);
      gl.uniform3fv(u.lightColours, this.lightColours);
      gl.uniform1i(u.lightCount, this._activeLights);
      gl.uniform4fv(u.spritePos, this.spritePos);
      gl.uniform4fv(u.spriteInfo, this.spriteInfo);
      gl.uniform1i(u.spriteCount, this._activeSprites);
      gl.uniform1i(u.weaponFrame, this._weaponFrame);
      gl.uniform1f(u.weaponBobX, this._weaponBobX);
      gl.uniform1f(u.weaponBobY, this._weaponBobY);
      gl.uniform1f(u.muzzleFlash, this._muzzleFlash);
    }

    draw(sceneData) {
      const { camera, sprites, lights, weaponFrame, weaponBobX, weaponBobY, muzzleFlash, time, ink, tint, dissolve } = sceneData;
      const yaw = camera.yaw, pitch = camera.pitch || 0;
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);

      // In Inkfire rules, angle=0 is +X, angle=PI/2 is +Y (which maps to +Z in 3D view)
      this.forward[0] = cosY * cosP;
      this.forward[1] = sinP;
      this.forward[2] = sinY * cosP;

      this.right[0] = -sinY;
      this.right[1] = 0;
      this.right[2] = cosY;

      this.up[0] = -cosY * sinP;
      this.up[1] = cosP;
      this.up[2] = -sinY * sinP;

      this.eye[0] = camera.x;
      this.eye[1] = camera.y;
      this.eye[2] = camera.z;

      const lCount = Math.min(MAX_LIGHTS, lights.length);
      this._activeLights = lCount;
      for (let i = 0; i < lCount; i++) {
        const l = lights[i];
        const i4 = i * 4, i3 = i * 3;
        this.lights[i4] = l.x;
        this.lights[i4 + 1] = l.y;
        this.lights[i4 + 2] = l.z;
        this.lights[i4 + 3] = l.intensity;
        this.lightColours[i3] = l.r;
        this.lightColours[i3 + 1] = l.g;
        this.lightColours[i3 + 2] = l.b;
      }

      const sCount = Math.min(MAX_SPRITES, sprites.length);
      this._activeSprites = sCount;
      for (let i = 0; i < sCount; i++) {
        const s = sprites[i];
        const i4 = i * 4;
        this.spritePos[i4] = s.x;
        this.spritePos[i4 + 1] = s.y;
        this.spritePos[i4 + 2] = s.z;
        this.spritePos[i4 + 3] = s.size;
        this.spriteInfo[i4] = s.frame;
        this.spriteInfo[i4 + 1] = s.material;
        this.spriteInfo[i4 + 2] = s.flash || 0;
        this.spriteInfo[i4 + 3] = s.selfLit ? 1 : 0;
      }

      this._weaponFrame = weaponFrame !== undefined ? weaponFrame : -1;
      this._weaponBobX = weaponBobX || 0;
      this._weaponBobY = weaponBobY || 0;
      this._muzzleFlash = muzzleFlash || 0;

      this.engine.render(this._uniformBinder, { time, ink, tint, dissolve });
    }

    inspect() { return this.engine.inspect(); }
    destroy() { this.engine.destroy(); }
  }

  InkfireView.WALL_HEIGHT = WALL_HEIGHT;
  global.InkfireView = InkfireView;
})(typeof window !== 'undefined' ? window : globalThis);
