/* Adaptive quality: watches frame times and steps down the display resolution, then
 * the cell count, when frames run long. It only steps down, so it cannot oscillate. */
(function (global) {
  'use strict';

  const LEVELS = [
    { maxDpr: 2, cellScale: 1 },
    { maxDpr: 1, cellScale: 1 },
    { maxDpr: 1, cellScale: 1.25 },
    { maxDpr: 1, cellScale: 1.5 }
  ];
  const WINDOW_MS = 1500, MIN_SAMPLES = 8, LIMIT_MS = 22, SETTLE_FRAMES = 10;

  class GlyphQuality {
    constructor(onChange) {
      this.onChange = onChange;
      this.level = 0;
      this.samples = [];
      this.elapsed = 0;
      this.settle = SETTLE_FRAMES;
    }
    get setting() { return LEVELS[this.level]; }
    sample(frameMs) {
      if (this.level >= LEVELS.length - 1 || frameMs > 250) return;
      if (this.settle > 0) { this.settle--; return; }
      this.samples.push(frameMs);
      this.elapsed += frameMs;
      if (this.elapsed < WINDOW_MS || this.samples.length < MIN_SAMPLES) return;
      const sorted = this.samples.sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      this.samples = [];
      this.elapsed = 0;
      if (p90 > LIMIT_MS) {
        this.level++;
        this.settle = SETTLE_FRAMES;
        this.onChange(this.setting);
      }
    }
    cell(base) {
      const scale = this.setting.cellScale;
      return [Math.round(base[0] * scale), Math.round(base[1] * scale)];
    }
  }

  global.GlyphQuality = GlyphQuality;
})(typeof window !== 'undefined' ? window : globalThis);
