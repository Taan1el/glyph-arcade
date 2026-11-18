/* Burrow art: the explorer, the night creatures and The Maw, drawn in code as small shaded
 * sprites. Every pixel becomes one tiny coloured letter on screen. Frames face right; the
 * scene mirrors them for facing left. A world tile is 6 x 4 letters. */
(function (global) {
  'use strict';
  const { Canvas, Atlas, hex, glow } = global.GlyphArt;
  const C = {
    skin: hex('#eab48a'), skinDark: hex('#b9825c'), hair: hex('#6a4022'), eye: hex('#1c1410'),
    shirt: hex('#3f8ad0'), shirtDark: hex('#285c90'), belt: hex('#7a4e26'), pants: hex('#6c5034'), boot: hex('#34261c'), pack: hex('#9a7438'),
    slime: hex('#62c84e'), slimeDark: hex('#3c8a30'), shine: hex('#d4ffaa'), white: hex('#f6f4ea'), black: hex('#141210'),
    rot: hex('#86ae64'), rotDark: hex('#56783e'), rags: hex('#5e5870'), ragsDark: hex('#3c3848'), redEye: glow(hex('#ff4a32')),
    wing: hex('#7a52a0'), wingDark: hex('#4a3264'), fang: hex('#f2ece0'),
    shell: hex('#949cab'), shellDark: hex('#5e6474'), leg: hex('#4a505c'), venom: glow(hex('#ff6a3a')),
    imp: hex('#d6502e'), impDark: hex('#8e2c1a'), horn: hex('#f0d090'), fire: glow(hex('#ffb040')),
    maw: hex('#b84c6c'), mawDark: hex('#7a2a44'), belly: hex('#e6965e'), plate: hex('#5a2438'), tooth: hex('#f4efe0'), mawEye: glow(hex('#ffe23a')),
    steel: hex('#d4dce6'), steelDark: hex('#8a94a4'), hilt: hex('#7a5030')
  };

  // The explorer: 7 x 9, feet on the bottom row, facing right.
  function explorer(pose) {
    const c = new Canvas(7, 9);
    const feet = { idle: [2, 4], walkA: [1, 5], walkB: [2, 3], jump: [1, 5], climb: [2, 4] }[pose];
    for (const x of feet) c.rect(x, 6, 1, pose === 'jump' ? 2 : 2, C.pants).set(x, pose === 'jump' ? 7 : 8, C.boot);
    if (pose !== 'jump') c.rect(feet[0], 8, 1, 1, C.boot).rect(feet[1], 8, 2, 1, C.boot);
    c.rect(0, 3, 1, 3, C.pack);
    c.rect(1, 3, 4, 3, C.shirt).rect(1, 3, 1, 3, C.shirtDark).rect(1, 5, 4, 1, C.belt);
    if (pose === 'climb' || pose === 'jump') c.set(0, 2, C.skin).set(5, 2, C.skin);
    else c.rect(5, 3, 1, 2, C.shirtDark).set(5, 5, C.skin);
    c.rect(2, 1, 3, 2, C.skin).set(4, 1, C.eye).set(5, 2, C.skin);
    c.rect(1, 0, 4, 1, C.hair).set(1, 1, C.hair).set(2, 1, C.hair);
    return c.finish();
  }

  function slime(hop) {
    const c = new Canvas(8, 5);
    if (hop) c.ellipse(3.5, 2, 3.4, 2, C.slime).rect(1, 2, 6, 2, C.slime);
    else c.ellipse(3.5, 2.8, 3.8, 2.2, C.slime).rect(0, 3, 8, 1, C.slime).rect(0, 4, 8, 1, C.slimeDark);
    const y = hop ? 1 : 2;
    c.set(2, y, C.white).set(5, y, C.white).set(2, y + 1, C.black).set(5, y + 1, C.black).set(1, y - 1, C.shine);
    return c.finish();
  }

  function zombie(step) {
    const c = new Canvas(7, 9);
    c.rect(step ? 1 : 2, 6, 1, 3, C.ragsDark).rect(step ? 4 : 3, 6, 1, 3, C.ragsDark);
    c.rect(1, 3, 4, 3, C.rags).set(2, 4, C.rotDark).rect(1, 5, 4, 1, C.ragsDark);
    c.rect(4, 3, 3, 1, C.rot).rect(4, 4, 2, 1, C.rotDark);
    c.rect(2, 0, 3, 3, C.rot).set(4, 1, C.redEye).set(2, 0, C.rotDark).rect(2, 2, 3, 1, C.rotDark);
    return c.finish();
  }

  function bat(up) {
    const c = new Canvas(9, 5);
    for (let i = 0; i < 3; i++) {
      const y = up ? 2 - i : 1 + i;
      c.rect(3 - i - 1, y, 1, 2, i === 2 ? C.wingDark : C.wing).rect(5 + i + 1, y, 1, 2, i === 2 ? C.wingDark : C.wing);
    }
    c.rect(3, 1, 3, 3, C.wingDark).set(3, 0, C.wingDark).set(5, 0, C.wingDark);
    c.set(3, 2, C.redEye).set(5, 2, C.redEye).set(4, 4, C.fang);
    return c.finish();
  }

  function crawler(step) {
    const c = new Canvas(10, 5);
    for (let i = 0; i < 3; i++) {
      const x = 1 + i * 3, out = (i + (step ? 1 : 0)) % 2;
      c.set(x + out, 4, C.leg).set(x + 1, 3, C.leg).set(x + 2 - out, 4, C.leg);
    }
    c.ellipse(4.5, 1.6, 4.4, 1.8, C.shell).rect(1, 2, 8, 1, C.shellDark).set(3, 0, C.shellDark).set(6, 0, C.shellDark);
    c.rect(8, 1, 2, 2, C.shellDark).set(9, 1, C.venom);
    return c.finish();
  }

  function imp(step) {
    const c = new Canvas(7, 7);
    c.set(step ? 2 : 3, 6, C.impDark).set(step ? 4 : 3, 6, C.impDark).set(step ? 2 : 2, 5, C.impDark).set(4, 5, C.impDark);
    c.rect(2, 3, 3, 2, C.imp).set(1, 3, C.impDark).set(5, 3, C.impDark);
    c.rect(2, 1, 3, 2, C.imp).set(2, 0, C.horn).set(4, 0, C.horn).set(4, 1, C.fire);
    c.set(6, 3, C.fire).set(6, 2, C.fire);
    return c.finish();
  }

  function mawHead(open) {
    const c = new Canvas(16, 11);
    c.ellipse(7.5, 5.5, 7.4, 5.2, C.maw).ellipse(7.5, 8, 5.5, 2.4, C.belly);
    for (let x = 3; x < 14; x += 3) c.rect(x, 0, 2, 1, C.plate);
    c.rect(10, 3, 2, 2, C.mawEye).set(11, 4, C.black).rect(3, 3, 2, 2, C.mawEye).set(3, 4, C.black);
    const jaw = open ? 3 : 1;
    c.rect(3, 7, 10, jaw, C.black);
    for (let x = 3; x < 13; x += 2) c.set(x, 7, C.tooth).set(x + 1, 6 + jaw, C.tooth);
    return c.finish();
  }

  function mawBody(pulse) {
    const c = new Canvas(14, 9);
    c.ellipse(6.5, 4.5, 6.8, 4.2, C.maw).ellipse(6.5, 6.5, 5.5, 1.8, C.belly);
    for (let x = 1; x < 13; x += 3) c.rect(x + (pulse ? 1 : 0), 0, 2, 1, C.plate).set(x + 1, 2, C.mawDark);
    return c.finish();
  }

  function sword() {
    const c = new Canvas(6, 5);
    c.line(1, 4, 5, 0, C.steel).line(2, 4, 5, 1, C.steelDark).rect(0, 3, 2, 1, C.hilt).set(0, 4, C.hilt);
    return c.finish({ outline: [0.1, 0.1, 0.12] });
  }

  function build() {
    const atlas = new Atlas();
    for (const pose of ['idle', 'walkA', 'walkB', 'jump', 'climb']) atlas.add(pose, explorer(pose));
    atlas.add('slime', slime(false));
    atlas.add('slimeHop', slime(true));
    atlas.add('zombie', zombie(false));
    atlas.add('zombieB', zombie(true));
    atlas.add('bat', bat(true));
    atlas.add('batB', bat(false));
    atlas.add('crawler', crawler(false));
    atlas.add('crawlerB', crawler(true));
    atlas.add('imp', imp(false));
    atlas.add('impB', imp(true));
    atlas.add('mawHead', mawHead(false));
    atlas.add('mawHeadOpen', mawHead(true));
    atlas.add('mawBody', mawBody(false));
    atlas.add('mawBodyB', mawBody(true));
    atlas.add('sword', sword());
    return atlas;
  }

  global.BurrowArt = { build };
})(window);
