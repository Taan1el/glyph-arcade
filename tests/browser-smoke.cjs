'use strict';
// Loads the built game, starts a run, plays a few turns, and fails on any page error.
const path=require('node:path'),{chromium}=require('playwright'),{pathToFileURL}=require('node:url');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(pathToFileURL(path.join(__dirname,'../dist/delve.html')).href);await page.waitForTimeout(1500);
    if(await page.evaluate(()=>!document.getElementById('fatal').hidden))throw Error('fatal: '+await page.textContent('#fatal p'));
    await page.click('#new-run');for(const key of ['KeyW','KeyE','KeyW','KeyW','KeyQ','KeyW','Digit1'])await page.keyboard.press(key),await page.waitForTimeout(250);
    const out=await page.evaluate(()=>({turn:delve.state.turn,hp:delve.state.player.hp,cells:new Set(delve.view.inspect().glyphs).size}));
    if(process.argv[2])await page.screenshot({path:process.argv[2]});
    if(errors.length)throw Error(errors.join('\n'));
    if(out.cells<6)throw Error('scene drew too few distinct letters: '+out.cells);
    console.log('PASS Delve boots, plays turns and renders',JSON.stringify(out));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
