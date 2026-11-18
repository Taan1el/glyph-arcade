/* Ricochet scene: the 28x16 disc court at 8x5 tiny letters per tile. A polished floor with
 * seams and a centre circle, riveted walls, angled wedges, glowing shields, bullseye pockets,
 * conveyors and prisms; the athletes and the disc are shaded sprites. */
(function (global) {
  'use strict';

  const TILE_W = 8, TILE_H = 5, MAX_SPRITES = 96;
  const R = global.Ricochet;

  const SCENE = `
  uniform usampler2D u_court;
  uniform ivec2 u_cam;
  uniform vec4 u_aim;
  uniform float u_charge;
  uniform vec4 u_pulse;
  ${global.GlyphArt.SHADER}
  ${global.GlyphSprites.SHADER}
  const int TW=${TILE_W},TH=${TILE_H};

  void main(){
    ivec2 grid=ivec2(ceil(u_viewport/u_cellSize));
    ivec2 cell=ivec2(int(gl_FragCoord.x),grid.y-1-int(gl_FragCoord.y));
    ivec2 wc=cell+u_cam;
    ivec2 t=ivec2(floor(vec2(wc)/vec2(TW,TH)));
    ivec2 l=wc-t*ivec2(TW,TH);
    vec2 world=(vec2(wc)+.5)/vec2(TW,TH);
    vec2 inTile=(vec2(l)+.5)/vec2(TW,TH);

    uint glyph=32u;vec3 fg=vec3(.04,.06,.10);vec3 bg=vec3(.035,.048,.082);

    if(t.x>=0&&t.y>=0&&t.x<${R.WIDTH}&&t.y<${R.HEIGHT}){
      uvec4 info=texelFetch(u_court,t,0);
      uint kind=info.r, meta=info.g;
      bool rightSide=t.x>=${R.NET_X};
      float n=hash21(vec2(wc)*.81+vec2(t)*.37);
      // Polished floor: panel seams every tile, a soft shine and the centre circle.
      vec3 floorTone=rightSide?vec3(.12,.09,.17):vec3(.08,.12,.20);
      float shine=.85+.3*smoothstep(.0,1.0,1.0-abs(world.y/${R.HEIGHT}.0-.35)*2.0);
      vec3 base=floorTone*shine;
      glyph=n>.97?46u:32u;
      if(l.x==0||l.y==0){glyph=l.y==0?95u:124u;base*=.75;}
      float ring=length((world-vec2(${R.WIDTH / 2}.0,${R.HEIGHT / 2}.0))*vec2(1.0,1.0));
      if(abs(ring-3.0)<.1){glyph=46u;base=mix(base,vec3(.3,.4,.6),.45);}
      bool lit=false;vec3 litFg=vec3(0);

      if(kind==1u||kind==2u){
        // Riveted wall panels
        base=vec3(.16,.24,.38);
        bool seam=kind==1u?(l.y==0||l.y==TH-1):(l.x==0||l.x==TW-1);
        glyph=seam?(kind==1u?61u:124u):35u;
        if(seam)base=vec3(.30,.48,.70);
        if((l.x==1||l.x==TW-2)&&(l.y==1||l.y==TH-2)){glyph=79u;base=vec3(.55,.7,.85);}
      }else if(kind==3u||kind==4u){
        // A plated wedge: the diagonal edge glows, the solid half is metal.
        float d=kind==3u?(inTile.x+inTile.y)-1.0:(inTile.x-inTile.y);
        bool solid=kind==3u?d<0.0:d>0.0;
        if(abs(d)<.16){glyph=kind==3u?47u:92u;lit=true;litFg=vec3(.5,.9,1.0);base=vec3(.1,.18,.3);}
        else if(solid){glyph=35u;base=vec3(.16,.26,.40);}
      }else if(kind==5u){
        vec3 scol=rightSide?vec3(.36,.92,.42):vec3(.28,.82,1.0);
        float pulse=.8+.2*sin(u_time*4.0+float(wc.y)*.4);
        glyph=(l.y%2==0)?35u:61u;base=scol*.4;lit=true;litFg=scol*pulse;
      }else if(kind==6u){
        glyph=n>.6?47u:45u;base=vec3(.34,.18,.04);lit=true;litFg=vec3(1.0,.62,.2);
      }else if(kind==7u){
        float r=length((inTile-.5)*vec2(1.6,1.0));
        float p=.75+.25*sin(u_time*7.0);
        base=vec3(.22,.16,.04);
        if(r<.16){glyph=36u;lit=true;litFg=vec3(1.0,.9,.4)*p;}
        else if(abs(r-.34)<.08||abs(r-.52)<.06){glyph=79u;lit=true;litFg=vec3(1.0,.78,.25)*p;}
      }else if(kind==8u){
        base=rightSide?vec3(.16,.04,.05):vec3(.04,.10,.18);
        glyph=l.x==TW/2?58u:32u;
      }else if(kind==9u){
        if((t.x==${R.NET_X - 1}&&l.x==TW-1)||(t.x==${R.NET_X}&&l.x==0)){glyph=(l.y%2==0)?58u:124u;lit=true;litFg=vec3(.55,.68,.86);}
      }else if(kind==10u){
        float r=length((inTile-.5)*vec2(1.6,1.0));
        if(r<.5){base=mix(vec3(.96,.66,.26),vec3(.5,.3,.1),r*1.8);glyph=r<.2?64u:35u;}
      }else if(kind==11u||kind==12u){
        float dir=kind==11u?1.0:-1.0;
        int phase=int(floor(float(wc.x)-dir*u_time*10.0))&3;
        base=kind==11u?vec3(.06,.16,.22):vec3(.20,.11,.06);
        if(phase!=0){glyph=kind==11u?62u:60u;lit=true;litFg=kind==11u?vec3(.32,.84,1.0):vec3(1.0,.62,.28);}
        if(l.y==0||l.y==TH-1){glyph=61u;base*=1.6;lit=false;}
      }else if(kind==13u){
        float p=.8+.2*sin(u_time*5.0);
        base=vec3(.20,.10,.30);
        bool edge=meta==0u?abs(inTile.x+inTile.y-1.0)<.18:meta==1u?abs(inTile.y-.5)<.14:meta==2u?abs(inTile.x-inTile.y)<.18:abs(inTile.x-.5)<.1;
        glyph=edge?(meta==0u?47u:meta==1u?45u:meta==2u?92u:124u):42u;
        lit=true;litFg=(edge?vec3(.95,.7,1.0):vec3(.55,.32,.75))*p;
      }
      fg=lit?litFg:base*1.7;bg=base;

      // Aim preview line while you hold the disc
      if(u_charge>=0.0&&u_aim.z>.05){
        vec2 rel=world-u_aim.xy;
        float along=dot(rel,u_aim.zw),perp=abs(rel.x*u_aim.w-rel.y*u_aim.z);
        if(along>.8&&along<7.5&&perp<.18&&fract(along*.85)<.45){
          fg=u_charge>.35?vec3(1.0,.62,.22):vec3(1.0,.90,.42);
          glyph=u_charge>.75?42u:58u;
        }
      }
      // Goal / parry shockwave ring
      if(u_pulse.z>0.0){
        float d=length((world-u_pulse.xy)*vec2(1.0,1.2));
        if(abs(d-u_pulse.z)<.35){
          fg=u_pulse.w>.5?vec3(1.0,.86,.35):vec3(.45,.92,1.0);
          if(glyph==32u||glyph==46u||glyph==95u||glyph==124u)glyph=42u;
        }
      }
    }

    spriteCell(cell,vec3(1.0),glyph,fg,bg);
    writeCell(glyph,0u,3u,1.0,fg,bg);
  }`;

  class RicochetView {
    constructor(canvas) {
      this.engine = new global.GlyphEngine(canvas, { sceneSource: SCENE, uniforms: ['court', 'art', 'sprites', 'cam', 'count', 'aim', 'charge', 'pulse'], far: 2 });
      this.sprites = new global.GlyphSprites(this.engine, global.RicochetArt.build(), { max: MAX_SPRITES });
      this.courtData = new Uint8Array(R.WIDTH * R.HEIGHT * 4);
      this.engine.setTexture('court', 4, R.WIDTH, R.HEIGHT, this.courtData);
      this.columns = 1;
      this.rows = 1;
    }

    size(name) { return this.sprites.size(name); }

    resize(width, height, cellSize) {
      this.engine.resize(width, height, cellSize);
      this.columns = this.engine.columns;
      this.rows = this.engine.rows;
    }

    camera(focusX) {
      const courtW = R.WIDTH * TILE_W, courtH = R.HEIGHT * TILE_H;
      const maxX = courtW - this.columns;
      const cx = maxX <= 0 ? Math.round(maxX / 2) : Math.max(0, Math.min(maxX, Math.round(focusX * TILE_W - this.columns / 2)));
      const cy = Math.round((courtH - this.rows) / 2) - (this.topOffset || 0);
      return { x: cx, y: cy };
    }

    uploadCourt(state) {
      const data = this.courtData;
      const code = {
        FLOOR: 0, WALL: 1, WALL_H: 1, WALL_V: 2, WEDGE_SLASH: 3, WEDGE_BACK: 4,
        SHIELD_2: 5, SHIELD_1: 6, BULLSEYE: 7, GOAL: 8, NET: 9, PILLAR: 10, CONVEYOR_E: 11, CONVEYOR_W: 12, PRISM: 13
      };
      for (let ty = 0; ty < R.HEIGHT; ty++) {
        for (let tx = 0; tx < R.WIDTH; tx++) {
          const i = (ty * R.WIDTH + tx) * 4;
          const tile = R.courtTileAt(state, tx + 0.5, ty + 0.5);
          data[i] = code[tile] || 0;
          let meta = 0;
          if (tile === 'PRISM') {
            const pr = state.prisms.find(p => Math.hypot(tx + 0.5 - p.x, ty + 0.5 - p.y) < p.r);
            if (pr) meta = pr.angle;
          }
          data[i + 1] = meta;
        }
      }
      this.engine.setTexture('court', 4, R.WIDTH, R.HEIGHT, data);
    }

    // sprites: GlyphSprites entries (art with flip, tint, flash and bar, or char + colour)
    draw({ state, cam, sprites, time, tint, pulse }) {
      this.sprites.clear();
      for (const sprite of sprites) if (!this.sprites.add(sprite)) break;
      const count = this.sprites.upload();
      const p0 = state.players[0];
      const aim = state.holder === 0 ? R.aimVector(state, 0) : { x: 0, y: 0 };
      const charge = state.holder === 0 ? Math.min(1, p0.chargeTimer) : -1;
      this.engine.render((gl, u) => {
        gl.uniform2i(u.cam, cam.x, cam.y);
        gl.uniform1i(u.count, count);
        gl.uniform4f(u.aim, p0.x, p0.y, aim.x, aim.y);
        gl.uniform1f(u.charge, charge);
        gl.uniform4fv(u.pulse, pulse || [0, 0, 0, 0]);
      }, { time, ink: false, tint });
    }

    inspect() { return this.engine.inspect(); }
  }

  RicochetView.TILE_W = TILE_W;
  RicochetView.TILE_H = TILE_H;
  global.RicochetView = RicochetView;
})(window);
