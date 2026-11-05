/* Joyride scene: top-down town view where each world tile is 3x2 character cells.
 * Renders four districts, lane markings, traffic lights, day/night headlights, and 8-heading cars. */
(function (global) {
  'use strict';

  const TILE_W = 3, TILE_H = 2, MARGIN = 10, MAX_SPRITES = 128;

  // Palette keys for ASCII sprite frames (space = transparent).
  const PALETTE = {
    w: '#f4f2e8', k: '#25262e', m: '#9ea6b4', M: '#5f6778',
    r: '#e84430', o: '#f29b2e', y: '#ffe252', g: '#62cb4c', G: '#3b8e36',
    c: '#52b4e8', b: '#2f6ce0', B: '#8cc8ff', p: '#c668e8', s: '#ebb88e'
  };

  function makeCarFrames(emblem, bodyCol, glassCol = 'B', wheelCol = 'k', roofEmblemCol = 'w') {
    const b = bodyCol, g = glassCol, w = wheelCol, e = roofEmblemCol;
    return {
      N:  [['[=]', `|${emblem}|`, '[=]'], [`${w}${g}${w}`, `${b}${e}${b}`, `${w}${b}${w}`]],
      NE: [[' /^\\', `/${emblem} /`, '\\_/ '], [` ${g}${b}${w}`, `${w}${e}${b}${b}`, `${w}${b}${w} `]],
      E:  [['[_][=]', `[#${emblem}#>]`, '[_][=]'], [`${w}${b}${b}${b}${g}${w}`, `${b}${b}${e}${b}${g}${b}`, `${w}${b}${b}${b}${g}${w}`]],
      SE: [[' /~\\', `\\${emblem} \\`, ' \\V/'], [` ${w}${b}${w}`, `${b}${e}${b}${w}`, ` ${w}${b}${g}`]],
      S:  [['[=]', `|${emblem}|`, '[=]'], [`${w}${b}${w}`, `${b}${e}${b}`, `${w}${g}${w}`]],
      SW: [['/~\\ ', `/ ${emblem}/`, '\\V/ '], [`${w}${b}${w} `, `${w}${b}${e}${b}`, `${g}${b}${w} `]],
      W:  [['[=][_]','[<#' + emblem + '#]', '[=][_]'], [`${w}${g}${b}${b}${b}${w}`, `${b}${g}${b}${e}${b}${b}`, `${w}${g}${b}${b}${b}${w}`]],
      NW: [['/^\\ ', `\\ ${emblem}\\`, ' \\_/'], [`${w}${b}${g} `, `${b}${b}${e}${w}`, ` ${w}${b}${w}`]]
    };
  }

  const CAR_SPECS = {
    compact:  makeCarFrames('C', 'c', 'B', 'k', 'w'),
    sedan:    makeCarFrames('S', 'w', 'B', 'k', 'c'),
    van:      makeCarFrames('V', 'm', 'B', 'k', 'w'),
    sports:   makeCarFrames('Z', 'r', 'B', 'k', 'y'),
    taxi:     makeCarFrames('T', 'y', 'B', 'k', 'k'),
    cruiser:  makeCarFrames('P', 'b', 'B', 'k', 'w'),
    armoured: makeCarFrames('A', 'G', 'B', 'k', 'y'),
    wreck:    makeCarFrames('X', 'M', 'k', 'k', 'o')
  };

  const FRAMES = {
    playerIdle: [[' @ ', '/H\\'], [' y ', 'ccc']],
    playerWalk: [[' @ ', '/X\\'], [' y ', 'cwc']],
    pedDown:    [['_@_'], ['sss']],
    marker:     [['\\V/', ' * '], ['yyy', ' y ']],
    parcel:     [['[$]'], ['gyg']],
    'arrow.N':  [['/^\\', ' | '], ['yyy', ' y ']],
    'arrow.NE': [[' /^', ' / '], [' yy', ' y ']],
    'arrow.E':  [['-->'], ['yyy']],
    'arrow.SE': [[' \\ ', ' \\V'], [' y ', ' yy']],
    'arrow.S':  [[' | ', '\\V/'], [' y ', 'yyy']],
    'arrow.SW': [[' / ', 'V/ '], [' y ', 'yy ']],
    'arrow.W':  [['<--'], ['yyy']],
    'arrow.NW': [['^\\ ', ' \\ '], ['yy ', ' y ']]
  };
  for (const [kind, dirs] of Object.entries(CAR_SPECS)) {
    for (const [dir, frame] of Object.entries(dirs)) {
      FRAMES[`${kind}.${dir}`] = frame;
    }
  }

  const SCENE = `
  uniform usampler2D u_world;
  uniform usampler2D u_art;
  uniform usampler2D u_sprites;
  uniform ivec2 u_origin;
  uniform ivec2 u_window;
  uniform ivec2 u_cam;
  uniform int u_count;
  uniform float u_day;
  uniform float u_rain;
  uniform vec4 u_beam;
  uniform vec3 u_siren;
  uniform vec3 u_marker;

  uvec4 tileAt(ivec2 t){
    ivec2 p=t-u_origin;
    if(p.x<0||p.y<0||p.x>=u_window.x||p.y>=u_window.y)return uvec4(0u,3u,0u,0u);
    return texelFetch(u_world,p,0);
  }

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0)));
    ivec2 l=wc-t*ivec2(${TILE_W},${TILE_H});
    uvec4 data=tileAt(t);
    uint tile=data.r,dist=data.g,meta=data.b,extra=data.a;

    float n=hash21(vec2(t)+vec2(l)*.37),th=hash21(vec2(t)*.73);
    vec3 ambient=mix(vec3(.24,.28,.44),vec3(1.0,.98,.94),u_day);

    // Headlight cone ahead of player car at night
    if(u_day<.75&&u_beam.w>.5){
      vec2 dp=(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0))-u_beam.xy;
      float d=length(dp);
      if(d<15.0&&d>.2){
        vec2 dir=vec2(cos(u_beam.z),sin(u_beam.z));
        float align=dot(normalize(dp),dir);
        if(align>.58){
          float strength=(1.0-d/15.0)*smoothstep(.58,.92,align)*(1.0-u_day);
          ambient+=vec3(1.1,1.02,.78)*strength*1.35;
        }
      }
    }
    // Police siren ground glow
    if(u_siren.z>.5){
      float sd=distance(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0),u_siren.xy);
      if(sd<11.0){
        float pulse=sin(u_time*18.0);
        vec3 scol=pulse>0.0?vec3(.95,.18,.18):vec3(.18,.42,1.0);
        ambient+=scol*(1.0-sd/11.0)*.48;
      }
    }

    uint glyph=32u;vec3 fg=vec3(0),bg=vec3(0);uint flags=3u,material=0u;

    if(tile==0u){
      // Water (~)
      float wave=sin(float(wc.x)*.6+float(wc.y)*.4+u_time*2.5);
      vec3 tone=vec3(.08,.28,.58)*ambient;
      bg=tone*.75;fg=tone*1.45+vec3(.04,.08,.12);
      glyph=wave>.15?126u:(n>.75?45u:32u);
    }else if(tile==1u){
      // Grass / Park (")
      vec3 tone=vec3(.18,.48,.20)*ambient*(.9+th*.2);
      bg=tone*.62;fg=tone*1.32;
      glyph=n>.55?34u:(n>.25?39u:46u);
    }else if(tile==2u||tile==3u){
      // Pavement (.) or Plaza (,)
      vec3 base=tile==3u?vec3(.48,.42,.36):vec3(.38,.38,.42);
      vec3 lit=base*ambient;
      bg=lit*.62;fg=lit*1.18;
      glyph=tile==3u?( (l.x+l.y)%2==0?44u:46u ):46u;
    }else if(tile>=4u&&tile<=7u){
      // Road (4), Avenue (5), Intersection (6), Bridge (7)
      vec3 asphalt=tile==7u?vec3(.28,.26,.24):vec3(.18,.19,.22);
      vec3 lit=asphalt*ambient;
      bg=lit*.68;fg=lit*1.4;
      glyph=32u;
      bool roadN=tileAt(t+ivec2(0,-1)).r>=4u&&tileAt(t+ivec2(0,-1)).r<=7u;
      bool roadS=tileAt(t+ivec2(0,1)).r>=4u&&tileAt(t+ivec2(0,1)).r<=7u;
      bool roadW=tileAt(t+ivec2(-1,0)).r>=4u&&tileAt(t+ivec2(-1,0)).r<=7u;
      bool roadE=tileAt(t+ivec2(1,0)).r>=4u&&tileAt(t+ivec2(1,0)).r<=7u;
      if(tile==6u){
        // Intersection with zebra markings and traffic light corners
        if((l.x==0||l.x==2)&&l.y==0&&(t.x+t.y)%2==0){
          glyph=58u;
          // Traffic light colour from meta (1=NS green, 2=NS yellow, 3=EW green, 4=EW yellow)
          if(meta==1u)fg=vec3(.25,.95,.35);
          else if(meta==3u)fg=vec3(.95,.28,.22);
          else fg=vec3(1.0,.85,.25);
        }else if(l.x==1&&l.y==1){
          glyph=43u;fg=lit*1.6;
        }
      }else if(tile==7u){
        // Bridge rails and deck
        if(!roadN&&l.y==0){glyph=61u;fg=vec3(.75,.68,.48)*ambient;}
        else if(!roadS&&l.y==1){glyph=61u;fg=vec3(.75,.68,.48)*ambient;}
        else if(!roadW&&l.x==0){glyph=124u;fg=vec3(.75,.68,.48)*ambient;}
        else if(!roadE&&l.x==2){glyph=124u;fg=vec3(.75,.68,.48)*ambient;}
        else if(l.x==1){glyph=roadN||roadS?124u:45u;fg=vec3(.65,.62,.52)*ambient;}
      }else{
        // Straight road/avenue lane markings (-, =, |, :)
        bool vert=(roadN||roadS)&&!(roadW&&roadE);
        if(vert){
          if(l.x==1&&(t.y+l.y)%2==0){glyph=tile==5u?58u:124u;fg=tile==5u?vec3(.88,.76,.28)*ambient:vec3(.72,.74,.78)*ambient;}
        }else{
          if(l.y==0&&(t.x+l.x)%2==0){glyph=tile==5u?61u:45u;fg=tile==5u?vec3(.88,.76,.28)*ambient:vec3(.72,.74,.78)*ambient;}
        }
      }
      // Fading tyre marks stored in extra bit
      if(extra==1u&&l.x==1){glyph=59u;fg=vec3(.07,.07,.08);}
    }else if(tile==8u||tile==9u||tile==10u){
      // Buildings (8), Containers (9), Cranes (10) tinted by district
      vec3 roof=dist==0u?vec3(.34,.52,.66):dist==1u?vec3(.58,.26,.68):dist==2u?vec3(.64,.36,.26):vec3(.56,.48,.28);
      if(tile==9u)roof=meta==1u?vec3(.74,.28,.22):meta==2u?vec3(.24,.48,.74):vec3(.74,.58,.20);
      if(tile==10u)roof=vec3(.85,.68,.20);
      bool edge=tileAt(t+ivec2(0,-1)).r!=tile||tileAt(t+ivec2(0,1)).r!=tile||tileAt(t+ivec2(-1,0)).r!=tile||tileAt(t+ivec2(1,0)).r!=tile;
      vec3 lit=roof*ambient*(.85+th*.25);
      bg=lit*(edge?.72:.54);fg=lit*1.35;
      glyph=tile==10u?42u:tile==9u?61u:(meta==1u?35u:meta==2u?37u:64u);
      // Lit windows at night and neon roofs on The Strip
      if(u_day<.55&&!edge&&n>.62){
        glyph=58u;
        fg=dist==1u?(n>.8?vec3(1.0,.3,.85):vec3(.25,.95,1.0)):vec3(1.0,.86,.45);
      }else if(dist==1u&&edge&&u_day<.65){
        fg= (t.x+t.y)%2==0?vec3(1.0,.32,.82):vec3(.25,.9,1.0);
      }
    }else if(tile==11u){
      // Stunt ramp (^)
      bg=vec3(.35,.28,.14)*ambient;fg=vec3(1.0,.85,.25);
      glyph=94u;
    }else if(tile==12u){
      // Payphone ($)
      float ring=sin(u_time*10.0)>.0?1.2:.85;
      bg=vec3(.12,.32,.18)*ambient;fg=vec3(.35,1.0,.45)*ring;
      glyph=l.x==1?36u:91u+uint(l.x==2)*2u;
    }else if(tile==13u){
      // Respray shop
      bg=vec3(.16,.34,.42)*ambient;fg=vec3(.4,1.0,.95);
      glyph=l.y==0?(l.x==0?82u:l.x==1?69u:80u):61u;
    }else if(tile==14u){
      // Garage
      bg=vec3(.28,.32,.16)*ambient;fg=vec3(.85,.95,.4);
      glyph=l.y==0?(l.x==0?71u:l.x==1?65u:82u):61u;
    }else if(tile==15u){
      // Hospital (+)
      bg=vec3(.45,.45,.50)*ambient;fg=vec3(1.0,.28,.28);
      glyph=l.x==1?43u:72u;
    }else if(tile==16u){
      // Police station
      bg=vec3(.16,.24,.46)*ambient;fg=vec3(.55,.78,1.0);
      glyph=l.y==0?(l.x==0?80u:l.x==1?79u:76u):35u;
    }else if(tile==17u){
      // Freighter dock drop-off
      bg=vec3(.36,.28,.16)*ambient;fg=vec3(1.0,.84,.3);
      glyph=l.y==0?61u:35u;
    }

    // Highlight active mission drop/checkpoint ring on the ground
    if(u_marker.z>.5){
      float md=distance(vec2(t)+.5,u_marker.xy);
      if(md>1.6&&md<3.1){
        float p=.75+.25*sin(u_time*8.0);
        fg=vec3(1.0,.88,.25)*p;
        bg=mix(bg,vec3(.45,.36,.08),0.45);
        if(glyph==32u)glyph=42u;
      }
    }

    // Light rain streaks
    if(u_rain>.5&&hash21(vec2(cell)+floor(u_time*24.0))>.965){
      glyph=47u;fg=vec3(.55,.7,1.0);
    }

    // Sprites (cars, player, pedestrians, particles, markers)
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),b=texelFetch(u_sprites,ivec2(i,1),0),c=texelFetch(u_sprites,ivec2(i,2),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      if(rel.x<0||rel.y<0||rel.x>=int(b.g)||rel.y>=int(b.b))continue;
      uvec4 art=int(b.r)==255?uvec4(c.r,c.g,c.b,c.a):texelFetch(u_art,ivec2(rel.x,int(b.r)+rel.y),0);
      if(art.r==32u||art.r==0u)continue;
      vec3 colour=vec3(art.gba)/255.0;
      bool hit=(int(b.a)&1)==1,lit=(int(b.a)&2)==2;
      fg=hit?vec3(1.0):lit?colour:colour*max(ambient*1.15,vec3(.38));
      bg=mix(bg,fg*.22,0.55);
      glyph=art.r;
      break;
    }

    writeCell(glyph,material,flags,1.0,fg,bg);
  }`;

  function compileFrames() {
    const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const names = Object.keys(FRAMES);
    let rows = 0;
    for (const name of names) rows += FRAMES[name][0].length;
    const width = 12, data = new Uint8Array(width * rows * 4), index = {};
    let y = 0;
    for (const name of names) {
      const [text, colours] = FRAMES[name], h = text.length, w = text[0].length;
      for (const [r, line] of text.entries()) {
        if (line.length !== w || colours[r].length !== w) {
          throw new Error(`Frame ${name} row ${r} is uneven.`);
        }
        for (let x = 0; x < w; x++) {
          const at = ((y + r) * width + x) * 4, rgb = hex(PALETTE[colours[r][x]] || '#ffffff');
          data[at] = line.charCodeAt(x);
          data[at + 1] = rgb[0]; data[at + 2] = rgb[1]; data[at + 3] = rgb[2];
        }
      }
      index[name] = { y, w, h };
      y += h;
    }
    return { data, width, height: rows, index };
  }

  const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  function headingDir(angle) {
    const norm = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.round((norm / (Math.PI * 2)) * 8) % 8;
    return DIRS[idx];
  }

  class JoyrideView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, {
        sceneSource: SCENE,
        uniforms: ['world', 'art', 'sprites', 'origin', 'window', 'cam', 'count', 'day', 'rain', 'beam', 'siren', 'marker'],
        far: 2
      });
      this.art = compileFrames();
      this.engine.setTexture('art', 6, this.art.width, this.art.height, this.art.data);
      this.spriteData = new Uint8Array(MAX_SPRITES * 3 * 4);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 3, this.spriteData);
      this.markStamp = new Uint32Array(160 * 160);
      this.stampId = 1;
      this.columns = 1;
      this.rows = 1;
    }

    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
      const w = Math.ceil(this.columns / TILE_W) + 4 + MARGIN * 2;
      const h = Math.ceil(this.rows / TILE_H) + 4 + MARGIN * 2;
      this.window = { w, h };
      this.worldData = new Uint8Array(w * h * 4);
    }

    camera(x, y) {
      const J = global.Joyride;
      const cx = Math.round(x * TILE_W - this.columns / 2);
      const cy = Math.round(y * TILE_H - this.rows / 2);
      return {
        x: Math.max(0, Math.min(J.WIDTH * TILE_W - this.columns, cx)),
        y: Math.max(0, Math.min(J.HEIGHT * TILE_H - this.rows, cy))
      };
    }

    upload(state, cam) {
      const J = global.Joyride, { w, h } = this.window;
      const ox = Math.floor(cam.x / TILE_W) - MARGIN, oy = Math.floor(cam.y / TILE_H) - MARGIN;
      const data = this.worldData;
      data.fill(0);

      // Stamp active tyre marks in O(marks) without per-frame Set allocation
      const stamp = (this.stampId = (this.stampId + 1) >>> 0) || 1;
      const markStamp = this.markStamp;
      for (let m = 0; m < state.marks.length; m++) {
        const mk = state.marks[m], mx = Math.floor(mk.x), my = Math.floor(mk.y);
        if (J.inBounds(mx, my)) markStamp[J.index(mx, my)] = stamp;
      }

      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const wx = x + ox, wy = y + oy, at = (y * w + x) * 4;
        if (!J.inBounds(wx, wy)) {
          data[at] = J.T.WATER;
          data[at + 1] = J.DIST.DOCKS;
          continue;
        }
        const i = J.index(wx, wy), tile = state.tiles[i];
        data[at] = tile;
        data[at + 1] = state.districts[i];
        if (tile === J.T.INTERSECTION) {
          const inter = state.intersections[state.roofStyle[i]] || state.intersections[0];
          const ls = J.lightState(state, inter);
          data[at + 2] = ls === 'NS' ? 1 : ls === 'NS_Y' ? 2 : ls === 'EW' ? 3 : 4;
        } else {
          data[at + 2] = state.roofStyle[i];
        }
        data[at + 3] = markStamp[i] === stamp ? 1 : 0;
      }
      this.engine.setTexture('world', 4, w, h, data);
      this.origin = [ox, oy];
    }

    draw({ state, cam, sprites, day, rain, beam, siren, marker, time, tint }) {
      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length);
      const put = (i, row, a, b, c, d) => {
        const at = (row * MAX_SPRITES + i) * 4;
        data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d;
      };
      for (let i = 0; i < count; i++) {
        const s = sprites[i], x = s.x + 2048, y = s.y + 2048, flags = (s.flash ? 1 : 0) | (s.lit ? 2 : 0);
        put(i, 0, x & 255, x >> 8, y & 255, y >> 8);
        if (s.frame) {
          const f = this.art.index[s.frame];
          put(i, 1, f.y, f.w, f.h, flags);
          put(i, 2, 0, 0, 0, 0);
        } else {
          put(i, 1, 255, 1, 1, flags);
          put(i, 2, s.char.charCodeAt(0), s.colour[0], s.colour[1], s.colour[2]);
        }
      }
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 3, data);
      this.upload(state, cam);
      this.engine.render((gl, u) => {
        gl.uniform2i(u.origin, this.origin[0], this.origin[1]);
        gl.uniform2i(u.window, this.window.w, this.window.h);
        gl.uniform2i(u.cam, cam.x, cam.y);
        gl.uniform1i(u.count, count);
        gl.uniform1f(u.day, day);
        gl.uniform1f(u.rain, rain ? 1 : 0);
        gl.uniform4f(u.beam, beam[0], beam[1], beam[2], beam[3]);
        gl.uniform3f(u.siren, siren[0], siren[1], siren[2]);
        gl.uniform3f(u.marker, marker[0], marker[1], marker[2]);
      }, { time, ink: false, tint, dissolve: 0 });
    }

    inspect() { return this.engine.inspect(); }
  }

  JoyrideView.TILE_W = TILE_W;
  JoyrideView.TILE_H = TILE_H;
  JoyrideView.FRAMES = FRAMES;
  JoyrideView.headingDir = headingDir;
  global.JoyrideView = JoyrideView;
})(typeof window !== 'undefined' ? window : globalThis);
