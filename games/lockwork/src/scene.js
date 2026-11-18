/* Lockwork scene: the 15x11 brass vault at 12x8 tiny letters per tile. Iron floor plates,
 * riveted brass walls, a round vault door, glowing beams with a soft halo, and every
 * mechanism and the engineer as shaded sprites. */
(function (global) {
  'use strict';

  const TILE_W = 12, TILE_H = 8, MAX_SPRITES = 96;
  const L = global.Lockwork;

  const SCENE = `
  uniform usampler2D u_board;
  uniform ivec2 u_cam;
  uniform ivec3 u_hint;
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

    uint glyph=32u;vec3 fg=vec3(.12,.09,.06);vec3 bg=vec3(.05,.04,.03);
    vec3 beamFg=vec3(0);float beamA=0.0;uint beamGlyph=32u;

    if(t.x>=0&&t.y>=0&&t.x<${L.WIDTH}&&t.y<${L.HEIGHT}){
      uvec4 info=texelFetch(u_board,t,0);
      uint tile=info.r, amber=info.g, cyan=info.b, meta=info.a;
      float n=hash21(vec2(wc)*.73+vec2(t)*.31);
      // Iron floor plates with seams and the odd rivet.
      vec3 base=vec3(.11,.09,.07)*(.9+hash21(vec2(t))*.2);
      glyph=n>.95?46u:32u;
      if(l.x==0||l.y==0){glyph=l.y==0?95u:124u;base*=.7;}
      if((l.x==1||l.x==TW-2)&&(l.y==1||l.y==TH-2))glyph=46u;
      bool lit=false;vec3 litFg=vec3(0);

      if(tile==1u){
        // Brass wall panel: bevelled rim, riveted corners, brushed middle.
        bool top=l.y==0,bottom=l.y==TH-1,left=l.x==0,right=l.x==TW-1;
        base=vec3(.42,.31,.15)*(top||left?1.3:bottom||right?.62:1.0);
        glyph=(top||bottom)?61u:(left||right?124u:(n>.5?35u:37u));
        if((l.x==1||l.x==TW-2)&&(l.y==1||l.y==TH-2)){glyph=79u;base=vec3(.75,.6,.3);}
      }else if(tile==7u){
        base=vec3(.36,.22,.12);glyph=(abs(uv.x-uv.y)<.12||abs(uv.x+uv.y-1.0)<.12)?88u:35u;
      }else if(tile==2u){
        // A round vault door; spokes glow green once every receptor is lit.
        bool open=(meta&1u)!=0u;
        float r=length((uv-.5)*vec2(1.5,1.0)),a=atan(uv.y-.5,(uv.x-.5)*1.5);
        float p=.8+.2*sin(u_time*5.0);
        vec3 col=open?vec3(.32,.88,.38):vec3(.85,.66,.36);
        if(r<.5){
          base=col*.35;glyph=r<.12?79u:(fract(a/1.0472+.5)<.18?42u:58u);
          if(r>.42){glyph=61u;base=col*.7;}
          if(open){lit=true;litFg=col*p;}
        }
      }else if(tile==3u){
        bool pressed=(meta&2u)!=0u;
        bool rim=l.x==1||l.x==TW-2||l.y==1||l.y==TH-2;
        bool innerPad=l.x>=2&&l.x<=TW-3&&l.y>=2&&l.y<=TH-3;
        if(l.x>=1&&l.x<=TW-2&&l.y>=1&&l.y<=TH-2){
          base=pressed?vec3(.46,.38,.12):vec3(.34,.23,.12);
          glyph=rim?(l.y==1||l.y==TH-2?61u:124u):(innerPad?95u:32u);
          if(rim){lit=true;litFg=pressed?vec3(1.0,.90,.38):vec3(.88,.62,.28);}
        }
      }else if(tile==4u){
        bool open=(meta&2u)!=0u;
        if(!open){base=vec3(.40,.22,.12)*(l.y%2==0?1.15:.75);glyph=l.y%2==0?61u:35u;}
        else{glyph=(l.x==0||l.x==TW-1)?124u:(n>.9?46u:32u);base=vec3(.28,.22,.14);}
      }else if(tile==5u||tile==6u){
        vec3 col=tile==5u?vec3(1.0,.82,.26):vec3(.28,.90,1.0);
        base=col*.22;glyph=(l.x+l.y)%3==0?47u:58u;lit=true;litFg=col*.8;
      }
      fg=lit?litFg:base*1.6;bg=base;

      // Beams: a bright core through the tile centre with a soft halo either side.
      bool aH=(amber&10u)!=0u, aV=(amber&5u)!=0u, cH=(cyan&10u)!=0u, cV=(cyan&5u)!=0u;
      if((aH||aV||cH||cV)&&tile!=1u&&tile!=7u){
        float dh=abs(float(l.y)-float(TH)/2.0+.5), dv=abs(float(l.x)-float(TW)/2.0+.5)/1.5;
        float hH=(aH||cH)?max(0.0,1.0-dh/2.2):0.0, hV=(aV||cV)?max(0.0,1.0-dv/2.2):0.0;
        float h=max(hH,hV);
        if(h>0.0){
          bool cyanOnly=(cH||cV)&&!(aH||aV),both=(cH||cV)&&(aH||aV);
          vec3 bcol=both?vec3(.78,1.0,.78):cyanOnly?vec3(.30,.92,1.0):vec3(1.0,.84,.28);
          float flick=.9+.1*sin(u_time*10.0+float(wc.x+wc.y)*.4);
          beamFg=bcol*flick;beamA=h;
          beamGlyph=h>.75?(hH>.75&&hV>.75?42u:(hH>hV?45u:124u)):(h>.4?58u:46u);
        }
      }
      if(beamA>0.0){bg=mix(bg,beamFg*.45,beamA*.85);if(beamA>.3){fg=mix(beamFg,vec3(1.0),beamA>.75?.45:0.0);glyph=beamGlyph;}}

      if(u_hint.z>0&&t==u_hint.xy){
        float p=.65+.35*sin(u_time*8.0);
        bg=mix(bg,vec3(.3,.55,.2),.4*p);
        if((l.x<2||l.x>TW-3)&&(l.y==0||l.y==TH-1)){fg=vec3(.45,1.0,.55);glyph=l.x<2?91u:93u;}
      }
    }

    // Mechanisms and the engineer; beams pass over pipes and bridges, so they show through faintly.
    if(spriteCell(cell,vec3(1.0),glyph,fg,bg)&&beamA>.75){bg=mix(bg,beamFg*.4,.5);}
    writeCell(glyph,0u,3u,1.0,fg,bg);
  }`;

  class LockworkView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['board', 'art', 'sprites', 'cam', 'count', 'hint'], far: 2 });
      this.sprites = new global.GlyphSprites(this.engine, global.LockworkArt.build(), { max: MAX_SPRITES });
      this.boardData = new Uint8Array(L.WIDTH * L.HEIGHT * 4);
      this.engine.setTexture('board', 4, L.WIDTH, L.HEIGHT, this.boardData);
      this.columns = 1;
      this.rows = 1;
    }

    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
    }

    camera() {
      if (this.offset) return { x: -this.offset.x, y: -this.offset.y };
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

      const cam = this.camera(), AMBER = [255, 212, 71], CYAN = [76, 232, 255];
      this.sprites.clear();
      const push = (tx, ty, art, tint, lit) => {
        const { w, h } = this.sprites.size(art);
        this.sprites.add({ x: tx * TILE_W + Math.floor((TILE_W - w) / 2) - cam.x, y: ty * TILE_H + Math.floor((TILE_H - h) / 2) - cam.y, art, tint, lit });
      };

      // Player first so the engineer always shows on top (even on plates and open gates).
      push(v.px, v.py, 'player');
      for (const r of v.receptors) push(r.x, r.y, r.lit ? 'recOn' : 'recOff', r.color === 2 ? CYAN : AMBER, r.lit);
      for (const o of v.objs) {
        if (o.kind === 'gen') push(o.x, o.y, 'gen' + o.dir, o.color === 2 ? CYAN : AMBER, true);
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
      const count = this.sprites.upload();

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
  global.LockworkView = LockworkView;
})(window);
