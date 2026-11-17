/* Irongrid scene: fixed top-down 8x8 tactical island grid at 6x4 cells per square (48x32 cells).
 * Draws slate terrain, gold relays, steel-blue steam rigs, toxic-green insects and crimson telegraphs. */
(function (global) {
  'use strict';

  const TILE_W = 6, TILE_H = 4, MAX_SPRITES = 48;
  const R = global.IrongridRules;

  const PALETTE = {
    w: '#f4f8ff', y: '#ffd147', b: '#58b8ff', c: '#74e8ff', s: '#8fa4ba',
    g: '#72d648', r: '#ff4438', o: '#ff9436', p: '#b878ff', d: '#4d6073',
    k: '#23303d', q: '#c8f058'
  };

  // Every frame string uses ONLY uppercase letters, digits and allowed symbols (6x4, Boss 12x4).
  const FRAMES = {
    titan: [
      [' _==_ ', '/[TT]\\', '| ## |', ' ==== '],
      [' tttt ', 'wbttbw', 'b ss b', ' dddd ']
    ],
    howitzer: [
      [' /==\\ ', '|[AA]|', '| /\\ |', ' ==== '],
      [' ytty ', 'tcttc ', 'b ww b', ' dddd ']
    ],
    aegis: [
      [' ^==^ ', '<[SS]>', ' /||\\ ', '  ^^  '],
      [' cttc ', 'wbttbw', ' bppb ', '  cc  ']
    ],
    pincer: [
      [' \\VV/ ', '<(OO)>', ' /||\\ ', '  /\\  '],
      [' rggy ', 'ggrrgg', ' dggd ', '  gg  ']
    ],
    spitter: [
      [' .**. ', '({**})', ' |~~| ', ' /  \\ '],
      [' qyyq ', 'gqyyqg', ' dggd ', ' g  g ']
    ],
    beetle: [
      [' /##\\ ', '|[@]@|', '|####|', ' \\==/ '],
      [' oggo ', 'ogrgro', ' gggg ', ' dddd ']
    ],
    webber: [
      ['/\\==/\\', '|(&)&|', '\\ :: /', ' /\\/\\ '],
      ['wgttgw', 'gwrrwg', 'g ww g', ' g  g ']
    ],
    hornet: [
      ['/\\  /\\', ' ^WW^ ', ' \\()/ ', '  \\/  '],
      ['wc  cw', ' yggy ', ' dqqd ', '  rr  ']
    ],
    queen: [
      ['  /======\\  ', '/###/#\\####\\', '|###****###|', ' //\\\\//\\\\// '],
      ['  orrrrro   ', 'orrgryrgrrro', 'rggyyyyyyggr', ' gggggggggg ']
    ],
    egg: [
      ['  ..  ', ' (**) ', ' (##) ', '  --  '],
      ['  yy  ', ' yqqy ', ' oggo ', '  dd  ']
    ],
    relay: [
      [' /^^\\ ', '|[HH]|', '|[##]|', '======'],
      [' yyyy ', 'ycyycy', 'yssyss', 'oooooo']
    ],
    train: [
      ['======', '[====]', '|[::]|', 'O====O'],
      ['ssssss', 'yooooy', 'sccccs', 'wswwsw']
    ]
  };

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
  uniform ivec4 u_cursor;

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(${TILE_W}.0,${TILE_H}.0)));
    ivec2 l=wc-t*ivec2(${TILE_W},${TILE_H});

    uint glyph=32u;vec3 fg=vec3(.18,.24,.30);vec3 bg=vec3(.05,.07,.09);

    if(t.x>=0&&t.y>=0&&t.x<${R.BOARD_SIZE}&&t.y<${R.BOARD_SIZE}){
      uvec4 info=texelFetch(u_board,t,0);
      uint ter=info.r, ov=info.g, thr=info.b, pdir=info.a;
      bool alt=((t.x+t.y)&1)==0;
      float n=hash21(vec2(t)*.81+vec2(l)*.29);

      // Base slate-teal checkerboard
      bg=alt?vec3(.102,.141,.188):vec3(.141,.196,.259);
      fg=alt?vec3(.24,.31,.40):vec3(.29,.37,.47);
      glyph=(l.x==0&&l.y==0&&n>.38)?46u:32u;

      if(ter==1u){ // Supply rail road
        bg=vec3(.16,.18,.22);fg=vec3(.48,.52,.58);
        glyph=(l.y==1||l.y==2)?61u:((l.x==0||l.x==5)?124u:46u);
      }else if(ter==2u){ // Mountain peak
        bg=vec3(.22,.24,.28);fg=vec3(.62,.68,.76);
        if(l.y==0)glyph=(l.x==2||l.x==3)?94u:32u;
        else if(l.y==1)glyph=(l.x==1?47u:(l.x==4?92u:(l.x==2||l.x==3?94u:32u)));
        else if(l.y==2)glyph=(l.x==0?47u:(l.x==5?92u:35u));
        else glyph=61u;
      }else if(ter==3u){ // Deep water
        float wv=.78+.22*sin(u_time*2.6+float(t.x*2+l.x)*.7+float(t.y));
        bg=vec3(.06,.18,.32);fg=vec3(.22,.71,1.0)*wv;
        glyph=((l.x+l.y)&1)==0?126u:46u;
      }else if(ter==4u){ // Chasm / void pit
        bg=vec3(.025,.035,.05);fg=vec3(.18,.24,.32);
        glyph=l.y==0?61u:(l.x==2&&l.y==2?46u:32u);
      }else if(ter==5u){ // Cracked ground
        bg=vec3(.21,.17,.14);fg=vec3(.78,.56,.36);
        glyph=(l.y==1||l.y==2)?((l.x==1||l.x==3)?92u:47u):46u;
      }else if(ter==6u){ // Relay foundation pad
        bg=vec3(.24,.20,.10);fg=vec3(.78,.64,.24);
        glyph=(l.y==3||l.y==0)?61u:32u;
      }

      // Overlays on floor
      if((ov&1u)!=0u){ // Reachable blue move highlight
        bg=mix(bg,vec3(.12,.36,.72),.55);
        if((l.x==0||l.x==5)&&(l.y==0||l.y==3)){fg=vec3(.38,.78,1.0);glyph=l.x==0?91u:93u;}
      }
      if((ov&2u)!=0u){ // Legal card target highlight
        float p=.75+.25*sin(u_time*5.0);
        bg=mix(bg,vec3(.58,.14,.14),.45*p);
        if((l.x==0||l.x==5)&&(l.y==0||l.y==3)){fg=vec3(1.0,.52,.32);glyph=l.x==0?123u:125u;}
      }
      if((ov&4u)!=0u){ // Spawn fissure %
        float p=.72+.28*sin(u_time*6.0+float(t.x));
        bg=mix(bg,vec3(.38,.16,.04),.62);
        if(l.y==1||l.y==2){
          if(l.x==2||l.x==3){fg=vec3(1.0,.58,.20)*p;glyph=37u;}
          else if(l.x==1||l.x==4){fg=vec3(.88,.42,.16);glyph=l.x==1?47u:92u;}
        }
      }
      if((ov&16u)!=0u&&ter!=2u&&ter!=6u){ // Mine [*]
        if(l.y==2&&(l.x>=1&&l.x<=3)){
          fg=l.x==2?vec3(1.0,.32,.26):vec3(1.0,.82,.28);
          glyph=l.x==1?91u:(l.x==3?93u:42u);
        }
      }
      if((ov&8u)!=0u){ // Smoke cloud :::
        bg=mix(bg,vec3(.28,.33,.40),.55);
        if(((l.x+l.y)&1)==0){fg=vec3(.70,.78,.88);glyph=58u;}
      }
      if((ov&32u)!=0u){ // Hazard telegraph !
        float p=.65+.35*sin(u_time*8.0);
        bg=mix(bg,vec3(.45,.18,.08),.45*p);
        if(l.x==5&&l.y==0){fg=vec3(1.0,.82,.25);glyph=33u;}
      }
      if((ov&64u)!=0u){ // Bubble shield aura ( )
        bg=mix(bg,vec3(.26,.16,.44),.45);
        if(l.x==0||l.x==5){fg=vec3(.76,.52,1.0);glyph=l.x==0?40u:41u;}
      }

      // Crimson enemy telegraphs
      if((thr&1u)!=0u){
        float p=.65+.35*sin(u_time*7.0);
        bg=mix(bg,vec3(.46,.08,.08),.42*p);
        if(l.y==0&&(l.x==2||l.x==3)){fg=vec3(1.0,.30,.24);glyph=l.x==2?40u:88u;}
        if(l.y==0&&l.x==4){fg=vec3(1.0,.30,.24);glyph=41u;}
      }
      if((thr&30u)!=0u){
        vec3 acol=vec3(1.0,.28,.22);
        if((thr&2u)!=0u&&l.x==5&&(l.y==1||l.y==2)){fg=acol;glyph=62u;} // >
        if((thr&4u)!=0u&&l.x==0&&(l.y==1||l.y==2)){fg=acol;glyph=60u;} // <
        if((thr&8u)!=0u&&l.y==3&&(l.x==2||l.x==3)){fg=acol;glyph=86u;} // V
        if((thr&16u)!=0u&&l.y==0&&(l.x==2||l.x==3)){fg=acol;glyph=94u;} // ^
      }

      // Action preview push/collision arrow
      if((thr&32u)!=0u){
        bg=mix(bg,vec3(.48,.22,.56),.55);
        if(l.x==0&&l.y==3){
          fg=vec3(1.0,.88,.30);
          glyph=pdir==1u?62u:(pdir==2u?60u:(pdir==3u?86u:(pdir==4u?94u:33u)));
        }
      }

      // Active cursor / selected hover tile
      if(u_cursor.z>0&&t==u_cursor.xy){
        if((l.x==0||l.x==5)&&(l.y==0||l.y==3)){
          fg=u_cursor.w>0?vec3(1.0,.86,.30):vec3(.95,.98,1.0);
          glyph=l.x==0?91u:93u;
        }
      }
    }

    // Sprites: Relays, Train, Player Rigs, Foes
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0);
      uvec4 b=texelFetch(u_sprites,ivec2(i,1),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      int w=int(b.g),h=int(b.b);
      if(rel.x<0||rel.y<0||rel.x>=w||rel.y>=h)continue;
      uvec4 c2=texelFetch(u_sprites,ivec2(i,2),0);
      uvec4 c3=texelFetch(u_sprites,ivec2(i,3),0);
      uint hp=c3.r, maxHp=c3.g, flags=c3.b;

      // Live HP pip strip along sprite bottom row inside [1..w-2]
      if(maxHp>0u&&rel.y==h-1&&rel.x>=1&&rel.x<w-1){
        uint pips=uint(w-2);
        uint idx=uint(rel.x-1);
        uint filled=(hp*pips+maxHp-1u)/maxHp;
        if(maxHp<=pips){
          if(idx<maxHp){
            glyph=idx<hp?42u:46u;
            fg=idx<hp?((flags&16u)!=0u?vec3(.40,.92,.48):vec3(.96,.38,.30)):vec3(.30,.36,.44);
            bg=vec3(.07,.10,.14);
            break;
          }
        }else if(idx<filled){
          glyph=42u;fg=vec3(.98,.42,.34);bg=vec3(.12,.06,.06);break;
        }
      }

      // Shield dome brackets around shielded unit/relay
      if((flags&1u)!=0u&&(rel.x==0||rel.x==w-1)&&(rel.y==1||rel.y==2)){
        glyph=rel.x==0?40u:41u;
        fg=vec3(.76,.52,1.0);
        bg=mix(bg,vec3(.24,.12,.38),.6);
        break;
      }

      uvec4 art=texelFetch(u_art,ivec2(rel.x,int(b.r)+rel.y),0);
      if(art.r==32u||art.r==0u)continue;
      vec3 colour=vec3(art.gba)/255.0;
      if(art.g==1u&&art.b==0u&&art.a==0u)colour=vec3(c2.rgb)/255.0;
      if((flags&4u)!=0u)colour*=.64; // Rig already acted
      if((flags&8u)!=0u&&(rel.y==0&&(rel.x==0||rel.x==w-1))){colour=vec3(.45,.92,1.0);}
      if((flags&2u)!=0u&&rel.y==0&&rel.x==w-1){glyph=38u;fg=vec3(.95,.98,1.0);bg=vec3(.18,.22,.28);break;}
      fg=colour;
      bg=mix(bg,fg*.22,.5);
      glyph=art.r;
      break;
    }

    writeCell(glyph,0u,3u,1.0,fg,bg);
  }`;

  const TERRAIN_ID = { ground: 0, road: 1, mountain: 2, water: 3, chasm: 4, cracked: 5, relay: 6 };

  class IrongridView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, {
        sceneSource: SCENE,
        uniforms: ['board', 'art', 'sprites', 'cam', 'count', 'cursor'],
        far: 2
      });
      this.art = compileFrames();
      this.engine.setTexture('art', 6, this.art.width, this.art.height, this.art.data);
      this.boardData = new Uint8Array(R.BOARD_SIZE * R.BOARD_SIZE * 4);
      this.spriteData = new Uint8Array(MAX_SPRITES * 4 * 4);
      this.engine.setTexture('board', 4, R.BOARD_SIZE, R.BOARD_SIZE, this.boardData);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, this.spriteData);
      this.columns = 1;
      this.rows = 1;
      this.topPadCells = 0;
    }

    resize(width, height, cellSize, topPadCells) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
      this.topPadCells = topPadCells || 0;
    }

    camera() {
      const bw = R.BOARD_SIZE * TILE_W, bh = R.BOARD_SIZE * TILE_H;
      return {
        x: Math.round((bw - this.columns) / 2),
        y: Math.round((bh - this.rows) / 2 - this.topPadCells * 0.5)
      };
    }

    draw({ state, time, tint, preview, previewTile }) {
      const ov = new Uint8Array(64);
      const thr = new Uint8Array(64);
      const pdir = new Uint8Array(64);

      if (state.mode === 'play') {
        if (state.selectedCardIndex >= 0 && state.selectedCardIndex < state.hand.length) {
          const cid = state.hand[state.selectedCardIndex];
          for (const pt of R.cardTargets(state, state.selectedRigId, cid)) {
            ov[pt.y * R.BOARD_SIZE + pt.x] |= 2;
          }
        } else {
          for (const mv of R.reachableTiles(state, state.selectedRigId)) {
            ov[mv.y * R.BOARD_SIZE + mv.x] |= 1;
          }
        }
      }

      for (const f of state.fissures) ov[f.y * R.BOARD_SIZE + f.x] |= 4;
      for (const sm of state.smokes) ov[sm.y * R.BOARD_SIZE + sm.x] |= 8;
      for (const m of state.mines) ov[m.y * R.BOARD_SIZE + m.x] |= 16;
      for (const hz of state.hazards) ov[hz.y * R.BOARD_SIZE + hz.x] |= 32;
      for (const rel of state.relays) if (rel.shielded) ov[rel.y * R.BOARD_SIZE + rel.x] |= 64;
      for (const r of state.rigs) if (r.hp > 0 && r.shielded) ov[r.y * R.BOARD_SIZE + r.x] |= 64;

      // Enemy telegraph danger & direction arrows
      for (const e of state.enemies) {
        if (e.hp <= 0 || !e.intent || e.cancelled) continue;
        const cells = R.computeEnemyAttackCells(state, e);
        for (const c of cells) thr[c.y * R.BOARD_SIZE + c.x] |= 1;
        let dirBit = 0;
        if (e.intent.dx > 0) dirBit = 2;
        else if (e.intent.dx < 0) dirBit = 4;
        else if (e.intent.dy > 0) dirBit = 8;
        else if (e.intent.dy < 0) dirBit = 16;
        for (const ec of R.cellsOf(e)) thr[ec.y * R.BOARD_SIZE + ec.x] |= dirBit;
      }

      if (preview && preview.ok && preview.events) {
        for (const ev of preview.events) {
          if (ev.type === 'push' && ev.toX !== undefined) {
            const idx = ev.toY * R.BOARD_SIZE + ev.toX;
            thr[idx] |= 32;
            pdir[idx] = ev.dx > 0 ? 1 : (ev.dx < 0 ? 2 : (ev.dy > 0 ? 3 : 4));
          } else if (ev.type === 'collision' || ev.type === 'drown' || ev.type === 'dmg') {
            if (ev.x !== undefined && ev.y !== undefined) {
              const idx = ev.y * R.BOARD_SIZE + ev.x;
              thr[idx] |= 32;
              if (!pdir[idx]) pdir[idx] = 5;
            }
          }
        }
      }

      for (let y = 0; y < R.BOARD_SIZE; y++) {
        for (let x = 0; x < R.BOARD_SIZE; x++) {
          const i = y * R.BOARD_SIZE + x;
          this.boardData[i * 4] = TERRAIN_ID[state.board[y][x]] || 0;
          this.boardData[i * 4 + 1] = ov[i];
          this.boardData[i * 4 + 2] = thr[i];
          this.boardData[i * 4 + 3] = pdir[i];
        }
      }
      this.engine.setTexture('board', 4, R.BOARD_SIZE, R.BOARD_SIZE, this.boardData);

      const cam = this.camera();
      const sprites = [];
      const push = (tx, ty, frame, team, hp, maxHp, flags) => {
        sprites.push({
          x: tx * TILE_W - cam.x,
          y: ty * TILE_H - cam.y,
          frame,
          team: team || [88, 184, 255],
          hp: hp || 0,
          maxHp: maxHp || 0,
          flags: flags || 0
        });
      };

      for (const r of state.rigs) {
        if (r.hp <= 0) continue;
        const fl = (r.shielded ? 1 : 0) | (r.webbed ? 2 : 0) | (r.acted ? 4 : 0) | (r.id === state.selectedRigId ? 8 : 0) | 16;
        push(r.x, r.y, r.id, r.id === state.selectedRigId ? [116, 232, 255] : [88, 184, 255], r.hp, r.maxHp, fl);
      }
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const frame = e.kind === 'brood_queen' ? 'queen' : e.kind;
        const col = e.boss ? [255, 110, 68] : (e.elite ? [255, 188, 60] : [114, 214, 72]);
        push(e.x, e.y, frame, col, e.hp, e.maxHp, e.shielded ? 1 : 0);
      }
      for (const rel of state.relays) {
        push(rel.x, rel.y, 'relay', [255, 209, 71], 0, 0, rel.shielded ? 1 : 0);
      }
      if (state.railRow >= 0 && state.turn <= R.TURNS_PER_BATTLE) {
        const tx = (state.turn - 1) * 2;
        if (tx >= 0 && tx < R.BOARD_SIZE) push(tx, state.railRow, 'train', [255, 168, 72], 0, 0, 0);
      }

      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length);
      const put = (i, row, a, b, c, d) => {
        const at = (row * MAX_SPRITES + i) * 4;
        data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d;
      };
      for (let i = 0; i < count; i++) {
        const s = sprites[i], x = s.x + 2048, y = s.y + 2048, f = this.art.index[s.frame];
        put(i, 0, x & 255, x >> 8, y & 255, y >> 8);
        put(i, 1, f.y, f.w, f.h, 0);
        put(i, 2, s.team[0], s.team[1], s.team[2], 0);
        put(i, 3, s.hp, s.maxHp, s.flags, 0);
      }
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, data);

      const cx = previewTile ? previewTile.x : state.cursorX;
      const cy = previewTile ? previewTile.y : state.cursorY;
      this.engine.render((gl, u) => {
        gl.uniform2i(u.cam, cam.x, cam.y);
        gl.uniform1i(u.count, count);
        gl.uniform4i(u.cursor, cx, cy, state.mode === 'play' ? 1 : 0, state.selectedCardIndex >= 0 ? 1 : 0);
      }, { time, ink: false, tint });
    }

    inspect() { return this.engine.inspect(); }
  }

  IrongridView.TILE_W = TILE_W;
  IrongridView.TILE_H = TILE_H;
  IrongridView.FRAMES = FRAMES;
  IrongridView.compileFrames = compileFrames;
  global.IrongridView = IrongridView;
})(window);
