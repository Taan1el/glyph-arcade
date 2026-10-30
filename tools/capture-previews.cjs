'use strict';
// Renders launcher/social preview images by staging a scene in each built game.
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist/previews');

(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}});
    await page.goto(pathToFileURL(path.join(root,'dist/delve.html')).href);await page.waitForFunction(()=>window.delve);
    // Stand in the largest room facing its longest axis with a skeleton, goblin and loot ahead.
    await page.evaluate(()=>{
      const D=window.Delve,app=window.delve,state=D.newRun('preview-room');
      const room=state.rooms.slice().sort((a,b)=>b.w*b.h-a.w*a.h)[0],wide=room.w>=room.h;
      const p=state.player;p.facing=wide?1:2;p.x=wide?room.x:room.cx;p.y=wide?room.cy:room.y;
      const [dx,dy]=D.DIRS[p.facing],at=(n,side=0)=>({x:p.x+dx*n+(wide?0:side),y:p.y+dy*n+(wide?side:0)});
      const put=(kind,n,side)=>{const c=at(n,side);if(D.passable(D.tileAt(state,c.x,c.y)))state.monsters.push({id:state.nextId++,kind,...c,hp:9,maxHp:9,atk:2,def:0,seen:null,cooldown:0});};
      state.monsters=[];state.items=[];put('skeleton',4,0);put('goblin',2,1);put('bat',3,-1);
      for(const [kind,n,side,extra] of [['gold',1,-1,{amount:9}],['potion',2,-1,{}],['weapon',3,1,{tier:2}]]){const c=at(n,side);if(D.passable(D.tileAt(state,c.x,c.y)))state.items.push({id:state.nextId++,kind,...c,...extra});}
      app.start(state);document.getElementById('toast').classList.remove('visible');
    });
    await page.waitForTimeout(900);
    await page.screenshot({path:path.join(out,'delve.png')});
    console.log('Wrote dist/previews/delve.png');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
