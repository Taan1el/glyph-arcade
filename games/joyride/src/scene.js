/* Joyride scene: top-down town where each world tile is 6x4 tiny character cells. Roofs,
 * pavements, lanes, crossings, parks and water carry real texture; cars are rendered from
 * their outline at 16 headings; day, night, headlights, sirens and rain light the streets. */
(function (global) {
  'use strict';

  const TILE_W = 6, TILE_H = 4, MARGIN = 10, MAX_SPRITES = 160;

  const SCENE = `
  uniform usampler2D u_world;
  uniform ivec2 u_origin;
  uniform ivec2 u_window;
  uniform ivec2 u_cam;
  uniform float u_day;
  uniform float u_rain;
  uniform vec4 u_beam;
  uniform vec3 u_siren;
  uniform vec3 u_marker;
  ${global.GlyphArt.SHADER}
  ${global.GlyphSprites.SHADER}

  uvec4 tileAt(ivec2 t){
    ivec2 p=t-u_origin;
    if(p.x<0||p.y<0||p.x>=u_window.x||p.y>=u_window.y)return uvec4(0u,3u,0u,0u);
    return texelFetch(u_world,p,0);
  }
  const int TW=6,TH=4;
  bool isRoad(uint t){return t>=4u&&t<=7u;}
  bool isBlock(uint t){return t==8u||t==9u||t==10u||(t>=13u&&t<=16u);}
  float valueNoise(vec2 p){
    vec2 i=floor(p),f=p-i;f=f*f*(3.0-2.0*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
  }
  // Six letters written across a tile's middle rows, as roof signs.
  uint sign6(int x,uint a,uint b,uint c,uint d,uint e,uint f){return x==0?a:x==1?b:x==2?c:x==3?d:x==4?e:f;}

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(TW,TH)));
    ivec2 l=wc-t*ivec2(TW,TH);
    uvec4 data=tileAt(t);
    uint tile=data.r,dist=data.g,meta=data.b,extra=data.a;
    vec2 world=(vec2(wc)+.5)/vec2(TW,TH);
    float n=hash21(vec2(wc)*.731+1.7),th=hash21(vec2(t)*.73);
    vec3 ambient=mix(vec3(.24,.28,.44),vec3(1.0,.98,.94),u_day);

    // Headlight cone ahead of the player's car at night
    if(u_day<.75&&u_beam.w>.5){
      vec2 dp=world-u_beam.xy;
      float d=length(dp);
      if(d<15.0&&d>.2){
        float align=dot(normalize(dp),vec2(cos(u_beam.z),sin(u_beam.z)));
        if(align>.58)ambient+=vec3(1.1,1.02,.78)*(1.0-d/15.0)*smoothstep(.58,.92,align)*(1.0-u_day)*1.35;
      }
    }
    // Police siren ground glow
    if(u_siren.z>.5){
      float sd=distance(world,u_siren.xy);
      if(sd<11.0)ambient+=(sin(u_time*18.0)>0.0?vec3(.95,.18,.18):vec3(.18,.42,1.0))*(1.0-sd/11.0)*.48;
    }

    uvec4 nN=tileAt(t+ivec2(0,-1)),nS=tileAt(t+ivec2(0,1)),nW=tileAt(t+ivec2(-1,0)),nE=tileAt(t+ivec2(1,0));
    // Blocks cast a shadow down and to the right onto the ground.
    float shadow=1.0;
    if(!isBlock(tile)){
      if(isBlock(nN.r)&&l.y<=1)shadow*=.6;
      if(isBlock(nW.r)&&l.x<=1)shadow*=.62;
    }

    uint glyph=32u;vec3 base=vec3(0);float bright=1.0;bool glow=false;vec3 glowFg=vec3(0);
    uint flags=3u;

    if(tile==0u){
      float wave=sin(float(wc.x)*.45+float(wc.y)*.6+u_time*2.2)+sin(float(wc.x)*.2-float(wc.y)*.35-u_time*1.3);
      base=vec3(.08,.28,.56)*(.9+.1*wave);
      glyph=wave>1.1?126u:wave>.7?45u:(n>.95?46u:32u);
      bool shore=(l.y==0&&nN.r!=0u)||(l.y==TH-1&&nS.r!=0u)||(l.x==0&&nW.r!=0u)||(l.x==TW-1&&nE.r!=0u);
      if(shore){glyph=fract(u_time*.8+n)>.5?126u:45u;base=vec3(.5,.7,.85);}
    }else if(tile==1u){
      float m=valueNoise(vec2(wc)*vec2(.25,.37));
      base=mix(vec3(.16,.40,.16),vec3(.26,.54,.22),m);
      glyph=n>.88?34u:n>.75?39u:n>.66?44u:32u;
      // Some park tiles hold a tree: a lit crown seen from above.
      if(th>.6){
        vec2 d=vec2(float(l.x)+.5-3.0,(float(l.y)+.5-2.0)*1.5)/2.6;
        float r=length(d);
        if(r<1.0){
          base=mix(vec3(.10,.32,.12),vec3(.30,.60,.24),clamp(1.0-r+(-d.x-d.y)*.4,0.0,1.0));
          glyph=r<.45?38u:r<.8?37u:42u;
        }
      }
      if(n>.99){glyph=42u;base=vec3(.95,.7,.85);}
    }else if(tile==2u){
      base=vec3(.50,.50,.54)*(.92+th*.12);
      bool joint=l.x==0||l.y==0;
      glyph=joint?(l.y==0?95u:124u):(n>.9?46u:32u);
      if(joint)bright=.82;
      bool kerb=(l.y==TH-1&&isRoad(nS.r))||(l.y==0&&isRoad(nN.r))||(l.x==0&&isRoad(nW.r))||(l.x==TW-1&&isRoad(nE.r));
      if(kerb){glyph=61u;bright=1.18;}
    }else if(tile==3u){
      bool herring=((l.x+l.y*2+t.x+t.y)%4)<2;
      base=herring?vec3(.62,.50,.40):vec3(.54,.42,.34);
      glyph=herring?61u:124u;
    }else if(tile>=4u&&tile<=7u){
      float speck=valueNoise(vec2(wc)*.5);
      base=(tile==7u?vec3(.30,.27,.24):vec3(.20,.21,.24))*(.9+speck*.18);
      glyph=n>.94?46u:32u;
      bool roadN=isRoad(nN.r),roadS=isRoad(nS.r),roadW=isRoad(nW.r),roadE=isRoad(nE.r);
      vec3 paint=tile==5u?vec3(.92,.78,.28):vec3(.82,.84,.86);
      if(tile==6u){
        // Zebra crossings where a street leaves the junction, traffic lights on alternate corners.
        bool zebraNS=(l.y==0&&roadN&&nN.r!=6u)||(l.y==TH-1&&roadS&&nS.r!=6u);
        bool zebraEW=(l.x==0&&roadW&&nW.r!=6u)||(l.x==TW-1&&roadE&&nE.r!=6u);
        if(zebraNS&&l.x%2==0){glyph=124u;base=vec3(.82,.82,.82);}
        if(zebraEW&&l.y%2==0){glyph=61u;base=vec3(.82,.82,.82);}
        if(l.x==0&&l.y==0&&(t.x+t.y)%2==0){
          glyph=79u;glow=true;
          glowFg=meta==1u?vec3(.25,.95,.35):meta==3u?vec3(.95,.28,.22):vec3(1.0,.85,.25);
        }
      }else if(tile==7u){
        // Bridge deck planks and side rails
        glyph=(roadN||roadS)?(l.y%2==0?61u:32u):(l.x%2==0?124u:32u);
        base=vec3(.42,.34,.26);
        if((!roadW&&l.x==0)||(!roadE&&l.x==TW-1)||(!roadN&&l.y==0)||(!roadS&&l.y==TH-1)){glyph=35u;base=vec3(.72,.66,.5);}
      }else{
        // Lines run where two lanes meet: on the shared tile edge, or down the middle of a lone lane.
        // Which way the street runs: the direction its road continues furthest.
        int runV=0,runH=0;
        for(int k=1;k<=3;k++){
          runV+=int(isRoad(tileAt(t+ivec2(0,k)).r))+int(isRoad(tileAt(t-ivec2(0,k)).r));
          runH+=int(isRoad(tileAt(t+ivec2(k,0)).r))+int(isRoad(tileAt(t-ivec2(k,0)).r));
        }
        bool vert=runV>runH;
        if(vert){
          bool dash=tile==5u||((t.y*TH+l.y)%4)<2;
          bool line=roadW&&isRoad(nW.r)?l.x==0:(!roadE&&l.x==2);
          if(line&&dash){glyph=124u;base=paint;}
        }else{
          bool dash=tile==5u||((t.x*TW+l.x)%6)<3;
          bool line=roadN?l.y==0:(!roadS&&l.y==2);
          if(line&&dash){glyph=45u;base=paint;}
        }
        if(extra==1u&&(l.x==1||l.x==4)&&glyph==32u){glyph=34u;base*=.55;}
      }
    }else if(tile==8u){
      // Roofs: parapet edge, gravel, and a vent or skylight per tile.
      vec3 roof=dist==0u?vec3(.36,.50,.62):dist==1u?vec3(.50,.28,.58):dist==2u?vec3(.60,.38,.30):vec3(.54,.48,.32);
      roof*=.88+float(meta%3u)*.08;
      bool edge=(l.y==0&&nN.r!=8u)||(l.y==TH-1&&nS.r!=8u)||(l.x==0&&nW.r!=8u)||(l.x==TW-1&&nE.r!=8u);
      base=roof;glyph=n>.8?58u:n>.55?46u:32u;
      if(edge){glyph=(l.y==0||l.y==TH-1)?61u:124u;base=roof*1.35;}
      else if(th>.7&&l.x>=2&&l.x<=3&&l.y>=1&&l.y<=2){glyph=35u;base=vec3(.62,.64,.68);}
      else if(th<.18&&l.x>=1&&l.x<=4&&l.y==1){glyph=61u;base=vec3(.5,.7,.9);if(u_day<.55){glow=true;glowFg=vec3(1.0,.86,.45);}}
      // At night a few roof lights burn; The Strip trims its rooftops in neon, one colour per tile.
      if(u_day<.55&&!edge&&n>.965){glyph=58u;glow=true;glowFg=dist==1u?(th>.5?vec3(1.0,.3,.85):vec3(.25,.95,1.0)):vec3(1.0,.86,.45);}
      if(dist==1u&&edge&&u_day<.65){glow=true;glowFg=th>.5?vec3(1.0,.32,.82):vec3(.25,.9,1.0);}
    }else if(tile==9u){
      vec3 col=meta==1u?vec3(.74,.28,.22):meta==2u?vec3(.24,.48,.74):vec3(.74,.58,.20);
      bool ridge=l.x%2==0;
      base=col*(ridge?1.1:.78);glyph=ridge?124u:58u;
      if(l.y==0||l.y==TH-1){glyph=61u;base=col*.6;}
    }else if(tile==10u){
      bool beam=(l.x+l.y)%3==0||(l.x-l.y+12)%3==0;
      base=beam?vec3(.92,.74,.18):vec3(.18,.16,.12);glyph=beam?((l.x+l.y)%3==0?47u:92u):32u;
    }else if(tile==11u){
      bool chev=((l.x+l.y)%4)<2;
      base=chev?vec3(.95,.8,.2):vec3(.2,.18,.12);glyph=chev?94u:61u;
    }else if(tile==12u){
      float ring=sin(u_time*10.0)>0.0?1.25:.85;
      base=vec3(.16,.40,.22);glyph=l.y==0||l.y==TH-1?61u:(l.x==0||l.x==TW-1?124u:32u);
      if((l.x==2||l.x==3)&&(l.y==1||l.y==2)){glyph=36u;glow=true;glowFg=vec3(.35,1.0,.45)*ring;}
    }else if(tile==13u){
      base=vec3(.18,.40,.46);glyph=(l.x+l.y)%3==0?47u:32u;
      if(l.y==1&&l.x>=0&&l.x<=4){glyph=sign6(l.x,83u,80u,82u,65u,89u,32u);glow=true;glowFg=vec3(.4,1.0,.95);}
    }else if(tile==14u){
      base=vec3(.30,.34,.18);glyph=l.y%2==0?61u:45u;
      if(l.y==1){glyph=sign6(l.x,71u,65u,82u,65u,71u,69u);glow=true;glowFg=vec3(.85,.95,.4);}
    }else if(tile==15u){
      base=vec3(.78,.78,.82);glyph=n>.7?46u:32u;
      if((l.x==2||l.x==3)||((l.y==1||l.y==2)&&l.x>=1&&l.x<=4)){glyph=35u;base=vec3(.9,.2,.2);}
    }else if(tile==16u){
      base=vec3(.18,.26,.50);glyph=l.y%2==0?61u:32u;
      if(l.y==1){glyph=sign6(l.x,80u,79u,76u,73u,67u,69u);glow=true;glowFg=vec3(.55,.78,1.0);}
    }else if(tile==17u){
      base=vec3(.42,.32,.20);glyph=l.x%2==0?124u:61u;
      if(l.y==0||l.y==TH-1){glyph=35u;base=vec3(.3,.24,.16);}
    }
    vec3 lit=base*ambient*bright*shadow;
    vec3 fg=lit*1.3,bg=lit*.66;
    if(glow){fg=glowFg;bg=max(bg,glowFg*.25);}

    // Highlight active mission drop/checkpoint ring on the ground
    if(u_marker.z>.5){
      float md=distance(world,u_marker.xy);
      if(md>1.6&&md<3.1){
        float p=.75+.25*sin(u_time*8.0);
        fg=vec3(1.0,.88,.25)*p;bg=mix(bg,vec3(.45,.36,.08),0.45);
        if(glyph==32u)glyph=42u;
      }
    }
    // Light rain streaks
    if(u_rain>.5&&hash21(vec2(cell)+floor(u_time*24.0))>.975){glyph=47u;fg=vec3(.55,.7,1.0);}

    // Cars, people, markers and particles; earlier sprites draw on top.
    spriteCell(cell,ambient,glyph,fg,bg);
    writeCell(glyph,0u,flags,1.0,fg,bg);
  }
  `;

  class JoyrideView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, {
        sceneSource: SCENE,
        uniforms: ['world', 'art', 'sprites', 'origin', 'window', 'cam', 'count', 'day', 'rain', 'beam', 'siren', 'marker'],
        far: 2
      });
      this.sprites = new global.GlyphSprites(this.engine, global.JoyrideArt.build(), { max: MAX_SPRITES });
      this.markStamp = new Uint32Array(160 * 160);
      this.stampId = 1;
      this.columns = 1;
      this.rows = 1;
    }

    size(name) { return this.sprites.size(name); }

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

    // sprites: GlyphSprites entries (art with flip, flash, lit and tint, or char + colour)
    draw({ state, cam, sprites, day, rain, beam, siren, marker, time, tint }) {
      this.sprites.clear();
      for (const sprite of sprites) if (!this.sprites.add(sprite)) break;
      const count = this.sprites.upload();
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
  global.JoyrideView = JoyrideView;
})(typeof window !== 'undefined' ? window : globalThis);
