/* Ricochet scene: fixed/centred 28x16 disc court rendered at 3x2 cells per tile.
 * Draws walls, angled corner wedges, shields, bullseye pockets, conveyors, rotating prisms,
 * spinning disc trails, and archetype ASCII figures with charge bars. */
(function (global) {
  'use strict';

  const TILE_W = 3, TILE_H = 2, MAX_SPRITES = 96;
  const R = global.Ricochet;

  const PALETTE = {
    w: '#f4f2e8', k: '#1c202c', c: '#48d0ff', r: '#ff5a4e', y: '#ffe055',
    o: '#ff922b', g: '#5ce868', m: '#9aa8be', M: '#546078', p: '#d078ff'
  };

  function makeHeroFrames(letter, bodyCol) {
    return {
      idle:  [[' O ', `/${letter}\\`, '/ \\'], [` w `, `w${bodyCol}w`, `m m`]],
      walkA: [[' O ', `/${letter}\\`, '| \\'], [` w `, `w${bodyCol}w`, `m m`]],
      walkB: [[' O ', `/${letter}\\`, '/ |'], [` w `, `w${bodyCol}w`, `m m`]],
      hold:  [[' O ', `<${letter}>`, '/ \\'], [` y `, `y${bodyCol}y`, `m m`]],
      throw: [['\\O/', ` ${letter} `, '/ \\'], [`wyw`, ` ${bodyCol} `, `m m`]],
      dash:  [['_O_', `/${letter}\\`, '| |'], [` c `, `c${bodyCol}c`, `c c`]]
    };
  }

  const FRAMES = {
    discHalo: [[' . ', '.@.', ' . '], [' y ', 'yoy', ' y ']],
    discCrit: [[' * ', '*@*', ' * '], [' r ', 'ryr', ' r ']]
  };
  for (const kind of R.ARCHETYPE_KEYS) {
    const spec = R.ARCHETYPES[kind];
    const set = makeHeroFrames(spec.letter, 't');
    for (const [pose, frame] of Object.entries(set)) {
      FRAMES[`${kind}.${pose}`] = frame;
    }
  }

  function compileFrames() {
    const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const names = Object.keys(FRAMES);
    let rows = 0;
    for (const name of names) rows += FRAMES[name][0].length * 2;
    const width = 8, data = new Uint8Array(width * rows * 4), index = {};
    const mirror = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[' };
    let y = 0;
    const write = (text, colours) => {
      for (const [r, line] of text.entries()) for (let x = 0; x < line.length; x++) {
        const at = ((y + r) * width + x) * 4, key = colours[r][x];
        data[at] = line.charCodeAt(x);
        const rgb = key === 't' ? [1, 0, 0] : hex(PALETTE[key] || '#ffffff');
        data[at + 1] = rgb[0]; data[at + 2] = rgb[1]; data[at + 3] = rgb[2];
      }
    };
    for (const name of names) {
      const [text, colours] = FRAMES[name], h = text.length, w = text[0].length;
      for (const [r, line] of text.entries()) if (line.length !== w || colours[r].length !== w) throw new Error(`Frame ${name} row ${r} is uneven.`);
      for (const line of text) if (/[a-z]/.test(line)) throw new Error(`Frame ${name} uses a lowercase letter.`);
      index[name] = { y, w, h };
      write(text, colours);
      y += h;
      write(text.map(line => [...line].reverse().map(ch => mirror[ch] || ch).join('')), colours.map(line => [...line].reverse().join('')));
      index[name + '.left'] = { y, w, h };
      y += h;
    }
    return { data, width, height: rows, index };
  }

  const SCENE = `
  uniform usampler2D u_court;
  uniform usampler2D u_art;
  uniform usampler2D u_sprites;
  uniform ivec2 u_cam;
  uniform int u_count;
  uniform vec4 u_aim;
  uniform float u_charge;
  uniform vec4 u_pulse;

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0)));
    ivec2 l=wc-t*ivec2(${TILE_W},${TILE_H});

    uint glyph=32u;vec3 fg=vec3(.04,.06,.10);vec3 bg=vec3(.035,.048,.082);

    if(t.x>=0&&t.y>=0&&t.x<${R.WIDTH}&&t.y<${R.HEIGHT}){
      uvec4 info=texelFetch(u_court,t,0);
      uint kind=info.r, meta=info.g;
      bool rightSide=t.x>=${R.NET_X};
      vec3 floorBg=rightSide?vec3(.078,.062,.110):vec3(.058,.082,.132);
      float n=hash21(vec2(wc)*.81+vec2(t)*.37);

      bg=floorBg;
      fg=floorBg*1.7;
      glyph=n>.92?44u:(n>.84?46u:32u);

      if(kind==1u){ // Horizontal wall '='
        bg=vec3(.10,.16,.28);fg=vec3(.42,.72,.98);glyph=61u;
      }else if(kind==2u){ // Vertical end wall '|'
        bg=vec3(.10,.16,.28);fg=vec3(.42,.72,.98);glyph=124u;
      }else if(kind==3u){ // Corner wedge '/'
        bg=vec3(.10,.18,.30);fg=vec3(.45,.86,1.0);glyph=47u;
      }else if(kind==4u){ // Corner wedge '\'
        bg=vec3(.10,.18,.30);fg=vec3(.45,.86,1.0);glyph=92u;
      }else if(kind==5u){ // Shield full '###'
        vec3 scol=rightSide?vec3(.36,.92,.42):vec3(.28,.82,1.0);
        bg=scol*.24;fg=scol;glyph=35u;
      }else if(kind==6u){ // Shield cracked '---'
        bg=vec3(.34,.18,.04);fg=vec3(1.0,.72,.22);glyph=45u;
      }else if(kind==7u){ // Open bullseye pocket '[$]'
        float p=.75+.25*sin(u_time*7.0);
        bg=vec3(.22,.16,.04);fg=vec3(1.0,.88,.32)*p;
        glyph=l.x==0?91u:(l.x==2?93u:36u);
      }else if(kind==8u){ // Open goal ' '
        bg=rightSide?vec3(.18,.05,.05):vec3(.05,.12,.20);
        fg=bg*1.8;glyph=l.x==1?58u:32u;
      }else if(kind==9u){ // Net line ':'
        if((t.x==${R.NET_X - 1}&&l.x==2)||(t.x==${R.NET_X}&&l.x==0)){
          fg=vec3(.52,.64,.82);glyph=58u;
        }
      }else if(kind==10u){ // Pillar '[#]'
        bg=vec3(.26,.16,.06);fg=vec3(.96,.66,.26);
        glyph=l.x==0?91u:(l.x==2?93u:35u);
      }else if(kind==11u||kind==12u){ // Conveyor '>>>' or '<<<'
        float dir=kind==11u?1.0:-1.0;
        int phase=int(floor(float(wc.x)-dir*u_time*10.0))&3;
        bg=kind==11u?vec3(.06,.16,.22):vec3(.20,.11,.06);
        fg=kind==11u?vec3(.32,.84,1.0):vec3(1.0,.62,.28);
        glyph=phase==0?32u:(kind==11u?62u:60u);
      }else if(kind==13u){ // Rotating prism ('/' '-' '\' '|')
        float p=.8+.2*sin(u_time*5.0);
        bg=vec3(.20,.10,.30);fg=vec3(.88,.58,1.0)*p;
        glyph=meta==0u?47u:(meta==1u?45u:(meta==2u?92u:124u));
      }

      // Aim preview line while player holds disc
      vec2 world=(vec2(wc)+.5)/vec2(${TILE_W}.0,${TILE_H}.0);
      if(u_charge>=0.0&&u_aim.z>.05){
        vec2 rel=world-u_aim.xy;
        float along=dot(rel,u_aim.zw);
        float perp=abs(rel.x*u_aim.w-rel.y*u_aim.z);
        if(along>.8&&along<7.5&&perp<.28&&fract(along*.85)<.45){
          fg=u_charge>.35?vec3(1.0,.62,.22):vec3(1.0,.90,.42);
          glyph=u_charge>.75?42u:58u;
        }
      }

      // Goal / parry shockwave ring
      if(u_pulse.z>0.0){
        float d=length((world-u_pulse.xy)*vec2(1.0,1.2));
        if(abs(d-u_pulse.z)<.45){
          fg=u_pulse.w>.5?vec3(1.0,.86,.35):vec3(.45,.92,1.0);
          if(glyph==32u||glyph==44u||glyph==46u)glyph=42u;
        }
      }
    }

    // Sprites (player, rival, disc, particles, charge bar)
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),b=texelFetch(u_sprites,ivec2(i,1),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      int w=int(b.g),h=int(b.b),fl=int(b.a);
      if((fl&8)!=0&&rel.y==h&&rel.x>=0&&rel.x<w){
        uvec4 c=texelFetch(u_sprites,ivec2(i,3),0);
        float fill=float(c.a)/255.0*float(w);
        bool on=float(rel.x)+.5<=fill;
        glyph=on?61u:45u;fg=on?vec3(c.rgb)/255.0:vec3(.25,.28,.35);bg=bg*.5;
        break;
      }
      if(rel.x<0||rel.y<0||rel.x>=w||rel.y>=h)continue;
      uvec4 c2=texelFetch(u_sprites,ivec2(i,2),0);
      uvec4 art=int(b.r)==255?c2:texelFetch(u_art,ivec2(rel.x,int(b.r)+rel.y),0);
      if(art.r==32u||art.r==0u)continue;
      vec3 colour=vec3(art.gba)/255.0;
      if(art.g==1u&&art.b==0u&&art.a==0u)colour=vec3(c2.rgb)/255.0;
      fg=(fl&1)!=0?vec3(1.0):colour;
      bg=mix(bg,fg*.22,.5);
      glyph=art.r;
      break;
    }

    writeCell(glyph,0u,3u,1.0,fg,bg);
  }`;

  class RicochetView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['court', 'art', 'sprites', 'cam', 'count', 'aim', 'charge', 'pulse'], far: 2 });
      this.art = compileFrames();
      this.engine.setTexture('art', 6, this.art.width, this.art.height, this.art.data);
      this.courtData = new Uint8Array(R.WIDTH * R.HEIGHT * 4);
      this.spriteData = new Uint8Array(MAX_SPRITES * 4 * 4);
      this.engine.setTexture('court', 4, R.WIDTH, R.HEIGHT, this.courtData);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, this.spriteData);
      this.columns = 1;
      this.rows = 1;
    }

    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
    }

    camera(focusX) {
      const courtW = R.WIDTH * TILE_W, courtH = R.HEIGHT * TILE_H;
      const maxX = courtW - this.columns;
      const cx = maxX <= 0 ? Math.round(maxX / 2) : Math.max(0, Math.min(maxX, Math.round(focusX * TILE_W - this.columns / 2)));
      const cy = Math.round((courtH - this.rows) / 2);
      return { x: cx, y: cy };
    }

    uploadCourt(state) {
      const data = this.courtData;
      const code = {
        FLOOR: 0, WALL: 1, WALL_H: 1, WALL_V: 2, WEDGE_SLASH: 3, WEDGE_BACK: 4,
        SHIELD_2: 5, SHIELD_1: 6, BULLSEYE: 7, GOAL: 8, NET: 9, PILLAR: 10, CONVEYOR_E: 11, CONVEYOR_W: 12, PRISM: 13
      };
      for (let ty = 0; ty < R.HEIGHT; ty++) {
        for (let tx = 0; tx < R.WIDTH; tx++) {
          const i = (ty * R.WIDTH + tx) * 4;
          const tile = R.courtTileAt(state, tx + 0.5, ty + 0.5);
          data[i] = code[tile] || 0;
          let meta = 0;
          if (tile === 'PRISM') {
            const pr = state.prisms.find(p => Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < p.r);
            if (pr) meta = pr.angle;
          }
          data[i + 1] = meta;
        }
      }
      this.engine.setTexture('court', 4, R.WIDTH, R.HEIGHT, data);
    }

    draw({ state, cam, sprites, time, tint, pulse }) {
      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length);
      const put = (i, row, a, b, c, d) => { const at = (row * MAX_SPRITES + i) * 4; data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d; };
      for (let i = 0; i < count; i++) {
        const s = sprites[i], x = s.x + 2048, y = s.y + 2048, flags = (s.flash ? 1 : 0) | (s.bar ? 8 : 0);
        put(i, 0, x & 255, x >> 8, y & 255, y >> 8);
        const team = s.team || [255, 255, 255];
        if (s.frame) {
          const f = this.art.index[s.frame];
          put(i, 1, f.y, f.w, f.h, flags);
          put(i, 2, team[0], team[1], team[2], 0);
        } else {
          put(i, 1, 255, 1, 1, flags);
          put(i, 2, s.char.charCodeAt(0), s.colour[0], s.colour[1], s.colour[2]);
        }
        if (s.bar) put(i, 3, s.bar.colour[0], s.bar.colour[1], s.bar.colour[2], Math.round(Math.max(0, Math.min(1, s.bar.fill)) * 255));
      }
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, data);

      const p0 = state.players[0];
      const aim = state.holder === 0 ? R.aimVector(state, 0) : { x: 0, y: 0 };
      const charge = state.holder === 0 ? Math.min(1, p0.chargeTimer) : -1;

      this.engine.render((gl, u) => {
        gl.uniform2i(u.cam, cam.x, cam.y);
        gl.uniform1i(u.count, count);
        gl.uniform4f(u.aim, p0.x, p0.y, aim.x, aim.y);
        gl.uniform1f(u.charge, charge);
        gl.uniform4fv(u.pulse, pulse || [0, 0, 0, 0]);
      }, { time, ink: false, tint });
    }

    inspect() { return this.engine.inspect(); }
  }

  RicochetView.TILE_W = TILE_W;
  RicochetView.TILE_H = TILE_H;
  RicochetView.FRAMES = FRAMES;
  global.RicochetView = RicochetView;
})(window);
