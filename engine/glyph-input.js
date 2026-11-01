/* Shared gamepad reader. Follows the standard mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB,
 * 6 LT, 7 RT, 9 Start, 12-15 d-pad; axes 0/1 left stick, 2/3 right stick. */
(function (global) {
  'use strict';

  class GlyphPad {
    constructor(deadzone = 0.22) {
      this.deadzone = deadzone;
      this.connected = false;
      this.axes = [0, 0, 0, 0];
      this.now = new Array(17).fill(false);
      this.before = new Array(17).fill(false);
    }
    poll() {
      const pads = global.navigator?.getGamepads?.() || [];
      let pad = null;
      for (let i = 0; i < pads.length && !pad; i++) if (pads[i]?.connected) pad = pads[i];
      this.connected = Boolean(pad);
      for (let i = 0; i < this.now.length; i++) {
        this.before[i] = this.now[i];
        this.now[i] = Boolean(pad?.buttons[i]?.pressed);
      }
      for (let i = 0; i < 4; i++) {
        const value = pad?.axes[i] ?? 0;
        this.axes[i] = Math.abs(value) < this.deadzone ? 0 : value;
      }
    }
    axis(i) { return this.axes[i]; }
    held(i) { return this.now[i]; }
    pressed(i) { return this.now[i] && !this.before[i]; }
  }

  global.GlyphPad = GlyphPad;
})(typeof window !== 'undefined' ? window : globalThis);
