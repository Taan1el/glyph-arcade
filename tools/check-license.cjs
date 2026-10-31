'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GAMES } = require('./build.cjs');

const root = path.resolve(__dirname, '..');
const licensePath = path.join(root, 'LICENSE');
assert(fs.existsSync(licensePath), 'LICENSE file is missing');
const licenseText = fs.readFileSync(licensePath, 'utf8');
assert(licenseText.includes('MIT License'), 'LICENSE must be the MIT License');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.license, 'MIT', 'package.json license field must be MIT');

const distDir = path.join(root, 'dist');
if (fs.existsSync(distDir)) {
  for (const game of GAMES) {
    const htmlPath = path.join(distDir, `${game.id}.html`);
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      assert(html.includes('MIT License'), `dist/${game.id}.html is missing embedded MIT License`);
    }
  }
}

console.log('PASS MIT license verified across repository and built bundles.');
