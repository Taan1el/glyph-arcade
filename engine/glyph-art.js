/* Glyph art: tiny procedural raster sprites, packed into one RGBA atlas.
 * Each texel becomes one shaded letter on screen, so a 16x24 creature reads
 * like hand-made ASCII art. Shapes are drawn in code, then outlined and shaded. */
(function (global) {
  'use strict';
  const SLOT = 48; // every frame occupies a 48x48 atlas slot, art bottom-centred

  const hex = value => [parseInt(value.slice(1,3),16)/255, parseInt(value.slice(3,5),16)/255, parseInt(value.slice(5,7),16)/255];

  class Canvas {
    constructor(width,height){this.width=width;this.height=height;this.pixels=new Array(width*height).fill(null);}
    set(x,y,colour){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<this.width&&y<this.height)this.pixels[y*this.width+x]=colour;}
    get(x,y){return x>=0&&y>=0&&x<this.width&&y<this.height?this.pixels[y*this.width+x]:null;}
    rect(x,y,w,h,colour){for(let j=0;j<h;j++)for(let i=0;i<w;i++)this.set(x+i,y+j,colour);return this;}
    ellipse(cx,cy,rx,ry,colour){for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){const dx=(x-cx)/rx,dy=(y-cy)/ry;if(dx*dx+dy*dy<=1.0)this.set(x,y,colour);}return this;}
    line(x0,y0,x1,y1,colour,width=1){const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))*2+1;for(let i=0;i<=steps;i++){const t=i/steps,x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;for(let w=0;w<width;w++)this.set(x+w*(Math.abs(y1-y0)>Math.abs(x1-x0)?1:0),y+w*(Math.abs(y1-y0)>Math.abs(x1-x0)?0:1),colour);}return this;}
    // Shade: lighten top-left facing edges, darken bottom-right, then a dark outline.
    finish({outline=[.06,.05,.05],shade=true}={}){
      if(shade){const copy=this.pixels.slice();for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){const c=copy[y*this.width+x];if(!c||c.glow)continue;
        const lit=(y===0||!copy[(y-1)*this.width+x])||(x===0||!copy[y*this.width+x-1]),dark=(y===this.height-1||!copy[(y+1)*this.width+x])||(x===this.width-1||!copy[y*this.width+x+1]);
        if(lit&&!dark)this.pixels[y*this.width+x]=Object.assign(c.map(v=>Math.min(1,v*1.28+.05)),{glow:c.glow});else if(dark&&!lit)this.pixels[y*this.width+x]=Object.assign(c.map(v=>v*.62),{glow:c.glow});}}
      if(outline){const copy=this.pixels.slice();for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){if(copy[y*this.width+x])continue;
        const near=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const c=x+dx>=0&&x+dx<this.width&&y+dy>=0&&y+dy<this.height?copy[(y+dy)*this.width+x+dx]:null;return c&&!c.glow;});
        if(near)this.pixels[y*this.width+x]=outline;}}
      return this;
    }
    mirrorRows(from,to){for(let y=from;y<to;y++){const row=this.pixels.slice(y*this.width,(y+1)*this.width).reverse();for(let x=0;x<this.width;x++)this.pixels[y*this.width+x]=row[x];}return this;}
  }
  const glow=colour=>Object.assign(colour.slice(),{glow:true});

  // Packs frames into an RGBA atlas: rgb colour, alpha 255 solid / 200 self-lit / 0 empty.
  class Atlas {
    constructor(){this.frames=[];this.names=new Map();}
    add(name,canvas){
      if(canvas.width>SLOT||canvas.height>SLOT)throw new Error(`Art ${name} exceeds the ${SLOT}px slot.`);
      const index=this.frames.length;this.frames.push({name,canvas});this.names.set(name,index);return index;
    }
    index(name){const value=this.names.get(name);if(value===undefined)throw new Error('Unknown art frame '+name);return value;}
    // Frame metadata for the scene: art height as a fraction of the slot, to size billboards.
    info(name){const {canvas}=this.frames[this.index(name)];return{width:canvas.width/SLOT,height:canvas.height/SLOT};}
    pack(){
      const columns=16,rows=Math.ceil(this.frames.length/columns),data=new Uint8Array(columns*SLOT*rows*SLOT*4),width=columns*SLOT;
      this.frames.forEach(({canvas},index)=>{
        const ox=(index%columns)*SLOT+Math.floor((SLOT-canvas.width)/2),oy=Math.floor(index/columns)*SLOT+(SLOT-canvas.height);
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const c=canvas.get(x,y);if(!c)continue;
          // Texture rows run bottom-up in the shader; flip so art reads upright.
          const tx=ox+x,ty=Math.floor(index/columns)*SLOT+(SLOT-1-(oy-Math.floor(index/columns)*SLOT+y)),i=(ty*width+tx)*4;
          data[i]=Math.round(c[0]*255);data[i+1]=Math.round(c[1]*255);data[i+2]=Math.round(c[2]*255);data[i+3]=c.glow?200:255;}
      });
      return{width,height:rows*SLOT,data,columns};
    }
  }

  // Picks the shading letter for one atlas texel. Scene shaders include this source.
  const SHADER=`
  uint atlasGlyph(uvec4 texel,int px,int py){
    if(texel.a==200u)return ((px+py)&1)==0?42u:64u; // '*' or '@' for self-lit glow
    float lum=(float(texel.r)*.299+float(texel.g)*.587+float(texel.b)*.114)/255.0;
    if(lum<.12)return 58u; // ':' dark outline
    if(lum<.28)return 61u; // '=' shadow
    if(lum<.45)return 43u; // '+' mid-dark
    if(lum<.62)return 37u; // '%' mid
    if(lum<.78)return 35u; // '#' bright
    return 77u;            // 'M' highlight
  }`;

  global.GlyphArt={SLOT,SHADER,Canvas,Atlas,hex,glow};
})(typeof window!=='undefined'?window:globalThis);
