/* Ricochet art: the four court athletes and the disc, drawn in code as shaded sprites.
 * Jerseys are team pixels, so the scene tints them blue for you and red for the rival.
 * Frames face right; the scene mirrors them for the rival. A tile is 8 x 5 letters. */
(function (global) {
  'use strict';
  const { Canvas, Atlas, hex, glow, team } = global.GlyphArt;
  const J = team(0.8), JD = team(0.5), JL = team(1);
  const C = {
    skin: hex('#e6b088'), skinDark: hex('#a8724e'), hair: hex('#3a2416'), shoe: hex('#f0f0f0'), sole: hex('#3a3a44'), shorts: hex('#2a2e3c'),
    pad: hex('#c8ccd8'), visor: glow(hex('#9af0ff')), band: hex('#f4f0e0'), cap: hex('#f0c040'), disc: glow(hex('#ffe070')), discCore: glow(hex('#fff8d0')),
    crit: glow(hex('#ff5038')), critCore: glow(hex('#ffd0a0')), charge: glow(hex('#ffa030'))
  };

  // A body in one of six poses; the archetype adds its own head and build.
  function athlete(kind, pose) {
    const bulky = kind === 'bastion', c = new Canvas(bulky ? 10 : 9, 10), ox = bulky ? 1 : 0;
    // Legs
    const stance = { idle: [2, 5], walkA: [1, 6], walkB: [3, 4], hold: [2, 5], throw: [1, 6], dash: [0, 6] }[pose];
    for (const x of stance) c.rect(x + ox, 7, 1, 2, C.skinDark).rect(x + ox, 9, 2, 1, C.shoe);
    c.rect(2 + ox, 6, 4, 1, C.shorts);
    // Torso in team colours
    c.rect(2 + ox, 3, 4, 3, J).rect(2 + ox, 3, 1, 3, JD).set(4 + ox, 4, JL);
    if (bulky) c.rect(0, 3, 2, 2, C.pad).rect(7, 3, 2, 2, C.pad);
    // Arms by pose
    if (pose === 'hold') c.rect(6 + ox, 4, 2, 1, C.skin).rect(1 + ox, 4, 1, 2, C.skin);
    else if (pose === 'throw') c.line(6 + ox, 3, 8 + ox, 1, C.skin).rect(1 + ox, 4, 1, 2, C.skin);
    else if (pose === 'dash') c.line(6 + ox, 4, 8 + ox, 4, C.skin).line(1 + ox, 4, 0, 5, C.skin);
    else c.rect(6 + ox, 3, 1, 3, C.skin).rect(1 + ox, 3, 1, 3, C.skin);
    // Head
    c.rect(3 + ox, 0, 3, 3, C.skin).set(5 + ox, 1, C.hair);
    if (kind === 'striker') c.rect(3, 0, 3, 1, C.hair).rect(3, 1, 3, 1, C.band).set(2, 1, C.band);
    else if (kind === 'spinner') c.rect(2, 0, 5, 1, C.cap).set(7, 1, C.cap).set(3, 1, C.hair);
    else if (kind === 'bastion') c.rect(4, 0, 3, 1, C.pad).set(3, 1, C.pad);
    else c.rect(3, 0, 4, 2, JD).rect(4, 1, 3, 1, C.visor);
    return c.finish();
  }

  function disc(kind) {
    const c = new Canvas(4, 3), rim = kind === 'crit' ? C.crit : kind === 'charged' ? C.charge : C.disc, core = kind === 'crit' ? C.critCore : C.discCore;
    c.rect(1, 0, 2, 1, rim).rect(0, 1, 4, 1, rim).rect(1, 2, 2, 1, rim).rect(1, 1, 2, 1, core);
    return c.finish({ outline: false, shade: false });
  }

  function build() {
    const atlas = new Atlas();
    for (const kind of ['striker', 'spinner', 'bastion', 'phantom']) {
      for (const pose of ['idle', 'walkA', 'walkB', 'hold', 'throw', 'dash']) atlas.add(`${kind}.${pose}`, athlete(kind, pose));
    }
    atlas.add('disc', disc('plain'));
    atlas.add('discHalo', disc('charged'));
    atlas.add('discCrit', disc('crit'));
    return atlas;
  }

  global.RicochetArt = { build };
})(window);
