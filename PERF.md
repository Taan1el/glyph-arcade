# Performance

Measured with `npm run perf` (`tools/perf.cjs`, 20 seconds per scenario) on 2026-11-02.

**Read this first:** these runs use headless Chromium with SwiftShader, which renders WebGL on the CPU. On top of that, the phone scenario adds a 4x CPU throttle. They are a worst case for comparing builds, not a prediction of a real phone, which has a GPU. No real device has been measured yet.

| Game | Scenario | Avg frame | p95 frame | Frames over 50ms | Quality level reached |
|---|---|---|---:|---:|---:|
| Delve | desktop 1280x720 | 82.9ms | 133.2ms | 195/206 | 3 |
| Delve | phone 360x640, 4x CPU | 23.5ms | 50.0ms | 31/828 | 3 |
| Inkfire | desktop 1280x720 | 95.6ms | 183.3ms | 158/178 | 3 |
| Inkfire | phone 360x640, 4x CPU | 25.2ms | 66.6ms | 47/774 | 3 |
| Wordfall | desktop 1280x720 | 56.0ms | 116.7ms | 142/354 | 3 |
| Wordfall | phone 360x640, 4x CPU | 17.3ms | 16.8ms | 3/1145 | 1 |

The target of p95 at or under 22ms at 4x throttle is **met by Wordfall only**. Delve and Inkfire miss it in this software-rendered setup, even at the lowest quality level. Whether they meet it on real hardware is still unknown.

## Adaptive quality

`engine/glyph-quality.js` watches frame times over 1.5 second windows. When the 90th percentile is over 22ms it steps down one level and never steps back up, so it cannot oscillate during a run:

| Level | Device pixel ratio cap | Cell size |
|---|---|---:|
| 0 | 2 | 1x |
| 1 | 1 | 1x |
| 2 | 1 | 1.25x |
| 3 | 1 | 1.5x |

## Next step

Run the three games on a real mid-range phone and record the numbers here. If a game still misses the target there, profile its scene shader first, since per-cell shader work is what dominates these runs.
