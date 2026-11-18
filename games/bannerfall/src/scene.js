/* Bannerfall scene: every map tile is 3x2 character cells, seen from above. Fog dims what
 * your team cannot see, area abilities are drawn as rings, and units are ASCII figures
 * in team colours with health bars above them. */
(function (global) {
  'use strict';

  const TILE_W = 3, TILE_H = 2, MAX_SPRITES = 160, MAX_FX = 16;
  const BF = global.Bannerfall;

  // Characters are rows of text. In colour rows a letter names a palette entry and space is
  // none. t and T take the unit's team colour (bright and dark).
  const PALETTE = {
    w: '#f4f1e6', k: '#24222a', m: '#a8afbb', M: '#69707e', s: '#e8b48a', y: '#ffe05a', o: '#f09a2e', r: '#e0402c',
    g: '#6fc84a', G: '#3e8a34', b: '#8a5a32', p: '#b070e0', P: '#6a3a98', c: '#7ad8f0', v: '#d04a68'
  };
  const FRAMES = {
    warden: [['_^_', '[W]', '/ \\'], ['mmm', 'twt', 'T T']],
    wardenB: [['_^_', '[W]', '| |'], ['mmm', 'twt', 'T T']],
    wardenA: [['_^_', '[W>', '/ \\'], ['mmm', 'twm', 'T T']],
    ranger: [[' A ', '(R-', '/ \\'], [' t ', 'twm', 'T T']],
    rangerB: [[' A ', '(R-', '| |'], [' t ', 'twm', 'T T']],
    rangerA: [[' A ', '(R>', '/ \\'], [' t ', 'twy', 'T T']],
    ember: [[' * ', '{E}', '/ \\'], [' o ', 'twt', 'T T']],
    emberB: [[' * ', '{E}', '| |'], [' o ', 'twt', 'T T']],
    emberA: [['\\*/', '{E}', '/ \\'], ['oyo', 'twt', 'T T']],
    shade: [[' V ', '<S>', '/ \\'], [' P ', 'twt', 'T T']],
    shadeB: [[' V ', '<S>', '| |'], [' P ', 'twt', 'T T']],
    shadeA: [[' V ', '<S/', '/ \\'], [' P ', 'twm', 'T T']],
    melee: [['[]', '/\\'], ['tt', 'TT']],
    meleeB: [['[]', '||'], ['tt', 'TT']],
    ranged: [['()', '/\\'], ['tt', 'TT']],
    rangedB: [['()', '||'], ['tt', 'TT']],
    siege: [['[#]', 'O-O'], ['tmt', 'kMk']],
    siegeB: [['[#]', '0-0'], ['tmt', 'kMk']],
    tower: [[' ^ ', '/#\\', '|#|', '|_|'], [' t ', 'tmt', 'mtm', 'MMM']],
    rubble: [['   ', '   ', ' . ', '%_%'], ['   ', '   ', ' M ', 'MMM']],
    banner: [[' |###', ' |###', ' |## ', ' |   ', '/_\\  '], [' mttt', ' mtTt', ' mtt ', ' m   ', 'MMM  ']],
    bannerB: [[' |## ', ' |###', ' |###', ' |   ', '/_\\  '], [' mtt ', ' mttt', ' mtTt', ' m   ', 'MMM  ']],
    beast: [['<@>', '/V\\'], ['ooo', 'b b']],
    beastB: [['<@>', '|V|'], ['ooo', 'b b']],
    colossus: [[' /---\\ ', '<(O O)>', ' |%%%| ', ' /   \\ '], [' PPPPP ', 'ppyPypp', ' pPPPp ', ' P   P ']],
    colossusB: [[' /---\\ ', '<(O O)>', ' |%%%| ', ' |   | '], [' PPPPP ', 'ppyPypp', ' pPPPp ', ' P   P ']]
  };

  const SCENE = `
  uniform usampler2D u_map;
  uniform usampler2D u_art;
  uniform usampler2D u_sprites;
  uniform ivec2 u_cam;
  uniform int u_count;
  uniform int u_fxCount;
  uniform vec4 u_fx[${MAX_FX}];
  uniform vec4 u_fxb[${MAX_FX}];

  uvec4 tileAt(ivec2 t){
    if(t.x<0||t.y<0||t.x>=${BF.WIDTH}||t.y>=${BF.HEIGHT})return uvec4(0u,0u,0u,0u);
    return texelFetch(u_map,t,0);
  }

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0)));
    ivec2 l=wc-t*ivec2(${TILE_W},${TILE_H});
    uvec4 data=tileAt(t);
    uint tile=data.r;
    float seen=data.g==2u?1.0:(data.g==1u?.5:.34);
    float n=hash21(vec2(wc)*.731+3.1),m=hash21(vec2(t)*1.37+vec2(l)*.41),th=hash21(vec2(t)*.53);
    vec2 world=(vec2(wc)+.5)/vec2(${TILE_W}.0,${TILE_H}.0);
    bool redSide=world.x>${BF.WIDTH / 2}.0;

    uint glyph=32u;vec3 fg=vec3(0),bg=vec3(0);uint flags=3u;

    if(tile==0u){
      // Jungle canopy: dense leaves in uneven clumps.
      float clump=hash21(floor(vec2(wc)/vec2(4.0,3.0))*.91);
      vec3 leaf=mix(vec3(.10,.30,.12),vec3(.20,.42,.16),clump);
      glyph=n>.82?37u:n>.6?38u:n>.36?35u:n>.18?64u:42u;
      fg=leaf*(1.25+m*.35);bg=leaf*.32;
    }else if(tile==1u){
      vec3 floorTone=vec3(.17,.22,.12);
      glyph=n>.9?34u:n>.8?44u:n>.72?39u:32u;
      fg=floorTone*2.2;bg=floorTone*.7;
    }else if(tile==2u){
      vec3 dirt=vec3(.42,.34,.22);
      glyph=n>.93?58u:n>.84?46u:n>.8?44u:32u;
      fg=dirt*1.5;bg=dirt*.55;
    }else if(tile==3u){
      float wave=sin(float(wc.x)*.7+float(wc.y)*1.3+u_time*1.8);
      vec3 water=vec3(.10,.28,.52);
      glyph=wave>.55?126u:(n>.9?45u:32u);
      fg=vec3(.45,.72,.95);bg=water*(.85+.15*wave);
    }else if(tile==4u){
      vec3 stone=redSide?vec3(.36,.22,.22):vec3(.20,.26,.38);
      glyph=(l.x==0&&l.y==0)?43u:(l.y==1?95u:32u);
      fg=stone*1.7;bg=stone*.62*(.9+th*.2);
    }else if(tile==5u){
      vec3 stone=vec3(.26,.20,.30);
      glyph=n>.7?58u:46u;
      fg=stone*1.8;bg=stone*.6;
    }
    // Bulwark stone set in this tile for a few seconds.
    if(data.b>0u){
      vec3 stone=data.b==1u?vec3(.42,.52,.72):vec3(.72,.42,.40);
      glyph=l.y==0?35u:61u;fg=stone*1.4;bg=stone*.45;
    }
    fg*=seen;bg*=seen;
    if(data.g!=2u){float grey=dot(fg,vec3(.33));fg=mix(fg,vec3(grey),.35);grey=dot(bg,vec3(.33));bg=mix(bg,vec3(grey),.35);}

    // Area effects: x, y, radius (tiles), kind; then progress, team, and two spare values.
    for(int i=0;i<u_fxCount;i++){
      vec4 f=u_fx[i],fb=u_fxb[i];
      vec2 d=(world-f.xy)*vec2(1.0,1.0);
      float r=length(d);
      if(r>f.z+.6)continue;
      int kind=int(f.w);
      vec3 tone=fb.y<.5?vec3(.35,.65,1.0):fb.y<1.5?vec3(1.0,.42,.32):vec3(1.0,.85,.35);
      bool edge=r>f.z-.45&&r<=f.z+.15;
      if(kind==1){ // trap
        if(r<.6){glyph=94u;fg=tone;}
      }else if(kind==2){ // arrow storm
        if(r<=f.z){bg=mix(bg,tone*.35,.45);if(hash21(vec2(wc)+floor(u_time*9.0))>.8){glyph=hash21(vec2(wc)*1.7)>.5?124u:92u;fg=vec3(1.0,.92,.6);}}
        else if(edge){glyph=46u;fg=tone;}
      }else if(kind==3){ // frost field
        if(r<=f.z){bg=mix(bg,vec3(.55,.8,1.0)*.4,.55);if(n>.78){glyph=n>.92?42u:46u;fg=vec3(.85,.95,1.0);}}
        if(edge){glyph=42u;fg=vec3(.7,.9,1.0);}
      }else if(kind==4){ // meteor marker fills as it falls
        if(r<=f.z*fb.x){bg=mix(bg,vec3(.8,.22,.08),.35);}
        if(edge){glyph=fract(u_time*4.0)>.5?33u:46u;fg=vec3(1.0,.45,.2);}
      }else if(kind==5){ // burst flash
        if(r<=f.z){bg=mix(bg,tone*.8,(1.0-fb.x)*.6);if(n>.6){glyph=42u;fg=mix(tone,vec3(1.0),.5);}}
      }else if(kind==6){ // recall ring
        if(edge&&n>.3){glyph=fract(u_time*3.0+n)>.5?43u:46u;fg=vec3(.55,.8,1.0);}
      }else if(kind==7){ // the cursor's chosen target
        if(edge){glyph=(world.x<f.x)?91u:93u;fg=tone;}
      }else if(kind==8){ // ability range preview
        if(edge&&n>.55){glyph=46u;fg=vec3(.95,.9,.6);}
      }
    }

    // Sprites sit in screen cells. Earlier sprites draw on top; a bar may sit one row above.
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),b=texelFetch(u_sprites,ivec2(i,1),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      int w=int(b.g),h=int(b.b),fl=int(b.a);
      if((fl&8)!=0&&rel.y==-1&&rel.x>=0&&rel.x<w){
        uvec4 c=texelFetch(u_sprites,ivec2(i,3),0);
        float fill=float(c.a)/255.0*float(w);
        bool on=float(rel.x)+.5<=fill;
        glyph=on?61u:45u;fg=on?vec3(c.rgb)/255.0:vec3(.35,.3,.3);bg=bg*.4;
        break;
      }
      if(rel.x<0||rel.y<0||rel.x>=w||rel.y>=h)continue;
      uvec4 art;
      uvec4 c2=texelFetch(u_sprites,ivec2(i,2),0);
      if(int(b.r)==255)art=c2;
      else art=texelFetch(u_art,ivec2(rel.x,int(b.r)+rel.y),0);
      if(art.r==32u||art.r==0u)continue;
      vec3 colour=vec3(art.gba)/255.0;
      // Palette slots 1 and 2 mean the team colour, bright and dark.
      if(art.g==1u&&art.b==0u&&art.a==0u)colour=vec3(c2.rgb)/255.0;
      else if(art.g==2u&&art.b==0u&&art.a==0u)colour=vec3(c2.rgb)/255.0*.62;
      fg=(fl&1)!=0?vec3(1.0):colour;
      if((fl&4)!=0)fg=mix(fg,vec3(.6,.75,1.0),.55);
      glyph=art.r;
      break;
    }
    writeCell(glyph,0u,flags,1.0,fg,bg);
  }`;

  function compileFrames() {
    const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const names = Object.keys(FRAMES);
    let rows = 0;
    for (const name of names) rows += FRAMES[name][0].length * 2;
    const width = 16, data = new Uint8Array(width * rows * 4), index = {};
    const mirror = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{' };
    let y = 0;
    const write = (text, colours) => {
      for (const [r, line] of text.entries()) for (let x = 0; x < line.length; x++) {
        const at = ((y + r) * width + x) * 4, key = colours[r][x];
        data[at] = line.charCodeAt(x);
        // Team slots are stored as tiny marker colours the shader swaps out.
        const rgb = key === 't' ? [1, 0, 0] : key === 'T' ? [2, 0, 0] : hex(PALETTE[key] || '#ffffff');
        data[at + 1] = rgb[0]; data[at + 2] = rgb[1]; data[at + 3] = rgb[2];
      }
    };
    for (const name of names) {
      const [text, colours] = FRAMES[name], h = text.length, w = text[0].length;
      for (const [r, line] of text.entries()) if (line.length !== w || colours[r].length !== w) throw new Error(`Frame ${name} row ${r} is uneven.`);
      for (const line of text) if (/[a-z]/.test(line)) throw new Error(`Frame ${name} uses a lowercase letter, which the font cannot draw.`);
      index[name] = { y, w, h };
      write(text, colours);
      y += h;
      // A mirrored copy lets units face either way with correct slashes.
      write(text.map(line => [...line].reverse().map(ch => mirror[ch] || ch).join('')), colours.map(line => [...line].reverse().join('')));
      index[name + '.left'] = { y, w, h };
      y += h;
    }
    return { data, width, height: rows, index };
  }

  class BannerfallView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['map', 'art', 'sprites', 'cam', 'count', 'fxCount', 'fx', 'fxb'], far: 2 });
      this.art = compileFrames();
      this.engine.setTexture('art', 6, this.art.width, this.art.height, this.art.data);
      this.spriteData = new Uint8Array(MAX_SPRITES * 4 * 4);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, this.spriteData);
      this.mapData = new Uint8Array(BF.WIDTH * BF.HEIGHT * 4);
      this.fx = new Float32Array(MAX_FX * 4);
      this.fxb = new Float32Array(MAX_FX * 4);
      this.columns = 1;
      this.rows = 1;
    }
    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
    }
    // Top-left world cell of the view for a camera centred on (x, y) in tiles.
    camera(x, y) {
      const cx = Math.round(x * TILE_W - this.columns / 2), cy = Math.round(y * TILE_H - this.rows / 2);
      // The view may run a little past the map edge so a base is never jammed under the HUD.
      const padX = Math.round(this.columns * 0.18), padY = Math.round(this.rows * 0.22);
      const maxX = BF.WIDTH * TILE_W - this.columns, maxY = BF.HEIGHT * TILE_H - this.rows;
      return {
        x: maxX < 0 ? Math.round(maxX / 2) : Math.max(-padX, Math.min(maxX + padX, cx)),
        y: maxY < 0 ? Math.round(maxY / 2) : Math.max(-padY, Math.min(maxY + padY, cy))
      };
    }
    // tiles: the map; sight: 2 seen now, 1 seen before, 0 never; walls: tile index -> team + 1.
    uploadMap(tiles, sight, walls) {
      const data = this.mapData;
      for (let i = 0; i < tiles.length; i++) {
        data[i * 4] = tiles[i];
        data[i * 4 + 1] = sight[i];
        data[i * 4 + 2] = walls.get(i) || 0;
      }
      this.engine.setTexture('map', 4, BF.WIDTH, BF.HEIGHT, data);
    }
    // sprites: {x, y (screen cells), frame | char+colour, team colour, flash, ally, bar: {fill, colour}}
    // fx: {x, y, r (tiles), kind, progress, team}
    draw({ cam, sprites, fx, time, tint, dissolve }) {
      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length);
      const put = (i, row, a, b, c, d) => { const at = (row * MAX_SPRITES + i) * 4; data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d; };
      for (let i = 0; i < count; i++) {
        const s = sprites[i], x = s.x + 2048, y = s.y + 2048, flags = (s.flash ? 1 : 0) | (s.shade ? 4 : 0) | (s.bar ? 8 : 0);
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
      const fxCount = Math.min(MAX_FX, fx.length);
      this.fx.fill(0);
      this.fxb.fill(0);
      for (let i = 0; i < fxCount; i++) {
        const f = fx[i];
        this.fx.set([f.x, f.y, f.r, f.kind], i * 4);
        this.fxb.set([f.progress || 0, f.team ?? 2, 0, 0], i * 4);
      }
      this.engine.render((gl, u) => {
        gl.uniform2i(u.cam, cam.x, cam.y);
        gl.uniform1i(u.count, count);
        gl.uniform1i(u.fxCount, fxCount);
        gl.uniform4fv(u.fx, this.fx);
        gl.uniform4fv(u.fxb, this.fxb);
      }, { time, ink: false, tint, dissolve });
    }
    inspect() { return this.engine.inspect(); }
  }

  BannerfallView.TILE_W = TILE_W;
  BannerfallView.TILE_H = TILE_H;
  BannerfallView.FRAMES = FRAMES;
  global.BannerfallView = BannerfallView;
})(window);
