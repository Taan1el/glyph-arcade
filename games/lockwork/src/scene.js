/* Lockwork scene: fixed top-down 15x11 brass vault at 4x3 cells per tile.
 * Draws burnished brass walls, glowing amber/cyan beams, clockwork mechanisms and the engineer. */
(function (global) {
  'use strict';

  const TILE_W = 4, TILE_H = 3, MAX_SPRITES = 96;
  const L = global.Lockwork;

  const PALETTE = {
    w: '#f6eed8', y: '#ffd447', c: '#4ce8ff', o: '#e88238', b: '#a87838',
    g: '#52e062', r: '#ff5244', m: '#9e9278', M: '#5c5240', p: '#c878ff'
  };

  const FRAMES = {
    player: [[' [@]', '/|#\\', ' / \\'], [' wyw', 'bobw', ' b b']],
    crate:  [['+==+', '|##|', '+==+'], ['bwwb', 'oooo', 'bwwb']],
    bridge: [[' || ', '-++-', ' || '], [' yy ', 'ywwy', ' yy ']],
    pipeH:  [['+==+', '----', '+==+'], ['bbbb', 'yyyy', 'bbbb']],
    pipeV:  [[' || ', ' || ', ' || '], [' yy ', ' yy ', ' yy ']],
    mir0:   [['.  .', ' // ', '.  .'], ['m  m', ' ww ', 'm  m']],
    mir1:   [['.  .', ' \\\\ ', '.  .'], ['m  m', ' ww ', 'm  m']],
    spl0:   [['----', ' TT ', ' || '], ['mmmm', ' oo ', ' yy ']],
    spl1:   [[' || ', '-TT|', ' || '], [' yy ', 'yoom', ' yy ']],
    spl2:   [[' || ', ' TT ', '----'], [' yy ', ' oo ', 'mmmm']],
    spl3:   [[' || ', '|TT-', ' || '], [' yy ', 'mooy', ' yy ']],
    gen0:   [['+^^+', '|GG|', '+--+'], ['bttb', 'btwb', 'bbbb']],
    gen1:   [['+--+', '|(G>', '+--+'], ['bbbb', 'btwt', 'bbbb']],
    gen2:   [['+--+', '|GG|', '+VV+'], ['bbbb', 'btwb', 'bttb']],
    gen3:   [['+--+', '<G)|', '+--+'], ['bbbb', 'twtb', 'bbbb']],
    pulseOn:  [['+**+', '(PP)', '+**+'], ['yyyy', 'ywwy', 'yyyy']],
    pulseOff: [['+..+', '(PP)', '+..+'], ['MMMM', 'MbbM', 'MMMM']],
    cap1:   [['+--+', '|[1]', '+--+'], ['bbbb', 'byyb', 'bbbb']],
    cap2:   [['+--+', '|[2]', '+--+'], ['bbbb', 'boob', 'bbbb']],
    invOn:  [['+!!+', '|!!|', '+--+'], ['yyyy', 'ywwy', 'bbbb']],
    invOff: [['+!!+', '|!!|', '+--+'], ['pppp', 'pMMp', 'MMMM']],
    recOff: [['.().', '(OO)', '.().'], ['mttm', 'tMMt', 'mttm']],
    recOn:  [['.**.', '*@@*', '.**.'], ['wttw', 'twwt', 'wttw']]
  };

  function compileFrames() {
    const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    const names = Object.keys(FRAMES);
    let rows = 0;
    for (const name of names) rows += FRAMES[name][0].length;
    const width = 8, data = new Uint8Array(width * rows * 4), index = {};
    let y = 0;
    for (const name of names) {
      const [text, colours] = FRAMES[name], h = text.length, w = text[0].length;
      for (const [r, line] of text.entries()) {
        if (line.length !== w || colours[r].length !== w) throw new Error(`Frame ${name} row ${r} uneven.`);
        if (/[a-z]/.test(line)) throw new Error(`Frame ${name} uses lowercase glyph.`);
      }
      index[name] = { y, w, h };
      for (let r = 0; r < h; r++) {
        for (let x = 0; x < w; x++) {
          const at = ((y + r) * width + x) * 4, key = colours[r][x];
          data[at] = text[r].charCodeAt(x);
          const rgb = key === 't' ? [1, 0, 0] : hex(PALETTE[key] || '#ffffff');
          data[at + 1] = rgb[0]; data[at + 2] = rgb[1]; data[at + 3] = rgb[2];
        }
      }
      y += h;
    }
    return { data, width, height: rows, index };
  }

  const SCENE = `
  uniform usampler2D u_board;
  uniform usampler2D u_art;
  uniform usampler2D u_sprites;
  uniform ivec2 u_cam;
  uniform int u_count;
  uniform ivec3 u_hint;

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0)));
    ivec2 l=wc-t*ivec2(${TILE_W},${TILE_H});

    uint glyph=32u;vec3 fg=vec3(.12,.09,.06);vec3 bg=vec3(.07,.055,.04);

    if(t.x>=0&&t.y>=0&&t.x<${L.WIDTH}&&t.y<${L.HEIGHT}){
      uvec4 info=texelFetch(u_board,t,0);
      uint tile=info.r, amber=info.g, cyan=info.b, meta=info.a;
      float n=hash21(vec2(t)*.73+vec2(l)*.31);
      bg=vec3(.094,.074,.055);
      fg=vec3(.24,.18,.12);
      glyph=(l.x==0&&l.y==0&&n>.35)?46u:32u;

      if(tile==1u){ // Brass wall '#'
        bg=vec3(.24,.18,.10);fg=vec3(.62,.48,.22);
        glyph=(l.y==0||l.y==2)?61u:(l.x==0||l.x==3?124u:35u);
      }else if(tile==7u){ // Locked master bronze crate
        bg=vec3(.22,.14,.08);fg=vec3(.75,.48,.24);
        glyph=(l.y==1&&(l.x==1||l.x==2))?88u:35u;
      }else if(tile==2u){ // Exit vault door
        bool open=(meta&1u)!=0u;
        float p=.8+.2*sin(u_time*5.0);
        vec3 col=open?vec3(.32,.88,.38)*p:vec3(.48,.40,.28);
        bg=col*.22;fg=col;
        if(l.y==1){glyph=l.x==0?123u:(l.x==3?125u:(open?42u:79u));}
        else glyph=l.x==1||l.x==2?61u:43u;
      }else if(tile==3u){ // Pressure plate
        bool pressed=(meta&2u)!=0u;
        fg=pressed?vec3(1.0,.86,.35):vec3(.78,.46,.22);
        bg=pressed?vec3(.28,.22,.08):vec3(.16,.11,.07);
        glyph=l.y==1?(l.x==0?91u:(l.x==3?93u:95u)):46u;
      }else if(tile==4u){ // Sliding shutter gate
        bool open=(meta&2u)!=0u;
        if(!open){
          bg=vec3(.28,.15,.08);fg=vec3(.82,.45,.22);
          glyph=l.y==1?35u:61u;
        }else{
          fg=vec3(.38,.30,.20);
          glyph=(l.x==0||l.x==3)?61u:46u;
        }
      }else if(tile==5u||tile==6u){ // Amber ':' or Cyan ';' filter
        vec3 col=tile==5u?vec3(1.0,.82,.26):vec3(.28,.90,1.0);
        bg=col*.16;fg=col;
        glyph=(l.x==1||l.x==2)?58u:46u;
      }

      // Beams on floor/gates/filters
      bool aH=(amber&10u)!=0u, aV=(amber&5u)!=0u;
      bool cH=(cyan&10u)!=0u, cV=(cyan&5u)!=0u;
      if((aH||aV||cH||cV)&&tile!=1u&&tile!=7u){
        bool horiz=(aH||cH)&&l.y==1;
        bool vert=(aV||cV)&&(l.x==1||l.x==2);
        if(horiz||vert){
          vec3 bcol=(cH||cV)&&(aH||aV)?vec3(.78,1.0,.78):((cH&&horiz)||(cV&&vert))?vec3(.30,.92,1.0):vec3(1.0,.84,.28);
          fg=bcol*(.9+.1*sin(u_time*10.0));
          bg=mix(bg,bcol*.32,.55);
          glyph=(horiz&&vert)?42u:(horiz?45u:124u);
        }
      }

      // Hint highlight
      if(u_hint.z>0&&t==u_hint.xy){
        float p=.65+.35*sin(u_time*8.0);
        bg=mix(bg,vec3(.3,.55,.2),.4*p);
        if((l.x==0||l.x==3)&&(l.y==0||l.y==2)){fg=vec3(.45,1.0,.55);glyph=l.x==0?91u:93u;}
      }
    }

    // Sprites (mechanisms, player)
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),b=texelFetch(u_sprites,ivec2(i,1),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      int w=int(b.g),h=int(b.b);
      if(rel.x<0||rel.y<0||rel.x>=w||rel.y>=h)continue;
      uvec4 c2=texelFetch(u_sprites,ivec2(i,2),0);
      uvec4 art=texelFetch(u_art,ivec2(rel.x,int(b.r)+rel.y),0);
      if(art.r==32u||art.r==0u)continue;
      vec3 colour=vec3(art.gba)/255.0;
      if(art.g==1u&&art.b==0u&&art.a==0u)colour=vec3(c2.rgb)/255.0;
      fg=colour;
      bg=mix(bg,fg*.24,.55);
      glyph=art.r;
      break;
    }

    writeCell(glyph,0u,3u,1.0,fg,bg);
  }`;

  class LockworkView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['board', 'art', 'sprites', 'cam', 'count', 'hint'], far: 2 });
      this.art = compileFrames();
      this.engine.setTexture('art', 6, this.art.width, this.art.height, this.art.data);
      this.boardData = new Uint8Array(L.WIDTH * L.HEIGHT * 4);
      this.spriteData = new Uint8Array(MAX_SPRITES * 4 * 4);
      this.engine.setTexture('board', 4, L.WIDTH, L.HEIGHT, this.boardData);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, this.spriteData);
      this.columns = 1;
      this.rows = 1;
    }

    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
    }

    camera() {
      const bw = L.WIDTH * TILE_W, bh = L.HEIGHT * TILE_H;
      return {
        x: Math.round((bw - this.columns) / 2),
        y: Math.round((bh - this.rows) / 2)
      };
    }

    draw({ state, time, tint }) {
      const v = state.vault;
      const meta = (v.unlocked ? 1 : 0) | (v.gatesOpen ? 2 : 0);
      for (let i = 0; i < v.tiles.length; i++) {
        this.boardData[i * 4] = v.tiles[i];
        this.boardData[i * 4 + 1] = v.beamsAmber[i];
        this.boardData[i * 4 + 2] = v.beamsCyan[i];
        this.boardData[i * 4 + 3] = meta;
      }
      this.engine.setTexture('board', 4, L.WIDTH, L.HEIGHT, this.boardData);

      const cam = this.camera();
      const sprites = [];
      const push = (tx, ty, frame, team = [255, 212, 71]) => {
        sprites.push({ x: tx * TILE_W - cam.x, y: ty * TILE_H - cam.y, frame, team });
      };

      // Player first so player always renders clearly on top (even on plates/open gates).
      push(v.px, v.py, 'player');

      for (const r of v.receptors) {
        push(r.x, r.y, r.lit ? 'recOn' : 'recOff', r.color === 2 ? [76, 232, 255] : [255, 212, 71]);
      }
      for (const o of v.objs) {
        if (o.kind === 'gen') push(o.x, o.y, 'gen' + o.dir, o.color === 2 ? [76, 232, 255] : [255, 212, 71]);
        else if (o.kind === 'pulse') push(o.x, o.y, v.vaultTick % 2 === 0 ? 'pulseOn' : 'pulseOff');
        else if (o.kind === 'cap') push(o.x, o.y, 'cap' + o.delay);
        else if (o.kind === 'inv') {
          const lit = v.beamsAmber[o.y * L.WIDTH + o.x] > 0 || v.beamsAmber[(o.y + L.DIRS[o.dir][1]) * L.WIDTH + (o.x + L.DIRS[o.dir][0])] > 0;
          push(o.x, o.y, lit ? 'invOn' : 'invOff');
        }
        else if (o.kind === 'mirror') push(o.x, o.y, 'mir' + o.rot);
        else if (o.kind === 'splitter') push(o.x, o.y, 'spl' + o.rot);
        else if (o.kind === 'crate') push(o.x, o.y, 'crate');
        else if (o.kind === 'bridge') push(o.x, o.y, 'bridge');
        else if (o.kind === 'pipe') push(o.x, o.y, o.rot === 0 ? 'pipeH' : 'pipeV');
      }

      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length);
      const put = (i, row, a, b, c, d) => { const at = (row * MAX_SPRITES + i) * 4; data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d; };
      for (let i = 0; i < count; i++) {
        const s = sprites[i], x = s.x + 2048, y = s.y + 2048, f = this.art.index[s.frame];
        put(i, 0, x & 255, x >> 8, y & 255, y >> 8);
        put(i, 1, f.y, f.w, f.h, 0);
        put(i, 2, s.team[0], s.team[1], s.team[2], 0);
      }
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, data);

      const h = state.hint;
      this.engine.render((gl, u) => {
        gl.uniform2i(u.cam, cam.x, cam.y);
        gl.uniform1i(u.count, count);
        gl.uniform3i(u.hint, h ? h.x : 0, h ? h.y : 0, h ? 1 : 0);
      }, { time, ink: false, tint });
    }

    inspect() { return this.engine.inspect(); }
  }

  LockworkView.TILE_W = TILE_W;
  LockworkView.TILE_H = TILE_H;
  LockworkView.FRAMES = FRAMES;
  global.LockworkView = LockworkView;
})(window);
