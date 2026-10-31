'use strict';
// Renders launcher/social preview images by staging a scene in each built game.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { buildLauncher } = require('./build.cjs');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist/previews');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    // 1. Capture Delve preview
    await page.goto(pathToFileURL(path.join(root, 'dist/delve.html')).href);
    await page.waitForFunction(() => window.delve);
    await page.evaluate(() => {
      const D = window.Delve, app = window.delve, state = D.newRun('preview-room');
      const room = state.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0], wide = room.w >= room.h;
      const p = state.player; p.facing = wide ? 1 : 2; p.x = wide ? room.x : room.cx; p.y = wide ? room.cy : room.y;
      const [dx, dy] = D.DIRS[p.facing], at = (n, side = 0) => ({ x: p.x + dx * n + (wide ? 0 : side), y: p.y + dy * n + (wide ? side : 0) });
      const put = (kind, n, side) => {
        const c = at(n, side);
        if (D.passable(D.tileAt(state, c.x, c.y))) {
          state.monsters.push({ id: state.nextId++, kind, ...c, hp: 9, maxHp: 9, atk: 2, def: 0, seen: null, cooldown: 0 });
        }
      };
      state.monsters = []; state.items = [];
      put('skeleton', 4, 0); put('goblin', 2, 1); put('bat', 3, -1);
      for (const [kind, n, side, extra] of [['gold', 1, -1, { amount: 9 }], ['potion', 2, -1, {}], ['weapon', 3, 1, { tier: 2 }]]) {
        const c = at(n, side);
        if (D.passable(D.tileAt(state, c.x, c.y))) state.items.push({ id: state.nextId++, kind, ...c, ...extra });
      }
      app.start(state);
      document.getElementById('toast').classList.remove('visible');
    });
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, 'delve.png') });
    console.log('Wrote dist/previews/delve.png');

    // 2. Capture Inkfire preview
    await page.goto(pathToFileURL(path.join(root, 'dist/inkfire.html')).href);
    await page.waitForFunction(() => window.inkfire);
    await page.evaluate(() => {
      const I = window.Inkfire, app = window.inkfire, state = I.newGame('preview-sector');
      const room = state.rooms.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const wide = room.w >= room.h;
      const p = state.player;
      p.x = (wide ? room.x + 1.5 : room.cx + 0.5);
      p.y = (wide ? room.cy + 0.5 : room.y + 1.5);
      p.angle = wide ? 0 : Math.PI / 2;
      p.weapons.shotgun = true;
      p.weapon = 'shotgun';
      p.ammo.shells = 24;

      const fwdX = Math.cos(p.angle), fwdY = Math.sin(p.angle);
      const sideX = -fwdY, sideY = fwdX;
      const at = (n, s) => ({ x: p.x + fwdX * n + sideX * s, y: p.y + fwdY * n + sideY * s });

      state.monsters = [
        { id: state.nextId++, kind: 'spitter', ...at(3.6, -0.8), angle: Math.PI, hp: 60, maxHp: 60, state: 'attack', frame: 'attack', animTimer: 10, cooldown: 10, flash: 0 },
        { id: state.nextId++, kind: 'trooper', ...at(2.8, 0.9), angle: Math.PI, hp: 30, maxHp: 30, state: 'chase', frame: 'walk0', animTimer: 10, cooldown: 10, flash: 0 },
        { id: state.nextId++, kind: 'brute', ...at(5.0, 0.1), angle: Math.PI, hp: 160, maxHp: 160, state: 'chase', frame: 'walk1', animTimer: 10, cooldown: 10, flash: 0 }
      ];
      state.barrels = [
        { id: state.nextId++, ...at(3.2, 0.0), hp: 20, dead: false, radius: 0.35 }
      ];
      state.items = [
        { id: state.nextId++, kind: 'medkit', ...at(1.8, -0.7), collected: false },
        { id: state.nextId++, kind: 'key.red', ...at(2.1, 0.6), collected: false }
      ];
      app.start(state);
      // Pause monster movement on the staged frame while still rendering the 3D scene
      app.mode = 'pause';
      document.getElementById('pause').hidden = true;
      document.getElementById('toast').classList.remove('visible');
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, 'inkfire.png') });
    console.log('Wrote dist/previews/inkfire.png');

    // Rebuild launcher so dist/index.html embeds the newly generated preview images
    buildLauncher({ siteUrl: process.env.PAGES_URL || '' });
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
