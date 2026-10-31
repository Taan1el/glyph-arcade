/* INKFIRE art: original creatures, items and weapons drawn procedurally. */
(function (global) {
  'use strict';
  const {Canvas,Atlas,hex,glow}=global.GlyphArt;
  const C={
    olive:hex('#5a6b34'),oliveDark:hex('#3b4722'),khaki:hex('#8a8a52'),visor:glow(hex('#5ff0ff')),gun:hex('#6c7078'),gunDark:hex('#3c4048'),
    skin:hex('#b77a55'),flesh:hex('#c8584a'),fleshDark:hex('#7a2a24'),horn:hex('#e8d8b0'),eyeYellow:glow(hex('#ffe23a')),fire:glow(hex('#ff9a1e')),fireCore:glow(hex('#fff27a')),
    brute:hex('#d0647a'),bruteDark:hex('#8a3446'),teeth:hex('#f4efe0'),mouth:hex('#3a0a12'),eyeRed:glow(hex('#ff3b2a')),
    bone:hex('#e6dcc0'),boneDark:hex('#a89c80'),socket:hex('#1a1414'),eyeGreen:glow(hex('#7dff5a')),flame:glow(hex('#a65cff')),flameLight:glow(hex('#e2b8ff')),
    steel:hex('#5c6e84'),steelLight:hex('#8aa0b8'),steelDark:hex('#36414f'),core:glow(hex('#ff7a1a')),
    white:hex('#f2f2f2'),red:hex('#d8261e'),green:hex('#3fae3a'),greenDark:hex('#246b22'),yellow:hex('#e8c63a'),brass:hex('#c89a3a'),shell:hex('#b8321e'),blue:hex('#2e6ad8'),wood:hex('#7a4a26'),barrel:hex('#4a7a3a'),slime:glow(hex('#8cff3a'))
  };

  // --- Enemies: frame is 'walk0' | 'walk1' | 'attack' | 'corpse'
  function trooper(frame){
    if(frame==='corpse'){const c=new Canvas(18,6);c.ellipse(9,4,8,2,C.fleshDark).rect(3,2,9,2,C.olive).ellipse(14,3,2.5,1.6,C.oliveDark).rect(5,4,5,1,C.gun);return c.finish();}
    const c=new Canvas(16,26),stride=frame==='walk1';
    c.rect(stride?4:5,18,3,stride?7:8,C.oliveDark).rect(stride?10:9,18,3,8,C.oliveDark);
    c.rect(4,10,9,9,C.olive).rect(4,17,9,1,C.oliveDark).rect(6,11,5,4,C.khaki);
    c.rect(2,11,2,6,C.olive).rect(13,11,2,6,C.olive);
    c.ellipse(8,6,3.6,3.8,C.oliveDark).rect(5,6,7,2,C.visor);
    if(frame==='attack'){c.rect(6,12,5,4,C.gunDark).ellipse(8.5,13.5,2.4,2.2,C.fireCore).ellipse(8.5,13.5,1.2,1.1,C.white);}
    else c.line(2,16,14,11,C.gun,2);
    return c.finish();
  }
  function spitter(frame){
    if(frame==='corpse'){const c=new Canvas(18,6);c.ellipse(9,4,8,2,C.fleshDark).ellipse(6,3,3,1.6,C.flesh).line(12,2,15,1,C.horn);return c.finish();}
    const c=new Canvas(18,24),stride=frame==='walk1';
    c.rect(stride?5:6,18,2,6,C.fleshDark).rect(stride?11:10,18,2,6,C.fleshDark).rect(stride?4:5,23,3,1,C.fleshDark).rect(stride?11:10,23,3,1,C.fleshDark);
    c.ellipse(9,14,6,6.5,C.flesh).ellipse(9,15,3.5,4,C.skin);
    c.ellipse(9,6,4.2,3.6,C.flesh).line(5,4,3,0,C.horn).line(13,4,15,0,C.horn);
    c.set(7,6,C.eyeYellow);c.set(11,6,C.eyeYellow);c.rect(7,8,5,1,C.mouth);
    if(frame==='attack'){c.line(4,11,3,3,C.fleshDark,2).line(14,11,15,3,C.fleshDark,2).ellipse(9,1.5,3,1.5,C.fire).ellipse(9,1.5,1.5,1,C.fireCore);}
    else{c.line(3,10,1,17,C.fleshDark,2).line(15,10,17,17,C.fleshDark,2).set(1,18,C.fire);c.set(17,18,C.fire);}
    return c.finish();
  }
  function brute(frame){
    if(frame==='corpse'){const c=new Canvas(24,7);c.ellipse(12,5,11,2.2,C.bruteDark).ellipse(9,4,6,2,C.brute).rect(14,3,4,1,C.teeth);return c.finish();}
    const c=new Canvas(24,26),stride=frame==='walk1',open=frame==='attack';
    c.rect(stride?5:6,20,4,6,C.bruteDark).rect(stride?15:14,20,4,6,C.bruteDark);
    c.ellipse(12,13,10,9,C.brute).ellipse(12,16,6,4,C.bruteDark);
    c.ellipse(2,13,2,4,C.brute).ellipse(22,13,2,4,C.brute);
    c.set(8,7,C.eyeRed);c.set(9,7,C.eyeRed);c.set(15,7,C.eyeRed);c.set(16,7,C.eyeRed);
    const top=open?10:12,bottom=open?19:16;c.rect(6,top,13,bottom-top,C.mouth);
    for(let x=6;x<19;x+=2){c.set(x,top,C.teeth);c.set(x+1,top+1,C.teeth);c.set(x,bottom-1,C.teeth);if(open)c.set(x+1,bottom-2,C.teeth);}
    return c.finish();
  }
  function wisp(frame){
    if(frame==='corpse'){const c=new Canvas(14,6);c.ellipse(7,3,6,2.4,C.boneDark).rect(3,2,8,1,C.bone).set(5,3,C.socket);return c.finish();}
    const c=new Canvas(20,22),flick=frame==='walk1',open=frame==='attack';
    for(let i=0;i<6;i++)c.ellipse(4+i*2.4,17+((i+(flick?1:0))%2)*1.5,1.6,3.4,C.flame);
    c.ellipse(10,17,5,2,C.flameLight);
    c.ellipse(10,8,7,6.5,C.bone).rect(6,13,8,open?4:2,C.boneDark);
    c.ellipse(7,8,1.8,2,C.socket).ellipse(13,8,1.8,2,C.socket);c.set(7,8,C.eyeGreen);c.set(13,8,C.eyeGreen);
    for(let x=7;x<14;x+=2)c.set(x,13,C.bone);
    if(open)c.ellipse(10,15,2.4,1.4,C.eyeGreen);
    return c.finish();
  }
  function titan(frame){
    if(frame==='corpse'){const c=new Canvas(34,9);c.ellipse(17,6,16,3,C.steelDark).ellipse(13,5,9,2.5,C.steel).ellipse(24,5,3,2,C.core);return c.finish();}
    const c=new Canvas(32,40),stride=frame==='walk1';
    c.rect(stride?7:8,28,6,12,C.steelDark).rect(stride?20:19,28,6,12,C.steelDark).rect(stride?6:7,38,8,2,C.steel).rect(stride?19:18,38,8,2,C.steel);
    c.rect(6,12,20,17,C.steel).rect(9,15,14,9,C.steelDark).ellipse(16,19,3.5,3.5,C.core);
    c.ellipse(5,13,4,3,C.steelLight).ellipse(27,13,4,3,C.steelLight);
    c.rect(1,15,4,10,C.steel).rect(27,14,5,6,C.gun).rect(26,20,6,8,C.gunDark);
    c.ellipse(16,7,5.5,5,C.steel).rect(12,7,9,2,C.eyeRed);
    if(frame==='attack')c.ellipse(29,28,3,2.4,C.fireCore).ellipse(29,28,1.5,1.2,C.white);
    return c.finish();
  }

  // --- Projectiles and effects (self-lit)
  const orb=(outer,inner,size=6)=>{const c=new Canvas(size,size);c.ellipse(size/2-.5,size/2-.5,size/2-.3,size/2-.3,outer).ellipse(size/2-.5,size/2-.5,size/4,size/4,inner);return c.finish({outline:null,shade:false});};
  function rocket(){const c=new Canvas(6,6);c.ellipse(2.5,2.5,2.3,2.3,glow(C.steelLight)).ellipse(2.5,2.5,1.2,1.2,C.fireCore);return c.finish({outline:null,shade:false});}
  function burst(scale){const s=Math.round(8*scale),c=new Canvas(s*2,s*2);for(let i=0;i<10;i++){const a=i/10*Math.PI*2;c.line(s,s,s+Math.cos(a)*s*.95,s+Math.sin(a)*s*.95,i%2?C.fire:C.fireCore);}c.ellipse(s,s,s*.45,s*.45,C.fireCore).ellipse(s,s,s*.22,s*.22,glow(C.white));return c.finish({outline:null,shade:false});}

  // --- Items
  function medkit(){const c=new Canvas(12,9);c.rect(0,1,12,8,C.white).rect(5,2,2,6,C.red).rect(3,4,6,2,C.red).rect(4,0,4,1,C.gunDark);return c.finish();}
  function stim(){const c=new Canvas(5,8);c.rect(1,0,3,1,C.gun).rect(0,1,5,7,glow(hex('#5fb0ff'))).rect(1,3,3,2,C.white);return c.finish();}
  function armour(){const c=new Canvas(12,11);c.rect(1,0,3,3,C.green).rect(8,0,3,3,C.green).rect(0,2,12,9,C.green).rect(5,3,2,8,C.greenDark).rect(2,5,3,2,C.greenDark).rect(7,5,3,2,C.greenDark);return c.finish();}
  function clip(){const c=new Canvas(7,6);for(let i=0;i<3;i++)c.rect(i*2+1,1,1,5,C.brass).set(i*2+1,0,C.yellow);c.rect(0,4,7,2,C.gunDark);return c.finish();}
  function box(colour,label){const c=new Canvas(12,8);c.rect(0,1,12,7,C.wood).rect(0,0,12,1,hex('#a06a3a')).rect(3,3,6,3,colour);if(label)c.rect(4,4,4,1,label);return c.finish();}
  function shells(){const c=new Canvas(7,5);c.rect(0,0,3,5,C.shell).rect(4,0,3,5,C.shell).rect(0,4,3,1,C.brass).rect(4,4,3,1,C.brass);return c.finish();}
  function rockets(){const c=new Canvas(5,11);c.rect(1,2,3,8,C.steelLight).ellipse(2,1.5,1.5,1.6,C.red).rect(0,9,5,2,C.gunDark);return c.finish();}
  function key(colour){const c=new Canvas(9,6);c.ellipse(2,3,2,2.4,colour).rect(4,2,5,2,colour).rect(6,4,1,2,colour).rect(8,4,1,2,colour).set(2,3,C.socket);return c.finish();}
  function barrel(burning){const c=new Canvas(10,14);c.rect(0,1,10,13,C.barrel).rect(0,3,10,1,C.greenDark).rect(0,10,10,1,C.greenDark).ellipse(4.5,1,4.5,1,burning?C.fire:C.slime);c.rect(3,5,4,3,hex('#d8d040'));return c.finish();}
  function lamp(colour){const c=new Canvas(6,24);c.rect(2,3,2,20,C.gunDark).rect(1,22,4,2,C.gun).ellipse(2.5,2,2.5,2.2,glow(colour));return c.finish();}
  function pickupGun(kind){const c=new Canvas(16,6);if(kind==='shotgun'){c.rect(0,1,12,2,C.gunDark).rect(9,2,7,3,C.wood);}else if(kind==='chaingun'){c.rect(0,0,11,1,C.gun).rect(0,2,11,1,C.gun).rect(0,4,11,1,C.gun).rect(10,0,6,6,C.gunDark);}else{c.rect(0,1,14,4,C.green).rect(12,0,4,6,C.gunDark).rect(0,2,2,2,C.socket);}return c.finish();}

  // --- First-person weapons (view models), drawn from the player's side.
  function viewPistol(){const c=new Canvas(14,18);c.rect(5,0,4,9,C.gunDark).rect(4,2,6,6,C.gun).rect(5,8,5,4,C.skin).rect(3,11,8,7,C.skin).rect(2,13,2,4,C.skin);return c.finish();}
  function viewShotgun(){const c=new Canvas(22,20);c.rect(8,0,3,12,C.gunDark).rect(11,0,3,12,C.gunDark).rect(7,10,8,6,C.wood).rect(4,14,6,6,C.skin).rect(13,13,6,7,C.skin);return c.finish();}
  function viewChaingun(spin){const c=new Canvas(24,20);for(let i=0;i<4;i++)c.rect(7+i*2+(spin&&i%2?1:0),0,1,11,i%2?C.gun:C.gunDark);c.rect(5,9,12,6,C.gunDark).rect(6,10,10,4,C.gun).rect(3,15,6,5,C.skin).rect(14,15,6,5,C.skin);return c.finish();}
  function viewLauncher(){const c=new Canvas(24,20);c.rect(7,0,9,14,C.green).rect(9,0,5,2,C.socket).rect(7,6,9,1,C.greenDark).rect(5,12,13,4,C.gunDark).rect(3,15,6,5,C.skin).rect(15,15,6,5,C.skin);return c.finish();}

  function build(){
    const atlas=new Atlas();
    for(const [name,draw] of Object.entries({trooper,spitter,brute,wisp,titan}))for(const frame of ['walk0','walk1','attack','corpse'])atlas.add(`${name}.${frame}`,draw(frame));
    atlas.add('fireball',orb(C.fire,C.fireCore));atlas.add('plasma',orb(C.eyeGreen,glow(C.white)));atlas.add('rocket',rocket());
    atlas.add('burst.small',burst(.6));atlas.add('burst.large',burst(1.4));
    atlas.add('medkit',medkit());atlas.add('stim',stim());atlas.add('armour',armour());atlas.add('clip',clip());atlas.add('bulletbox',box(C.brass));
    atlas.add('shells',shells());atlas.add('shellbox',box(C.shell));atlas.add('rockets',rockets());atlas.add('rocketbox',box(C.steelLight,C.red));
    atlas.add('key.red',key(C.red));atlas.add('key.blue',key(C.blue));atlas.add('barrel',barrel(false));atlas.add('barrel.hot',barrel(true));
    atlas.add('lamp.warm',lamp(hex('#ffc070')));atlas.add('lamp.cold',lamp(hex('#80d0ff')));atlas.add('lamp.red',lamp(hex('#ff5040')));
    atlas.add('gun.shotgun',pickupGun('shotgun'));atlas.add('gun.chaingun',pickupGun('chaingun'));atlas.add('gun.launcher',pickupGun('launcher'));
    atlas.add('view.pistol',viewPistol());atlas.add('view.shotgun',viewShotgun());atlas.add('view.chaingun',viewChaingun(false));atlas.add('view.chaingun.spin',viewChaingun(true));atlas.add('view.launcher',viewLauncher());
    atlas.add('view.flash',burst(.9));
    return atlas;
  }
  global.InkArt={build,COLOURS:C};
})(typeof window!=='undefined'?window:globalThis);
