/* Delve view: a grid raycaster that writes character cells. Walls are brick
 * letters, monsters and items are giant letters built from small ones. */
(function (global) {
  'use strict';
  const MAX_SPRITES = 48, MAX_TORCHES = 12, WALL_HEIGHT = 2.2;

  const SCENE = `
  const float H=${WALL_HEIGHT.toFixed(2)};
  uniform usampler2D u_map;
  uniform int u_size;
  uniform vec3 u_eye;
  uniform vec3 u_forward;
  uniform vec3 u_right;
  uniform vec3 u_up;
  uniform vec4 u_lantern;
  uniform vec4 u_torches[${MAX_TORCHES}];
  uniform int u_torchCount;
  uniform vec4 u_spritePos[${MAX_SPRITES}];
  uniform vec4 u_spriteInfo[${MAX_SPRITES}];
  uniform vec3 u_spriteColour[${MAX_SPRITES}];
  uniform int u_spriteCount;
  uniform vec3 u_wallColour;
  uniform vec3 u_floorColour;
  uniform vec3 u_fogColour;

  uvec4 tile(ivec2 c){if(c.x<0||c.y<0||c.x>=u_size||c.y>=u_size)return uvec4(0u);return texelFetch(u_map,c,0);}

  vec3 light(vec3 p,vec3 n,vec3 base){
    vec3 total=vec3(.06,.065,.085)*base;
    vec3 toL=u_lantern.xyz-p;float d=length(toL);
    total+=base*vec3(1.0,.82,.58)*u_lantern.w*max(.15,dot(n,toL/max(d,.01)))/(1.0+d*d*.22);
    for(int i=0;i<${MAX_TORCHES};i++){
      if(i>=u_torchCount)break;
      vec3 toT=u_torches[i].xyz-p;float dt=length(toT);
      float flicker=.85+.15*sin(u_time*9.0+u_torches[i].w*7.0)*sin(u_time*5.3+u_torches[i].w*3.0);
      total+=base*vec3(1.0,.55,.22)*1.6*flicker*max(.2,dot(n,toT/max(dt,.01)))/(1.0+dt*dt*.16);
    }
    return total;
  }

  // World-space size of one character cell at distance t on a surface.
  float footprint(float t,vec3 n,vec3 rd){return t*cellAngle()/max(.15,abs(dot(n,-rd)));}

  uint wallGlyph(vec2 uv,float t,float fp,out float shade){
    // Running-bond bricks .8 x .4, joints drawn as letters when resolvable.
    float row=floor(uv.y/.4),u=uv.x/.8+mod(row,2.0)*.5;
    vec2 local=vec2(fract(u),fract(uv.y/.4));
    float brick=hash21(vec2(floor(u),row));shade=.82+.3*brick;
    if(fp<.18){
      bool hJoint=local.y<.12,vJoint=local.x<.08;
      if(hJoint&&vJoint){shade*=.55;return 43u;}
      if(hJoint){shade*=.6;return 45u;}
      if(vJoint){shade*=.6;return 124u;}
    }
    float grain=hash21(floor(uv*vec2(5.0,4.0)/max(1.0,fp*4.0)));
    return brick>.86?37u:grain>.6?35u:grain>.25?61u:58u;
  }
  uint floorGlyph(vec2 xz,uint kind,float fp,out float shade){
    vec2 local=fract(xz);float stone=hash21(floor(xz)*1.7);shade=.8+.3*stone;
    if(kind==4u){shade=.7+.35*fract(xz.y*3.0);return fract(xz.y*3.0)<.25?61u:62u;}
    if(fp<.3&&(local.x<.06||local.y<.06)){shade*=.6;return local.x<.06&&local.y<.06?43u:local.x<.06?124u:45u;}
    float grit=hash21(floor(xz*6.0/max(1.0,fp*6.0)));
    return grit>.85?44u:grit>.7?39u:46u;
  }

  void main(){
    vec2 screen=(gl_FragCoord.xy*u_cellSize)/u_viewport*2.0-1.0;
    vec3 rd=normalize(u_forward+u_right*screen.x*(u_viewport.x/u_viewport.y)*.78+u_up*screen.y*.78);
    // Floor and ceiling planes.
    float tPlane=rd.y<-.0001?(0.0-u_eye.y)/rd.y:rd.y>.0001?(H-u_eye.y)/rd.y:1e9;
    // Amanatides-Woo walk through the tile grid.
    ivec2 cell=ivec2(floor(u_eye.xz));vec2 dir=rd.xz;
    vec2 delta=abs(1.0/max(abs(dir),vec2(1e-5)));ivec2 step=ivec2(sign(dir));
    vec2 side=(vec2(step)*(vec2(cell)-u_eye.xz)+vec2(step)*.5+.5)*delta;
    float tWall=1e9;vec3 wallN=vec3(0);uint wallKind=0u;float wallOpen=0.0;
    for(int i=0;i<72;i++){
      float t;int axis;
      if(side.x<side.y){t=side.x;side.x+=delta.x;cell.x+=step.x;axis=0;}else{t=side.y;side.y+=delta.y;cell.y+=step.y;axis=1;}
      if(t>tPlane||t>u_far)break;
      uvec4 data=tile(cell);
      float y=u_eye.y+rd.y*t;
      if(data.r==0u||(data.r==2u&&y>float(data.g)/255.0*H)){tWall=t;wallKind=data.r;wallOpen=float(data.g)/255.0;wallN=axis==0?vec3(-float(step.x),0,0):vec3(0,0,-float(step.y));break;}
    }
    float tHit=min(tWall,tPlane);
    vec3 fg=vec3(0),bg=vec3(0);uint glyph=32u,material=0u,flags=0u;
    if(tHit<u_far){
      vec3 p=u_eye+rd*tHit,n;vec3 base;float shade=1.0;
      if(tWall<tPlane){
        n=wallN;vec2 uv=vec2(abs(n.x)>.5?p.z:p.x,p.y);float fp=footprint(tHit,n,rd);
        if(wallKind==2u){
          // Iron portcullis: bars and crossbands, raised by its open fraction.
          material=3u;base=vec3(.42,.40,.38);float bar=fract(uv.x*5.0);shade=bar<.3?1.1:.65;
          glyph=fract((uv.y-wallOpen*H)*2.5)<.18?61u:bar<.3?124u:35u;
        }else{material=1u;base=u_wallColour;glyph=wallGlyph(uv,tHit,fp,shade);}
      }else if(rd.y<0.0){
        n=vec3(0,1,0);uint kind=tile(ivec2(floor(p.xz))).r;float fp=footprint(tHit,n,rd);
        material=kind==4u?5u:2u;base=kind==4u?u_floorColour*1.25:u_floorColour;glyph=floorGlyph(p.xz,kind,fp,shade);
      }else{
        n=vec3(0,-1,0);material=4u;base=u_wallColour*.55;
        float beam=fract(p.x*.5);shade=beam<.12?1.2:.7;glyph=beam<.12?61u:hash21(floor(p.xz*3.0))>.9?96u:32u;
      }
      vec3 lit=light(p,n,base*shade);
      fg=lit*1.3+vec3(.012);bg=lit*.3;
    }
    // Giant-letter sprites: camera-facing billboards masked by their own glyph.
    vec3 normal=-normalize(vec3(u_forward.x,0,u_forward.z));vec3 across=normalize(vec3(u_right.x,0,u_right.z));
    float tSprite=tHit;
    for(int i=0;i<${MAX_SPRITES};i++){
      if(i>=u_spriteCount)break;
      vec4 s=u_spritePos[i],info=u_spriteInfo[i];
      float denom=dot(rd,normal);if(abs(denom)<1e-4)continue;
      float t=dot(s.xyz-u_eye,normal)/denom;if(t<.2||t>=tSprite)continue;
      vec3 p=u_eye+rd*t;float halfW=s.w*.36,halfH=s.w*.5;
      float u=dot(p-s.xyz,across)/halfW,v=(p.y-s.y)/halfH;
      if(abs(u)>1.0||abs(v)>1.0)continue;
      int column=int(floor((u*.5+.5)*5.0)),row=int(floor((1.0-(v*.5+.5))*7.0));
      if(!glyphBit(uint(info.x),column,row))continue;
      if(info.w>0.0&&hash21(floor(gl_FragCoord.xy)+float(i))<info.w)continue; // dissolving
      tSprite=t;
      bool selfLit=info.y>=20.0;
      vec3 base=u_spriteColour[i]*(.85+.25*(v*.5+.5));
      vec3 lit=selfLit?base:light(p,normal,base)*1.6+base*.12;
      lit=mix(lit,vec3(1.0,.95,.9),clamp(info.z,0.0,1.0));
      fg=lit*1.25+vec3(.02);bg=lit*.38;
      // Each giant letter is drawn in its own small letter.
      glyph=uint(info.x);material=uint(info.y);flags=selfLit?3u:1u; // thin letter strokes would ink solid
      tHit=t;
    }
    float fog=1.0-exp(-tHit*.055);
    fg=mix(fg,u_fogColour,fog);bg=mix(bg,u_fogColour*.6,fog);
    if(tHit>=u_far){glyph=32u;fg=u_fogColour;bg=u_fogColour*.6;}
    writeCell(glyph,material,flags,tHit,fg,bg);
  }`;

  const PALETTES=[
    {wall:[.46,.47,.50],floor:[.40,.38,.36],fog:[.010,.012,.018]},
    {wall:[.36,.47,.36],floor:[.34,.38,.30],fog:[.008,.016,.010]},
    {wall:[.52,.40,.30],floor:[.42,.34,.26],fog:[.016,.011,.008]},
    {wall:[.55,.32,.30],floor:[.40,.28,.26],fog:[.020,.008,.008]},
    {wall:[.40,.44,.62],floor:[.32,.34,.46],fog:[.010,.012,.026]}
  ];

  class DelveView {
    constructor(canvas){
      this.engine=new GlyphEngine(canvas,{sceneSource:SCENE,far:40,uniforms:['map','size','eye','forward','right','up','lantern','torches','torchCount','spritePos','spriteInfo','spriteColour','spriteCount','wallColour','floorColour','fogColour']});
      this.mapData=null;this.spritePos=new Float32Array(MAX_SPRITES*4);this.spriteInfo=new Float32Array(MAX_SPRITES*4);this.spriteColour=new Float32Array(MAX_SPRITES*3);this.torchData=new Float32Array(MAX_TORCHES*4);
      this.eye=new Float32Array(3);this.forward=new Float32Array(3);this.right=new Float32Array(3);this.up=new Float32Array(3);
      this._nearTorches=[];this._visibleSprites=[];this._activePalette=PALETTES[0];this._lantern=0.95;this._torchCount=0;this._spriteCount=0;
      this._uniformBinder=this._bindUniforms.bind(this);
    }
    resize(width,height,cellSize){this.engine.resize(width,height,cellSize);}
    // tiles: Delve tile ids; doors: Map(index -> open 0..1)
    setMap(size,tiles,doors){
      if(!this.mapData||this.mapData.length!==size*size*4)this.mapData=new Uint8Array(size*size*4);
      for(let i=0;i<size*size;i++){
        const tile=tiles[i],open=doors?.has(i)?doors.get(i):(tile===3?1:0);
        this.mapData[i*4]=tile===3?(open>=1?1:2):tile;
        this.mapData[i*4+1]=Math.round(Math.min(1,Math.max(0,open))*255);
      }
      this.size=size;this.engine.setTexture('map',4,size,size,this.mapData);
    }
    _bindUniforms(gl,u){
      const eye=this.eye,forward=this.forward,palette=this._activePalette;
      gl.uniform1i(u.map,4);gl.uniform1i(u.size,this.size);gl.uniform3fv(u.eye,eye);gl.uniform3fv(u.forward,forward);gl.uniform3fv(u.right,this.right);gl.uniform3fv(u.up,this.up);
      gl.uniform4f(u.lantern,eye[0]+forward[0]*.2,eye[1]+.15,eye[2]+forward[2]*.2,this._lantern);
      gl.uniform4fv(u.torches,this.torchData);gl.uniform1i(u.torchCount,this._torchCount);
      gl.uniform4fv(u.spritePos,this.spritePos);gl.uniform4fv(u.spriteInfo,this.spriteInfo);gl.uniform3fv(u.spriteColour,this.spriteColour);gl.uniform1i(u.spriteCount,this._spriteCount);
      gl.uniform3fv(u.wallColour,palette.wall);gl.uniform3fv(u.floorColour,palette.floor);gl.uniform3fv(u.fogColour,palette.fog);
    }
    draw(view){
      const {camera,sprites,torches,depth,time,ink,tint,dissolve}=view;
      this._activePalette=PALETTES[Math.max(0,Math.min(PALETTES.length-1,depth-1))];
      const yaw=camera.yaw,pitch=camera.pitch||0,cosP=Math.cos(pitch),sinP=Math.sin(pitch),sinY=Math.sin(yaw),cosY=Math.cos(yaw);
      this.forward[0]=sinY*cosP;this.forward[1]=sinP;this.forward[2]=-cosY*cosP;
      this.right[0]=cosY;this.right[1]=0;this.right[2]=sinY;
      this.up[0]=-sinY*sinP;this.up[1]=cosP;this.up[2]=cosY*sinP;
      const ex=camera.x,ey=camera.y,ez=camera.z;
      this.eye[0]=ex;this.eye[1]=ey;this.eye[2]=ez;
      this._lantern=view.lantern??.95;

      const nearTorches=this._nearTorches;nearTorches.length=0;
      for(let i=0;i<torches.length;i++){const t=torches[i];t._dist=Math.hypot(t.x-ex,t.z-ez);nearTorches.push(t);}
      nearTorches.sort((a,b)=>a._dist-b._dist);
      const tCount=Math.min(MAX_TORCHES,nearTorches.length);this._torchCount=tCount;
      this.torchData.fill(0);
      for(let i=0;i<tCount;i++){const t=nearTorches[i],i4=i*4;this.torchData[i4]=t.x;this.torchData[i4+1]=t.y;this.torchData[i4+2]=t.z;this.torchData[i4+3]=t.phase;}

      const visible=this._visibleSprites;visible.length=0;
      for(let i=0;i<sprites.length;i++){const s=sprites[i],d=Math.hypot(s.x-ex,s.z-ez);if(d<36){s._dist=d;visible.push(s);}}
      visible.sort((a,b)=>a._dist-b._dist);
      const sCount=Math.min(MAX_SPRITES,visible.length);this._spriteCount=sCount;
      for(let i=0;i<sCount;i++){
        const s=visible[i],i4=i*4,i3=i*3,c=s.colour;
        this.spritePos[i4]=s.x;this.spritePos[i4+1]=s.y;this.spritePos[i4+2]=s.z;this.spritePos[i4+3]=s.size;
        this.spriteInfo[i4]=s.glyph.charCodeAt(0);this.spriteInfo[i4+1]=s.material;this.spriteInfo[i4+2]=s.flash||0;this.spriteInfo[i4+3]=s.dissolve||0;
        this.spriteColour[i3]=c[0];this.spriteColour[i3+1]=c[1];this.spriteColour[i3+2]=c[2];
      }
      this.engine.render(this._uniformBinder,{time,ink,tint,dissolve});
    }
    inspect(){return this.engine.inspect();}
    destroy(){this.engine.destroy();}
  }
  DelveView.WALL_HEIGHT=WALL_HEIGHT;
  global.DelveView=DelveView;
})(typeof window!=='undefined'?window:globalThis);
