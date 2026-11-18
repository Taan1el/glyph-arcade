/* Irongrid scene: the 8x8 tactical island at 18x11 tiny letters per square. Slate ground,
 * rails, peaks, water, chasms and cracked earth carry texture; rigs, insects, relays and the
 * supply train are shaded sprites; overlays show reach, targets, threats and pushes. */
(function (global) {
  'use strict';

  const TILE_W = 18, TILE_H = 11, MAX_SPRITES = 48;
  const R = global.IrongridRules;

  const SCENE = `
  uniform usampler2D u_board;
  uniform ivec2 u_cam;
  uniform ivec4 u_cursor;
  ${global.GlyphArt.SHADER}
  ${global.GlyphSprites.SHADER}
  const int TW=${TILE_W},TH=${TILE_H};

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(TW,TH)));
    ivec2 l=wc-t*ivec2(TW,TH);
    vec2 uv=(vec2(l)+.5)/vec2(TW,TH);

    uint glyph=32u;vec3 fg=vec3(.18,.24,.30);vec3 bg=vec3(.05,.07,.09);
    bool onBoard=t.x>=0&&t.y>=0&&t.x<${R.BOARD_SIZE}&&t.y<${R.BOARD_SIZE};
    uint ov=0u,thr=0u,pdir=0u;
    bool corner=(l.x<2||l.x>TW-3)&&(l.y==0||l.y==TH-1);
    bool edgeV=l.x==0||l.x==TW-1,midRows=l.y>=TH/2-1&&l.y<=TH/2+1;

    if(onBoard){
      uvec4 info=texelFetch(u_board,t,0);
      uint ter=info.r;ov=info.g;thr=info.b;pdir=info.a;
      bool alt=((t.x+t.y)&1)==0;
      float n=hash21(vec2(wc)*.81+vec2(t)*.29);
      vec3 base=alt?vec3(.13,.17,.22):vec3(.17,.22,.28);
      glyph=n>.92?46u:n>.86?44u:32u;
      if(l.x==0||l.y==0)base*=.82;
      bool lit=false;vec3 litFg=vec3(0);

      if(ter==1u){
        base=vec3(.16,.17,.20);glyph=n>.8?46u:32u;
        if(l.y==3||l.y==TH-4){glyph=61u;base=vec3(.55,.6,.68);}
        else if(l.y>3&&l.y<TH-4&&l.x%3==0){glyph=124u;base=vec3(.42,.3,.18);}
      }else if(ter==2u){
        float peak=1.0-abs(uv.x-.5)*2.0;
        if(uv.y>1.0-peak){
          float shade=uv.x<.5?1.15:.75;
          base=vec3(.42,.45,.52)*shade;glyph=n>.6?35u:37u;
          if(uv.y<1.0-peak+.22){base=vec3(.92,.95,1.0)*shade;glyph=94u;}
        }
      }else if(ter==3u){
        float wave=sin(u_time*2.6+float(wc.x)*.5+float(wc.y)*.8);
        base=vec3(.06,.2,.36);glyph=wave>.6?126u:wave>.2?45u:32u;
        if(wave>.2){lit=true;litFg=vec3(.3,.72,1.0)*(.8+.2*wave);}
      }else if(ter==4u){
        float r=max(abs(uv.x-.5)*2.0,abs(uv.y-.5)*2.0);
        base=r>.82?vec3(.24,.22,.22):vec3(.02,.03,.04);
        glyph=r>.82?35u:(n>.97?46u:32u);
      }else if(ter==5u){
        base=vec3(.25,.20,.16);glyph=n>.7?46u:32u;
        float crack=abs(uv.y-.5-.18*sin(uv.x*18.0));
        if(crack<.08){glyph=uv.x*18.0-floor(uv.x*18.0)>.5?47u:92u;lit=true;litFg=vec3(.85,.6,.36);}
      }else if(ter==6u){
        base=vec3(.30,.25,.12);
        bool plate=l.x==0||l.x==TW-1||l.y==0||l.y==TH-1;
        glyph=plate?61u:(l.x%4==0?124u:32u);
        if(plate)base=vec3(.62,.5,.2);
      }
      fg=lit?litFg:base*1.7;bg=base;

      if((ov&1u)!=0u){
        bg=mix(bg,vec3(.12,.36,.72),.5);
        if(corner){fg=vec3(.38,.78,1.0);glyph=l.x<2?91u:93u;}
      }
      if((ov&2u)!=0u){
        float p=.75+.25*sin(u_time*5.0);
        bg=mix(bg,vec3(.58,.14,.14),.45*p);
        if(corner){fg=vec3(1.0,.52,.32);glyph=l.x<2?123u:125u;}
      }
      if((ov&4u)!=0u){
        float p=.72+.28*sin(u_time*6.0+float(t.x));
        bg=mix(bg,vec3(.38,.16,.04),.62);
        float crack=abs(uv.y-.55-.15*sin(uv.x*14.0));
        if(crack<.1){fg=vec3(1.0,.58,.20)*p;glyph=37u;}
      }
      if((ov&16u)!=0u&&ter!=2u&&ter!=6u&&l.y==TH-3&&abs(l.x-TW/2)<=1){
        fg=l.x==TW/2?vec3(1.0,.32,.26):vec3(1.0,.82,.28);
        glyph=l.x<TW/2?91u:(l.x>TW/2?93u:42u);
      }
      if((ov&8u)!=0u){
        bg=mix(bg,vec3(.28,.33,.40),.55);
        if(((l.x+l.y)&1)==0){fg=vec3(.70,.78,.88);glyph=58u;}
      }
      if((ov&32u)!=0u){
        float p=.65+.35*sin(u_time*8.0);
        bg=mix(bg,vec3(.45,.18,.08),.45*p);
        if(l.x==TW-2&&l.y==1){fg=vec3(1.0,.82,.25);glyph=33u;}
      }
      // Enemy telegraphs: the struck square, and arrows on the attacker's facing edge.
      if((thr&1u)!=0u){
        float p=.65+.35*sin(u_time*7.0);
        bg=mix(bg,vec3(.46,.08,.08),.42*p);
        if(l.y==1&&abs(l.x-TW/2)<=1){fg=vec3(1.0,.30,.24);glyph=l.x<TW/2?40u:(l.x>TW/2?41u:88u);}
      }
      if((thr&30u)!=0u){
        vec3 acol=vec3(1.0,.28,.22);
        if((thr&2u)!=0u&&l.x==TW-1&&midRows){fg=acol;glyph=62u;}
        if((thr&4u)!=0u&&l.x==0&&midRows){fg=acol;glyph=60u;}
        if((thr&8u)!=0u&&l.y==TH-1&&abs(l.x-TW/2)<=1){fg=acol;glyph=86u;}
        if((thr&16u)!=0u&&l.y==0&&abs(l.x-TW/2)<=1){fg=acol;glyph=94u;}
      }
      if((thr&32u)!=0u){
        bg=mix(bg,vec3(.48,.22,.56),.55);
        if(l.x==1&&l.y==TH-2){fg=vec3(1.0,.88,.30);glyph=pdir==1u?62u:(pdir==2u?60u:(pdir==3u?86u:(pdir==4u?94u:33u)));}
      }
      if(u_cursor.z>0&&t==u_cursor.xy&&corner){
        fg=u_cursor.w>0?vec3(1.0,.86,.30):vec3(.95,.98,1.0);
        glyph=l.x<2?91u:93u;
      }
    }

    // Rigs, insects, relays and the train; health bars sit on the row above each.
    spriteCell(cell,vec3(1.0),glyph,fg,bg);

    // Shields and webs wrap whatever stands in the square, so they draw last.
    if(onBoard&&(ov&64u)!=0u&&edgeV&&l.y>0&&l.y<TH-1){glyph=l.x==0?40u:41u;fg=vec3(.76,.52,1.0);bg=mix(bg,vec3(.24,.12,.38),.6);}
    if(onBoard&&(ov&128u)!=0u&&((l.x+l.y*2)%5==0||(l.x-l.y*2+20)%5==0)){glyph=(l.x+l.y)%2==0?47u:92u;fg=vec3(.85,.88,.9);}
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
      this.sprites = new global.GlyphSprites(this.engine, global.IrongridArt.build(), { max: MAX_SPRITES });
      this.boardData = new Uint8Array(R.BOARD_SIZE * R.BOARD_SIZE * 4);
      this.engine.setTexture('board', 4, R.BOARD_SIZE, R.BOARD_SIZE, this.boardData);
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
      for (const r of state.rigs) if (r.hp > 0 && r.webbed) ov[r.y * R.BOARD_SIZE + r.x] |= 128;
      for (const e of state.enemies) if (e.hp > 0 && e.shielded) for (const c of R.cellsOf(e)) ov[c.y * R.BOARD_SIZE + c.x] |= 64;

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
      this.sprites.clear();
      const add = (tx, ty, art, extra) => {
        const { w, h } = this.sprites.size(art), span = art === 'queen' ? 2 : 1;
        this.sprites.add({ x: tx * TILE_W + Math.floor((TILE_W * span - w) / 2) - cam.x, y: ty * TILE_H + TILE_H - h - cam.y, art, ...extra });
      };
      for (const r of state.rigs) {
        if (r.hp <= 0) continue;
        const tint = r.id === state.selectedRigId ? [130, 236, 255] : r.acted ? [56, 92, 124] : [88, 184, 255];
        add(r.x, r.y, r.id, { tint, bar: { fill: r.hp / r.maxHp, colour: [104, 232, 120] } });
      }
      for (const e of state.enemies) {
        if (e.hp <= 0) continue;
        const art = e.kind === 'brood_queen' ? 'queen' : e.kind;
        add(e.x, e.y, art, { bar: { fill: e.hp / e.maxHp, colour: e.boss ? [255, 140, 60] : [255, 84, 72] } });
      }
      for (const rel of state.relays) add(rel.x, rel.y, 'relay', {});
      if (state.railRow >= 0 && state.turn <= R.TURNS_PER_BATTLE) {
        const tx = (state.turn - 1) * 2;
        if (tx >= 0 && tx < R.BOARD_SIZE) add(tx, state.railRow, 'train', {});
      }
      const count = this.sprites.upload();

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
  global.IrongridView = IrongridView;
})(window);
