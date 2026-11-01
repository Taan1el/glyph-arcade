/* Delve rules: seeded floors, turn order, combat and items. Pure data in, events out.
 * No DOM or rendering, so tests and bots can play complete runs headlessly. */
(function (global) {
  'use strict';

  const SIZE = 44, FINAL_DEPTH = 5;
  const WALL = 0, FLOOR = 1, DOOR = 2, OPEN = 3, STAIRS = 4;
  const DIRS = [[0,-1],[1,0],[0,1],[-1,0]]; // north, east, south, west

  const MONSTERS = {
    rat:      {glyph:'R',name:'rat',hp:4,atk:2,def:0,xp:2,depths:[1,2],weight:4},
    bat:      {glyph:'B',name:'bat',hp:3,atk:2,def:0,xp:2,depths:[1,3],weight:3,erratic:true},
    goblin:   {glyph:'G',name:'goblin',hp:8,atk:3,def:1,xp:4,depths:[1,4],weight:3},
    jelly:    {glyph:'J',name:'jelly',hp:13,atk:3,def:0,xp:5,depths:[2,4],weight:2,slow:true},
    skeleton: {glyph:'S',name:'skeleton',hp:12,atk:4,def:2,xp:7,depths:[2,5],weight:3},
    archer:   {glyph:'A',name:'skeleton archer',hp:8,atk:3,def:1,xp:7,depths:[3,5],weight:2,range:5},
    wraith:   {glyph:'W',name:'wraith',hp:14,atk:5,def:1,xp:9,depths:[4,5],weight:2,fast:true},
    ogre:     {glyph:'O',name:'ogre',hp:26,atk:7,def:2,xp:15,depths:[4,5],weight:1},
    lich:     {glyph:'L',name:'lich',hp:50,atk:8,def:2,xp:60,depths:[5,5],weight:0,range:6,boss:true}
  };
  const DIFFICULTIES = {
    easy:   {name:'easy',label:'Easy',startHp:26,startPotions:2,hpMul:0.82,atkMod:-1},
    normal: {name:'normal',label:'Normal',startHp:20,startPotions:1,hpMul:1.0,atkMod:0},
    hard:   {name:'hard',label:'Hard',startHp:18,startPotions:1,hpMul:1.15,atkMod:1}
  };
  const WEAPONS = [{name:'dagger',atk:0},{name:'short sword',atk:2},{name:'war axe',atk:3},{name:'longsword',atk:5},{name:'rune blade',atk:7}];
  const ARMOURS = [{name:'tunic',def:0},{name:'leather coat',def:1},{name:'chain mail',def:2},{name:'scale armour',def:3},{name:'plate armour',def:4}];
  const ITEM_GLYPHS = {gold:'$',potion:'!',scroll:'?',weapon:')',armour:'['};

  // --- Deterministic randomness: the whole generator state lives in the save.
  function hashString(text) {let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}
  function random(state) {
    state.rng=(state.rng+0x6D2B79F5)>>>0;let t=state.rng;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  }
  const int=(state,min,max)=>min+Math.floor(random(state)*(max-min+1));
  const pick=(state,list)=>list[Math.floor(random(state)*list.length)];

  const index=(x,y)=>y*SIZE+x;
  const inBounds=(x,y)=>x>=0&&y>=0&&x<SIZE&&y<SIZE;
  function tileAt(state,x,y){return inBounds(x,y)?state.tiles[index(x,y)]:WALL;}
  const passable=tile=>tile===FLOOR||tile===OPEN||tile===STAIRS;
  const seeThrough=tile=>tile!==WALL&&tile!==DOOR;

  // --- Floor generation
  function generateFloor(state) {
    const floorRng={rng:hashString(state.seed+'|floor|'+state.depth)};
    const tiles=new Array(SIZE*SIZE).fill(WALL),rooms=[];
    for(let attempt=0;attempt<220&&rooms.length<11;attempt++){
      const w=int(floorRng,4,9),h=int(floorRng,4,8),x=int(floorRng,1,SIZE-w-2),y=int(floorRng,1,SIZE-h-2);
      if(rooms.some(r=>x<=r.x+r.w+1&&x+w+1>=r.x&&y<=r.y+r.h+1&&y+h+1>=r.y))continue;
      rooms.push({x,y,w,h,cx:x+Math.floor(w/2),cy:y+Math.floor(h/2)});
    }
    for(const r of rooms)for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)tiles[index(x,y)]=FLOOR;
    // Chain rooms by nearest neighbour, then add two loops so the floor is not a tree.
    const order=[rooms[0]],left=rooms.slice(1);
    while(left.length){const last=order.at(-1);left.sort((a,b)=>Math.hypot(a.cx-last.cx,a.cy-last.cy)-Math.hypot(b.cx-last.cx,b.cy-last.cy));order.push(left.shift());}
    const carve=(a,b)=>{
      let x=a.cx,y=a.cy;const horizontalFirst=random(floorRng)<.5;
      const stepX=()=>{while(x!==b.cx){x+=Math.sign(b.cx-x);if(tiles[index(x,y)]===WALL)tiles[index(x,y)]=FLOOR;}};
      const stepY=()=>{while(y!==b.cy){y+=Math.sign(b.cy-y);if(tiles[index(x,y)]===WALL)tiles[index(x,y)]=FLOOR;}};
      if(horizontalFirst){stepX();stepY();}else{stepY();stepX();}
    };
    for(let i=1;i<order.length;i++)carve(order[i-1],order[i]);
    for(let i=0;i<2&&order.length>3;i++)carve(pick(floorRng,order),pick(floorRng,order));
    // Doors sit in one-cell doorways just outside rooms.
    for(const r of rooms)for(let y=r.y-1;y<=r.y+r.h;y++)for(let x=r.x-1;x<=r.x+r.w;x++){
      const edge=x===r.x-1||x===r.x+r.w||y===r.y-1||y===r.y+r.h;
      if(!edge||tiles[index(x,y)]!==FLOOR)continue;
      const horizontal=tiles[index(x-1,y)]===WALL&&tiles[index(x+1,y)]===WALL,vertical=tiles[index(x,y-1)]===WALL&&tiles[index(x,y+1)]===WALL;
      if((horizontal||vertical)&&random(floorRng)<.55)tiles[index(x,y)]=DOOR;
    }
    state.tiles=tiles;state.rooms=rooms.map(r=>({...r}));
    const start=order[0];state.player.x=start.cx;state.player.y=start.cy;
    // Face the longest open view, never a wall at arm's length.
    const reach=d=>{let n=0,[dx,dy]=DIRS[d];while(tiles[index(start.cx+dx*(n+1),start.cy+dy*(n+1))]===FLOOR)n++;return n;};
    state.player.facing=[0,1,2,3].sort((a,b)=>reach(b)-reach(a)||a-b)[0];
    const distance=distances(state,start.cx,start.cy,true);
    const far=rooms.slice().sort((a,b)=>distance[index(b.cx,b.cy)]-distance[index(a.cx,a.cy)])[0];
    if(state.depth<FINAL_DEPTH)tiles[index(far.cx,far.cy)]=STAIRS;
    state.explored=new Array(SIZE*SIZE).fill(0);state.monsters=[];state.items=[];state.torches=[];
    // Torches on room walls light the rooms; the corridors stay dark.
    for(const r of rooms){
      const spots=[];
      for(let x=r.x;x<r.x+r.w;x++){spots.push([x,r.y-1,0]);spots.push([x,r.y+r.h,2]);}
      for(let y=r.y;y<r.y+r.h;y++){spots.push([r.x-1,y,3]);spots.push([r.x+r.w,y,1]);}
      const walls=spots.filter(([x,y])=>tiles[index(x,y)]===WALL);
      for(let i=0;i<2&&walls.length;i++){const [x,y,dir]=walls.splice(int(floorRng,0,walls.length-1),1)[0];state.torches.push({x,y,dir});}
    }
    const free=(room)=>{for(let tries=0;tries<40;tries++){const x=int(floorRng,room.x,room.x+room.w-1),y=int(floorRng,room.y,room.y+room.h-1);if(tiles[index(x,y)]===FLOOR&&!(x===state.player.x&&y===state.player.y)&&!state.monsters.some(m=>m.x===x&&m.y===y)&&!state.items.some(i=>i.x===x&&i.y===y))return[x,y];}return null;};
    const others=rooms.filter(r=>r!==start);
    const roster=Object.entries(MONSTERS).filter(([,m])=>state.depth>=m.depths[0]&&state.depth<=m.depths[1]);
    const total=roster.reduce((sum,[,m])=>sum+m.weight,0);
    for(let i=0;i<4+state.depth*2;i++){
      let roll=random(floorRng)*total,kind=roster[0][0];for(const [name,m] of roster){roll-=m.weight;if(roll<0){kind=name;break;}}
      const spot=free(pick(floorRng,others));if(spot)spawn(state,kind,spot[0],spot[1]);
    }
    if(state.depth===FINAL_DEPTH){spawn(state,'lich',far.cx,far.cy);}
    const place=(kind,extra)=>{const spot=free(pick(floorRng,others));if(spot)state.items.push({id:state.nextId++,kind,x:spot[0],y:spot[1],...extra});};
    for(let i=int(floorRng,4,6);i>0;i--)place('gold',{amount:int(floorRng,3,8)+state.depth*3});
    for(let i=int(floorRng,2,3);i>0;i--)place('potion',{});
    if(random(floorRng)<.8)place('scroll',{});
    place('weapon',{tier:Math.min(WEAPONS.length-1,state.depth+(random(floorRng)<.3?1:0))});
    if(random(floorRng)<.75)place('armour',{tier:Math.min(ARMOURS.length-1,Math.max(1,state.depth-1+(random(floorRng)<.35?1:0)))});
    reveal(state);
  }
  function spawn(state,kind,x,y){
    const m=MONSTERS[kind],diff=DIFFICULTIES[state.difficulty]||DIFFICULTIES.normal;
    const scale=(1+Math.max(0,state.depth-m.depths[0])*.12)*diff.hpMul;
    if(!Number.isFinite(scale))throw new Error('Monster '+kind+' has no depth range.');
    const hp=Math.max(1,Math.round(m.hp*scale)),atk=Math.max(1,m.atk+diff.atkMod);
    const monster={id:state.nextId++,kind,x,y,hp,maxHp:hp,atk,def:m.def,seen:null,cooldown:0};
    state.monsters.push(monster);return monster;
  }

  // Breadth-first distances over walkable tiles; closed doors count as walkable.
  function distances(state,x,y,doorsOpen){
    const result=new Array(SIZE*SIZE).fill(Infinity),queue=[[x,y]];result[index(x,y)]=0;
    while(queue.length){const [cx,cy]=queue.shift();for(const [dx,dy] of DIRS){const nx=cx+dx,ny=cy+dy,tile=tileAt(state,nx,ny);if(!inBounds(nx,ny)||result[index(nx,ny)]!==Infinity)continue;if(passable(tile)||(doorsOpen&&tile===DOOR)){result[index(nx,ny)]=result[index(cx,cy)]+1;queue.push([nx,ny]);}}}
    return result;
  }
  function lineOfSight(state,x0,y0,x1,y1){
    let dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx+dy,x=x0,y=y0;
    while(!(x===x1&&y===y1)){const e2=2*err;if(e2>=dy){err+=dy;x+=sx;}if(e2<=dx){err+=dx;y+=sy;}if(x===x1&&y===y1)break;if(!seeThrough(tileAt(state,x,y)))return false;}
    return true;
  }
  function reveal(state,radius=6){
    const p=state.player;
    for(let y=p.y-radius;y<=p.y+radius;y++)for(let x=p.x-radius;x<=p.x+radius;x++){
      if(!inBounds(x,y)||Math.hypot(x-p.x,y-p.y)>radius+.5)continue;
      if(lineOfSight(state,p.x,p.y,x,y))state.explored[index(x,y)]=1;
    }
  }

  function newRun(seed,difficulty='normal'){
    seed=String(seed||'delve').slice(0,40);
    const diffKey=DIFFICULTIES[difficulty]?difficulty:'normal',diff=DIFFICULTIES[diffKey];
    const state={version:1,seed,difficulty:diffKey,rng:hashString(seed+'|run'),depth:1,turn:0,nextId:1,kills:0,gold:0,dead:false,won:false,cause:null,log:[],
      player:{x:0,y:0,facing:1,hp:diff.startHp,maxHp:diff.startHp,baseAtk:4,baseDef:0,level:1,xp:0,potions:diff.startPotions,scrolls:0,weapon:0,armour:0}};
    generateFloor(state);
    state.log.push('You descend into the dark. Find the stairs down; the lich waits on floor '+FINAL_DEPTH+'.');
    return state;
  }

  const attackOf=p=>p.baseAtk+WEAPONS[p.weapon].atk;
  const defenceOf=p=>p.baseDef+ARMOURS[p.armour].def;
  const monsterAt=(state,x,y)=>state.monsters.find(m=>m.x===x&&m.y===y);

  function strike(state,attack,defence){
    const crit=random(state)<.1,damage=Math.max(1,attack+int(state,0,2)-defence)*(crit?2:1);
    return{damage,crit};
  }
  function gainXp(state,amount,events){
    const p=state.player;p.xp+=amount;
    while(p.xp>=p.level*10){p.xp-=p.level*10;p.level++;p.maxHp+=5;p.hp=Math.min(p.maxHp,p.hp+8);p.baseAtk++;if(p.level%2===0)p.baseDef++;
      events.push({type:'level',level:p.level});say(state,events,`You reach level ${p.level}. You feel stronger.`);}
  }
  function say(state,events,text){state.log.push(text);if(state.log.length>40)state.log.shift();events.push({type:'message',text});}

  function playerAttack(state,monster,events){
    const p=state.player,{damage,crit}=strike(state,attackOf(p),monster.def),info=MONSTERS[monster.kind];
    monster.hp-=damage;events.push({type:'attack',actor:'player',target:monster.id,damage,crit});
    if(monster.hp<=0){
      state.monsters=state.monsters.filter(m=>m!==monster);state.kills++;events.push({type:'die',id:monster.id,x:monster.x,y:monster.y,glyph:info.glyph});
      say(state,events,`You slay the ${info.name}${crit?' with a critical blow':''}.`);gainXp(state,info.xp,events);
      if(info.boss){state.won=true;events.push({type:'victory'});say(state,events,'The lich crumbles to dust. The deep is quiet. You have won.');}
    }else say(state,events,`You hit the ${info.name} for ${damage}${crit?' (critical!)':''}.`);
  }
  function hurtPlayer(state,amount,source,events){
    const p=state.player;p.hp-=amount;events.push({type:'hurt',damage:amount,source});
    if(p.hp<=0){p.hp=0;state.dead=true;state.cause=source;events.push({type:'death',cause:source});say(state,events,`You are slain by a ${source}.`);}
  }
  function pickUp(state,events){
    const p=state.player;
    for(const item of state.items.filter(i=>i.x===p.x&&i.y===p.y)){
      state.items=state.items.filter(i=>i!==item);let text;
      if(item.kind==='gold'){state.gold+=item.amount;text=`You pick up ${item.amount} gold.`;}
      else if(item.kind==='potion'){p.potions++;text='You find a healing potion. Q to drink.';}
      else if(item.kind==='scroll'){p.scrolls++;text='You find a scroll of mapping. M to read.';}
      else if(item.kind==='weapon'){const w=WEAPONS[item.tier];if(item.tier>p.weapon){p.weapon=item.tier;text=`You wield a ${w.name} (+${w.atk} attack).`;}else{state.gold+=5+item.tier*3;text=`You sell a spare ${w.name} for ${5+item.tier*3} gold.`;}}
      else if(item.kind==='armour'){const a=ARMOURS[item.tier];if(item.tier>p.armour){p.armour=item.tier;text=`You put on ${a.name} (+${a.def} defence).`;}else{state.gold+=5+item.tier*3;text=`You sell spare ${a.name} for ${5+item.tier*3} gold.`;}}
      events.push({type:'pickup',kind:item.kind,id:item.id});say(state,events,text);
    }
  }

  // Step a monster toward a target using BFS distances from that target.
  function approach(state,monster,tx,ty,events){
    const field=distances(state,tx,ty,true);let best=null,bestScore=field[index(monster.x,monster.y)];
    for(const [dx,dy] of DIRS){const nx=monster.x+dx,ny=monster.y+dy;const score=field[index(nx,ny)];
      if(!inBounds(nx,ny)||score>=bestScore||monsterAt(state,nx,ny)||(nx===state.player.x&&ny===state.player.y))continue;best=[nx,ny];bestScore=score;}
    if(best)moveMonster(state,monster,best[0],best[1],events);
  }
  function moveMonster(state,monster,x,y,events){
    const tile=tileAt(state,x,y);
    if(tile===DOOR){state.tiles[index(x,y)]=OPEN;events.push({type:'door',x,y});return;}
    if(!passable(tile)||monsterAt(state,x,y)||(x===state.player.x&&y===state.player.y))return;
    events.push({type:'move',id:monster.id,from:[monster.x,monster.y],to:[x,y]});monster.x=x;monster.y=y;
  }
  function monsterAct(state,monster,events){
    const info=MONSTERS[monster.kind],p=state.player,dx=p.x-monster.x,dy=p.y-monster.y,adjacent=Math.abs(dx)+Math.abs(dy)===1;
    if(adjacent){const {damage}=strike(state,monster.atk,defenceOf(p));events.push({type:'attack',actor:monster.id,target:'player',damage});say(state,events,`The ${info.name} hits you for ${damage}.`);hurtPlayer(state,damage,info.name,events);return;}
    const distance=Math.hypot(dx,dy),sees=distance<=9&&lineOfSight(state,monster.x,monster.y,p.x,p.y);
    if(sees)monster.seen=[p.x,p.y];
    if(info.range&&sees&&(dx===0||dy===0)&&distance<=info.range&&monster.cooldown===0){
      const {damage}=strike(state,monster.atk-1,defenceOf(p));monster.cooldown=info.boss?2:1;
      events.push({type:'shoot',actor:monster.id,from:[monster.x,monster.y],to:[p.x,p.y],damage});say(state,events,`The ${info.name} ${info.boss?'hurls a bolt of frost':'looses an arrow'} for ${damage}.`);hurtPlayer(state,damage,info.name,events);return;
    }
    if(monster.cooldown>0)monster.cooldown--;
    if(info.boss&&state.turn%7===0&&state.monsters.length<16){
      for(const [ox,oy] of DIRS){const x=monster.x+ox,y=monster.y+oy;if(passable(tileAt(state,x,y))&&!monsterAt(state,x,y)&&!(x===p.x&&y===p.y)){const raised=spawn(state,'skeleton',x,y);events.push({type:'summon',id:raised.id});say(state,events,'The lich raises a skeleton from the floor.');break;}}
    }
    if(info.erratic&&random(state)<.5){const [ox,oy]=pick(state,DIRS);moveMonster(state,monster,monster.x+ox,monster.y+oy,events);return;}
    if(monster.seen){approach(state,monster,monster.seen[0],monster.seen[1],events);if(monster.x===monster.seen[0]&&monster.y===monster.seen[1])monster.seen=null;return;}
    if(random(state)<.3){const [ox,oy]=pick(state,DIRS);moveMonster(state,monster,monster.x+ox,monster.y+oy,events);}
  }
  function monstersTurn(state,events){
    state.turn++;
    for(const monster of state.monsters.slice()){
      if(state.dead||state.won)break;if(!state.monsters.includes(monster))continue;
      const info=MONSTERS[monster.kind];if(info.slow&&state.turn%2===1)continue;
      monsterAct(state,monster,events);if(info.fast&&!state.dead)monsterAct(state,monster,events);
    }
  }

  // Apply one player action. Turning is free; everything else ends the turn.
  function act(state,action){
    const events=[];if(state.dead||state.won)return events;
    const p=state.player;
    if(action==='turnLeft'||action==='turnRight'){p.facing=(p.facing+(action==='turnLeft'?3:1))%4;events.push({type:'turn',facing:p.facing});return events;}
    const offsets={forward:0,right:1,back:2,left:3};
    if(action in offsets){
      const [dx,dy]=DIRS[(p.facing+offsets[action])%4],x=p.x+dx,y=p.y+dy,tile=tileAt(state,x,y),monster=monsterAt(state,x,y);
      if(monster)playerAttack(state,monster,events);
      else if(tile===DOOR){state.tiles[index(x,y)]=OPEN;events.push({type:'door',x,y});say(state,events,'The door grinds open.');}
      else if(passable(tile)){events.push({type:'step',from:[p.x,p.y],to:[x,y]});p.x=x;p.y=y;pickUp(state,events);reveal(state);if(tile===STAIRS)say(state,events,'Stairs lead down. Press Enter (or the stairs button) to descend.');}
      else{events.push({type:'bump'});return events;}
    }else if(action==='wait'){events.push({type:'wait'});}
    else if(action==='potion'){
      if(!p.potions){say(state,events,'You have no potions.');return events;}
      if(p.hp>=p.maxHp){say(state,events,'You are already at full health.');return events;}
      p.potions--;const healed=Math.min(p.maxHp-p.hp,Math.max(12,Math.round(p.maxHp*.5)));p.hp+=healed;events.push({type:'heal',amount:healed});say(state,events,`You drink a potion and recover ${healed} health.`);
    }else if(action==='scroll'){
      if(!p.scrolls){say(state,events,'You have no scrolls.');return events;}
      p.scrolls--;state.tiles.forEach((tile,i)=>{if(tile!==WALL)state.explored[i]=1;});events.push({type:'map'});say(state,events,'The scroll burns away and the floor plan glows in your mind.');
    }else if(action==='descend'){
      if(tileAt(state,p.x,p.y)!==STAIRS){say(state,events,'There are no stairs here.');return events;}
      state.depth++;p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*.25));generateFloor(state);
      events.push({type:'descend',depth:state.depth});say(state,events,state.depth===FINAL_DEPTH?'Floor 5. A cold wind carries the lich\'s whisper.':`You descend to floor ${state.depth}.`);return events;
    }else return events;
    monstersTurn(state,events);
    return events;
  }

  function score(state){return state.gold+state.kills*5+(state.depth-1)*50+(state.won?500:0);}

  // Minimal structural validation for resumed runs from local storage.
  function restore(data){
    if(!data||data.version!==1||typeof data.seed!=='string'||!Array.isArray(data.tiles)||data.tiles.length!==SIZE*SIZE||!data.player||!Array.isArray(data.monsters)||!Array.isArray(data.items))throw new Error('Saved run is not a Delve run.');
    if(!Number.isInteger(data.depth)||data.depth<1||data.depth>FINAL_DEPTH)throw new Error('Saved run depth is invalid.');
    return JSON.parse(JSON.stringify(data));
  }

  // Headless bot: fights adjacent monsters, heals when low, grabs nearby upgrades/potions, and descends to the lich.
  function botAction(state){
    const p=state.player;
    const face=dir=>{if(dir===p.facing)return null;return(dir-p.facing+4)%4===1?'turnRight':'turnLeft';};
    if(p.hp<p.maxHp*.5&&p.potions)return'potion';
    for(let d=0;d<4;d++){const [dx,dy]=DIRS[d];if(state.monsters.some(m=>m.x===p.x+dx&&m.y===p.y+dy))return face(d)||'forward';}
    if(p.scrolls>0)return'scroll';
    // Check for nearby useful items (potions or better gear) within 4 steps
    const fromPlayer=distances(state,p.x,p.y,true);
    let target=null,bestItemDist=5;
    for(const it of state.items){
      const useful=it.kind==='potion'||(it.kind==='weapon'&&it.tier>p.weapon)||(it.kind==='armour'&&it.tier>p.armour);
      if(!useful)continue;
      const d=fromPlayer[index(it.x,it.y)];
      if(d<bestItemDist){bestItemDist=d;target=[it.x,it.y];}
    }
    if(!target){
      if(tileAt(state,p.x,p.y)===STAIRS)return'descend';
      for(let i=0;i<state.tiles.length;i++)if(state.tiles[i]===STAIRS)target=[i%SIZE,Math.floor(i/SIZE)];
      const lich=state.monsters.find(m=>m.kind==='lich');if(lich)target=[lich.x,lich.y];
    }
    if(!target)return'wait';
    const field=distances(state,target[0],target[1],true);let best=null,bestScore=field[index(p.x,p.y)];
    for(let d=0;d<4;d++){const [dx,dy]=DIRS[d],score=field[index(p.x+dx,p.y+dy)];if(score!==undefined&&score<bestScore){best=d;bestScore=score;}}
    if(best===null)return'wait';
    return face(best)||'forward';
  }

  global.Delve={SIZE,FINAL_DEPTH,WALL,FLOOR,DOOR,OPEN,STAIRS,DIRS,MONSTERS,DIFFICULTIES,WEAPONS,ARMOURS,ITEM_GLYPHS,
    newRun,act,score,restore,botAction,tileAt,passable,lineOfSight,distances,attackOf,defenceOf,hashString,index};
})(typeof window!=='undefined'?window:globalThis);
