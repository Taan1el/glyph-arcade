/* Burrow scene: every world tile is 3x2 character cells. Lit by flood-filled light,
 * with a day and night sky, moving liquids, and creatures drawn as ASCII figures. */
(function (global) {
  'use strict';

  const TILE_W = 3, TILE_H = 2, MARGIN = 12, MAX_SPRITES = 96;
  const T = global.Burrow.T;

  // Characters are rows of text. In colour rows: a letter names a palette entry, space is none.
  const PALETTE = {
    s: '#e8b48a', c: '#5ea8e0', b: '#9c6b3a', k: '#2a2a30', w: '#f2f0e6', g: '#6fc84a', G: '#3e8a34', r: '#e0402c', o: '#f09a2e', y: '#ffe05a',
    p: '#b070e0', m: '#9aa2ae', M: '#60687a', t: '#60e0d0', n: '#7a4a2a', v: '#d04a68', V: '#8a2438'
  };
  const FRAMES = {
    idle: [[' O ', '/#\\', ' # ', '/ \\'], [' s ', 'scs', ' c ', 'b b']],
    walkA: [[' O ', '/#\\', ' # ', '| \\'], [' s ', 'scs', ' c ', 'b b']],
    walkB: [[' O ', '/#\\', ' # ', '/ |'], [' s ', 'scs', ' c ', 'b b']],
    jump: [['\\O/', ' # ', ' # ', '/ \\'], ['sss', ' c ', ' c ', 'b b']],
    climb: [[' O ', '-#-', ' # ', '| |'], [' s ', 'scs', ' c ', 'b b']],
    slime: [['.--.', '(OO)'], ['gggg', 'gkkg']],
    slimeHop: [[' __ ', '(OO)'], [' gg ', 'gkkg']],
    zombie: [[' @ ', '=#=', ' # ', '/ \\'], [' g ', 'GGG', ' G ', 'k k']],
    zombieB: [[' @ ', '=#=', ' # ', '| \\'], [' g ', 'GGG', ' G ', 'k k']],
    bat: [['\\VV/', ' OO '], ['pppp', ' rr ']],
    batB: [['/VV\\', ' OO '], ['pppp', ' rr ']],
    crawler: [['/\\O/\\', '/ O \\'], ['mmrmm', 'm M m']],
    crawlerB: [['\\/O\\/', '\\ O /'], ['mmrmm', 'm M m']],
    imp: [['\\^/', '(O)', '/ \\'], ['r r', 'oyo', 'r r']],
    impB: [['/^\\', '(O)', '| |'], ['r r', 'oyo', 'r r']],
    mawHead: [['  ___  ', ' /O O\\ ', '<VVVVV>', ' \\^^^/ ', '  ---  '], ['  vvv  ', ' vyvyv ', 'wwwwwww', ' vwwwv ', '  VVV  ']],
    mawBody: [[' _____ ', '(#####)', '(%%%%%)', '(#####)', ' ----- '], [' VVVVV ', 'vvvvvvv', 'VoooooV', 'vvvvvvv', ' VVVVV ']],
    sword: [['  /', ' / ', '/  '], ['  w', ' w ', 'b  ']]
  };

  const SCENE = `
  uniform usampler2D u_world;
  uniform usampler2D u_light;
  uniform usampler2D u_art;
  uniform usampler2D u_sprites;
  uniform ivec2 u_origin;
  uniform ivec2 u_window;
  uniform ivec2 u_cam;
  uniform int u_count;
  uniform float u_day;
  uniform float u_dusk;
  uniform ivec3 u_cursor;
  uniform ivec3 u_crack;
  uniform vec2 u_glow;
  uniform vec3 u_sun;

  uvec4 tileAt(ivec2 t){
    ivec2 p=t-u_origin;
    if(p.x<0||p.y<0||p.x>=u_window.x||p.y>=u_window.y)return uvec4(3u,0u,2u,0u);
    return texelFetch(u_world,p,0);
  }
  bool solid(uint t){return t==1u||t==2u||t==3u||t==4u||t==7u||t==8u||t==10u||(t>=12u&&t<=17u);}
  vec4 lightAt(vec2 p){
    ivec2 i=ivec2(floor(p));vec2 f=p-floor(p);f=f*f*(3.0-2.0*f);
    ivec2 hi=u_window-ivec2(1);
    vec4 a=vec4(texelFetch(u_light,clamp(i,ivec2(0),hi),0));
    vec4 b=vec4(texelFetch(u_light,clamp(i+ivec2(1,0),ivec2(0),hi),0));
    vec4 c=vec4(texelFetch(u_light,clamp(i+ivec2(0,1),ivec2(0),hi),0));
    vec4 d=vec4(texelFetch(u_light,clamp(i+ivec2(1,1),ivec2(0),hi),0));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y)/255.0;
  }
  vec3 skyColour(float height){
    vec3 top=mix(vec3(.012,.018,.05),vec3(.20,.46,.82),u_day),low=mix(vec3(.03,.04,.10),vec3(.62,.80,.95),u_day);
    vec3 sky=mix(top,low,height);
    return mix(sky,vec3(.92,.46,.26),u_dusk*height*.8);
  }
  float valueNoise(vec2 p){
    vec2 i=floor(p),f=p-i;f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
  }
  // Rough rock letters chosen per cell and held steady by the tile hash.
  uint rock(float n,float m){return n>.86?37u:n>.6?35u:n>.3?61u:m>.5?58u:43u;}

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0)));
    ivec2 l=wc-t*ivec2(${TILE_W},${TILE_H});
    uvec4 data=tileAt(t);
    uint tile=data.r,liquid=data.g,wall=data.b;
    vec4 L=lightAt((vec2(wc)+.5)/vec2(${TILE_W}.0,${TILE_H}.0)-.5-vec2(u_origin));
    float glow=max(0.0,1.0-distance(vec2(wc)*vec2(1.0,1.5),u_glow*vec2(1.0,1.5))/19.0);
    vec3 skyLight=mix(vec3(.13,.17,.32),vec3(1.0,.97,.90),u_day)*L.a;
    vec3 light=L.rgb*1.25+skyLight+vec3(.34,.30,.24)*glow*glow+vec3(.075,.075,.1);
    float n=hash21(vec2(t)+vec2(l)*.37),m=hash21(vec2(t)*1.7+vec2(l)*3.1);
    float tileHash=hash21(vec2(t)*.73);

    uint glyph=32u;vec3 fg=vec3(0),bg=vec3(0);uint flags=3u,material=0u;
    bool open=!solid(tile)&&tile!=5u&&tile!=6u;

    // Backdrop: sky above the ground line, dim dug-out rock below it.
    if(wall==0u){
      float height=clamp(float(cell.y)/float(grid.y),0.0,1.0);
      vec3 sky=skyColour(height);bg=sky*.82;fg=sky;
      if(u_day<.45&&hash21(vec2(cell)*.9+11.0)>.985){glyph=hash21(vec2(cell))>.6?42u:46u;fg=vec3(.8,.85,1.0)*(.55+.45*sin(u_time*2.0+float(cell.x)));}
      vec2 ds=(vec2(cell)-u_sun.xy)*vec2(1.0,1.5);
      float d=length(ds);
      if(u_sun.z>1.5){
        if(d<6.0&&length(ds-vec2(2.4,-1.0))>5.0){glyph=d<4.6?64u:42u;fg=vec3(.88,.9,1.0);bg=mix(bg,fg,.28);}
      }else if(u_sun.z>0.0&&d<7.0){glyph=d<4.6?64u:42u;fg=vec3(1.0,.9,.5);bg=mix(bg,fg,.5);}
      float drift=float(cell.x)+u_time*.5,rows=float(cell.y);
      float puff=valueNoise(vec2(drift/17.0,rows/5.0+3.0))*.68+valueNoise(vec2(drift/7.0+9.0,rows/2.4))*.32;
      float fade=1.0-smoothstep(.34,.62,rows/float(grid.y));
      puff=puff*fade;
      if(puff>.52){
        float body=clamp((puff-.52)/.18,0.0,1.0);
        glyph=body>.66?35u:body>.33?61u:126u;
        vec3 cloudTone=mix(vec3(.16,.18,.28),vec3(1.0,.98,.95),u_day);
        cloudTone=mix(cloudTone,vec3(1.0,.62,.42),u_dusk*.7);
        fg=cloudTone;bg=mix(bg,cloudTone*.82,.35+.55*body);
      }
      if(L.a<.5){vec3 dark=vec3(.015,.016,.022);bg=mix(dark,bg,L.a*2.0);fg=mix(dark,fg,L.a*2.0);}
    }else{
      vec3 base=wall==1u?vec3(.34,.24,.15):wall==2u?vec3(.25,.25,.30):vec3(.36,.25,.14);
      if(wall==3u){glyph=l.y==1?45u:(l.x==0?124u:32u);}
      else glyph=n>.74?46u:n>.56?39u:n>.46?44u:32u;
      vec3 lit=base*light;bg=lit*.5;fg=lit*1.3;
    }

    if(tile==1u||tile==2u){
      vec3 base=vec3(.48,.31,.18);
      glyph=m>.7?59u:m>.4?44u:46u;
      if(tile==2u&&l.y==0){base=vec3(.30,.66,.24);glyph=n>.5?34u:39u;}
      vec3 lit=base*light;fg=lit*1.35;bg=lit*.62;material=1u;
    }else if(tile==3u||tile==16u||tile==17u){
      vec3 base=tile==3u?vec3(.46,.46,.52):tile==16u?vec3(.34,.27,.28):vec3(.18,.17,.20);
      glyph=rock(n,m);if(tile==17u)glyph=35u;
      vec3 lit=base*light*(.86+tileHash*.26);fg=lit*1.3;bg=lit*.6;material=2u;
    }else if(tile==4u){
      vec3 lit=vec3(.86,.74,.44)*light;glyph=n>.6?58u:46u;fg=lit*1.3;bg=lit*.66;material=1u;
    }else if(tile==5u){
      vec3 lit=vec3(.46,.28,.15)*light;glyph=l.x==1?124u:(l.x==0?40u:41u);fg=lit*1.5;bg=lit*.5;material=3u;
    }else if(tile==6u){
      vec3 lit=vec3(.20,.54,.20)*light*(.8+tileHash*.5);glyph=n>.6?37u:n>.3?38u:42u;fg=lit*1.5;bg=lit*.45;material=3u;
    }else if(tile==7u){
      vec3 lit=vec3(.66,.44,.24)*light;glyph=l.y==1?95u:61u;fg=lit*1.3;bg=lit*.62;material=1u;
    }else if(tile==8u){
      vec3 lit=vec3(.62,.38,.32)*light;glyph=l.y==1?95u:(l.x==0?124u:35u);fg=lit*1.25;bg=lit*.6;material=2u;
    }else if(tile==9u){
      float f=sin(u_time*11.0+float(t.x)*3.0);
      if(l.x==1&&l.y==0){glyph=f>0.0?42u:94u;fg=vec3(1.0,.8,.3);bg=light*vec3(.5,.36,.18);}
      else if(l.x==1){glyph=124u;fg=vec3(.5,.32,.16)*max(vec3(.5),light);}
    }else if(tile==10u||tile==11u){
      vec3 lit=vec3(.62,.40,.20)*light;
      if(tile==10u){glyph=l.x==1?35u:124u;fg=lit*1.4;bg=lit*.62;}
      else if(l.x==0){glyph=124u;fg=lit*1.4;}
      material=3u;
    }else if(tile==12u||tile==13u||tile==14u){
      vec3 base=vec3(.40,.40,.46);
      vec3 ore=tile==12u?vec3(.95,.52,.22):tile==13u?vec3(.82,.84,.92):vec3(.35,.85,1.0);
      vec3 lit=base*light;bg=lit*.6;fg=lit*1.2;glyph=rock(n,m);
      if(tileHash*7.0+float(l.x)*2.0+float(l.y)>3.0==(n>.28)){glyph=tile==14u?60u+uint(n>.5)*2u:42u;fg=ore*max(light,vec3(tile==14u?.8:.11));}
      material=2u;
    }else if(tile==15u){
      vec3 lit=vec3(.22,.14,.34)*max(light,vec3(.2));glyph=n>.6?37u:35u;fg=lit*1.5;bg=lit*.62;material=2u;
    }else if(tile==18u){
      vec3 lit=vec3(.66,.44,.24)*light;
      if(l.y==0){glyph=61u;fg=lit*1.5;bg=lit*.5;}else if(l.x!=1){glyph=124u;fg=lit*1.5;}
    }else if(tile==19u){
      float p=.7+.3*sin(u_time*3.0);
      glyph=l.y==0?(l.x==1?42u:86u):35u;fg=vec3(1.0,.42,.2)*p;bg=vec3(.3,.07,.05)*p;
    }else if(tile==20u){
      vec3 lit=vec3(.66,.44,.24)*light;glyph=l.y==0?61u:(l.x==1?32u:124u);fg=lit*1.5;
    }else if(tile==21u){
      if(l.y==1&&l.x==1){glyph=70u;fg=vec3(.5,.9,.8)*max(light,vec3(.35));}
    }else if(tile==22u){
      vec3 lit=vec3(.22,.5,.2)*light;glyph=n>.72?79u:37u;fg=n>.72?vec3(.85,.2,.3)*max(light,vec3(.2)):lit*1.4;bg=lit*.4;
    }

    // Liquids fill a tile from the bottom in eighths.
    if(liquid>0u&&!solid(tile)){
      uint kind=liquid>>4;float level=float(liquid&15u)/8.0;
      float cellTop=1.0-(float(l.y)+1.0)/${TILE_H}.0;
      if(cellTop<level){
        bool surface=cellTop+.5>=level&&(tileAt(t-ivec2(0,1)).g==0u);
        float wave=sin(float(wc.x)*.8+u_time*(kind==2u?1.2:2.4));
        if(kind==1u){
          vec3 tone=vec3(.10,.34,.72)*(light+vec3(.1));
          bg=mix(bg,tone,.84);fg=tone*1.9+vec3(.02);glyph=surface?(wave>0.0?126u:45u):(hash21(vec2(wc)+floor(u_time*.7))>.92?126u:32u);
        }else{
          float heat=.75+.25*sin(float(wc.x)*.5+float(wc.y)+u_time*1.6);
          bg=vec3(.86,.26,.05)*heat;fg=vec3(1.0,.78,.25);glyph=surface?(wave>0.0?94u:126u):(hash21(vec2(wc)+floor(u_time*2.0))>.8?42u:126u);
        }
        material=4u;
      }
    }

    if(u_crack.z>0&&t==u_crack.xy&&hash21(vec2(l)+3.0)<float(u_crack.z)/4.0){glyph=88u;fg=vec3(.04);}
    if(u_cursor.z>0&&t==u_cursor.xy){
      vec3 ring=u_cursor.z==1?vec3(1.0,.92,.55):vec3(.95,.3,.25);
      if(l.y==0&&l.x==0){glyph=91u;fg=ring;}else if(l.y==0&&l.x==${TILE_W-1}){glyph=93u;fg=ring;}
      else if(l.y==${TILE_H-1}&&l.x==0){glyph=91u;fg=ring;}else if(l.y==${TILE_H-1}&&l.x==${TILE_W-1}){glyph=93u;fg=ring;}
    }

    // Sprites sit in screen cells, so characters never smear between tiles.
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),b=texelFetch(u_sprites,ivec2(i,1),0),c=texelFetch(u_sprites,ivec2(i,2),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      if(rel.x<0||rel.y<0||rel.x>=int(b.g)||rel.y>=int(b.b))continue;
      uvec4 art=int(b.r)==255?uvec4(c.r,c.g,c.b,c.a):texelFetch(u_art,ivec2(rel.x,int(b.r)+rel.y),0);
      if(art.r==32u||art.r==0u)continue;
      vec3 colour=vec3(art.gba)/255.0;
      bool hit=(int(b.a)&1)==1,lit=(int(b.a)&2)==2;
      fg=hit?vec3(1.0):lit?colour:colour*max(light*1.2,vec3(.2));
      glyph=art.r;
      break;
    }
    writeCell(glyph,material,flags,1.0,fg,bg);
  }`;

  function compileFrames() {
    const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const names = Object.keys(FRAMES);
    let rows = 0;
    for (const name of names) rows += FRAMES[name][0].length * 2;
    const width = 16, data = new Uint8Array(width * rows * 4), index = {};
    const mirror = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[' };
    let y = 0;
    const write = (text, colours) => {
      for (const [r, line] of text.entries()) for (let x = 0; x < line.length; x++) {
        const at = ((y + r) * width + x) * 4, rgb = hex(PALETTE[colours[r][x]] || '#ffffff');
        data[at] = line.charCodeAt(x);
        data[at + 1] = rgb[0]; data[at + 2] = rgb[1]; data[at + 3] = rgb[2];
      }
    };
    for (const name of names) {
      const [text, colours] = FRAMES[name], h = text.length, w = text[0].length;
      for (const [r, line] of text.entries()) if (line.length !== w || colours[r].length !== w) throw new Error(`Frame ${name} row ${r} is uneven.`);
      index[name] = { y, w, h };
      write(text, colours);
      y += h;
      // A mirrored copy lets creatures face either way with correct slashes.
      write(text.map(line => [...line].reverse().map(ch => mirror[ch] || ch).join('')), colours.map(line => [...line].reverse().join('')));
      index[name + '.left'] = { y, w, h };
      y += h;
    }
    return { data, width, height: rows, index };
  }

  class BurrowView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['world', 'light', 'art', 'sprites', 'origin', 'window', 'cam', 'count', 'day', 'dusk', 'cursor', 'crack', 'glow', 'sun'], far: 2 });
      this.art = compileFrames();
      this.engine.setTexture('art', 6, this.art.width, this.art.height, this.art.data);
      this.spriteData = new Uint8Array(MAX_SPRITES * 3 * 4);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 3, this.spriteData);
      this.columns = 1;
      this.rows = 1;
      this.lightKey = '';
      this.lightAge = 0;
    }
    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
      const w = Math.ceil(this.columns / TILE_W) + 3 + MARGIN * 2, h = Math.ceil(this.rows / TILE_H) + 3 + MARGIN * 2;
      this.window = { w, h };
      this.worldData = new Uint8Array(w * h * 4);
      this.lightData = new Uint8Array(w * h * 4);
      this.lightKey = '';
    }
    // Top-left world cell of the view for a camera centred on (x, y) in tiles.
    camera(x, y) {
      const B = global.Burrow;
      const cx = Math.round(x * TILE_W - this.columns / 2), cy = Math.round(y * TILE_H - this.rows / 2);
      return {
        x: Math.max(0, Math.min(B.WIDTH * TILE_W - this.columns, cx)),
        y: Math.max(0, Math.min(B.HEIGHT * TILE_H - this.rows, cy))
      };
    }
    upload(state, cam, force) {
      const B = global.Burrow, { w, h } = this.window;
      const ox = Math.floor(cam.x / TILE_W) - MARGIN, oy = Math.floor(cam.y / TILE_H) - MARGIN, data = this.worldData;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const wx = x + ox, wy = y + oy, at = (y * w + x) * 4;
        if (wx < 0 || wy < 0 || wx >= B.WIDTH || wy >= B.HEIGHT) { data[at] = 17; data[at + 1] = 0; data[at + 2] = wy < 0 ? 0 : 2; continue; }
        const i = B.index(wx, wy);
        data[at] = state.tiles[i];
        data[at + 1] = state.liquid[i];
        data[at + 2] = state.walls[i];
      }
      this.engine.setTexture('world', 4, w, h, data);
      const key = ox + ',' + oy;
      this.lightAge++;
      if (force || key !== this.lightKey || state.dirty || this.lightAge > 12) {
        B.computeLight(state, ox, oy, w, h, this.lightData);
        this.engine.setTexture('light', 5, w, h, this.lightData);
        this.lightKey = key;
        this.lightAge = 0;
        state.dirty = false;
      }
      this.origin = [ox, oy];
    }
    // sprites: {x, y (screen cells), frame | char+colour, flash, lit}
    draw({ state, cam, sprites, cursor, crack, glow, sun, day, dusk, time, tint, dissolve }) {
      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length);
      const put = (i, row, a, b, c, d) => { const at = (row * MAX_SPRITES + i) * 4; data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d; };
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
        gl.uniform1f(u.dusk, dusk);
        gl.uniform3i(u.cursor, cursor ? cursor.x : 0, cursor ? cursor.y : 0, cursor ? cursor.kind : 0);
        gl.uniform3i(u.crack, crack ? crack.x : 0, crack ? crack.y : 0, crack ? crack.stage : 0);
        gl.uniform2f(u.glow, glow[0], glow[1]);
        gl.uniform3f(u.sun, sun[0], sun[1], sun[2]);
      }, { time, ink: false, tint, dissolve });
    }
    inspect() { return this.engine.inspect(); }
  }

  BurrowView.TILE_W = TILE_W;
  BurrowView.TILE_H = TILE_H;
  global.BurrowView = BurrowView;
})(window);
