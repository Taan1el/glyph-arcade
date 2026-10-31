'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const box=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../../engine/glyph-art.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../src/rules.js'),'utf8')+'\nthis.D=Delve;this.GA=GlyphArt;',box);
const D=box.D,GA=box.GA,clone=v=>JSON.parse(JSON.stringify(v));let count=0;
function test(name,run){run();count++;console.log('PASS '+name);}

// A simple player bot: fight what is adjacent, heal when low, otherwise walk to the stairs (or the lich).
function botAction(state){
  const p=state.player,dirs=D.DIRS;
  const face=dir=>{if(dir===p.facing)return null;return (dir-p.facing+4)%4===1?'turnRight':'turnLeft';};
  for(let d=0;d<4;d++){const [dx,dy]=dirs[d];if(state.monsters.some(m=>m.x===p.x+dx&&m.y===p.y+dy))return face(d)||'forward';}
  if(p.hp<p.maxHp*.4&&p.potions)return'potion';
  if(D.tileAt(state,p.x,p.y)===D.STAIRS)return'descend';
  let target=null;for(let i=0;i<state.tiles.length;i++)if(state.tiles[i]===D.STAIRS)target=[i%D.SIZE,Math.floor(i/D.SIZE)];
  const lich=state.monsters.find(m=>m.kind==='lich');if(lich)target=[lich.x,lich.y];
  const field=D.distances(state,target[0],target[1],true);let best=null,bestScore=field[D.index(p.x,p.y)];
  for(let d=0;d<4;d++){const [dx,dy]=dirs[d],score=field[D.index(p.x+dx,p.y+dy)];if(score!==undefined&&score<bestScore){best=d;bestScore=score;}}
  if(best===null)return'wait';
  return face(best)||'forward';
}
function playRun(seed,limit=4000){
  const state=D.newRun(seed);let steps=0;
  while(!state.dead&&!state.won&&steps<limit){D.act(state,botAction(state));steps++;}
  return{state,steps};
}

