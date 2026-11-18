/* Burrow scene: every world tile is 6x4 tiny character cells, so blocks carry real texture.
 * Lit by flood-filled light, with a day and night sky, moving liquids, bevelled block edges,
 * and drawn sprites where each art pixel is one shaded letter. */
(function (global) {
  'use strict';

  const TILE_W = 6, TILE_H = 4, MARGIN = 12, MAX_SPRITES = 96;

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
  ${global.GlyphArt.SHADER}

  const int TW=${TILE_W},TH=${TILE_H};
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
    return mix(mix(top,low,height),vec3(.92,.46,.26),u_dusk*height*.8);
  }
  float valueNoise(vec2 p){
    vec2 i=floor(p),f=p-i;f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
  }
  // Dense letters read as solid texture; lighter ones as grain.
  uint grain(float v){return v>.82?37u:v>.6?35u:v>.4?38u:v>.2?61u:58u;}

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(TW,TH)));
    ivec2 l=wc-t*ivec2(TW,TH);
    uvec4 data=tileAt(t);
    uint tile=data.r,liquid=data.g,wall=data.b;
    vec2 world=(vec2(wc)+.5)/vec2(TW,TH);
    vec4 L=lightAt(world-.5-vec2(u_origin));
    float g=max(0.0,1.0-distance(world,u_glow)/6.5);
    vec3 skyLight=mix(vec3(.13,.17,.32),vec3(1.0,.97,.90),u_day)*L.a;
    vec3 light=L.rgb*1.25+skyLight+vec3(.36,.30,.22)*g*g+vec3(.07,.07,.095);
    float n=hash21(vec2(wc)*.731+1.3),m=hash21(vec2(wc)*1.37+vec2(t)*.11),th=hash21(vec2(t)*.73);
    float vn=valueNoise(vec2(wc)*vec2(.31,.45));

    // Bevel exposed block faces so blocks read as solid shapes.
    bool openUp=!solid(tileAt(t+ivec2(0,-1)).r),openDown=!solid(tileAt(t+ivec2(0,1)).r);
    bool openL=!solid(tileAt(t+ivec2(-1,0)).r),openR=!solid(tileAt(t+ivec2(1,0)).r);
    float bevel=1.0;
    if(openUp&&l.y==0)bevel*=1.3;
    if(openDown&&l.y==TH-1)bevel*=.62;
    if(openL&&l.x==0)bevel*=1.12;
    if(openR&&l.x==TW-1)bevel*=.78;

    uint glyph=32u;vec3 fg=vec3(0),bg=vec3(0);uint flags=3u,material=0u;
    bool done=false;
    vec3 base=vec3(0);

    // Backdrop: sky above the ground line, dim dug-out walls below it.
    if(wall==0u){
      float height=clamp(float(cell.y)/float(grid.y),0.0,1.0);
      vec3 sky=skyColour(height);bg=sky*.82;fg=sky;
      if(u_day<.45&&hash21(vec2(cell)*.9+11.0)>.993){glyph=hash21(vec2(cell))>.6?42u:46u;fg=vec3(.8,.85,1.0)*(.55+.45*sin(u_time*2.0+float(cell.x)));}
      vec2 ds=(vec2(cell)-u_sun.xy)*vec2(1.0,1.5);
      float d=length(ds),r=float(grid.y)*.06;
      if(u_sun.z>1.5){
        if(d<r&&length(ds-vec2(r*.45,-r*.18))>r*.85){glyph=d<r*.75?64u:42u;fg=vec3(.88,.9,1.0);bg=mix(bg,fg,.32);}
      }else if(u_sun.z>0.0&&d<r*1.15){glyph=d<r*.8?64u:42u;fg=vec3(1.0,.9,.5);bg=mix(bg,fg,.55);}
      float drift=float(cell.x)+u_time*1.0,rows=float(cell.y);
      float puff=valueNoise(vec2(drift/34.0,rows/10.0+3.0))*.68+valueNoise(vec2(drift/14.0+9.0,rows/4.8))*.32;
      puff*=1.0-smoothstep(.34,.62,rows/float(grid.y));
      if(puff>.52){
        float body=clamp((puff-.52)/.18,0.0,1.0);
        glyph=body>.66?35u:body>.33?61u:126u;
        vec3 cloud=mix(mix(vec3(.16,.18,.28),vec3(1.0,.98,.95),u_day),vec3(1.0,.62,.42),u_dusk*.7);
        fg=cloud;bg=mix(bg,cloud*.85,.35+.55*body);
      }
      if(L.a<.5){vec3 dark=vec3(.015,.016,.022);bg=mix(dark,bg,L.a*2.0);fg=mix(dark,fg,L.a*2.0);}
    }else{
      vec3 back=wall==1u?vec3(.30,.21,.13):wall==2u?vec3(.22,.22,.27):vec3(.34,.24,.14);
      if(wall==3u){glyph=l.y==TH-1?95u:(l.x==0?124u:61u);}
      else glyph=n>.8?44u:n>.6?46u:n>.45?39u:32u;
      vec3 lit=back*light*(.85+vn*.3);bg=lit*.42;fg=lit*1.05;
    }

    if(tile==1u||tile==2u){
      base=mix(vec3(.36,.23,.13),vec3(.52,.34,.20),vn);glyph=grain(n);
      if(m>.94){glyph=48u;base=vec3(.55,.50,.44);}
      if(tile==2u&&openUp&&l.y<=1){
        float blade=hash21(vec2(float(wc.x),0.0)*1.7);
        base=l.y==0?vec3(.38,.74,.26)*(.85+blade*.3):vec3(.28,.56,.20);
        glyph=l.y==0?(blade>.5?34u:39u):(n>.5?37u:38u);
      }
      material=1u;done=true;
    }else if(tile==3u||tile==16u||tile==17u){
      base=tile==3u?vec3(.46,.46,.52):tile==16u?vec3(.34,.27,.28):vec3(.15,.14,.17);
      base*=.86+th*.24;
      // Stone sits in slabs: darker seams along the bottom and some left edges.
      bool seam=(l.y==TH-1&&((l.x+t.x)%3!=0))||(l.x==0&&l.y<2&&th>.5);
      glyph=seam?95u:grain(n*.6+vn*.4);
      if(seam)base*=.7;
      if(tile==17u)glyph=n>.5?35u:37u;
      material=2u;done=true;
    }else if(tile==4u){
      base=vec3(.86,.74,.46)*(.9+vn*.2);glyph=n>.7?58u:n>.4?46u:44u;material=1u;done=true;
    }else if(tile==5u){
      // Bark: vertical ridges with dark outer edges.
      bool edge=l.x==0||l.x==TW-1;
      float ridge=hash21(vec2(float(wc.x),floor(float(wc.y)/3.0)));
      base=edge?vec3(.30,.18,.10):mix(vec3(.44,.28,.15),vec3(.56,.37,.20),ridge);
      glyph=edge?124u:(ridge>.6?41u:ridge>.3?124u:40u);
      material=3u;done=true;
    }else if(tile==6u){
      float clump=valueNoise(vec2(wc)*vec2(.55,.8)+th*9.0);
      base=mix(vec3(.12,.36,.14),vec3(.34,.66,.24),clump)*(.85+th*.3);
      glyph=clump>.62?38u:clump>.45?37u:clump>.3?42u:44u;
      if(clump>.78&&n>.6)base+=vec3(.12,.12,.04);
      material=3u;done=true;
    }else if(tile==7u){
      bool seam=l.y==1||l.y==TH-1;
      bool joint=l.x==((t.y*2+(l.y>1?3:0))%TW);
      base=vec3(.66,.44,.24)*(.9+hash21(vec2(float(t.x),float(l.y/2)+float(t.y)*3.0))*.2);
      glyph=seam?95u:joint?124u:61u;
      if(seam||joint)base*=.68;
      if(l.y%2==0&&(l.x==1||l.x==TW-2)&&n>.6)glyph=46u;
      material=1u;done=true;
    }else if(tile==8u){
      int row=l.y/2;bool mortar=(l.y%2==1)||(((l.x+row+t.y)%3)==0);
      base=mortar?vec3(.52,.48,.44):vec3(.62,.32,.26)*(.85+hash21(vec2(t)+vec2(float(row),float((l.x+row)/3)))*.3);
      glyph=mortar?(l.y%2==1?95u:124u):35u;
      material=2u;done=true;
    }else if(tile==9u){
      float f=sin(u_time*11.0+float(t.x)*3.0+float(l.x));
      if((l.x==2||l.x==3)&&l.y<=1){glyph=l.y==0?(f>0.0?94u:42u):(f>.3?42u:35u);fg=mix(vec3(1.0,.62,.2),vec3(1.0,.92,.45),float(l.y==1));bg=bg*.5+vec3(.36,.18,.06);}
      else if((l.x==2||l.x==3)&&l.y>=2){glyph=124u;fg=vec3(.5,.32,.16)*max(vec3(.6),light);}
    }else if(tile==10u||tile==11u){
      if(tile==10u){
        base=vec3(.58,.36,.18);bool frame=l.x==0||l.x==TW-1;
        glyph=frame?124u:(l.x%2==0?124u:58u);if(frame)base*=.7;
        if(l.x==TW-2&&l.y==2){glyph=79u;base=vec3(.85,.72,.3);}
        material=3u;done=true;
      }else if(l.x==0){glyph=91u;fg=vec3(.58,.36,.18)*light*1.3;}
    }else if(tile==12u||tile==13u||tile==14u){
      base=vec3(.42,.42,.48)*(.86+th*.24);glyph=grain(n*.6+vn*.4);
      vec3 ore=tile==12u?vec3(.96,.55,.24):tile==13u?vec3(.86,.88,.96):vec3(.38,.88,1.0);
      float vein=valueNoise(vec2(wc)*vec2(.6,.9)+th*17.0);
      material=2u;done=true;
      if(vein>.58){
        base=ore*(.8+n*.3);glyph=tile==14u?(n>.5?60u:62u):(n>.6?42u:n>.3?48u:35u);
        // Crystal glints even in the dark.
        if(tile==14u){done=false;fg=ore*max(light*1.3,vec3(.75));bg=ore*.3;if(sin(u_time*3.0+n*20.0)>.6)glyph=42u;}
      }
    }else if(tile==15u){
      base=vec3(.20,.12,.32)*(.9+vn*.3);
      bool shine=(l.x+l.y)%4==0&&n>.5;
      glyph=shine?47u:35u;
      if(shine)base+=vec3(.18,.12,.28);
      material=2u;done=true;
    }else if(tile==18u){
      vec3 wood=vec3(.66,.44,.24)*light;
      if(l.y==1){glyph=61u;fg=wood*1.5;bg=wood*.5;}
      else if(l.y==0&&l.x==1){glyph=84u;fg=vec3(.7,.7,.75)*light*1.4;}
      else if(l.y==0&&l.x==4){glyph=47u;fg=vec3(.6,.4,.2)*light*1.4;}
      else if(l.y>=2&&(l.x==1||l.x==4)){glyph=124u;fg=wood*1.4;}
    }else if(tile==19u){
      float p=.7+.3*sin(u_time*3.0);
      if(l.y==0){glyph=(l.x==2||l.x==3)?(fract(u_time*2.0+n)>.5?42u:86u):32u;fg=vec3(1.0,.5,.2)*p;}
      else{glyph=l.y==1?61u:35u;fg=vec3(1.0,.42,.2)*p;bg=vec3(.3,.07,.05)*p;}
    }else if(tile==20u){
      vec3 wood=vec3(.66,.44,.24)*light;
      if(l.x==1||l.x==TW-2){glyph=124u;fg=wood*1.5;}
      else if(l.y%2==1&&l.x>1&&l.x<TW-2){glyph=61u;fg=wood*1.3;}
    }else if(tile==21u){
      vec3 tone=vec3(.5,.9,.8)*max(light,vec3(.35));
      if(l.y==TH-1&&(l.x==2||l.x==3)){glyph=124u;fg=vec3(.85,.85,.75)*max(light,vec3(.3));}
      else if(l.y==TH-2&&l.x>=1&&l.x<=4){glyph=l.x%2==0?79u:35u;fg=tone;}
    }else if(tile==22u){
      if(l.y>=1){
        float leaf=valueNoise(vec2(wc)*.9+th*5.0);
        bool berry=leaf>.6&&n>.7;
        glyph=berry?79u:(leaf>.45?38u:37u);
        fg=berry?vec3(.9,.2,.3)*max(light,vec3(.25)):vec3(.24,.52,.2)*light*1.4;bg=vec3(.24,.52,.2)*light*.35;
      }
    }

    if(done){
      vec3 lit=base*light*bevel;
      fg=lit*1.22;bg=lit*.66;
    }

    // Liquids fill a tile from the bottom in eighths.
    if(liquid>0u&&!solid(tile)){
      uint kind=liquid>>4;float level=float(liquid&15u)/8.0;
      float cellTop=1.0-(float(l.y)+1.0)/float(TH);
      if(cellTop<level){
        bool surface=cellTop+1.0/float(TH)>=level&&(tileAt(t-ivec2(0,1)).g==0u);
        float wave=sin(float(wc.x)*.6+u_time*(kind==2u?1.2:2.4));
        if(kind==1u){
          vec3 tone=vec3(.10,.34,.72)*(light+vec3(.1));
          bg=mix(bg,tone,.84);fg=tone*1.9+vec3(.02);glyph=surface?(wave>0.0?126u:45u):(hash21(vec2(wc)+floor(u_time*.7))>.94?126u:32u);
        }else{
          float heat=.75+.25*sin(float(wc.x)*.35+float(wc.y)*.7+u_time*1.6);
          bg=vec3(.86,.26,.05)*heat;fg=vec3(1.0,.78,.25);glyph=surface?(wave>0.0?94u:126u):(hash21(vec2(wc)+floor(u_time*2.0))>.85?42u:126u);
        }
        material=4u;
      }
    }

    if(u_crack.z>0&&t==u_crack.xy&&hash21(vec2(l)+3.0)<float(u_crack.z)/4.0){glyph=n>.5?47u:92u;fg=vec3(.04);}
    if(u_cursor.z>0&&t==u_cursor.xy){
      vec3 ring=u_cursor.z==1?vec3(1.0,.92,.55):vec3(.95,.3,.25);
      bool sideX=l.x==0||l.x==TW-1,sideY=l.y==0||l.y==TH-1;
      if(sideX&&sideY){glyph=43u;fg=ring;}
      else if(sideY&&(l.x==1||l.x==TW-2)){glyph=45u;fg=ring;}
    }

    // Sprites sit in screen cells. Earlier sprites draw on top.
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),c=texelFetch(u_sprites,ivec2(i,2),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      int w=int(c.r),h=int(c.g),fl=int(c.b);
      if(rel.x<0||rel.y<0||rel.x>=w||rel.y>=h)continue;
      if((fl&8)!=0){
        uvec4 d=texelFetch(u_sprites,ivec2(i,3),0);
        glyph=d.r;fg=vec3(d.gba)/255.0;
        break;
      }
      uvec4 b=texelFetch(u_sprites,ivec2(i,1),0);
      int ax=int(b.r)+int(b.g)*256,ay=int(b.b)+int(b.a)*256;
      int px=(fl&4)!=0?w-1-rel.x:rel.x;
      uvec4 texel=texelFetch(u_art,ivec2(ax+px,ay-rel.y),0);
      if(texel.a==0u)continue;
      vec3 colour=vec3(texel.rgb)/255.0;
      bool selfLit=texel.a==200u||(fl&2)!=0;
      vec3 k=selfLit?vec3(1.0):max(light*1.15,vec3(.24));
      glyph=atlasGlyph(texel,px,rel.y);
      fg=(fl&1)!=0?vec3(1.0):colour*k*1.2;
      bg=(fl&1)!=0?vec3(.8):colour*k*.6;
      break;
    }
    writeCell(glyph,material,flags,1.0,fg,bg);
  }`;

  class BurrowView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['world', 'light', 'art', 'sprites', 'origin', 'window', 'cam', 'count', 'day', 'dusk', 'cursor', 'crack', 'glow', 'sun'], far: 2 });
      this.atlas = global.BurrowArt.build();
      const packed = this.atlas.pack();
      this.engine.setTexture('art', 6, packed.width, packed.height, packed.data);
      this.spriteData = new Uint8Array(MAX_SPRITES * 4 * 4);
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, this.spriteData);
      this.columns = 1;
      this.rows = 1;
      this.lightKey = '';
      this.lightAge = 0;
    }
    // Width and height of an art frame, in cells.
    size(name) {
      const { canvas } = this.atlas.frames[this.atlas.index(name)];
      return { w: canvas.width, h: canvas.height };
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
    // sprites: {x, y (screen cells), art, flip, flash, lit} or {x, y, char, colour}
    draw({ state, cam, sprites, cursor, crack, glow, sun, day, dusk, time, tint, dissolve }) {
      const data = this.spriteData, count = Math.min(MAX_SPRITES, sprites.length), SLOT = global.GlyphArt.SLOT;
      const put = (i, row, a, b, c, d) => { const at = (row * MAX_SPRITES + i) * 4; data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d; };
      for (let i = 0; i < count; i++) {
        const s = sprites[i], x = s.x + 2048, y = s.y + 2048;
        put(i, 0, x & 255, x >> 8, y & 255, y >> 8);
        if (s.art) {
          const index = this.atlas.index(s.art), { w, h } = this.size(s.art);
          const ax = (index % 16) * SLOT + Math.floor((SLOT - w) / 2), ay = Math.floor(index / 16) * SLOT + h - 1;
          put(i, 1, ax & 255, ax >> 8, ay & 255, ay >> 8);
          put(i, 2, w, h, (s.flash ? 1 : 0) | (s.lit ? 2 : 0) | (s.flip ? 4 : 0), 0);
        } else {
          put(i, 2, 1, 1, 8, 0);
          put(i, 3, s.char.charCodeAt(0), s.colour[0], s.colour[1], s.colour[2]);
        }
      }
      this.engine.setTexture('sprites', 7, MAX_SPRITES, 4, data);
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
