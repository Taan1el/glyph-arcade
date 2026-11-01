'use strict';
// Plays each game for a fixed time and reports frame times at desktop size and at a throttled phone size.
const path = require('node:path');
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const { GAMES } = require('./build.cjs');

const SCENARIOS = [
  { name: 'desktop 1280x720', width: 1280, height: 720, throttle: 1 },
  { name: 'phone 360x640 4x CPU', width: 360, height: 640, throttle: 4 }
];
const SECONDS = Number(process.argv[2]) || 20;

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function measure(browser, game, scenario) {
  const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const cdp = await page.context().newCDPSession(page);
  await page.goto(pathToFileURL(path.join(__dirname, `../dist/${game.id}.html`)).href);
  await page.waitForTimeout(600);
  await page.click('#new-run');
  await page.waitForTimeout(300);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.throttle });
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = now => { window.__frames.push(now - last); last = now; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });

  const end = Date.now() + SECONDS * 1000;
  const keys = ['KeyW', 'KeyE', 'KeyW', 'KeyQ', 'KeyD', 'KeyA'];
  for (let i = 0; Date.now() < end; i++) {
    const key = keys[i % keys.length];
    await page.keyboard.down(key);
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
    await page.evaluate(() => {
      const app = window.delve || window.inkfire || window.wordfall;
      if (app?.mode && app.mode !== 'play') app.show?.('play');
    });
  }
  const frames = await page.evaluate(() => window.__frames.slice(30));
  const quality = await page.evaluate(() => (window.delve || window.inkfire || window.wordfall)?.quality?.level ?? 0);
  await page.close();
  const sorted = [...frames].sort((a, b) => a - b);
  const total = frames.reduce((a, b) => a + b, 0);
  return {
    game: game.id,
    scenario: scenario.name,
    frames: frames.length,
    avgMs: Number((total / frames.length).toFixed(2)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(2)),
    longFrames: frames.filter(f => f > 50).length,
    qualityLevel: quality,
    errors
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  try {
    for (const game of GAMES) for (const scenario of SCENARIOS) {
      const result = await measure(browser, game, scenario);
      results.push(result);
      console.log(`${result.game.padEnd(8)} ${result.scenario.padEnd(22)} avg ${result.avgMs}ms  p95 ${result.p95Ms}ms  long frames ${result.longFrames}/${result.frames}  quality ${result.qualityLevel}`);
      if (result.errors.length) console.log('  errors: ' + result.errors.join('; '));
    }
  } finally {
    await browser.close();
  }
  if (process.env.PERF_JSON) require('node:fs').writeFileSync(process.env.PERF_JSON, JSON.stringify(results, null, 2));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
