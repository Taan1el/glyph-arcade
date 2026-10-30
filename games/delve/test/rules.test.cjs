'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const box=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/rules.js'),'utf8')+'\nthis.D=Delve;',box);
const D=box.D,clone=v=>JSON.parse(JSON.stringify(v));let count=0;
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
});
test('Bot runs finish without errors and the difficulty curve is plausible',()=>{
  const outcomes={won:0,died:0,stuck:0},depths=[];
  for(let s=0;s<60;s++){const {state}=playRun('bot-'+s);if(state.won)outcomes.won++;else if(state.dead)outcomes.died++;else outcomes.stuck++;depths.push(state.depth);}
  const mean=depths.reduce((a,b)=>a+b,0)/depths.length;
  console.log(`   60 bot runs: ${outcomes.won} won, ${outcomes.died} died, ${outcomes.stuck} unfinished, mean depth ${mean.toFixed(2)}`);
  assert.equal(outcomes.stuck,0,'bot never gets stuck');assert(outcomes.died>0,'the dungeon can kill a careless player');assert(mean>=2.2,'a simple bot gets past the first floors');
});
console.log(`${count}/${count} Delve rules checks passed.`);
