/* Delve art: original creatures and items drawn in code. Frames are 'idle0' | 'idle1' | 'attack'. */
(function (global) {
  'use strict';
  const {Canvas,Atlas,hex,glow}=global.GlyphArt;
  const C={
    fur:hex('#8a6a4e'),furDark:hex('#5e4632'),pink:hex('#d89a94'),redEye:glow(hex('#ff4a32')),
    batWing:hex('#6a5a86'),batDark:hex('#43385c'),
    goblin:hex('#6da448'),goblinDark:hex('#44702e'),leather:hex('#7a5632'),leatherDark:hex('#54391f'),yellowEye:glow(hex('#ffe23a')),tooth:hex('#f4efe0'),wood:hex('#6e4526'),
    jelly:hex('#7fd64e'),jellyDark:hex('#4c9a30'),jellyCore:glow(hex('#d4ff8a')),ink:hex('#14180f'),white:hex('#f6f6f0'),
    bone:hex('#e4dcc4'),boneDark:hex('#a89e84'),socket:hex('#16120f'),steel:hex('#a4b0bc'),steelDark:hex('#6c7682'),
    cloth:hex('#7a6a4a'),clothDark:hex('#4e432e'),bowWood:hex('#9a6a34'),string:hex('#d8d0b8'),
    shroud:hex('#3e5a70'),shroudDark:hex('#26394a'),shroudLight:hex('#6c94ae'),cyanEye:glow(hex('#7deaff')),
    ogre:hex('#b98a58'),ogreDark:hex('#84603a'),hide:hex('#5a4a34'),
    robe:hex('#54348a'),robeDark:hex('#35205c'),robeTrim:hex('#c8a040'),crown:glow(hex('#ffd24a')),violet:glow(hex('#c79aff')),violetCore:glow(hex('#f4e4ff')),
    gold:hex('#e8b830'),goldLight:hex('#ffe27a'),glass:hex('#bcd0dc'),potion:glow(hex('#ff4a42')),cork:hex('#a07848'),
    paper:hex('#e6d9b0'),paperDark:hex('#b4a478'),seal:hex('#c0302a'),chest:hex('#6a84b4'),chestDark:hex('#42587e')
  };

  function rat(frame){
    const c=new Canvas(22,12),step=frame==='idle1';
    c.line(6,8,0,4,C.pink);
    c.rect(step?8:7,9,2,3,C.furDark).rect(step?13:14,9,2,3,C.furDark);
    c.ellipse(10,7,6,3.8,C.fur).ellipse(10,8,4,2,C.furDark);
    c.ellipse(16,7,3.6,2.8,C.fur).ellipse(14,3.6,1.8,1.8,C.pink);
    c.set(17,6,C.redEye);c.set(20,8,C.pink);
    if(frame==='attack'){c.rect(18,9,3,1,C.tooth);c.rect(18,10,2,1,C.tooth);}
    return c.finish();
  }
  function bat(frame){
    const c=new Canvas(26,14),up=frame!=='idle1';
    const wing=(from,to,dir)=>{
      for(let i=0;i<4;i++)c.line(from,7+i,to,up?1+i:9+i,i===3?C.batDark:C.batWing);
      c.line(from+dir*4,up?10:9,to,up?4:12,C.batDark);
    };
    wing(11,1,-1);wing(15,25,1);
    c.ellipse(13,7,3,4,C.batDark).line(11,3,10,0,C.batDark).line(15,3,16,0,C.batDark);
    c.set(12,6,C.redEye);c.set(14,6,C.redEye);
    if(frame==='attack')c.rect(12,9,3,2,C.tooth);
    return c.finish();
  }
  function goblin(frame){
    const c=new Canvas(24,27),step=frame==='idle1',swing=frame==='attack';
    c.rect(step?7:8,20,3,7,C.goblinDark).rect(step?14:13,20,3,7,C.goblinDark);
    c.rect(7,13,10,8,C.leather).rect(7,19,10,2,C.leatherDark).rect(11,13,2,6,C.leatherDark);
    c.line(7,14,4,19,C.goblin,2);
    if(swing)c.line(17,14,21,9,C.goblin,2).line(21,10,22,1,C.wood,3);
    else c.line(17,14,19,19,C.goblin,2).line(19,20,22,13,C.wood,3);
    c.ellipse(12,8,6,5.2,C.goblin).line(6,7,1,4,C.goblinDark,2).line(18,7,23,4,C.goblinDark,2);
    c.set(9,7,C.yellowEye);c.set(10,7,C.yellowEye);c.set(14,7,C.yellowEye);c.set(15,7,C.yellowEye);
    c.rect(9,10,7,1,C.ink);c.set(10,10,C.tooth);c.set(14,10,C.tooth);
    return c.finish();
  }
  function jelly(frame){
    const c=new Canvas(22,17),squish=frame==='idle1',open=frame==='attack';
    c.ellipse(11,squish?10:9,squish?10:9,squish?6:7,C.jelly).rect(squish?1:2,12,squish?20:18,4,C.jelly).rect(squish?1:2,15,squish?20:18,1,C.jellyDark);
    c.ellipse(15,11,2,2,C.jellyCore).ellipse(6,13,1.4,1.4,C.jellyCore);
    c.rect(7,squish?7:6,3,3,C.white).rect(13,squish?7:6,3,3,C.white);
    c.set(8,squish?8:7,C.ink);c.set(14,squish?8:7,C.ink);
    if(open)c.rect(8,11,6,3,C.ink);else c.rect(9,11,4,1,C.ink);
    return c.finish();
  }
  // Shared bones for the skeleton and the archer.
  function bones(c,step){
    c.line(step?7:8,23,step?6:7,35,C.bone,2).line(step?15:14,23,step?16:15,35,C.bone,2);
    c.rect(step?5:6,34,4,1,C.boneDark).rect(step?14:13,34,4,1,C.boneDark);
    c.rect(7,21,8,3,C.boneDark).rect(10,11,2,11,C.boneDark);
    for(let y=12;y<20;y+=2)c.rect(7,y,8,1,C.bone);
    c.ellipse(11,6,5,5,C.bone).rect(8,9,6,3,C.bone);
    c.rect(8,5,2,3,C.socket).rect(12,5,2,3,C.socket);
    c.set(8,6,C.redEye);c.set(13,6,C.redEye);
    for(let x=8;x<14;x+=2)c.set(x,11,C.socket);
  }
  function skeleton(frame){
    const c=new Canvas(26,36),swing=frame==='attack';
    bones(c,frame==='idle1');
    c.line(7,12,3,20,C.bone,2);
    if(swing)c.line(15,12,20,7,C.bone,2).line(20,7,24,0,C.steel,2).line(18,9,22,11,C.steelDark,1);
    else c.line(15,12,19,20,C.bone,2).line(19,20,23,11,C.steel,2).line(18,18,22,21,C.steelDark,1);
    return c.finish();
  }
  function archer(frame){
    const c=new Canvas(28,36),draw=frame==='attack',step=frame==='idle1';
    bones(c,step);
    c.rect(6,11,10,3,C.cloth).rect(6,13,3,9,C.clothDark).rect(13,13,3,9,C.clothDark);
    c.ellipse(11,4,6,4.4,C.cloth).rect(5,4,2,6,C.clothDark).rect(15,4,2,6,C.clothDark);
    c.line(15,13,22,16,C.bone,2);
    c.line(7,13,draw?13:4,draw?16:19,C.bone,2);
    for(let i=0;i<18;i++){const y=7+i,x=22+Math.round(Math.sin(i/17*Math.PI)*4);c.set(x,y,C.bowWood);}
    c.line(22,7,draw?14:22,16,C.string).line(draw?14:22,16,22,24,C.string);
    if(draw)c.line(14,16,26,16,C.steelDark);
    return c.finish();
  }
  function wraith(frame){
    const c=new Canvas(26,36),flick=frame==='idle1',reach=frame==='attack';
    for(let i=0;i<7;i++)c.ellipse(3+i*3.3,29+((i+(flick?1:0))%2)*2.4,2,4.4,i%2?C.shroudDark:C.shroud);
    c.ellipse(13,20,9,12,C.shroud).ellipse(13,23,6,8,C.shroudDark);
    if(reach){c.line(5,14,0,8,C.shroud,3).line(21,14,25,8,C.shroud,3);c.set(0,6,C.bone);c.set(1,6,C.bone);c.set(25,6,C.bone);c.set(24,6,C.bone);}
    else{c.line(5,16,3,24,C.shroudLight,2).line(21,16,23,24,C.shroudLight,2);}
    c.ellipse(13,8,7,7.4,C.shroud).ellipse(13,9,4.8,5,C.socket);
    c.rect(10,8,2,2,C.cyanEye).rect(15,8,2,2,C.cyanEye);
    return c.finish();
  }
  function ogre(frame){
    const c=new Canvas(36,42),step=frame==='idle1',swing=frame==='attack';
    c.rect(step?9:10,32,6,10,C.ogreDark).rect(step?23:22,32,6,10,C.ogreDark);
    c.ellipse(18,23,13,12,C.ogre).ellipse(18,27,9,6,C.ogreDark);
    c.rect(8,30,22,5,C.hide).rect(14,33,3,4,C.hide).rect(22,33,3,3,C.hide);
    c.line(6,17,3,30,C.ogre,4);
    if(swing)c.line(30,16,33,8,C.ogre,4).line(33,9,30,0,C.wood,4);
    else c.line(30,17,33,29,C.ogre,4).line(33,30,30,19,C.wood,4);
    c.ellipse(18,9,6.4,6,C.ogre).rect(13,12,11,3,C.ogreDark);
    c.set(15,8,C.redEye);c.set(21,8,C.redEye);
    c.rect(14,11,1,3,C.tooth).rect(22,11,1,3,C.tooth);
    return c.finish();
  }
  function lich(frame){
    const c=new Canvas(36,44),raise=frame==='attack',flick=frame==='idle1';
    const orbY=raise?4:flick?11:10;
    c.rect(28,orbY+3,2,44-orbY-3,C.wood);
    c.ellipse(29,orbY,4,4,C.violet).ellipse(29,orbY,2,2,C.violetCore);
    for(let i=0;i<6;i++)c.ellipse(6+i*3.2,38+((i+(flick?1:0))%2)*1.6,2,4,i%2?C.robeDark:C.robe);
    c.ellipse(14,27,10,14,C.robe).rect(12,16,4,24,C.robeDark).rect(8,16,12,2,C.robeTrim);
    c.line(5,20,2,30,C.robe,3).rect(1,30,3,2,C.bone);
    c.line(23,20,27,raise?12:18,C.robe,3).rect(26,raise?10:16,3,2,C.bone);
    c.ellipse(14,11,5.6,5.6,C.bone).rect(11,15,6,2,C.boneDark);
    c.rect(10,10,3,3,C.socket).rect(15,10,3,3,C.socket);
    c.set(11,11,C.violet);c.set(16,11,C.violet);
    for(let x=11;x<18;x+=2)c.set(x,16,C.socket);
    c.rect(9,5,11,2,C.crown);for(let x=9;x<20;x+=5)c.rect(x,2,1,3,C.crown);
    return c.finish();
  }

  function gold(){const c=new Canvas(14,9);c.ellipse(7,6,6.4,3,C.gold).ellipse(5,4,3,2,C.gold).ellipse(9,4,3,2,C.goldLight).ellipse(7,2.5,2.2,1.6,C.goldLight);return c.finish();}
  function potion(){const c=new Canvas(9,13);c.rect(3,0,3,2,C.cork).rect(3,2,3,2,C.glass).ellipse(4,8,4,4.4,C.glass).ellipse(4,8.6,3,3.2,C.potion);return c.finish();}
  function scroll(){const c=new Canvas(14,10);c.rect(2,1,10,8,C.paper).rect(0,0,2,10,C.paperDark).rect(12,0,2,10,C.paperDark);c.rect(4,3,6,1,C.paperDark).rect(4,5,5,1,C.paperDark);c.ellipse(9,7,1.4,1.4,C.seal);return c.finish();}
  function weapon(){const c=new Canvas(8,18);c.rect(3,0,2,12,C.steel).rect(3,0,1,12,C.white).rect(0,12,8,2,C.gold).rect(3,14,2,3,C.wood).rect(3,17,2,1,C.gold);return c.finish();}
  function armour(){const c=new Canvas(14,13);c.rect(1,0,4,3,C.chest).rect(9,0,4,3,C.chest).rect(0,2,14,5,C.chest).rect(2,7,10,6,C.chest).rect(6,2,2,11,C.chestDark).rect(3,5,3,1,C.chestDark).rect(8,5,3,1,C.chestDark);return c.finish();}

  function build(){
    const atlas=new Atlas();
    const monsters={rat,bat,goblin,jelly,skeleton,archer,wraith,ogre,lich};
    for(const [name,draw] of Object.entries(monsters))for(const frame of ['idle0','idle1','attack'])atlas.add(`${name}.${frame}`,draw(frame));
    for(const [name,draw] of Object.entries({gold,potion,scroll,weapon,armour}))atlas.add(`item.${name}`,draw());
    return atlas;
  }
  global.DelveArt={build};
})(typeof window!=='undefined'?window:globalThis);
