'use strict';
// Loads the arcade portal and every built game, starts gameplay, and fails on any console or page error.
const path = require('node:path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true });
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
    if (!portalInfo.cards.includes('delve.html') || !portalInfo.cards.includes('inkfire.html')) {
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
    if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('PASS Inkfire boots, plays, pauses/mutes and renders', JSON.stringify(inkfireOut));
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
