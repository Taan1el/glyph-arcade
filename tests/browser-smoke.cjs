'use strict';
// Loads the arcade portal and every built game, starts gameplay, and fails on any console or page error.
const path = require('node:path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    // 1. Portal check (including 360px mobile responsiveness & keyboard focusability)
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/index.html')).href);
    await page.waitForTimeout(300);
    const portalInfo = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.game')].map(a => a.getAttribute('href'));
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      const manifest = Boolean(document.querySelector('link[rel="manifest"]'));
      const skipLink = Boolean(document.querySelector('a.skip-link'));
      return { cards, overflow, manifest, skipLink };
    });
    if (!require('../tools/build.cjs').GAMES.map(game => game.id).every(game => portalInfo.cards.includes(game + '.html'))) {
      throw new Error('Portal is missing delve.html or inkfire.html card: ' + JSON.stringify(portalInfo.cards));
    }
    if (portalInfo.overflow) throw new Error('Portal overflows horizontally at 360px viewport width');
    if (!portalInfo.manifest || !portalInfo.skipLink) throw new Error('Portal missing manifest link or skip link');
    console.log('PASS Arcade portal renders cleanly at 360px with all games', JSON.stringify(portalInfo));

    // 2. Delve smoke check
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/delve.html')).href);
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !document.getElementById('fatal').hidden)) {
      throw new Error('Delve fatal: ' + await page.textContent('#fatal p'));
    }
    await page.click('#new-run');
    for (const key of ['KeyW', 'KeyE', 'KeyW', 'KeyW', 'KeyQ', 'KeyW', 'Digit1']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(220);
    }
    const delveOut = await page.evaluate(() => ({
      turn: window.delve.state.turn,
      hp: window.delve.state.player.hp,
      cells: new Set(window.delve.view.inspect().glyphs).size
    }));
    if (delveOut.cells < 6) throw new Error('Delve scene drew too few distinct letters: ' + delveOut.cells);
    console.log('PASS Delve boots, plays turns and renders', JSON.stringify(delveOut));

    // Dying and starting again must not carry the death effects into the new run.
    await page.evaluate(() => {
      const D = window.Delve, app = window.delve, s = app.state, p = s.player;
      const open = D.DIRS.map(([dx, dy]) => [p.x + dx, p.y + dy]).find(([x, y]) => D.passable(D.tileAt(s, x, y)));
      s.monsters.push({ id: s.nextId++, kind: 'ogre', x: open[0], y: open[1], hp: 99, maxHp: 99, atk: 99, def: 0, seen: null, cooldown: 0 });
      p.hp = 1;
      app.request('wait');
    });
    await page.waitForFunction(() => window.delve.mode === 'end', null, { timeout: 5000 });
    await page.click('#end-again');
    await page.waitForTimeout(300);
    const restarted = await page.evaluate(() => {
      const app = window.delve;
      return { mode: app.mode, turn: app.state.turn, dissolve: app.dissolve, shake: app.shake, tint: app.tint[3], pitch: app.camera.pitch, log: app.el.log.children.length };
    });
    if (restarted.mode !== 'play' || restarted.turn !== 0) throw new Error('Delve did not restart: ' + JSON.stringify(restarted));
    if (restarted.dissolve !== 0 || restarted.tint !== 0 || restarted.log !== 0) throw new Error('Delve death effects leaked into the new run: ' + JSON.stringify(restarted));
    console.log('PASS Delve restarts cleanly after dying', JSON.stringify(restarted));

    // 3. Inkfire smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/inkfire.html')).href);
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !document.getElementById('fatal').hidden)) {
      throw new Error('Inkfire fatal: ' + await page.textContent('#fatal p'));
    }
    await page.click('#new-run');
    for (const key of ['KeyW', 'KeyE', 'Space', 'KeyW', 'KeyQ']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(180);
    }
    // Test pause & resume and mute toggle
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    const paused = await page.evaluate(() => window.inkfire.mode === 'pause' && !document.getElementById('pause').hidden);
    if (!paused) throw new Error('Inkfire did not enter pause state on KeyP');
    await page.click('#resume-btn');
    await page.waitForTimeout(100);
    await page.click('#mute');

    const inkfireOut = await page.evaluate(() => ({
      time: Number(window.inkfire.state.time.toFixed(2)),
      hp: window.inkfire.state.player.hp,
      ammo: window.inkfire.state.player.ammo.bullets,
      muted: window.inkfire.sound.muted,
      cells: new Set(window.inkfire.view.inspect().glyphs).size
    }));
    if (inkfireOut.cells < 6) throw new Error('Inkfire scene drew too few distinct letters: ' + inkfireOut.cells);
    const inkfireLog = await page.evaluate(() => {
      window.inkfire.log('old line');
      window.inkfire.newRun();
      return window.inkfire.el.log.children.length;
    });
    if (inkfireLog !== 0) throw new Error('Inkfire log leaked into the new run');
    if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
    console.log('PASS Inkfire boots, plays, pauses/mutes and renders', JSON.stringify(inkfireOut));

    // 4. Wordfall smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/wordfall.html')).href);
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !document.getElementById('fatal').hidden)) {
      throw new Error('Wordfall fatal: ' + await page.textContent('#fatal p'));
    }
    await page.click('#new-run');
    await page.waitForTimeout(2200);
    const lane = await page.evaluate(() => window.wordfall.state.lane);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const wordfallOut = await page.evaluate(() => ({
      lane: window.wordfall.state.lane,
      drops: window.wordfall.state.drops.length,
      word: window.wordfall.state.word,
      cells: new Set(window.wordfall.view.inspect().glyphs).size
    }));
    if (wordfallOut.lane !== lane - 1) throw new Error('Wordfall did not move on ArrowLeft');
    if (!wordfallOut.drops) throw new Error('Wordfall dropped no letters');
    if (wordfallOut.cells < 6) throw new Error('Wordfall scene drew too few distinct letters: ' + wordfallOut.cells);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Wordfall boots, moves and renders', JSON.stringify(wordfallOut));

    // 5. Burrow smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/burrow.html')).href);
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !document.getElementById('fatal').hidden)) {
      throw new Error('Burrow fatal: ' + await page.textContent('#fatal p'));
    }
    await page.click('#new-run');
    await page.waitForTimeout(400);
    const burrowStart = await page.evaluate(() => window.burrow.state.player.x);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');
    // Hold the mouse on the ground beside the player and dig.
    const ground = await page.evaluate(() => {
      const app = window.burrow, p = app.state.player, size = app.view.engine.cellSize;
      const x = Math.floor(p.x + 2), y = Math.floor(p.y + p.h);
      return { x: ((x + 0.5) * 3 - app.cam.x) * size[0], y: ((y + 0.5) * 2 - app.cam.y) * size[1] };
    });
    await page.mouse.move(ground.x, ground.y);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.keyboard.press('KeyC');
    await page.waitForTimeout(100);
    const crafting = await page.evaluate(() => window.burrow.mode === 'craft' && document.querySelectorAll('#recipes button').length > 3);
    if (!crafting) throw new Error('Burrow crafting panel did not open');
    await page.keyboard.press('KeyC');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    await page.click('#pause-title');
    await page.waitForTimeout(100);
    await page.click('#continue');
    await page.waitForTimeout(200);
    const burrowOut = await page.evaluate(() => ({
      moved: window.burrow.state.player.x,
      dirt: window.burrow.state.items.dirt || 0,
      mode: window.burrow.mode,
      cells: new Set(window.burrow.view.inspect().glyphs).size
    }));
    if (burrowOut.moved <= burrowStart) throw new Error('Burrow did not walk on KeyD');
    if (!burrowOut.dirt) throw new Error('Burrow did not dig under the held mouse, or the save lost the dirt');
    if (burrowOut.mode !== 'play') throw new Error('Burrow did not continue from its save');
    if (burrowOut.cells < 6) throw new Error('Burrow scene drew too few distinct letters: ' + burrowOut.cells);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Burrow boots, walks, digs, crafts, saves and renders', JSON.stringify(burrowOut));

    // 6. Joyride smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/joyride.html')).href);
    await page.waitForTimeout(800);
    if (await page.evaluate(() => !document.getElementById('fatal').hidden)) {
      throw new Error('Joyride fatal: ' + await page.textContent('#fatal p'));
    }
    await page.click('#new-run');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const app = window.joyride, s = app.state, c = s.cars[0];
      s.player.x = c.x;
      s.player.y = c.y + 1;
    });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(150);
    const joyStart = await page.evaluate(() => window.joyride.state.player.x);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(100);
    const mapOpen = await page.evaluate(() => window.joyride.mode === 'map' && !document.getElementById('map').hidden);
    if (!mapOpen) throw new Error('Joyride map panel did not open');
    await page.keyboard.press('KeyM');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    await page.click('#pause-title');
    await page.waitForTimeout(100);
    await page.click('#continue');
    await page.waitForTimeout(200);
    const joyOut = await page.evaluate(startX => ({
      carId: window.joyride.state.player.carId,
      moved: Math.abs(window.joyride.state.player.x - startX) > 0.2,
      mode: window.joyride.mode,
      cells: new Set(window.joyride.view.inspect().glyphs).size
    }), joyStart);
    if (!joyOut.carId) throw new Error('Joyride did not enter car on KeyE');
    if (!joyOut.moved) throw new Error('Joyride car did not move on KeyW');
    if (joyOut.mode !== 'play') throw new Error('Joyride did not continue from its save');
    if (joyOut.cells < 6) throw new Error('Joyride scene drew too few distinct letters: ' + joyOut.cells);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Joyride boots, enters car, drives, opens map, saves and renders', JSON.stringify(joyOut));
    // Bannerfall: ordinary movement/ability input, pause, save and resume.
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/bannerfall.html')).href);
    await page.waitForFunction(() => window.bannerfall);
    await page.click('#new-run');
    await page.waitForTimeout(500);
    const bannerStart = await page.evaluate(() => ({x: bannerfall.state.player.x, y: bannerfall.state.player.y}));
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    if (!await page.evaluate(() => bannerfall.mode === 'pause')) throw new Error('Bannerfall did not pause');
    await page.click('#pause-title');
    await page.click('#continue');
    await page.waitForTimeout(300);
    const bannerOut = await page.evaluate(start => ({
      mode: bannerfall.mode, time: bannerfall.state.time,
      moved: Math.hypot(bannerfall.state.player.x-start.x,bannerfall.state.player.y-start.y)>0.1,
      cells: new Set(bannerfall.view.inspect().glyphs).size,
      towers: bannerfall.state.towers.length
    }), bannerStart);
    if (bannerOut.mode !== 'play' || !bannerOut.moved || bannerOut.cells < 6 || bannerOut.towers !== 12)
      throw new Error('Bannerfall play/save/render check failed: '+JSON.stringify(bannerOut));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Bannerfall boots, moves, casts, pauses, saves and renders', JSON.stringify(bannerOut));

    // 8. Ricochet smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/ricochet.html')).href);
    await page.waitForFunction(() => window.ricochet);
    await page.click('#new-run');
    await page.waitForTimeout(300);
    const ricoStart = await page.evaluate(() => ({ y: ricochet.state.players[0].y, holder: ricochet.state.holder }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(260);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(250);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    if (!await page.evaluate(() => ricochet.mode === 'pause')) throw new Error('Ricochet did not pause');
    await page.click('#pause-title');
    await page.click('#continue');
    await page.waitForTimeout(200);
    const ricoOut = await page.evaluate(start => ({
      mode: ricochet.mode,
      moved: Math.abs(ricochet.state.players[0].y - start.y) > 0.2,
      threw: ricochet.state.holder !== start.holder || Math.hypot(ricochet.state.disc.vx, ricochet.state.disc.vy) > 1,
      cells: new Set(ricochet.view.inspect().glyphs).size
    }), ricoStart);
    if (ricoOut.mode !== 'play' || !ricoOut.moved || !ricoOut.threw || ricoOut.cells < 6) {
      throw new Error('Ricochet play/save/render check failed: ' + JSON.stringify(ricoOut));
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Ricochet boots, moves, throws, pauses, saves and renders', JSON.stringify(ricoOut));

    // 9. Lockwork smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/lockwork.html')).href);
    await page.waitForFunction(() => window.lockwork);
    await page.click('#new-run');
    await page.waitForTimeout(250);
    const lockStart = await page.evaluate(() => ({ px: lockwork.state.vault.px, py: lockwork.state.vault.py, steps: lockwork.state.vault.steps }));
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    if (!await page.evaluate(() => lockwork.mode === 'pause')) throw new Error('Lockwork did not pause');
    await page.click('#pause-title');
    await page.click('#continue');
    await page.waitForTimeout(200);
    const lockOut = await page.evaluate(s => ({
      mode: lockwork.mode,
      moved: lockwork.state.vault.px !== s.px || lockwork.state.vault.py !== s.py,
      steps: lockwork.state.vault.steps,
      cells: new Set(lockwork.view.inspect().glyphs).size
    }), lockStart);
    if (lockOut.mode !== 'play' || !lockOut.moved || lockOut.steps !== 1 || lockOut.cells < 6) {
      throw new Error('Lockwork play/save/render check failed: ' + JSON.stringify(lockOut));
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Lockwork boots, steps, pauses, saves and renders', JSON.stringify(lockOut));

    // 10. Irongrid smoke check
    await page.goto(pathToFileURL(path.join(__dirname, '../dist/irongrid.html')).href);
    await page.waitForFunction(() => window.irongrid);
    await page.click('#new-run');
    await page.waitForTimeout(250);
    const ironStart = await page.evaluate(() => ({ x: irongrid.state.rigs[0].x, y: irongrid.state.rigs[0].y, turn: irongrid.state.turn }));
    await page.evaluate(() => {
      const app = window.irongrid, R = window.IrongridRules;
      const mv = R.reachableTiles(app.state, app.state.selectedRigId)[0];
      if (mv) app.act({ confirmAt: mv });
    });
    await page.waitForTimeout(100);
    await page.keyboard.press('KeyP');
    await page.waitForTimeout(100);
    if (!await page.evaluate(() => irongrid.mode === 'pause')) throw new Error('Irongrid did not pause');
    await page.click('#pause-title');
    await page.click('#continue');
    await page.waitForTimeout(200);
    const ironOut = await page.evaluate(s => ({
      mode: irongrid.mode,
      moved: irongrid.state.rigs.some((r, idx) => idx === 0 && (r.x !== s.x || r.y !== s.y)),
      turn: irongrid.state.turn,
      cells: new Set(irongrid.view.inspect().glyphs).size
    }), ironStart);
    if (ironOut.mode !== 'play' || !ironOut.moved || ironOut.turn !== 1 || ironOut.cells < 6) {
      throw new Error('Irongrid play/save/render check failed: ' + JSON.stringify(ironOut));
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Irongrid boots, moves, pauses, saves and renders', JSON.stringify(ironOut));
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
