/* Bannerfall art: heroes, minions, towers, banners and the jungle's beasts, drawn in code as
 * shaded sprites. Team pixels take blue or red from the sprite's tint, so one drawing serves
 * both sides. Frames face right; the scene mirrors them for facing left. A tile is 6 x 4. */
(function (global) {
  'use strict';
  const { Canvas, Atlas, hex, glow, team } = global.GlyphArt;
  const T = team(0.78), TD = team(0.5), TL = team(1);
  const C = {
    skin: hex('#e6b088'), skinDark: hex('#b07a56'), steel: hex('#c4ccd8'), steelDark: hex('#7c8696'), leather: hex('#7a5232'), leatherDark: hex('#4e3420'),
    wood: hex('#8a5e30'), string: hex('#e0d8c0'), boot: hex('#3a2a20'), cloak: hex('#3c4a3a'), cloakDark: hex('#283224'),
    robe: hex('#d8d0c0'), fire: glow(hex('#ffb040')), fireCore: glow(hex('#fff2a0')), shadow: hex('#2e2840'), shadowDark: hex('#1c1828'), blade: hex('#e0e6f0'),
    stone: hex('#8a8a96'), stoneDark: hex('#5a5a66'), stoneLight: hex('#b0b0bc'), crystal: glow(hex('#fff4c0')),
    fur: hex('#a07848'), furDark: hex('#6a4c2c'), eye: glow(hex('#ffd040')), tooth: hex('#f4efe0'),
    golem: hex('#7a6a8e'), golemDark: hex('#4e4260'), golemLight: hex('#a898bc'), rune: glow(hex('#c890ff')), black: hex('#141210')
  };

  // Shared hero legs: two frames of a stride.
  function legs(c, x, y, stride, colour = C.boot) {
    if (stride) c.rect(x, y, 1, 2, colour).rect(x + 3, y, 1, 2, colour).set(x - 1, y + 1, colour).set(x + 4, y + 1, colour);
    else c.rect(x + 1, y, 1, 2, colour).rect(x + 2, y, 1, 2, colour);
  }

  function warden(pose) {
    const c = new Canvas(9, 10), stride = pose === 'B';
    legs(c, 2, 8, stride);
    c.rect(1, 3, 5, 5, T).rect(1, 6, 5, 1, C.leather).rect(2, 3, 3, 2, C.steel);
    c.rect(2, 0, 3, 3, C.steel).rect(2, 2, 3, 1, C.steelDark).set(4, 1, C.black).set(1, 0, TL).set(1, 1, TL);
    // Tower shield in front, sword arm behind
    const sx = pose === 'A' ? 6 : 5;
    c.rect(sx, 2, 3, 6, C.steel).rect(sx + 1, 3, 1, 4, T).set(sx + 1, 4, TL);
    if (pose === 'A') c.line(5, 4, 8, 1, C.blade);
    return c.finish();
  }
  function ranger(pose) {
    const c = new Canvas(9, 10), stride = pose === 'B';
    legs(c, 2, 8, stride);
    c.rect(1, 3, 4, 5, C.cloak).rect(0, 4, 1, 4, C.cloakDark).rect(2, 3, 2, 4, T).rect(1, 6, 4, 1, C.leather);
    c.rect(1, 0, 4, 3, T).rect(2, 1, 2, 2, C.skin).set(3, 1, C.black).set(1, 2, TD);
    // Bow held forward; drawn back on attack
    const bx = pose === 'A' ? 6 : 5;
    c.line(bx + 1, 1, bx + 2, 4, C.wood).line(bx + 2, 4, bx + 1, 7, C.wood).line(bx + 1, 1, bx + 1, 7, C.string);
    if (pose === 'A') c.line(3, 4, 8, 4, C.string).set(8, 4, C.steel);
    c.rect(0, 2, 1, 3, C.leatherDark);
    return c.finish();
  }
  function ember(pose) {
    const c = new Canvas(9, 11), stride = pose === 'B';
    c.rect(1, 5, 5, 5, T).rect(0, 8, 7, 2, TD).rect(2, 5, 3, 1, C.robe);
    if (stride) c.set(1, 10, C.boot).set(5, 10, C.boot); else c.set(2, 10, C.boot).set(4, 10, C.boot);
    c.rect(2, 3, 3, 2, C.skin).set(4, 3, C.black);
    c.rect(1, 2, 5, 1, TD).rect(2, 1, 3, 1, T).set(3, 0, T).set(4, 0, TL);
    // Staff with a burning head
    const sx = pose === 'A' ? 7 : 6;
    c.line(sx, 3, sx, 10, C.wood).set(sx, 2, C.fire).set(sx, 1, C.fireCore);
    if (pose === 'A') c.set(sx + 1, 1, C.fire).set(sx + 1, 2, C.fireCore).set(sx - 1, 1, C.fire);
    return c.finish();
  }
  function shade(pose) {
    const c = new Canvas(9, 10), stride = pose === 'B';
    legs(c, 2, 8, stride, C.shadowDark);
    c.rect(1, 3, 5, 5, C.shadow).rect(1, 5, 5, 1, T).rect(0, 4, 1, 4, C.shadowDark);
    c.rect(2, 0, 3, 3, C.shadow).rect(3, 1, 2, 1, C.skin).set(4, 1, C.black).set(2, 0, C.shadowDark);
    // Twin daggers, lunging on attack
    if (pose === 'A') c.line(5, 4, 8, 2, C.blade).line(5, 6, 8, 6, C.blade);
    else c.line(5, 5, 7, 3, C.blade).set(0, 6, C.blade);
    return c.finish();
  }

  function melee(step) {
    const c = new Canvas(5, 6);
    c.set(step ? 1 : 2, 5, C.boot).set(step ? 3 : 2, 5, C.boot).set(1, 4, TD).set(3, 4, TD);
    c.rect(1, 2, 3, 2, T).rect(1, 0, 3, 2, C.steel).set(3, 1, C.black).line(4, 1, 4, 4, C.blade);
    return c.finish();
  }
  function ranged(step) {
    const c = new Canvas(5, 6);
    c.set(step ? 1 : 2, 5, C.boot).set(step ? 3 : 2, 5, C.boot);
    c.rect(1, 2, 3, 3, T).rect(1, 0, 3, 2, TD).set(2, 1, C.skin).set(3, 1, C.black);
    c.line(4, 0, 4, 5, C.wood).set(4, 0, C.fire);
    return c.finish();
  }
  function siege(step) {
    const c = new Canvas(9, 6);
    c.rect(0, 2, 8, 2, C.wood).rect(1, 1, 6, 1, C.leather).line(2, 1, 7, 0, C.leatherDark);
    c.rect(4, 0, 2, 1, T);
    const spoke = step ? C.steelDark : C.steel;
    c.ellipse(1.5, 4.5, 1.4, 1.4, C.steelDark).set(1, 4, spoke).ellipse(6.5, 4.5, 1.4, 1.4, C.steelDark).set(7, 5, spoke);
    return c.finish();
  }

  function tower(standing) {
    const c = new Canvas(10, 16);
    if (!standing) {
      c.rect(1, 12, 8, 4, C.stoneDark).rect(2, 11, 3, 1, C.stone).rect(6, 10, 2, 2, C.stone).set(4, 13, C.black);
      return c.finish();
    }
    c.rect(1, 6, 8, 10, C.stone).rect(1, 15, 8, 1, C.stoneDark);
    for (let y = 7; y < 15; y += 2) c.rect(1, y, 8, 1, C.stoneDark).set(y % 4 === 1 ? 4 : 6, y + 1, C.stoneDark);
    c.rect(0, 4, 10, 2, C.stoneLight).set(0, 3, C.stoneLight).set(3, 3, C.stoneLight).set(6, 3, C.stoneLight).set(9, 3, C.stoneLight);
    c.rect(4, 9, 2, 3, C.black).set(4, 9, T);
    // A team crystal burns on top
    c.rect(4, 1, 2, 2, TL).set(4, 0, T).set(5, 0, TL);
    return c.finish();
  }
  function banner(wave) {
    const c = new Canvas(14, 18);
    c.rect(2, 1, 1, 15, C.wood).set(2, 0, C.steelLight || C.steel);
    for (let y = 0; y < 7; y++) {
      const len = 9 - (wave ? (y % 3 === 1 ? 1 : 0) : (y % 3 === 2 ? 1 : 0));
      c.rect(3, 1 + y, len, 1, y === 3 ? TL : T);
    }
    c.rect(5, 3, 3, 3, TD).set(6, 4, TL);
    c.rect(0, 15, 6, 3, C.stone).rect(1, 14, 4, 1, C.stoneLight).rect(0, 17, 6, 1, C.stoneDark);
    return c.finish();
  }
  function beast(step) {
    const c = new Canvas(8, 6);
    c.set(step ? 1 : 2, 5, C.furDark).set(step ? 3 : 2, 5, C.furDark).set(step ? 5 : 6, 5, C.furDark);
    c.ellipse(3.5, 3, 3.4, 1.8, C.fur).rect(1, 4, 6, 1, C.furDark);
    c.rect(5, 1, 3, 2, C.fur).set(6, 0, C.furDark).set(6, 1, C.eye).set(7, 3, C.tooth).set(0, 2, C.furDark);
    return c.finish();
  }
  function colossus(slam) {
    const c = new Canvas(22, 16);
    c.rect(5, 12, 4, 4, C.golemDark).rect(13, 12, 4, 4, C.golemDark);
    c.ellipse(11, 8, 8, 5, C.golem).rect(6, 9, 10, 3, C.golemDark);
    c.rect(8, 2, 6, 5, C.golem).rect(9, 4, 1, 1, C.eye).rect(12, 4, 1, 1, C.eye).rect(9, 6, 4, 1, C.golemDark);
    c.set(11, 9, C.rune).set(10, 10, C.rune).set(12, 10, C.rune);
    if (slam) c.rect(0, 9, 4, 4, C.golemLight).rect(18, 9, 4, 4, C.golemLight).line(3, 7, 6, 7, C.golem).line(18, 7, 15, 7, C.golem);
    else c.rect(1, 4, 4, 4, C.golemLight).rect(17, 4, 4, 4, C.golemLight).line(4, 6, 6, 7, C.golem).line(17, 6, 15, 7, C.golem);
    return c.finish();
  }

  function build() {
    const atlas = new Atlas(), heroes = { warden, ranger, ember, shade };
    for (const [name, draw] of Object.entries(heroes)) for (const pose of ['', 'B', 'A']) atlas.add(name + pose, draw(pose));
    atlas.add('melee', melee(false)); atlas.add('meleeB', melee(true));
    atlas.add('ranged', ranged(false)); atlas.add('rangedB', ranged(true));
    atlas.add('siege', siege(false)); atlas.add('siegeB', siege(true));
    atlas.add('tower', tower(true)); atlas.add('rubble', tower(false));
    atlas.add('banner', banner(false)); atlas.add('bannerB', banner(true));
    atlas.add('beast', beast(false)); atlas.add('beastB', beast(true));
    atlas.add('colossus', colossus(false)); atlas.add('colossusB', colossus(true));
    return atlas;
  }

  global.BannerfallArt = { build };
})(window);