test('Every floor is connected: stairs (or the lich) are reachable from the start',()=>{
  for(let s=0;s<40;s++){const state=D.newRun('seed-'+s);
    for(let depth=1;depth<=D.FINAL_DEPTH;depth++){
      const field=D.distances(state,state.player.x,state.player.y,true);
      const goal=depth<D.FINAL_DEPTH?state.tiles.findIndex(t=>t===D.STAIRS):(()=>{const l=state.monsters.find(m=>m.kind==='lich');return D.index(l.x,l.y);})();
      assert(goal>=0&&Number.isFinite(field[goal]),`seed-${s} floor ${depth} goal unreachable`);
      assert(state.rooms.length>=5,'enough rooms');
      for(const m of state.monsters)assert(D.passable(D.tileAt(state,m.x,m.y))||D.tileAt(state,m.x,m.y)===D.FLOOR);
      if(depth<D.FINAL_DEPTH){state.player.x=goal%D.SIZE;state.player.y=Math.floor(goal/D.SIZE);D.act(state,'descend');assert.equal(state.depth,depth+1);}
    }
  }
});
test('Runs are deterministic for a seed and differ between seeds',()=>{
  const a=playRun('same',300).state,b=playRun('same',300).state,c=D.newRun('other');
  assert.deepEqual(a,b);assert.notDeepEqual(c.tiles,D.newRun('same').tiles);
});
test('Turning is free; moving into walls costs nothing; stepping ends the turn',()=>{
  const state=D.newRun('turns'),turn=state.turn;D.act(state,'turnLeft');D.act(state,'turnRight');assert.equal(state.turn,turn);
  for(let i=0;i<4;i++){const before=clone(state);const events=D.act(state,'forward');if(events.some(e=>e.type==='bump')){assert.equal(state.turn,before.turn);break;}}
});
test('Doors open on a bump and then let you through',()=>{
  const state=D.newRun('doors');const door=state.tiles.findIndex(t=>t===D.DOOR);assert(door>=0);
  const x=door%D.SIZE,y=Math.floor(door/D.SIZE);
  for(let f=0;f<4;f++){const [dx,dy]=D.DIRS[f];if(D.passable(D.tileAt(state,x-dx,y-dy))){state.monsters=[];state.player.x=x-dx;state.player.y=y-dy;state.player.facing=f;break;}}
  const events=D.act(state,'forward');assert(events.some(e=>e.type==='door'));assert.equal(D.tileAt(state,x,y),D.OPEN);
  D.act(state,'forward');assert.deepEqual([state.player.x,state.player.y],[x,y]);
});
test('Combat, death of a monster, xp and level up',()=>{
  const state=D.newRun('fight'),p=state.player;state.monsters=[];
  const [dx,dy]=D.DIRS[p.facing];let x=p.x+dx,y=p.y+dy;if(!D.passable(D.tileAt(state,x,y))){p.facing=(p.facing+1)%4;}
  const [fx,fy]=D.DIRS[p.facing];state.monsters.push({id:999,kind:'rat',x:p.x+fx,y:p.y+fy,hp:1,maxHp:4,atk:2,def:0,seen:null,cooldown:0});
  p.xp=9;const events=D.act(state,'forward');assert(events.some(e=>e.type==='die'));assert.equal(state.kills,1);assert.equal(p.level,2);assert.equal(p.maxHp,25);
});
test('Potions heal, scrolls map the floor, gear auto-equips only when better',()=>{
  const state=D.newRun('items'),p=state.player;p.hp=5;p.potions=1;D.act(state,'potion');assert(p.hp>=17);assert.equal(p.potions,0);
  p.scrolls=1;D.act(state,'scroll');assert(state.tiles.every((t,i)=>t===D.WALL||state.explored[i]===1));
  state.monsters=[];state.items=[{id:500,kind:'weapon',tier:3,x:p.x,y:p.y},{id:501,kind:'weapon',tier:1,x:p.x,y:p.y}];
  // Pick up by stepping off and back on.
  for(let f=0;f<4;f++){const [dx,dy]=D.DIRS[f];if(D.passable(D.tileAt(state,p.x+dx,p.y+dy))){const items=state.items.map(i=>({...i,x:p.x+dx,y:p.y+dy}));state.items=items;p.facing=f;break;}}
  const gold=state.gold;D.act(state,'forward');assert.equal(p.weapon,3);assert(state.gold>gold,'spare weapon sold');
});
test('Saves round-trip through JSON and reject foreign data',()=>{
  const state=playRun('save',150).state,copy=D.restore(clone(state));assert.deepEqual(copy,state);
  const a=clone(state),b=clone(state);D.act(a,'wait');D.act(b,'wait');assert.deepEqual(a,b);
  assert.throws(()=>D.restore({version:2}),/not a Delve run/);
  assert.throws(()=>D.restore(null),/not a Delve run/);
  const badDepth=clone(state);badDepth.depth=6;assert.throws(()=>D.restore(badDepth),/depth is invalid/);
  const badDepthZero=clone(state);badDepthZero.depth=0;assert.throws(()=>D.restore(badDepthZero),/depth is invalid/);
  const badTiles=clone(state);badTiles.tiles=[1,2,3];assert.throws(()=>D.restore(badTiles),/not a Delve run/);
});
test('Archer and Lich ranged cooldowns and Lich skeleton summoning',()=>{
  const state=D.newRun('ranged');state.monsters=[];const p=state.player;p.hp=100;p.maxHp=100;
  // Carve a straight corridor of floor tiles to the east
  for(let i=0;i<=5;i++)state.tiles[D.index(p.x+i,p.y)]=D.FLOOR;
  const archer={id:901,kind:'archer',x:p.x+3,y:p.y,hp:10,maxHp:10,atk:3,def:1,seen:null,cooldown:0};
  state.monsters.push(archer);
  const e1=D.act(state,'wait');
  assert(e1.some(e=>e.type==='shoot'&&e.actor===901),'archer shoots on first turn');
  assert.equal(archer.cooldown,1,'archer cooldown set to 1 after firing');
  const e2=D.act(state,'wait');
  assert(!e2.some(e=>e.type==='shoot'),'archer rests on second turn while cooldown is 1');
  assert.equal(archer.cooldown,0,'archer cooldown decrements to 0 after resting');
  const e3=D.act(state,'wait');
  assert(e3.some(e=>e.type==='shoot'&&e.actor===901),'archer fires again on third turn');

  // Lich rests 2 turns between frost bolts and summons on turn % 7 === 0
  state.monsters=[];
  const lich={id:902,kind:'lich',x:p.x+4,y:p.y,hp:60,maxHp:60,atk:9,def:3,seen:null,cooldown:0};
  state.monsters.push(lich);
  const l1=D.act(state,'wait');
  assert(l1.some(e=>e.type==='shoot'&&e.actor===902),'lich shoots frost bolt');
  assert.equal(lich.cooldown,2,'lich cooldown set to 2');
  const l2=D.act(state,'wait');
  assert(!l2.some(e=>e.type==='shoot'),'lich rests turn 1');
  const l3=D.act(state,'wait');
  assert(!l3.some(e=>e.type==='shoot'),'lich rests turn 2');
  const l4=D.act(state,'wait');
  assert(l4.some(e=>e.type==='shoot'&&e.actor===902),'lich fires after 2 rest turns');
});
test('Monster traits: slow jelly, fast wraith, monster door opening, and boss victory',()=>{
  const state=D.newRun('traits');state.monsters=[];const p=state.player;p.hp=100;p.maxHp=100;
  for(let i=0;i<=6;i++)state.tiles[D.index(p.x+i,p.y)]=D.FLOOR;
  const jelly={id:910,kind:'jelly',x:p.x+3,y:p.y,hp:13,maxHp:13,atk:3,def:0,seen:[p.x,p.y],cooldown:0};
  state.monsters=[jelly];state.turn=0;
  D.act(state,'wait'); // turn becomes 1 (odd) -> slow jelly skips
  assert.equal(jelly.x,p.x+3,'slow jelly skips odd turn');
  D.act(state,'wait'); // turn becomes 2 (even) -> slow jelly steps
  assert.equal(jelly.x,p.x+2,'slow jelly moves on even turn');

  const wraith={id:911,kind:'wraith',x:p.x+4,y:p.y,hp:14,maxHp:14,atk:5,def:1,seen:[p.x,p.y],cooldown:0};
  state.monsters=[wraith];
  D.act(state,'wait');
  assert.equal(wraith.x,p.x+2,'fast wraith steps twice in one turn');

  // Monster opens a closed door in its path
  state.tiles[D.index(p.x+1,p.y)]=D.DOOR;
  const goblin={id:912,kind:'goblin',x:p.x+2,y:p.y,hp:8,maxHp:8,atk:3,def:1,seen:[p.x,p.y],cooldown:0};
  state.monsters=[goblin];
  const dEvents=D.act(state,'wait');
  assert(dEvents.some(e=>e.type==='door'),'monster opens closed door');
  assert.equal(D.tileAt(state,p.x+1,p.y),D.OPEN);

  // Slaying the Lich wins the game and adds 500 score
  const lich={id:913,kind:'lich',x:p.x+1,y:p.y,hp:1,maxHp:60,atk:9,def:3,seen:null,cooldown:0};
  state.monsters=[lich];p.facing=1;
  const vEvents=D.act(state,'forward');
  assert.equal(state.won,true,'killing lich sets won=true');
  assert(vEvents.some(e=>e.type==='victory'));
  assert(D.score(state)>=500,'victory adds 500 score bonus');
});
test('Item and action edge cases: full-HP potion, empty inventory, armour sales, invalid descend',()=>{
  const state=D.newRun('edge-items');state.monsters=[];const p=state.player;
  const startTurn=state.turn;
  // Full HP potion does not consume potion or turn
  p.hp=p.maxHp;p.potions=2;
  D.act(state,'potion');
  assert.equal(p.potions,2);assert.equal(state.turn,startTurn);
  // Zero potions or scrolls do not advance turn
  p.hp=5;p.potions=0;p.scrolls=0;
  D.act(state,'potion');assert.equal(state.turn,startTurn);
  D.act(state,'scroll');assert.equal(state.turn,startTurn);
  // Descending when not on stairs does not advance turn or depth
  D.act(state,'descend');assert.equal(state.depth,1);assert.equal(state.turn,startTurn);
  // Armour auto-equip and spare sale
  state.tiles[D.index(p.x+1,p.y)]=D.FLOOR;p.facing=1;
  state.items=[{id:601,kind:'armour',tier:3,x:p.x+1,y:p.y},{id:602,kind:'armour',tier:1,x:p.x+1,y:p.y}];
  const beforeGold=state.gold;
  D.act(state,'forward');
  assert.equal(p.armour,3,'higher-tier armour equipped');
  assert.equal(state.gold,beforeGold+8,'lower-tier armour sold for 5 + 3*1 gold');
});
test('GlyphArt Canvas.finish does not wrap shading across horizontal boundaries',()=>{
  const c=new GA.Canvas(6,4);
  // Set (5,0) at end of row 0, and a block at (0,0),(0,1),(1,1),(0,2)
  c.set(5,0,[0.5,0.5,0.5]);
  c.set(0,0,[0.5,0.5,0.5]);
  c.set(0,1,[0.5,0.5,0.5]);
  c.set(1,1,[0.5,0.5,0.5]);
  c.set(0,2,[0.5,0.5,0.5]);
  c.finish({outline:null,shade:true});
  // Pixel (0,1) has top (0,0), right (1,1), and bottom (0,2) filled, so only its left edge (x=0) is open
  const p01=c.get(0,1);
  assert(p01[0]>0.5,'left-edge pixel is highlighted without wrapping to previous row right edge');
});
test('Bot runs finish without errors and the difficulty curve is plausible',()=>{
  const outcomes={won:0,died:0,stuck:0},depths=[];
  for(let s=0;s<60;s++){const {state}=playRun('bot-'+s);if(state.won)outcomes.won++;else if(state.dead)outcomes.died++;else outcomes.stuck++;depths.push(state.depth);}
  const mean=depths.reduce((a,b)=>a+b,0)/depths.length;
  console.log(`   60 bot runs: ${outcomes.won} won, ${outcomes.died} died, ${outcomes.stuck} unfinished, mean depth ${mean.toFixed(2)}`);
  assert.equal(outcomes.stuck,0,'bot never gets stuck');assert(outcomes.died>0,'the dungeon can kill a careless player');assert(mean>=2.2,'a simple bot gets past the first floors');
});
console.log(`${count}/${count} Delve rules checks passed.`);
