/* Glyph engine: a game's scene shader writes one record per character cell
 * (glyph, material, flags, log depth + foreground + background), and a shared
 * display pass draws each cell as a 5x7 letter. Shared by every arcade game.
 *
 * Record layout: r = glyph code, g = material id, b = flags, a = log depth.
 * Flags: 1 = never ink-outline this cell, 2 = flat colour (no ink shading).
 */
(function (global) {
  'use strict';

  // Five bits per row, top row first. Numeric tables are data, not font assets.
  const GLYPHS = Object.freeze({
    ' ': [0,0,0,0,0,0,0], '.': [0,0,0,0,0,12,12], ',': [0,0,0,0,12,12,8],
    ':': [0,12,12,0,12,12,0], ';': [0,12,12,0,12,12,8], "'": [4,4,8,0,0,0,0],
    '`': [8,4,0,0,0,0,0], '-': [0,0,0,31,0,0,0], '=': [0,0,31,0,31,0,0],
    '+': [0,4,4,31,4,4,0], '*': [0,21,14,31,14,21,0], '#': [10,31,10,10,31,10,0],
    '%': [25,26,2,4,8,11,19], '@': [14,17,23,21,23,16,14], '&': [12,18,20,8,21,18,13],
    '$': [4,15,20,14,5,30,4], '/': [1,2,2,4,8,8,16], '\\': [16,8,8,4,2,2,1],
    '|': [4,4,4,4,4,4,4], '_': [0,0,0,0,0,0,31], '~': [0,0,9,22,0,0,0],
    '"': [10,10,10,0,0,0,0], '!': [4,4,4,4,4,0,4], '?': [14,17,1,2,4,0,4],
    '<': [2,4,8,16,8,4,2], '>': [8,4,2,1,2,4,8], '[': [14,8,8,8,8,8,14],
    ']': [14,2,2,2,2,2,14], '(': [2,4,8,8,8,4,2], ')': [8,4,2,2,2,4,8],
    '{': [6,8,8,16,8,8,6], '}': [12,2,2,1,2,2,12], '^': [4,10,17,0,0,0,0],
    '0': [14,17,19,21,25,17,14], '1': [4,12,4,4,4,4,14],
    '2': [14,17,1,2,4,8,31], '3': [30,1,1,14,1,1,30], '4': [2,6,10,18,31,2,2],
    '5': [31,16,16,30,1,1,30], '6': [14,16,16,30,17,17,14],
    '7': [31,1,2,4,8,8,8], '8': [14,17,17,14,17,17,14], '9': [14,17,17,15,1,1,14],
    'A': [14,17,17,31,17,17,17], 'B': [30,17,17,30,17,17,30],
    'C': [14,17,16,16,16,17,14], 'D': [30,17,17,17,17,17,30],
    'E': [31,16,16,30,16,16,31], 'F': [31,16,16,30,16,16,16],
    'G': [14,17,16,23,17,17,15], 'H': [17,17,17,31,17,17,17],
    'I': [14,4,4,4,4,4,14], 'J': [7,2,2,2,18,18,12], 'K': [17,18,20,24,20,18,17],
    'L': [16,16,16,16,16,16,31], 'M': [17,27,21,21,17,17,17],
    'N': [17,25,21,19,17,17,17], 'O': [14,17,17,17,17,17,14],
    'P': [30,17,17,30,16,16,16], 'Q': [14,17,17,17,21,18,13],
    'R': [30,17,17,30,20,18,17], 'S': [15,16,16,14,1,1,30],
    'T': [31,4,4,4,4,4,4], 'U': [17,17,17,17,17,17,14],
    'V': [17,17,17,17,17,10,4], 'W': [17,17,17,21,21,21,10],
    'X': [17,17,10,4,10,17,17], 'Y': [17,17,10,4,4,4,4],
    'Z': [31,1,2,4,8,16,31]
  });

  const VERTEX = `#version 300 es
  precision highp float;
  void main() {
    vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

  // Prepended to every game scene shader.
  const SCENE_HEADER = `#version 300 es
  precision highp float;
  precision highp int;
  precision highp sampler2D;
  precision highp usampler2D;
  layout(location=0) out uvec4 out_record;
  layout(location=1) out uvec4 out_foreground;
  layout(location=2) out uvec4 out_background;
  uniform vec2 u_viewport;
  uniform vec2 u_cellSize;
  uniform float u_time;
  uniform float u_far;
  uniform usampler2D u_masks;
  float hash21(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  // Is bit (column 0-4, row 0-6 from the top) of a glyph set?
  bool glyphBit(uint glyph, int column, int row) {
    if (column<0||column>4||row<0||row>6) return false;
    uint mask=texelFetch(u_masks,ivec2(int(glyph),row),0).r;
    return (mask & (1u << uint(4-column)))!=0u;
  }
  // Cell size in screen units, used for distance-aware pattern detail.
  float cellAngle() { return 1.28*u_cellSize.y/u_viewport.y; }
  void writeCell(uint glyph, uint material, uint flags, float distance, vec3 foreground, vec3 background) {
    out_record=uvec4(glyph,material,flags,uint(clamp(log2(1.0+distance)/log2(1.0+u_far)*255.0,0.0,255.0)));
    out_foreground=uvec4(round(clamp(foreground,0.0,1.0)*255.0),255u);
    out_background=uvec4(round(clamp(background,0.0,1.0)*255.0),255u);
  }
  `;

  const DISPLAY = `#version 300 es
  precision highp float;
  precision highp int;
  precision highp usampler2D;
  out vec4 out_colour;
  uniform usampler2D u_records;
  uniform usampler2D u_foreground;
  uniform usampler2D u_background;
  uniform usampler2D u_masks;
  uniform vec2 u_viewport;
  uniform vec2 u_cellSize;
  uniform vec2 u_physical;
  uniform ivec2 u_grid;
  uniform bool u_ink;
  uniform float u_far;
  uniform vec4 u_tint;       // rgb + strength: damage flashes and fades
  uniform float u_dissolve;  // 0..1 letter-by-letter wipe to black
  uniform float u_time;
  float hash21(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float depthOf(uvec4 record){return exp2(float(record.a)/255.0*log2(1.0+u_far))-1.0;}
  bool inside(ivec2 cell){return all(greaterThanEqual(cell,ivec2(0)))&&all(lessThan(cell,u_grid));}
  // A neighbour farther than the surface through this cell and its opposite
  // neighbour predicts (planes are affine in inverse depth) marks a silhouette.
  bool behind(ivec2 cell,ivec2 opposite,float depth){
    if(!inside(cell))return false;
    uvec4 other=texelFetch(u_records,cell,0);
    float here=1.0/(depth+.5),there=1.0/(depthOf(other)+.5),predicted=here;
    if(inside(opposite)){uvec4 back=texelFetch(u_records,opposite,0);predicted=max(here*.5,2.0*here-1.0/(depthOf(back)+.5));}
    return there<predicted*.7;
  }
  void main() {
    vec2 logical=gl_FragCoord.xy/u_physical*u_viewport;
    ivec2 cell=clamp(ivec2(floor(logical/u_cellSize)),ivec2(0),u_grid-ivec2(1));
    vec2 within=fract(logical/u_cellSize);
    uvec4 record=texelFetch(u_records,cell,0);
    uint glyph=record.r;
    vec3 foreground=vec3(texelFetch(u_foreground,cell,0).rgb)/255.0;
    vec3 background=vec3(texelFetch(u_background,cell,0).rgb)/255.0;
    if(u_ink&&(record.b&1u)==0u){
      float depth=depthOf(record);
      bool left=behind(cell+ivec2(-1,0),cell+ivec2(1,0),depth),right=behind(cell+ivec2(1,0),cell+ivec2(-1,0),depth);
      bool up=behind(cell+ivec2(0,1),cell+ivec2(0,-1),depth),down=behind(cell+ivec2(0,-1),cell+ivec2(0,1),depth);
      int count=int(left)+int(right)+int(up)+int(down);uint stroke=0u;
      if(count==1||count==2){
        if(up&&left||down&&right)stroke=47u;
        else if(up&&right||down&&left)stroke=92u;
        else if(left||right)stroke=124u;
        else if(down)stroke=95u;
        else stroke=45u;
      }
      if(stroke!=0u){glyph=stroke;foreground=mix(background*.3,foreground,.3);}
    }
    // Letter-by-letter dissolve: each cell blanks at its own moment.
    if(u_dissolve>0.0&&hash21(vec2(cell)+3.7)<u_dissolve){glyph=32u;background*=1.0-u_dissolve;}
    vec2 ink=(within-vec2(.15,.18))/vec2(.70,.64);
    bool on=false;
    if(ink.x>=0.0&&ink.x<1.0&&ink.y>=0.0&&ink.y<1.0){
      ivec2 bit=ivec2(floor(ink*vec2(5.0,7.0)));
      uint mask=texelFetch(u_masks,ivec2(int(glyph),6-bit.y),0).r;
      on=(mask&(1u<<uint(4-bit.x)))!=0u;
    }
    float shade=(record.b&2u)!=0u?1.0:mix(.94,1.08,clamp(ink.y,0.0,1.0));
    vec3 colour=on?foreground*shade:background;
    colour=mix(colour,u_tint.rgb,u_tint.a);
    out_colour=vec4(colour,1.0);
  }`;

  function compile(gl,type,source){
    const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);
    if(!gl.getShaderParameter(value,gl.COMPILE_STATUS)){const reason=gl.getShaderInfoLog(value);gl.deleteShader(value);throw new Error('Glyph shader failed: '+reason);}
    return value;
  }
  function link(gl,fragment){
    const vertex=compile(gl,gl.VERTEX_SHADER,VERTEX),frag=compile(gl,gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();
    gl.attachShader(program,vertex);gl.attachShader(program,frag);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(frag);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const reason=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error('Glyph program failed: '+reason);}
    return program;
  }
  function texture(gl){
    const value=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,value);
    for(const [name,mode] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,name,mode);
    return value;
  }

  const DEFAULT_TINT = Object.freeze([0, 0, 0, 0]);

  class GlyphEngine {
    constructor(canvas,{sceneSource,uniforms=[],far=100}={}){
      if(!sceneSource)throw new Error('GlyphEngine needs a scene shader.');
      this.canvas=canvas;this.far=far;this.destroyed=false;this.lost=false;this.extraTextures=new Map();this._extraList=[];
      this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,powerPreference:'high-performance'});
      if(!this.gl)throw new Error('This game needs WebGL2. Enable hardware acceleration or use a current browser.');
      const gl=this.gl;
      this.sceneProgram=link(gl,SCENE_HEADER+sceneSource);this.displayProgram=link(gl,DISPLAY);
      const locate=(program,names)=>Object.fromEntries(names.map(name=>[name,gl.getUniformLocation(program,'u_'+name)]));
      this.sceneUniforms=locate(this.sceneProgram,['viewport','cellSize','time','far','masks',...uniforms]);
      this.displayUniforms=locate(this.displayProgram,['records','foreground','background','masks','viewport','cellSize','physical','grid','ink','far','tint','dissolve','time']);
      this.vao=gl.createVertexArray();
      this.maskTexture=texture(gl);const masks=new Uint8Array(128*7);
      for(const [character,rows] of Object.entries(GLYPHS))for(let y=0;y<7;y++)masks[y*128+character.charCodeAt(0)]=rows[y];
      gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8UI,128,7,0,gl.RED_INTEGER,gl.UNSIGNED_BYTE,masks);
      this.cellTextures=[texture(gl),texture(gl),texture(gl)];this.framebuffer=gl.createFramebuffer();
      this.cellSize=[8,12];this.columns=1;this.rows=1;this.width=1;this.height=1;
      this._lostHandler=event=>{event.preventDefault();this.lost=true;};
      this._restoredHandler=()=>{this.lost=false;};
      canvas.addEventListener('webglcontextlost',this._lostHandler);
      canvas.addEventListener('webglcontextrestored',this._restoredHandler);
    }
    // Upload an integer texture (e.g. a tile map) that the scene samples by name.
    setTexture(name,unitIndex,width,height,data){
      const gl=this.gl;let value=this.extraTextures.get(name);
      if(!value){value=texture(gl);value.name=name;this.extraTextures.set(name,value);this._extraList.push(value);}
      gl.bindTexture(gl.TEXTURE_2D,value);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8UI,width,height,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,data);
      value.unitIndex=unitIndex;
    }
    resize(width,height,cellSize=this.cellSize){
      this.width=Math.max(1,Math.round(width));this.height=Math.max(1,Math.round(height));
      this.cellSize[0]=cellSize[0];this.cellSize[1]=cellSize[1];
      this.columns=Math.max(1,Math.ceil(this.width/cellSize[0]));this.rows=Math.max(1,Math.ceil(this.height/cellSize[1]));
      this.dpr=Math.min(2,Math.max(1,global.devicePixelRatio||1));
      this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);
      const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);
      for(let i=0;i<3;i++){const value=this.cellTextures[i];gl.bindTexture(gl.TEXTURE_2D,value);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8UI,this.columns,this.rows,0,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,value,0);}
      gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Character-cell framebuffer is incomplete on this GPU.');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    // setUniforms(gl, locations) sets the game's own scene uniforms.
    render(setUniforms,{time=0,ink=true,tint=DEFAULT_TINT,dissolve=0}={}){
      if(this.destroyed||this.lost)return;
      const gl=this.gl;gl.bindVertexArray(this.vao);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,this.columns,this.rows);gl.useProgram(this.sceneProgram);
      const s=this.sceneUniforms;
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.maskTexture);gl.uniform1i(s.masks,0);
      for(let i=0;i<this._extraList.length;i++){const value=this._extraList[i];gl.activeTexture(gl.TEXTURE0+value.unitIndex);gl.bindTexture(gl.TEXTURE_2D,value);const loc=s[value.name];if(loc)gl.uniform1i(loc,value.unitIndex);}
      gl.uniform2f(s.viewport,this.width,this.height);gl.uniform2f(s.cellSize,this.cellSize[0],this.cellSize[1]);gl.uniform1f(s.time,time);gl.uniform1f(s.far,this.far);
      setUniforms(gl,s);
      gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.useProgram(this.displayProgram);
      const d=this.displayUniforms;
      for(let i=0;i<3;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,this.cellTextures[i]);}
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.maskTexture);
      gl.uniform1i(d.records,0);gl.uniform1i(d.foreground,1);gl.uniform1i(d.background,2);gl.uniform1i(d.masks,3);
      gl.uniform2f(d.viewport,this.width,this.height);gl.uniform2f(d.cellSize,this.cellSize[0],this.cellSize[1]);gl.uniform2f(d.physical,this.canvas.width,this.canvas.height);
      gl.uniform2i(d.grid,this.columns,this.rows);gl.uniform1i(d.ink,ink?1:0);gl.uniform1f(d.far,this.far);gl.uniform4fv(d.tint,tint);gl.uniform1f(d.dissolve,dissolve);gl.uniform1f(d.time,time);
      gl.drawArrays(gl.TRIANGLES,0,3);
    }
    // Diagnostics only: read back glyph and material ids for every cell.
    inspect(){
      const gl=this.gl,data=new Uint8Array(this.columns*this.rows*4);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.framebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0,0,this.columns,this.rows,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,data);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
      const glyphs=[],materials=[];for(let i=0;i<data.length;i+=4){glyphs.push(data[i]);materials.push(data[i+1]);}
      return{columns:this.columns,rows:this.rows,glyphs,materials};
    }
    destroy(){
      if(this.destroyed)return;this.destroyed=true;
      this.canvas.removeEventListener('webglcontextlost',this._lostHandler);
      this.canvas.removeEventListener('webglcontextrestored',this._restoredHandler);
      const gl=this.gl;if(this.lost)return;
      gl.deleteProgram(this.sceneProgram);gl.deleteProgram(this.displayProgram);gl.deleteVertexArray(this.vao);gl.deleteFramebuffer(this.framebuffer);
      for(const value of [this.maskTexture,...this.cellTextures,...this._extraList])gl.deleteTexture(value);
    }
  }
  GlyphEngine.GLYPHS=GLYPHS;
  global.GlyphEngine=GlyphEngine;
})(typeof window!=='undefined'?window:globalThis);
