/* Bannerfall scene: every map tile is 6x4 tiny character cells, seen from above. Canopy,
 * grass, lanes, water and stone carry real texture; fog dims what your team cannot see;
 * area abilities are drawn as rings; units are shaded sprites in team colours. */
(function (global) {
  'use strict';

  const TILE_W = 6, TILE_H = 4, MAX_SPRITES = 160, MAX_FX = 16;
  const BF = global.Bannerfall;

  const SCENE = `
  uniform usampler2D u_map;
  uniform ivec2 u_cam;
  uniform int u_fxCount;
  uniform vec4 u_fx[${MAX_FX}];
  uniform vec4 u_fxb[${MAX_FX}];
  ${global.GlyphArt.SHADER}
  ${global.GlyphSprites.SHADER}

  const int TW=${TILE_W},TH=${TILE_H};
  uvec4 tileAt(ivec2 t){
    if(t.x<0||t.y<0||t.x>=${BF.WIDTH}||t.y>=${BF.HEIGHT})return uvec4(0u,0u,0u,0u);
    return texelFetch(u_map,t,0);
  }
  float valueNoise(vec2 p){
    vec2 i=floor(p),f=p-i;f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
  }
  float canopy(vec2 p){return valueNoise(p*vec2(.16,.24))*.65+valueNoise(p*vec2(.45,.68)+7.0)*.35;}

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(TW,TH)));
    ivec2 l=wc-t*ivec2(TW,TH);
    uvec4 data=tileAt(t);
    uint tile=data.r;
    float seen=data.g==2u?1.0:(data.g==1u?.5:.34);
    float n=hash21(vec2(wc)*.731+3.1),th=hash21(vec2(t)*.53);
    vec2 world=(vec2(wc)+.5)/vec2(TW,TH);
    vec2 p=vec2(wc);
    bool redSide=world.x>${BF.WIDTH / 2}.0;
    // Is a neighbouring tile of another kind? Used for fringes and banks.
    uint up=tileAt(t+ivec2(0,-1)).r,down=tileAt(t+ivec2(0,1)).r,left=tileAt(t+ivec2(-1,0)).r,right=tileAt(t+ivec2(1,0)).r;
    bool nearUp=l.y==0&&up!=tile,nearDown=l.y==TH-1&&down!=tile,nearL=l.x==0&&left!=tile,nearR=l.x==TW-1&&right!=tile;
    bool border=nearUp||nearDown||nearL||nearR;

    uint glyph=32u;vec3 base=vec3(0);float bright=1.0;uint flags=3u;

    if(tile==0u){
      // Tree crowns: bumpy clumps lit from the top left, with dark gaps between them.
      float c=canopy(p),cUp=canopy(p+vec2(-1.0,-1.0));
      base=mix(vec3(.07,.20,.08),vec3(.22,.46,.18),c);
      bright=c>cUp+.02?1.3:c<cUp-.02?.7:1.0;
      glyph=c>.62?38u:c>.5?37u:c>.4?35u:c>.3?42u:58u;
      if(c<.3)base*=.6;
      if(border&&down!=0u&&l.y==TH-1)bright*=.75;
    }else if(tile==1u){
      float m=valueNoise(p*vec2(.22,.33));
      base=mix(vec3(.16,.28,.12),vec3(.26,.40,.16),m);
      glyph=n>.93?34u:n>.86?39u:n>.78?44u:n>.7?46u:32u;
      if(n>.997){glyph=42u;base=vec3(.95,.85,.35);}
      // Trees cast a soft shadow onto the floor below and to their right.
      if((up==0u&&l.y==0)||(left==0u&&l.x==0))bright*=.7;
    }else if(tile==2u){
      float m=valueNoise(p*vec2(.3,.45));
      base=mix(vec3(.38,.29,.18),vec3(.50,.40,.26),m);
      glyph=n>.92?48u:n>.8?46u:n>.7?44u:n>.6?58u:32u;
      if(n>.92)base=vec3(.56,.52,.46);
      if(border&&(up==1u||down==1u||left==1u||right==1u)){glyph=n>.5?39u:44u;base=mix(base,vec3(.26,.40,.16),.6);}
      if((up==0u&&l.y==0)||(left==0u&&l.x==0))bright*=.72;
    }else if(tile==3u){
      float wave=sin(p.x*.45+p.y*.9+u_time*1.8)+sin(p.x*.21-p.y*.4-u_time*1.1);
      base=vec3(.10,.28,.52)*(.9+.12*wave);
      glyph=wave>1.2?126u:wave>.9?45u:(n>.96?46u:32u);
      if(border&&up!=3u&&up!=5u&&nearUp){glyph=126u;base=vec3(.55,.75,.9);}
      if(border&&down!=3u&&nearDown){glyph=45u;base=vec3(.5,.7,.85);}
    }else if(tile==4u){
      // Flagstones: one slab per tile, mortar on its top and left edges.
      vec3 stone=redSide?vec3(.40,.25,.24):vec3(.23,.29,.42);
      bool mortar=l.y==0||l.x==0;
      base=stone*(.85+th*.3)*(mortar?.62:1.0);
      glyph=mortar?(l.y==0?95u:124u):(n>.8?46u:n>.6?44u:32u);
    }else if(tile==5u){
      float r=length(world-vec2(${BF.PIT.x}.0,${BF.PIT.y}.0));
      base=vec3(.24,.19,.28)*(.85+n*.3);
      glyph=n>.75?58u:n>.5?46u:32u;
      if(abs(r-3.0)<.18){glyph=42u;base=vec3(.6,.4,.9);bright=1.0+.4*sin(u_time*2.0+world.x);}
    }
    vec3 fg=base*bright*1.3,bg=base*bright*.62;

    // Bulwark stone set in this tile for a few seconds.
    if(data.b>0u){
      vec3 stone=data.b==1u?vec3(.42,.52,.72):vec3(.72,.42,.40);
      float bevel=l.y==0?1.3:l.y==TH-1?.6:1.0;
      glyph=l.y==0?61u:(l.x==0?124u:35u);fg=stone*bevel*1.3;bg=stone*bevel*.5;
    }
    fg*=seen;bg*=seen;
    if(data.g!=2u){float grey=dot(fg,vec3(.33));fg=mix(fg,vec3(grey),.35);grey=dot(bg,vec3(.33));bg=mix(bg,vec3(grey),.35);}

    // Area effects: x, y, radius (tiles), kind; then progress and team.
    for(int i=0;i<u_fxCount;i++){
      vec4 f=u_fx[i],fb=u_fxb[i];
      float r=length(world-f.xy);
      if(r>f.z+.6)continue;
      int kind=int(f.w);
      vec3 tone=fb.y<.5?vec3(.35,.65,1.0):fb.y<1.5?vec3(1.0,.42,.32):vec3(1.0,.85,.35);
      bool edge=r>f.z-.3&&r<=f.z+.08;
      if(kind==1){
        if(r<.45){glyph=94u;fg=tone;}
      }else if(kind==2){
        if(r<=f.z){bg=mix(bg,tone*.35,.45);if(hash21(vec2(wc)+floor(u_time*9.0))>.86){glyph=hash21(vec2(wc)*1.7)>.5?124u:92u;fg=vec3(1.0,.92,.6);}}
        else if(edge){glyph=46u;fg=tone;}
      }else if(kind==3){
        if(r<=f.z){bg=mix(bg,vec3(.55,.8,1.0)*.4,.55);if(n>.82){glyph=n>.94?42u:46u;fg=vec3(.85,.95,1.0);}}
        if(edge){glyph=42u;fg=vec3(.7,.9,1.0);}
      }else if(kind==4){
        if(r<=f.z*fb.x)bg=mix(bg,vec3(.8,.22,.08),.35);
        if(edge){glyph=fract(u_time*4.0)>.5?33u:46u;fg=vec3(1.0,.45,.2);}
      }else if(kind==5){
        if(r<=f.z){bg=mix(bg,tone*.8,(1.0-fb.x)*.6);if(n>.7){glyph=42u;fg=mix(tone,vec3(1.0),.5);}}
      }else if(kind==6){
        if(edge&&n>.3){glyph=fract(u_time*3.0+n)>.5?43u:46u;fg=vec3(.55,.8,1.0);}
      }else if(kind==7){
        if(edge){glyph=(world.x<f.x)?91u:93u;fg=tone;}
      }else if(kind==8){
        if(edge&&n>.55){glyph=46u;fg=vec3(.95,.9,.6);}
      }
    }

    // Sprites sit in screen cells. Earlier sprites draw on top; bars sit one row above.
    spriteCell(cell,vec3(1.0),glyph,fg,bg);
    writeCell(glyph,0u,flags,1.0,fg,bg);
  }`;

  class BannerfallView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['map', 'art', 'sprites', 'cam', 'count', 'fxCount', 'fx', 'fxb'], far: 2 });
      this.sprites = new global.GlyphSprites(this.engine, global.BannerfallArt.build(), { max: MAX_SPRITES });
      this.mapData = new Uint8Array(BF.WIDTH * BF.HEIGHT * 4);
      this.fx = new Float32Array(MAX_FX * 4);
      this.fxb = new Float32Array(MAX_FX * 4);
      this.columns = 1;
      this.rows = 1;
    }
    size(name) { return this.sprites.size(name); }
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
    // sprites: GlyphSprites entries (art with tint, flash, shade and bar, or char + colour)
    // fx: {x, y, r (tiles), kind, progress, team}
    draw({ cam, sprites, fx, time, tint, dissolve }) {
      this.sprites.clear();
      for (const sprite of sprites) if (!this.sprites.add(sprite)) break;
      const count = this.sprites.upload();
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
  global.BannerfallView = BannerfallView;
})(window);
