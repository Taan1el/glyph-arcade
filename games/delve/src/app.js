/* Delve app: input, animation, interface, sound and saves around the pure rules. */
(function (global) {
  'use strict';
  const D=global.Delve,EYE=1.05,MOVE_MS=150,TURN_MS=130;
  const LOOK={
    rat:{size:.75,y:.375,colour:[.62,.48,.36]},bat:{size:.6,y:1.35,colour:[.62,.55,.72],float:true},
    goblin:{size:1.1,y:.55,colour:[.42,.68,.32]},jelly:{size:.95,y:.48,colour:[.55,.9,.4]},
    skeleton:{size:1.5,y:.75,colour:[.9,.88,.8]},archer:{size:1.4,y:.7,colour:[.92,.84,.6]},
    wraith:{size:1.6,y:1.0,colour:[.62,.86,.95],float:true},ogre:{size:2.0,y:1.0,colour:[.78,.52,.3]},
    lich:{size:2.1,y:1.05,colour:[.78,.6,1.0],float:true}
  };
  const ITEM_COLOURS={gold:[1,.82,.3],potion:[1,.32,.3],scroll:[.92,.86,.66],weapon:[.82,.86,.92],armour:[.6,.72,.95]};
  const HOLD=new Set(['forward','back','left','right','wait']);
  const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
  const lerp=(a,b,t)=>a+(b-a)*t;
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};

  class Sound {
    constructor(){this.muted=false;this.context=null;}
    ensure(){if(this.muted)return null;const Audio=global.AudioContext||global.webkitAudioContext;if(!Audio)return null;if(!this.context){try{this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=.35;this.master.connect(this.context.destination);}catch{return null;}}if(this.context.state==='suspended')this.context.resume().catch(()=>{});return this.context;}
    tone(frequency,duration,{type='square',volume=.12,slide=0,delay=0}={}){
      const c=this.ensure();if(!c)return;const now=c.currentTime+delay,osc=c.createOscillator(),gain=c.createGain();
      osc.type=type;osc.frequency.setValueAtTime(frequency,now);if(slide)osc.frequency.exponentialRampToValueAtTime(Math.max(30,frequency+slide),now+duration);
      gain.gain.setValueAtTime(volume,now);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(gain);gain.connect(this.master);osc.start(now);osc.stop(now+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
    noise(duration,{volume=.15,filter=900,delay=0}={}){
      const c=this.ensure();if(!c)return;const now=c.currentTime+delay,buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
      const source=c.createBufferSource(),biquad=c.createBiquadFilter(),gain=c.createGain();biquad.type='lowpass';biquad.frequency.value=filter;gain.gain.value=volume;
      source.buffer=buffer;source.connect(biquad);biquad.connect(gain);gain.connect(this.master);source.start(now);source.onended=()=>{source.disconnect();biquad.disconnect();gain.disconnect();};
    }
    play(name){
      switch(name){
        case'step':this.noise(.06,{volume:.06,filter:500});break;
        case'bump':this.noise(.08,{volume:.12,filter:250});break;
        case'swing':this.noise(.09,{volume:.1,filter:2400});break;
        case'hit':this.tone(180,.12,{slide:-90,volume:.14});break;
        case'crit':this.tone(320,.18,{slide:-200,volume:.16});this.noise(.1,{volume:.12,filter:3000});break;
        case'hurt':this.tone(110,.22,{type:'sawtooth',slide:-50,volume:.14});break;
        case'die':this.tone(260,.35,{type:'triangle',slide:-220,volume:.14});break;
        case'coin':this.tone(988,.07,{volume:.08});this.tone(1319,.12,{volume:.08,delay:.06});break;
        case'item':this.tone(523,.09,{type:'triangle',volume:.1});this.tone(784,.14,{type:'triangle',volume:.1,delay:.07});break;
        case'drink':this.tone(400,.25,{type:'sine',slide:300,volume:.12});break;
        case'door':this.noise(.4,{volume:.12,filter:180});this.tone(70,.4,{type:'sawtooth',volume:.05});break;
        case'level':[523,659,784,1047].forEach((f,i)=>this.tone(f,.16,{type:'triangle',volume:.1,delay:i*.08}));break;
        case'stairs':[392,330,262,196].forEach((f,i)=>this.tone(f,.18,{type:'triangle',volume:.1,delay:i*.1}));break;
        case'shoot':this.tone(900,.2,{type:'sine',slide:-600,volume:.08});break;
        case'victory':[523,659,784,1047,1319].forEach((f,i)=>this.tone(f,.3,{type:'triangle',volume:.12,delay:i*.12}));break;
        case'death':[220,196,165,131].forEach((f,i)=>this.tone(f,.4,{type:'sawtooth',volume:.08,delay:i*.18}));break;
      }
    }
  }

  class DelveApp {
    constructor(){
      this.canvas=document.getElementById('view');this.view=new DelveView(this.canvas);this.sound=new Sound();
      this.el=Object.fromEntries(['title','help','end','hud','log','minimap','touch','end-title','end-detail','end-score','continue','depth','hp','hp-bar','level','attack','defence','gold','potions','scrolls','toast','mute'].map(id=>[id,document.getElementById(id)]));
      this.state=null;this.mode='title';this.queue=[];this.anim=[];this.visuals=new Map();this.particles=[];this.doors=new Map();
      this.pad=new global.GlyphPad();this.quality=new global.GlyphQuality(()=>this.resize());this.padNext=0;this.touchAction=null;this.touchNext=0;this.camera={x:0,y:EYE,z:0,yaw:0,pitch:-.04};this._renderCamera={x:0,y:EYE,z:0,yaw:0,pitch:-.04};
      this.tint=[0,0,0,0];this.dissolve=0;this.shake=0;this.time=0;this.last=performance.now();
      this.reducedMotion=Boolean(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      this._sprites=[];this._torchSprites=[];
      this.demo=D.newRun('title-'+today());this.syncVisuals(this.demo,true);this.placeCamera(this.demo);
      this.bind();this.resize();this.refreshTitle();
      if(global.matchMedia?.('(pointer: coarse)').matches)this.enableTouch();
      this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
    }
    bind(){
      global.addEventListener('resize',()=>this.resize());
      const keys={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',KeyD:'right',KeyQ:'turnLeft',ArrowLeft:'turnLeft',KeyE:'turnRight',ArrowRight:'turnRight',Space:'wait',Digit1:'potion',Digit2:'scroll',Enter:'descend',Period:'descend'};
      global.addEventListener('keydown',event=>{
        if(event.code==='Escape'){event.preventDefault();if(this.mode==='play')this.show('help');else if(this.mode==='help'&&this.state&&!this.state.dead&&!this.state.won)this.show('play');return;}
        if(this.mode!=='play'){if((this.mode==='title'||this.mode==='end')&&(event.code==='Enter'||event.code==='Space')){event.preventDefault();this.newRun();}return;}
        if(event.code==='KeyM'){this.el.minimap.classList.toggle('large');return;}
        const action=keys[event.code];if(!action)return;event.preventDefault();this.request(action);
      });
      const difficulty=document.getElementById('difficulty');
      try{const stored=localStorage.getItem('delve-difficulty');if(D.DIFFICULTIES[stored])difficulty.value=stored;}catch{}
      difficulty.addEventListener('change',()=>{try{localStorage.setItem('delve-difficulty',difficulty.value);}catch{}});
      document.getElementById('new-run').addEventListener('click',()=>this.newRun());
      document.getElementById('daily-run').addEventListener('click',()=>this.newRun('daily-'+today()));
      this.el.continue.addEventListener('click',()=>this.resume());
      document.getElementById('how-to').addEventListener('click',()=>this.show('help'));
      document.getElementById('help-back').addEventListener('click',()=>this.show(this.state&&!this.state.dead&&!this.state.won?'play':'title'));
      document.getElementById('end-again').addEventListener('click',()=>this.newRun());
      document.getElementById('end-same').addEventListener('click',()=>this.newRun(this.state.seed,this.state.difficulty));
      document.getElementById('end-menu').addEventListener('click',()=>this.show('title'));
      const showMute=()=>{this.el.mute.textContent=this.sound.muted?'Sound off':'Sound on';this.el.mute.setAttribute('aria-pressed',this.sound.muted?'true':'false');};
      this.el.mute.addEventListener('click',()=>{this.sound.muted=!this.sound.muted;showMute();try{localStorage.setItem('delve-muted',this.sound.muted?'1':'0');}catch{}});
      try{this.sound.muted=localStorage.getItem('delve-muted')==='1';}catch{}showMute();
      this.el.touch.addEventListener('pointerdown',event=>{const button=event.target.closest('button[data-action]');if(!button)return;event.preventDefault();const action=button.dataset.action;if(action==='menu'){this.show('help');return;}this.request(action);if(HOLD.has(action)){this.touchAction={id:event.pointerId,action};this.touchNext=this.time+280;}});
      const release=event=>{if(this.touchAction?.id===event.pointerId)this.touchAction=null;};
      global.addEventListener('pointerup',release);global.addEventListener('pointercancel',release);
      global.addEventListener('touchstart',()=>this.enableTouch(),{passive:true,once:true});
    }
    enableTouch(){document.body.classList.add('touch');this.el.touch.hidden=false;}
    resize(){const coarse=global.innerWidth<700;this.view.engine.maxDpr=this.quality.setting.maxDpr;this.view.resize(global.innerWidth,global.innerHeight,this.quality.cell(coarse?[7,10]:[8,12]));}
    show(mode){
      this.mode=mode;this.touchAction=null;for(const name of ['title','help','end'])this.el[name].hidden=mode!==name;
      this.el.hud.hidden=mode!=='play'&&mode!=='help';document.body.dataset.mode=mode;
      if(mode==='title'){this.refreshTitle();this.anim=[];this.dissolve=0;this.tint=[0,0,0,0];this.visuals.clear();this.particles=[];this.doors.clear();this.syncVisuals(this.demo,true);this.placeCamera(this.demo);}
      (this.el[mode]?.querySelector('button'))?.focus();
    }
    refreshTitle(){
      let saved=null;try{saved=localStorage.getItem('delve-run');}catch{}
      this.el.continue.hidden=!saved;
      let best=[];try{best=JSON.parse(localStorage.getItem('delve-best')||'[]');}catch{}
      document.getElementById('best').textContent=best.length?'Best runs · '+best.slice(0,3).map(b=>`${b.score} (${b.won?'won':'floor '+b.depth})`).join(' · '):'No runs yet. The lich waits on floor 5.';
      document.getElementById('daily-run').textContent='Daily delve · '+today();
    }
    newRun(seed,difficulty){
      seed=seed||Math.random().toString(36).slice(2,8);difficulty=difficulty||document.getElementById('difficulty').value;
      this.start(D.newRun(seed,difficulty));
      const controls=document.body.classList.contains('touch')?'Left thumb steps · right thumb turns · walk into monsters to attack.':'W/S move · A/D sidestep · Q/E turn · walk into monsters to attack.';
      this.toast(`Seed ${seed} · ${D.DIFFICULTIES[this.state.difficulty].label}. ${controls}`);
    }
    resume(){try{this.start(D.restore(JSON.parse(localStorage.getItem('delve-run'))));this.toast('Run resumed.');}catch(error){this.toast(error.message);try{localStorage.removeItem('delve-run');}catch{}this.refreshTitle();}}
    start(state){
      this.state=state;this.queue=[];this.anim=[];this.particles=[];this.doors.clear();this.visuals.clear();this.tint=[0,0,0,0];this.dissolve=0;this.shake=0;this.el.log.replaceChildren();
      this.syncVisuals(state,true);this.placeCamera(state);this.updateHud();this.show('play');this.sound.ensure();this.save();
    }
    placeCamera(state){const p=state.player;Object.assign(this.camera,{x:p.x+.5,z:p.y+.5,y:EYE,pitch:-.04,yaw:p.facing*Math.PI/2});}
    save(){
      try{if(!this.state||this.state.dead||this.state.won)localStorage.removeItem('delve-run');else localStorage.setItem('delve-run',JSON.stringify(this.state));}catch{}
    }
    record(){
      try{const best=JSON.parse(localStorage.getItem('delve-best')||'[]');best.push({score:D.score(this.state),depth:this.state.depth,won:this.state.won,seed:this.state.seed});best.sort((a,b)=>b.score-a.score);localStorage.setItem('delve-best',JSON.stringify(best.slice(0,5)));}catch{}
    }
    busy(){return this.anim.some(a=>a.blocking);}
    request(action){if(this.mode!=='play')return;if(this.queue.length<1)this.queue.push(action);}

    // --- Turning rule events into animation.
    run(action){
      const before=this.state.player,from={x:this.camera.x,z:this.camera.z,yaw:this.camera.yaw},startDepth=this.state.depth;
      const events=D.act(this.state,action),p=this.state.player,now=this.time;
      for(const e of events){
        switch(e.type){
          case'turn':{const target=from.yaw+(action==='turnLeft'?-1:1)*Math.PI/2;this.tween(this.camera,'yaw',from.yaw,target,TURN_MS,true);break;}
          case'step':this.tween(this.camera,'x',from.x,e.to[0]+.5,MOVE_MS,true);this.tween(this.camera,'z',from.z,e.to[1]+.5,MOVE_MS,true);this.bob(MOVE_MS);this.sound.play('step');break;
          case'bump':{const [dx,dy]=D.DIRS[(before.facing+({forward:0,right:1,back:2,left:3}[action]||0))%4];this.nudge(dx,dy,.12,120);this.sound.play('bump');break;}
          case'door':{const i=D.index(e.x,e.y);this.doors.set(i,0);this.anim.push({start:now,duration:380,update:t=>this.doors.set(i,ease(t)),done:()=>{this.doors.delete(i);if(this.state)this.view.setMap(D.SIZE,this.state.tiles,this.doors);}});this.sound.play('door');break;}
          case'attack':
            if(e.actor==='player'){const [dx,dy]=D.DIRS[before.facing];this.nudge(dx,dy,.28,170);const v=this.visuals.get(e.target);if(v){v.flash=1;this.number(v.x,v.y+v.size*.6,v.z,e.damage,e.crit?[1,.85,.3]:[1,1,1]);}this.sound.play(e.crit?'crit':'hit');}
            else{const v=this.visuals.get(e.actor);if(v)this.lunge(v,this.camera.x,this.camera.z);this.sound.play('swing');}
            break;
          case'shoot':{const v=this.visuals.get(e.actor);const boss=this.state.monsters.find(m=>m.id===e.actor)?.kind==='lich';if(v)this.projectile(v.x,v.z,this.camera.x,this.camera.z,boss);this.sound.play('shoot');break;}
          case'hurt':this.flash([.75,.05,.04],.42,320);this.shake=1;this.sound.play('hurt');break;
          case'heal':this.flash([.2,.9,.4],.25,350);this.sound.play('drink');break;
          case'map':this.flash([.9,.85,.5],.25,400);this.sound.play('item');break;
          case'move':{const v=this.visuals.get(e.id);if(v){this.tween(v,'x',v.x,e.to[0]+.5,MOVE_MS);this.tween(v,'z',v.z,e.to[1]+.5,MOVE_MS);}break;}
          case'die':{const v=this.visuals.get(e.id);if(v){v.dying=true;this.anim.push({start:now+80,duration:520,update:t=>{v.dissolve=t;v.y=v.baseY+t*.3;},done:()=>this.visuals.delete(e.id)});}this.sound.play('die');break;}
          case'summon':{const m=this.state.monsters.find(x=>x.id===e.id);if(m){const v=this.visualFor(m);v.y=v.baseY-v.size;this.tween(v,'y',v.y,v.baseY,500);v.dissolve=.8;this.tween(v,'dissolve',.8,0,500);}break;}
          case'pickup':{const v=this.visuals.get(e.id);if(v){v.dying=true;this.anim.push({start:now,duration:300,update:t=>{v.y=v.baseY+t*.8;v.dissolve=t;},done:()=>this.visuals.delete(e.id)});}this.sound.play(e.kind==='gold'?'coin':'item');break;}
          case'level':this.flash([1,.85,.35],.3,500);this.sound.play('level');break;
          case'descend':break;
          case'victory':this.sound.play('victory');break;
          case'death':this.sound.play('death');break;
          case'message':this.log(e.text);break;
        }
      }
      if(this.state.depth!==startDepth){
        // Letter-by-letter dissolve out, swap the floor, dissolve back in.
        this.sound.play('stairs');this.anim.push({start:now,duration:420,blocking:true,update:t=>{this.dissolve=t;},done:()=>{this.doors.clear();this.visuals.clear();this.particles=[];this.syncVisuals(this.state,true);this.placeCamera(this.state);this.anim.push({start:this.time,duration:420,update:t=>{this.dissolve=1-t;},done:()=>{this.dissolve=0;}});}});
      }else this.syncVisuals(this.state,false);
      this.updateHud();this.save();
      if(this.state.dead||this.state.won){this.record();this.anim.push({start:now,duration:this.state.won?900:1100,blocking:true,update:t=>{if(this.state.dead){this.camera.pitch=-.04-t*.5;this.camera.y=EYE-t*.6;}this.dissolve=this.state.dead?t*.6:0;},done:()=>this.showEnd()});}
    }
    tween(target,key,from,to,duration,blocking=false){target[key]=from;this.anim=this.anim.filter(a=>!(a.target===target&&a.key===key));this.anim.push({target,key,start:this.time,duration,blocking,update:t=>{target[key]=lerp(from,to,ease(t));}});}
    nudge(dx,dy,amount,duration){const x=this.camera.x,z=this.camera.z;this.anim.push({start:this.time,duration,blocking:true,update:t=>{const k=Math.sin(t*Math.PI)*amount;this.camera.x=x+dx*k;this.camera.z=z+dy*k;},done:()=>{this.camera.x=x;this.camera.z=z;}});}
    bob(duration){this.anim.push({start:this.time,duration,update:t=>{this.camera.y=EYE+Math.sin(t*Math.PI)*.045;}});}
    lunge(v,tx,tz){const x=v.x,z=v.z,dx=tx-x,dz=tz-z,len=Math.hypot(dx,dz)||1;this.anim.push({start:this.time,duration:220,update:t=>{const k=Math.sin(t*Math.PI)*.32;v.x=x+dx/len*k;v.z=z+dz/len*k;},done:()=>{v.x=x;v.z=z;}});}
    flash(colour,strength,duration){if(this.reducedMotion)strength*=.35;this.anim.push({start:this.time,duration,update:t=>{this.tint[0]=colour[0];this.tint[1]=colour[1];this.tint[2]=colour[2];this.tint[3]=strength*(1-t);},done:()=>{this.tint[0]=0;this.tint[1]=0;this.tint[2]=0;this.tint[3]=0;}});}
    number(x,y,z,value,colour){
      String(value).split('').forEach((digit,i,all)=>{const p={x:x+(i-(all.length-1)/2)*.16,y,z,glyph:digit,colour,size:.22,material:21,born:this.time};this.particles.push(p);});
    }
    projectile(x,z,tx,tz,boss){const p={x,y:1.1,z,glyph:boss?'*':'-',colour:boss?[.6,.85,1]:[.9,.85,.7],size:boss?.5:.4,material:22,born:this.time,life:220};this.particles.push(p);this.anim.push({start:this.time,duration:220,update:t=>{p.x=lerp(x,tx,t);p.z=lerp(z,tz,t);},done:()=>{p.life=0;}});}

    visualFor(m){
      let v=this.visuals.get(m.id);if(v)return v;const look=LOOK[m.kind];
      v={id:m.id,kind:'monster',x:m.x+.5,z:m.y+.5,y:look.y,baseY:look.y,size:look.size,glyph:D.MONSTERS[m.kind].glyph,colour:look.colour,material:10,flash:0,dissolve:0,float:look.float,phase:m.id*1.7};
      this.visuals.set(m.id,v);return v;
    }
    syncVisuals(state,reset){
      for(const m of state.monsters){const v=this.visualFor(m);if(reset){v.x=m.x+.5;v.z=m.y+.5;}}
      for(const item of state.items)if(!this.visuals.has(item.id))this.visuals.set(item.id,{id:item.id,kind:'item',x:item.x+.5,z:item.y+.5,y:.32,baseY:.32,size:.46,glyph:D.ITEM_GLYPHS[item.kind],colour:ITEM_COLOURS[item.kind],material:12,flash:0,dissolve:0,phase:item.id*.9});
      if(reset){
        const map=this.state===state||state===this.demo?state:this.state;
        this.view.setMap(D.SIZE,map.tiles,this.doors);
        this.torches=state.torches.map((t,i)=>{const [dx,dy]=D.DIRS[(t.dir+2)%4];return{x:t.x+.5+dx*.62,y:1.55,z:t.y+.5+dy*.62,phase:i*1.37};});
        this._torchSprites=this.torches.map(t=>({x:t.x,y:t.y,z:t.z,size:.32,glyph:'*',colour:[1,.7,.3],material:20,flash:0,dissolve:0,phase:t.phase,baseY:t.y}));
      }
    }

    // --- Interface
    log(text){const line=document.createElement('div');line.textContent=text;this.el.log.append(line);while(this.el.log.children.length>4)this.el.log.firstChild.remove();}
    toast(text){this.el.toast.textContent=text;this.el.toast.classList.add('visible');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.el.toast.classList.remove('visible'),4200);}
    updateHud(){
      const s=this.state,p=s.player;
      this.el.depth.textContent=`Floor ${s.depth}/${D.FINAL_DEPTH}`;this.el.hp.textContent=`${p.hp}/${p.maxHp}`;this.el['hp-bar'].style.width=`${p.hp/p.maxHp*100}%`;
      this.el['hp-bar'].classList.toggle('low',p.hp<p.maxHp*.3);
      this.el.level.textContent=`Lv ${p.level} · ${p.xp}/${p.level*10} xp`;this.el.attack.textContent=`ATK ${D.attackOf(p)} · ${D.WEAPONS[p.weapon].name}`;this.el.defence.textContent=`DEF ${D.defenceOf(p)} · ${D.ARMOURS[p.armour].name}`;
      this.el.gold.textContent=`${s.gold} gold`;this.el.potions.textContent=`1 Potion ×${p.potions}`;this.el.scrolls.textContent=`2 Scroll ×${p.scrolls}`;
      this.drawMinimap();
    }
    drawMinimap(){
      const s=this.state,p=s.player,rows=[];
      for(let y=0;y<D.SIZE;y++){let row='';for(let x=0;x<D.SIZE;x++){
        const i=D.index(x,y),tile=s.tiles[i];
        if(x===p.x&&y===p.y){row+='^>v<'[p.facing];continue;}
        const seenNow=Math.hypot(x-p.x,y-p.y)<=6.5&&D.lineOfSight(s,p.x,p.y,x,y);
        const monster=seenNow&&s.monsters.find(m=>m.x===x&&m.y===y);if(monster){row+=D.MONSTERS[monster.kind].glyph;continue;}
        if(!s.explored[i]){const near=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>s.explored[D.index(Math.min(D.SIZE-1,Math.max(0,x+dx)),Math.min(D.SIZE-1,Math.max(0,y+dy)))]&&s.tiles[D.index(Math.min(D.SIZE-1,Math.max(0,x+dx)),Math.min(D.SIZE-1,Math.max(0,y+dy)))]!==D.WALL);row+=near&&tile===D.WALL?'#':' ';continue;}
        const item=s.items.find(it=>it.x===x&&it.y===y);if(item){row+=D.ITEM_GLYPHS[item.kind];continue;}
        row+=tile===D.WALL?'#':tile===D.DOOR?'+':tile===D.OPEN?"'":tile===D.STAIRS?'>':'.';
      }rows.push(row);}
      this.el.minimap.textContent=rows.join('\n');
    }
    showEnd(){
      const s=this.state;this.mode='end';
      this.el['end-title'].textContent=s.won?'The deep is quiet':'Here lies an adventurer';
      this.el['end-detail'].textContent=s.won?`You destroyed the lich on floor ${s.depth} at level ${s.player.level}.`:`Slain by a ${s.cause} on floor ${s.depth}, at level ${s.player.level}.`;
      this.el['end-score'].textContent=`Score ${D.score(s)} · ${s.kills} kills · ${s.gold} gold · ${s.turn} turns · seed ${s.seed}`;
      this.show('end');
    }

    pollPad(){
      const pad=this.pad;pad.poll();if(!pad.connected)return;
      if(this.mode!=='play'){if(pad.pressed(0))document.activeElement?.click?.();if(pad.pressed(9)&&this.mode==='help'&&this.state&&!this.state.dead&&!this.state.won)this.show('play');return;}
      if(pad.pressed(9)){this.show('help');return;}
      const x=pad.axis(0),y=pad.axis(1);
      const step=pad.held(12)||y<-.6?'forward':pad.held(13)||y>.6?'back':pad.held(14)||x<-.6?'left':pad.held(15)||x>.6?'right':null;
      if(step&&this.time>=this.padNext){this.request(step);this.padNext=this.time+170;}
      if(pad.pressed(4))this.request('turnLeft');if(pad.pressed(5))this.request('turnRight');
      if(pad.pressed(0))this.request('wait');if(pad.pressed(1))this.request('descend');if(pad.pressed(2))this.request('potion');if(pad.pressed(3))this.request('scroll');
    }

    // --- Frame loop
    frame(now){
      const dt=Math.min(.05,(now-this.last)/1000);this.quality.sample(now-this.last);this.last=now;this.time+=dt*1000;this.pollPad();
      if(this.touchAction&&this.time>=this.touchNext){this.request(this.touchAction.action);this.touchNext=this.time+170;}
      for(let i=this.anim.length-1;i>=0;i--){const a=this.anim[i],t=Math.min(1,Math.max(0,(this.time-a.start)/a.duration));if(this.time>=a.start)a.update(t);if(t>=1){this.anim.splice(i,1);a.done?.();}}
      if(this.mode==='play'&&!this.busy()&&this.queue.length&&!this.state.dead&&!this.state.won)this.run(this.queue.shift());
      if(this.doors.size&&this.state)this.view.setMap(D.SIZE,this.state.tiles,this.doors);
      const playing=this.state&&(this.mode==='play'||this.mode==='help'||this.mode==='end'),world=playing?this.state:this.demo;
      if(!playing){if(!this.reducedMotion)this.camera.yaw+=dt*.12;this.camera.pitch=-.04;}
      const sprites=this._sprites;sprites.length=0;
      for(const v of this.visuals.values()){
        v.flash=Math.max(0,(v.flash||0)-dt*5);
        if(!v.dying&&v.kind==='monster'&&!this.anim.some(a=>a.target===v&&a.key==='y'))v.y=v.baseY+(v.float?Math.sin(this.time/400+v.phase)*.12:Math.abs(Math.sin(this.time/260+v.phase))*.03);
        if(v.kind==='item'&&!v.dying)v.y=v.baseY+Math.sin(this.time/330+v.phase)*.06;
        sprites.push(v);
      }
      for(let i=0;i<this._torchSprites.length;i++){
        const ts=this._torchSprites[i];
        ts.y=ts.baseY+Math.sin(this.time/90+ts.phase)*.02;
        ts.size=.32+Math.sin(this.time/70+ts.phase)*.03;
        sprites.push(ts);
      }
      for(let i=this.particles.length-1;i>=0;i--){
        const p=this.particles[i],age=this.time-p.born;
        if(p.material===21){p.y+=dt*.6;p.dissolve=Math.max(0,(age-500)/400);if(age>=900){this.particles.splice(i,1);continue;}}
        else if(p.life!==undefined&&p.life<=0){this.particles.splice(i,1);continue;}
        sprites.push(p);
      }
      this.shake=Math.max(0,this.shake-dt*5);
      const rc=this._renderCamera;
      rc.x=this.camera.x;rc.y=this.camera.y;rc.z=this.camera.z;
      rc.yaw=this.camera.yaw+(this.reducedMotion?0:(Math.random()-.5)*this.shake*.06);
      rc.pitch=this.camera.pitch;
      if(!playing&&world===this.demo&&this.view.size!==D.SIZE)this.view.setMap(D.SIZE,this.demo.tiles,null);
      try{this.view.draw({camera:rc,sprites,torches:this.torches||[],depth:world.depth,time:this.time/1000,ink:true,tint:this.tint,dissolve:this.dissolve});}catch(error){this.fatal(error);return;}
      requestAnimationFrame(this.frame);
    }
    fatal(error){console.error(error);const box=document.getElementById('fatal');box.hidden=false;box.querySelector('p').textContent=error.message;}
  }

  global.addEventListener('DOMContentLoaded',()=>{try{global.delve=new DelveApp();}catch(error){const box=document.getElementById('fatal');box.hidden=false;box.querySelector('p').textContent=error.message;console.error(error);}});
})(window);
