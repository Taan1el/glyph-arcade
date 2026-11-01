'use strict';
// Measures the touch HUD in both games at phone sizes and fails on overlaps or undersized tap targets.
const path = require('node:path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');

const VIEWPORTS = [
  { name: 'portrait', width: 360, height: 640 },
  { name: 'landscape', width: 844, height: 390 }
];
const REGIONS = ['.stats', '#minimap', '#log', '#touch .pad', '#touch .side'];

async function check(browser, game, viewport, problems) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.join(__dirname, `../dist/${game}.html`)).href);
  await page.waitForTimeout(500);
  await page.tap('#new-run');
  await page.waitForTimeout(300);
  await page.evaluate(game => {
    const app = window[game];
    app.enableTouch();
    for (let i = 0; i < 4; i++) app.log?.('You hit the skeleton for four damage.');
  }, game);
  await page.waitForTimeout(200);

  const result = await page.evaluate(selectors => {
    const rects = {};
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node) { const r = node.getBoundingClientRect(); rects[selector] = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }
    }
    const small = [...document.querySelectorAll('#touch button:not(.blank), #hud button')]
      .map(b => { const r = b.getBoundingClientRect(); return { label: b.textContent.trim().slice(0, 12), width: r.width, height: r.height }; })
      .filter(b => b.width && (b.width < 44 || b.height < 44));
    return { rects, small };
  }, REGIONS);

  const names = Object.keys(result.rects);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = result.rects[names[i]], b = result.rects[names[j]];
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        problems.push(`${game} ${viewport.name}: ${names[i]} overlaps ${names[j]}`);
      }
    }
    const r = result.rects[names[i]];
    if (r.left < 0 || r.top < 0 || r.right > viewport.width || r.bottom > viewport.height) {
      problems.push(`${game} ${viewport.name}: ${names[i]} leaves the screen`);
    }
  }
  for (const b of result.small) problems.push(`${game} ${viewport.name}: button "${b.label}" is ${b.width}x${b.height}`);
  if (process.argv[2]) await page.screenshot({ path: path.join(process.argv[2], `${game}-${viewport.name}.png`) });
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const problems = [];
  try {
    for (const game of ['delve', 'inkfire', 'wordfall']) for (const viewport of VIEWPORTS) await check(browser, game, viewport, problems);
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('PASS Touch HUD has no overlaps and every tap target is at least 44px');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
