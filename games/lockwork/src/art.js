/* Lockwork art: the engineer and every clockwork mechanism, drawn in code as shaded sprites
 * that fill one 12 x 8 tile. Emitter lenses and receptor rings are team pixels so the scene
 * tints them amber or cyan; glowing parts are self-lit. */
(function (global) {
  'use strict';
  const { Canvas, Atlas, hex, glow, team } = global.GlyphArt;
  const C = {
    brass: hex('#c89a40'), brassDark: hex('#7a5a24'), brassLight: hex('#f0c870'), iron: hex('#4a4440'), ironDark: hex('#2a2624'),
    wood: hex('#9a6a34'), woodDark: hex('#5e3e1c'), glass: hex('#c8e4f0'), glassDark: hex('#6a90a8'),
    skin: hex('#e6b088'), suit: hex('#6a4a2e'), suitDark: hex('#3e2a18'), goggle: glow(hex('#9af0ff')), boot: hex('#2a2020'),
    crystal: glow(hex('#ffe0a0')), violet: hex('#8a5ab8'), violetGlow: glow(hex('#d8a0ff')), off: hex('#5a5048'), spark: glow(hex('#fff4c0'))
  };
  const LENS = team(1), LENS_DIM = team(0.45);

  function engineer() {
    const c = new Canvas(9, 8);
    c.rect(2, 6, 2, 2, C.boot).rect(5, 6, 2, 2, C.boot);
    c.rect(1, 3, 7, 3, C.suit).rect(1, 5, 7, 1, C.suitDark).rect(0, 3, 1, 2, C.brass).rect(8, 3, 1, 2, C.brass).set(4, 4, C.brassLight);
    c.rect(2, 0, 5, 3, C.skin).rect(2, 0, 5, 1, C.suitDark).rect(2, 1, 2, 1, C.goggle).rect(5, 1, 2, 1, C.goggle);
    return c.finish();
  }
  function crate() {
    const c = new Canvas(12, 8);
    c.rect(0, 0, 12, 8, C.wood);
    for (let y = 1; y < 8; y += 2) c.rect(1, y, 10, 1, C.woodDark);
    c.line(1, 1, 10, 6, C.woodDark).rect(0, 0, 2, 2, C.brass).rect(10, 0, 2, 2, C.brass).rect(0, 6, 2, 2, C.brass).rect(10, 6, 2, 2, C.brass);
    return c.finish();
  }
  function bridge() {
    const c = new Canvas(12, 8);
    c.rect(4, 0, 4, 8, C.brassDark).rect(0, 3, 12, 2, C.brassDark).rect(5, 0, 2, 8, C.brass).rect(0, 3, 12, 1, C.brass).rect(4, 2, 4, 4, C.brassLight);
    return c.finish();
  }
  function pipe(vertical) {
    const c = new Canvas(12, 8);
    if (vertical) c.rect(4, 0, 4, 8, C.brass).rect(4, 0, 1, 8, C.brassLight).rect(3, 0, 6, 1, C.brassDark).rect(3, 7, 6, 1, C.brassDark);
    else c.rect(0, 2, 12, 4, C.brass).rect(0, 2, 12, 1, C.brassLight).rect(0, 1, 1, 6, C.brassDark).rect(11, 1, 1, 6, C.brassDark);
    return c.finish();
  }
  function mirror(rot) {
    const c = new Canvas(12, 8);
    c.ellipse(5.5, 6.5, 4, 1.2, C.iron);
    // rot 0 is '/', rot 1 is '\'
    for (let i = 0; i < 8; i++) {
      const x = rot === 0 ? Math.round(9 - i * 1.15) : Math.round(2 + i * 1.15);
      c.rect(x, i, 2, 1, C.glass).set(x + (rot === 0 ? 2 : -1), i, C.brassDark);
    }
    return c.finish();
  }
  function splitter(rot) {
    // rot names the blocked side: 0 up, 1 right, 2 down, 3 left.
    const c = new Canvas(12, 8);
    c.ellipse(5.5, 3.5, 3.4, 2.6, C.violet).ellipse(5.5, 3.5, 1.8, 1.2, C.violetGlow);
    if (rot === 0) c.rect(1, 0, 10, 1, C.iron);
    if (rot === 1) c.rect(11, 0, 1, 8, C.iron);
    if (rot === 2) c.rect(1, 7, 10, 1, C.iron);
    if (rot === 3) c.rect(0, 0, 1, 8, C.iron);
    return c.finish();
  }
  function emitter(dir) {
    const c = new Canvas(12, 8);
    c.rect(1, 1, 10, 6, C.iron).rect(2, 2, 8, 4, C.ironDark).rect(4, 3, 4, 2, LENS);
    if (dir === 0) c.rect(4, 0, 4, 1, LENS);
    if (dir === 1) c.rect(11, 3, 1, 2, LENS);
    if (dir === 2) c.rect(4, 7, 4, 1, LENS);
    if (dir === 3) c.rect(0, 3, 1, 2, LENS);
    c.set(1, 1, C.brass).set(10, 1, C.brass).set(1, 6, C.brass).set(10, 6, C.brass);
    return c.finish();
  }
  function coil(on) {
    const c = new Canvas(12, 8);
    for (let y = 1; y < 7; y += 2) c.rect(3, y, 6, 1, on ? C.brassLight : C.brassDark);
    c.rect(5, 0, 2, 8, C.iron);
    if (on) c.set(2, 0, C.spark).set(9, 7, C.spark).set(10, 1, C.spark).set(1, 6, C.spark);
    return c.finish();
  }
  const DIGITS = { 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'] };
  function capacitor(delay) {
    const c = new Canvas(12, 8);
    c.rect(1, 1, 10, 6, C.brassDark).rect(2, 2, 8, 4, C.ironDark);
    DIGITS[delay].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') c.set(5 + x, 1 + y, C.crystal); }));
    return c.finish();
  }
  function inverter(on) {
    const c = new Canvas(12, 8);
    c.rect(2, 1, 8, 6, on ? C.brass : C.off).rect(3, 2, 6, 4, C.ironDark);
    c.rect(5, 2, 2, 2, on ? C.spark : C.violet).set(5, 5, on ? C.spark : C.violet).set(6, 5, on ? C.spark : C.violet);
    return c.finish();
  }
  function receptor(on) {
    const c = new Canvas(12, 8), ring = on ? LENS : LENS_DIM;
    c.ellipse(5.5, 3.5, 5, 3.4, C.iron).ellipse(5.5, 3.5, 4, 2.6, ring).ellipse(5.5, 3.5, 2.2, 1.4, on ? C.spark : C.ironDark);
    return c.finish();
  }

  function build() {
    const atlas = new Atlas();
    atlas.add('player', engineer());
    atlas.add('crate', crate());
    atlas.add('bridge', bridge());
    atlas.add('pipeH', pipe(false));
    atlas.add('pipeV', pipe(true));
    for (const rot of [0, 1]) atlas.add('mir' + rot, mirror(rot));
    for (const rot of [0, 1, 2, 3]) atlas.add('spl' + rot, splitter(rot));
    for (const dir of [0, 1, 2, 3]) atlas.add('gen' + dir, emitter(dir));
    atlas.add('pulseOn', coil(true));
    atlas.add('pulseOff', coil(false));
    atlas.add('cap1', capacitor(1));
    atlas.add('cap2', capacitor(2));
    atlas.add('invOn', inverter(true));
    atlas.add('invOff', inverter(false));
    atlas.add('recOn', receptor(true));
    atlas.add('recOff', receptor(false));
    return atlas;
  }

  global.LockworkArt = { build };
})(window);
