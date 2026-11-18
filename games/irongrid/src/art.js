/* Irongrid art: steam-walker rigs, hive insects, relays and the supply train, drawn in code
 * as shaded sprites that fill one 18 x 11 board square (the Brood Queen fills two). Rig
 * hulls are team pixels so the scene can show selected, ready and spent rigs. */
(function (global) {
  'use strict';
  const { Canvas, Atlas, hex, glow, team } = global.GlyphArt;
  const H = team(0.78), HD = team(0.5), HL = team(1);
  const C = {
    steel: hex('#9aa8b8'), steelDark: hex('#5c6878'), iron: hex('#3c4654'), brass: hex('#d0a040'), brassDark: hex('#8a6420'),
    glass: glow(hex('#8ef0ff')), steam: hex('#e0e8f0'), fire: glow(hex('#ffb040')), barrel: hex('#4a5260'),
    shell: hex('#5aa83c'), shellDark: hex('#2e6a22'), shellLight: hex('#8ad25c'), belly: hex('#c8d860'), eye: glow(hex('#ff5030')),
    acid: glow(hex('#c8ff60')), claw: hex('#d8c070'), wing: hex('#c8e8f0'), stripe: hex('#e8c030'), black: hex('#16181c'),
    queen: hex('#a85030'), queenDark: hex('#6a2a18'), queenLight: hex('#e08050'), egg: hex('#e8e0b0'), eggGlow: glow(hex('#d0ff70')),
    coil: glow(hex('#ffe060')), pylon: hex('#7a6a40'), boiler: hex('#4a4a52'), rail: hex('#8a7a60')
  };

  // Two jointed walker legs with feet, under a hull.
  function walkerLegs(c, xs) {
    for (const x of xs) c.line(x, 6, x - 1, 9, C.iron).rect(x - 2, 9, 3, 1, C.steelDark).set(x, 6, C.brass);
  }
  function titan() {
    const c = new Canvas(16, 10);
    walkerLegs(c, [5, 11]);
    c.rect(2, 2, 12, 5, H).rect(2, 6, 12, 1, HD).rect(3, 1, 10, 1, HL);
    c.rect(6, 3, 4, 2, C.glass).rect(1, 3, 2, 3, C.steel).rect(13, 3, 2, 3, C.steel);
    c.rect(4, 0, 1, 2, C.iron).set(4, 0, C.steam).set(11, 4, C.brass).set(4, 4, C.brass);
    return c.finish();
  }
  function howitzer() {
    const c = new Canvas(16, 10);
    walkerLegs(c, [5, 10]);
    c.rect(3, 3, 9, 4, H).rect(3, 6, 9, 1, HD).rect(4, 2, 7, 1, HL);
    c.line(9, 3, 15, 0, C.barrel).line(9, 4, 15, 1, C.barrel).set(15, 0, C.fire);
    c.rect(5, 4, 2, 2, C.glass).rect(2, 4, 1, 2, C.brass);
    return c.finish();
  }
  function aegis() {
    const c = new Canvas(16, 10);
    // Hovering: no legs, emitter wings and a downward thrust glow.
    c.rect(0, 3, 4, 2, C.steel).rect(12, 3, 4, 2, C.steel).set(0, 2, C.glass).set(15, 2, C.glass);
    c.ellipse(8, 4.5, 4.5, 3, H).rect(4, 6, 8, 1, HD).rect(6, 2, 4, 1, HL);
    c.rect(7, 3, 2, 2, C.glass).set(6, 8, C.fire).set(9, 8, C.fire).set(7, 9, C.steam).set(8, 9, C.steam);
    return c.finish();
  }
  function pincer() {
    const c = new Canvas(16, 10);
    for (const x of [4, 7, 10]) c.line(x, 6, x - 2, 9, C.shellDark).line(x + 1, 6, x + 3, 9, C.shellDark);
    c.ellipse(8, 4.5, 5, 2.6, C.shell).rect(4, 5, 8, 1, C.shellDark).rect(6, 2, 4, 1, C.shellLight);
    c.line(12, 3, 15, 1, C.claw).line(12, 5, 15, 7, C.claw).set(15, 0, C.claw).set(15, 8, C.claw);
    c.set(12, 4, C.eye).set(11, 3, C.eye);
    return c.finish();
  }
  function spitter() {
    const c = new Canvas(16, 10);
    for (const x of [5, 9]) c.line(x, 7, x - 1, 9, C.shellDark).line(x + 2, 7, x + 3, 9, C.shellDark);
    c.ellipse(7, 4, 5, 3.5, C.shell).ellipse(7, 4, 3, 2, C.acid).rect(3, 6, 8, 1, C.shellDark);
    c.rect(11, 3, 3, 2, C.shellDark).set(13, 3, C.eye).set(14, 4, C.acid).set(15, 4, C.acid);
    return c.finish();
  }
  function beetle() {
    const c = new Canvas(16, 10);
    for (const x of [4, 7, 10]) c.line(x, 7, x - 1, 9, C.black).line(x + 1, 7, x + 2, 9, C.black);
    c.ellipse(7.5, 4.5, 6.5, 3.2, C.shellDark).rect(7, 1, 1, 7, C.black).ellipse(5, 3.5, 2, 1.2, C.shellLight).ellipse(10, 3.5, 2, 1.2, C.shellLight);
    c.rect(13, 3, 2, 3, C.shell).line(14, 3, 15, 0, C.claw).set(14, 4, C.eye);
    return c.finish();
  }
  function webber() {
    const c = new Canvas(16, 10);
    for (let i = 0; i < 4; i++) {
      c.line(6, 4, 1 + i, 9 - (i % 2), C.black).line(10, 4, 14 - i, 9 - (i % 2), C.black);
      c.line(6, 4, 1 + i, 0 + (i % 2), C.black).line(10, 4, 14 - i, 0 + (i % 2), C.black);
    }
    c.ellipse(8, 4.5, 3.5, 2.6, C.shell).ellipse(8, 4.5, 2, 1.2, C.belly).set(7, 3, C.eye).set(9, 3, C.eye);
    return c.finish();
  }
  function hornet() {
    const c = new Canvas(16, 10);
    c.ellipse(5, 2, 3.5, 1.6, C.wing).ellipse(11, 2, 3.5, 1.6, C.wing);
    c.ellipse(8, 5.5, 5, 2, C.stripe);
    for (let x = 5; x < 12; x += 2) c.rect(x, 4, 1, 3, C.black);
    c.rect(12, 4, 3, 3, C.shellDark).set(13, 5, C.eye).line(3, 6, 1, 8, C.black).set(0, 8, C.claw);
    return c.finish();
  }
  function queen() {
    const c = new Canvas(34, 10);
    for (let x = 6; x < 30; x += 4) c.line(x, 7, x - 2, 9, C.queenDark).line(x + 1, 7, x + 3, 9, C.queenDark);
    c.ellipse(12, 5, 11, 4.2, C.queen).ellipse(12, 6.5, 8, 2, C.queenLight);
    for (let x = 4; x < 22; x += 4) c.rect(x, 2, 2, 1, C.queenDark);
    c.ellipse(26, 4.5, 6, 3.6, C.queenDark).ellipse(26, 4, 4, 2.4, C.queen);
    c.rect(28, 3, 2, 1, C.eye).rect(24, 3, 2, 1, C.eye).line(31, 5, 33, 7, C.claw).line(31, 3, 33, 1, C.claw);
    c.set(10, 5, C.acid).set(14, 5, C.acid);
    return c.finish();
  }
  function egg() {
    const c = new Canvas(16, 10);
    c.ellipse(8, 5, 4, 4, C.egg).ellipse(8, 5.5, 2.4, 2.4, C.eggGlow).rect(4, 9, 8, 1, C.shellDark);
    c.set(6, 3, C.steam);
    return c.finish();
  }
  function relay() {
    const c = new Canvas(16, 10);
    c.rect(3, 8, 10, 2, C.pylon).rect(4, 7, 8, 1, C.brassDark);
    c.line(5, 7, 7, 1, C.brass).line(10, 7, 8, 1, C.brass).line(6, 4, 9, 4, C.brassDark);
    c.ellipse(8, 1.5, 2.5, 1.5, C.coil).set(5, 0, C.coil).set(11, 0, C.coil);
    return c.finish();
  }
  function train() {
    const c = new Canvas(18, 10);
    c.rect(0, 8, 18, 1, C.rail).rect(1, 3, 12, 5, C.boiler).rect(13, 1, 4, 7, C.queenDark).rect(14, 2, 2, 2, C.glass);
    c.rect(3, 1, 2, 2, C.iron).set(3, 0, C.steam).set(4, 0, C.steam).rect(1, 5, 12, 1, C.brass);
    for (const x of [3, 7, 11, 15]) c.ellipse(x, 8.5, 1.4, 1.2, C.black);
    c.set(0, 5, C.fire);
    return c.finish();
  }

  function build() {
    const atlas = new Atlas();
    const frames = { titan, howitzer, aegis, pincer, spitter, beetle, webber, hornet, queen, egg, relay, train };
    for (const [name, draw] of Object.entries(frames)) atlas.add(name, draw());
    return atlas;
  }

  global.IrongridArt = { build };
})(window);
