/* Joyride art: cars rendered top-down from their outline at 16 headings, people seen from
 * above, and mission markers. A world tile is 6 x 4 letters, so art pixels are 1/6 of a tile
 * across and 1/4 of a tile down; the car renderer works in tile units to keep shapes true. */
(function (global) {
  'use strict';
  const { Canvas, Atlas, hex, glow, team } = global.GlyphArt;
  const HEADINGS = 16, CELL_X = 6, CELL_Y = 4;

  // Length and width in tiles, body colours, and a mark that tells the kinds apart.
  const CARS = {
    compact: { length: 1.5, width: 0.85, body: hex('#4ab0e0'), roof: hex('#7ccaf0') },
    sedan: { length: 1.75, width: 0.9, body: hex('#e8e4d8'), roof: hex('#f8f6ee') },
    van: { length: 2.0, width: 0.95, body: hex('#9aa2b0'), roof: hex('#c0c6d0'), van: true },
    sports: { length: 1.8, width: 0.85, body: hex('#e0402c'), roof: hex('#f06a50'), stripe: hex('#fff2e0') },
    taxi: { length: 1.75, width: 0.9, body: hex('#f4cc30'), roof: hex('#ffe070'), sign: glow(hex('#fff4b0')) },
    cruiser: { length: 1.8, width: 0.9, body: hex('#24345e'), roof: hex('#e8ecf4'), siren: true },
    armoured: { length: 2.1, width: 1.0, body: hex('#3e6a3a'), roof: hex('#5a8a52'), armour: true },
    wreck: { length: 1.75, width: 0.9, body: hex('#3a3634'), roof: hex('#4a4440'), wreck: true }
  };
  const GLASS = hex('#9ccce8'), GLASS_DARK = hex('#4a7090'), TYRE = hex('#18181c'), HEAD = glow(hex('#fff6c8')), TAIL = glow(hex('#ff4030'));
  const RED = glow(hex('#ff3030')), BLUE = glow(hex('#3a7cff')), EMBER = glow(hex('#ff7a20'));

  function car(spec, heading, flash) {
    const angle = heading / HEADINGS * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    const L = spec.length, W = spec.width, hx = Math.abs(cos) * L / 2 + Math.abs(sin) * W / 2 + 0.15, hy = Math.abs(sin) * L / 2 + Math.abs(cos) * W / 2 + 0.15;
    const w = Math.ceil(hx * CELL_X) * 2 + 1, h = Math.ceil(hy * CELL_Y) * 2 + 1, c = new Canvas(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i + 0.5 - w / 2) / CELL_X, dy = (j + 0.5 - h / 2) / CELL_Y;
      const u = dx * cos + dy * sin, v = -dx * sin + dy * cos, au = Math.abs(u), av = Math.abs(v);
      // Wheels peek out at the four corners.
      const axle = L * 0.31;
      if (av > W / 2 - 0.08 && av < W / 2 + 0.07 && (Math.abs(u - axle) < 0.16 || Math.abs(u + axle) < 0.16)) { c.set(i, j, TYRE); continue; }
      const r = 0.16, cu = au - (L / 2 - r), cv = av - (W / 2 - r);
      if (au > L / 2 || av > W / 2 || (cu > 0 && cv > 0 && cu * cu + cv * cv > r * r)) continue;
      let colour = spec.body;
      if (spec.wreck) colour = (Math.sin(i * 12.9 + j * 78.2) * 43758.5 % 1 + 1) % 1 > 0.86 ? EMBER : spec.body;
      else if (u > L * 0.12 && u < L * 0.3 && av < W / 2 - 0.12) colour = GLASS;
      else if (!spec.van && u < -L * 0.24 && u > -L * 0.38 && av < W / 2 - 0.12) colour = GLASS_DARK;
      else if (spec.van ? u < L * 0.12 && u > -L / 2 + 0.1 : u <= L * 0.12 && u >= -L * 0.24) colour = spec.roof;
      if (spec.stripe && av < 0.08) colour = spec.stripe;
      if (spec.armour && u < L * 0.12 && u > -L / 2 + 0.1 && (Math.floor(u * 5) + Math.floor(v * 5)) % 2 === 0) colour = spec.body;
      if (spec.sign && au < 0.1 && av < 0.16) colour = spec.sign;
      if (spec.siren && Math.abs(u + L * 0.06) < 0.08 && av < W * 0.42) colour = (v < 0) !== flash ? RED : BLUE;
      if (!spec.wreck && u > L / 2 - 0.1 && av > W * 0.16 && av < W * 0.42) colour = HEAD;
      if (!spec.wreck && u < -L / 2 + 0.08 && av > W * 0.14 && av < W * 0.44) colour = TAIL;
      c.set(i, j, colour);
    }
    return c.finish({ outline: [0.05, 0.05, 0.06] });
  }

  const HAIR = hex('#4a3020'), SKIN = hex('#e6b088'), JACKET = hex('#f0c040'), JACKET_DARK = hex('#b88a20');
  function person(step, shirt, shirtDark) {
    const c = new Canvas(4, 3);
    c.rect(1, 0, 2, 1, HAIR).set(0, 1, shirt).set(3, 1, shirt).rect(1, 1, 2, 1, SKIN).rect(1, 2, 2, 1, shirtDark);
    if (step) c.set(0, 2, shirtDark); else c.set(3, 2, shirtDark);
    return c.finish();
  }
  function lying() {
    const c = new Canvas(6, 2);
    c.rect(0, 0, 1, 2, HAIR).set(1, 0, SKIN).rect(2, 0, 3, 2, team(0.8)).set(5, 1, hex('#3a3a44'));
    return c.finish();
  }
  function marker() {
    const c = new Canvas(5, 4), gold = glow(hex('#ffe050')), deep = glow(hex('#ffb020'));
    c.rect(0, 0, 5, 1, gold).rect(1, 1, 3, 1, gold).set(2, 2, deep).set(2, 3, deep);
    return c.finish({ outline: false, shade: false });
  }
  function parcel() {
    const c = new Canvas(4, 3), case_ = hex('#3a8a4a'), clasp = glow(hex('#ffe050'));
    c.rect(1, 0, 2, 1, hex('#2a5a32')).rect(0, 1, 4, 2, case_).set(2, 1, clasp);
    return c.finish();
  }
  function arrow(heading) {
    const angle = heading / HEADINGS * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle), c = new Canvas(9, 7), gold = glow(hex('#ffe050'));
    for (let j = 0; j < 7; j++) for (let i = 0; i < 9; i++) {
      const dx = (i + 0.5 - 4.5) / CELL_X, dy = (j + 0.5 - 3.5) / CELL_Y;
      const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
      if (u > -0.6 && u < 0.65 && Math.abs(v) < (0.65 - u) * 0.6) c.set(i, j, gold);
    }
    return c.finish({ outline: [0.1, 0.08, 0.02], shade: false });
  }

  function build() {
    const atlas = new Atlas();
    for (const [kind, spec] of Object.entries(CARS)) for (let h = 0; h < HEADINGS; h++) {
      atlas.add(`${kind}.${h}`, car(spec, h, false));
      if (spec.siren) atlas.add(`${kind}B.${h}`, car(spec, h, true));
    }
    atlas.add('player', person(false, JACKET, JACKET_DARK));
    atlas.add('playerWalk', person(true, JACKET, JACKET_DARK));
    atlas.add('ped', person(false, team(0.85), team(0.55)));
    atlas.add('pedWalk', person(true, team(0.85), team(0.55)));
    atlas.add('pedDown', lying());
    atlas.add('marker', marker());
    atlas.add('parcel', parcel());
    for (let h = 0; h < HEADINGS; h++) atlas.add(`arrow.${h}`, arrow(h));
    return atlas;
  }
  // The frame index for a heading in radians (0 = east, clockwise with y down).
  const heading = angle => ((Math.round(angle / (Math.PI * 2) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;

  global.JoyrideArt = { build, heading, HEADINGS };
})(typeof window !== 'undefined' ? window : globalThis);
