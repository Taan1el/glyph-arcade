/* Glyph sprites: draws GlyphArt frames into a 2D scene, one shaded letter per art pixel.
 * The game's scene shader includes GlyphSprites.SHADER and calls spriteCell() per cell;
 * the game adds sprites each frame in screen cells, topmost first. Sprites may be mirrored,
 * flash white, glow, take a team tint, and carry a health bar on the row above them. */
(function (global) {
  'use strict';
  const ROWS = 5;

  const SHADER = `
  uniform usampler2D u_art;
  uniform usampler2D u_sprites;
  uniform int u_count;
  // Rows: 0 position, 1 atlas origin, 2 size and flags, 3 tint or letter, 4 health bar.
  // Flags: 1 flash, 2 self-lit, 4 mirrored, 8 single letter, 16 bar, 32 hidden-ish (stealth).
  bool spriteCell(ivec2 cell,vec3 light,inout uint glyph,inout vec3 fg,inout vec3 bg){
    for(int i=0;i<u_count;i++){
      uvec4 a=texelFetch(u_sprites,ivec2(i,0),0),c=texelFetch(u_sprites,ivec2(i,2),0);
      ivec2 pos=ivec2(int(a.r)+int(a.g)*256-2048,int(a.b)+int(a.a)*256-2048);
      ivec2 rel=cell-pos;
      int w=int(c.r),h=int(c.g),fl=int(c.b);
      if((fl&16)!=0&&rel.y==-1&&rel.x>=0&&rel.x<w){
        uvec4 bar=texelFetch(u_sprites,ivec2(i,4),0);
        bool on=float(rel.x)+.5<=float(bar.a)/255.0*float(w);
        glyph=on?61u:45u;fg=on?vec3(bar.rgb)/255.0:vec3(.32,.28,.28);bg=on?vec3(bar.rgb)/255.0*.35:bg*.35;
        return true;
      }
      if(rel.x<0||rel.y<0||rel.x>=w||rel.y>=h)continue;
      uvec4 t=texelFetch(u_sprites,ivec2(i,3),0);
      if((fl&8)!=0){glyph=t.r;fg=vec3(t.gba)/255.0;return true;}
      uvec4 b=texelFetch(u_sprites,ivec2(i,1),0);
      int ax=int(b.r)+int(b.g)*256,ay=int(b.b)+int(b.a)*256;
      int px=(fl&4)!=0?w-1-rel.x:rel.x;
      uvec4 texel=texelFetch(u_art,ivec2(ax+px,ay-rel.y),0);
      if(texel.a==0u)continue;
      vec3 colour=vec3(texel.rgb)/255.0;
      // Team pixels store only brightness; the sprite's tint supplies the hue.
      if(texel.a==150u)colour=vec3(t.rgb)/255.0*(float(texel.r)/255.0)*1.35;
      bool selfLit=texel.a==200u||(fl&2)!=0;
      vec3 k=selfLit?vec3(1.0):max(light*1.15,vec3(.24));
      glyph=atlasGlyph(texel,px,rel.y);
      fg=(fl&1)!=0?vec3(1.0):colour*k*1.2;
      bg=(fl&1)!=0?vec3(.8):colour*k*.6;
      if((fl&32)!=0){fg=mix(bg,vec3(.55,.7,1.0),.5);bg=bg*.6;}
      return true;
    }
    return false;
  }`;

  class GlyphSprites {
    constructor(engine, atlas, { max = 128, artUnit = 6, spriteUnit = 7 } = {}) {
      this.engine = engine;
      this.atlas = atlas;
      this.max = max;
      this.unit = spriteUnit;
      this.data = new Uint8Array(max * ROWS * 4);
      this.count = 0;
      const packed = atlas.pack();
      engine.setTexture('art', artUnit, packed.width, packed.height, packed.data);
      this.sizes = new Map(atlas.frames.map(({ name, canvas }) => [name, { w: canvas.width, h: canvas.height }]));
    }
    // Width and height of an art frame, in cells.
    size(name) {
      const size = this.sizes.get(name);
      if (!size) throw new Error('Unknown art frame ' + name);
      return size;
    }
    clear() { this.count = 0; }
    put(row, a, b, c, d) {
      const at = (row * this.max + this.count) * 4, data = this.data;
      data[at] = a; data[at + 1] = b; data[at + 2] = c; data[at + 3] = d;
    }
    // {x, y (screen cells, top-left), art, flip, flash, lit, shade, tint: [r,g,b], bar: {fill, colour}}
    // or {x, y, char, colour}. Returns false once full.
    add(s) {
      if (this.count >= this.max) return false;
      const x = s.x + 2048, y = s.y + 2048, SLOT = global.GlyphArt.SLOT;
      this.put(0, x & 255, x >> 8, y & 255, y >> 8);
      if (s.art) {
        const index = this.atlas.index(s.art), { w, h } = this.size(s.art);
        const ax = (index % 16) * SLOT + Math.floor((SLOT - w) / 2), ay = Math.floor(index / 16) * SLOT + h - 1;
        const flags = (s.flash ? 1 : 0) | (s.lit ? 2 : 0) | (s.flip ? 4 : 0) | (s.bar ? 16 : 0) | (s.shade ? 32 : 0);
        this.put(1, ax & 255, ax >> 8, ay & 255, ay >> 8);
        this.put(2, w, h, flags, 0);
        const tint = s.tint || [255, 255, 255];
        this.put(3, tint[0], tint[1], tint[2], 0);
        if (s.bar) this.put(4, s.bar.colour[0], s.bar.colour[1], s.bar.colour[2], Math.round(Math.max(0, Math.min(1, s.bar.fill)) * 255));
      } else {
        this.put(2, 1, 1, 8, 0);
        this.put(3, s.char.charCodeAt(0), s.colour[0], s.colour[1], s.colour[2]);
      }
      this.count++;
      return true;
    }
    upload() {
      this.engine.setTexture('sprites', this.unit, this.max, ROWS, this.data);
      return this.count;
    }
  }

  GlyphSprites.SHADER = SHADER;
  global.GlyphSprites = GlyphSprites;
})(typeof window !== 'undefined' ? window : globalThis);
