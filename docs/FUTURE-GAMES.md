# Future Games: candidate designs for the next wave

Six new game designs for Glyph Arcade. Each one uses the shared glyph engine (`engine/`), follows the standard file layout and quality bar from `docs/NEXT-GAMES.md`, and covers a genre not yet represented in the arcade (court sports, logic puzzle, turn-based board/card strategy, rhythm action, stealth heist, and precision grappling platformer).

---

## Ranked build order

Ordered by best fun-to-effort ratio and least engine work first:

1. **Ricochet** (Arcade court sport, **S**, no engine changes) — Single-screen court, three-rule disc physics with wall banks and spin curves, instant first-minute readability, and a fast deterministic bot.
2. **Lockwork** (Clockwork logic puzzle, **S**, no engine changes) — Single-screen turn-based vaults with undo, zero camera scrolling, and a breadth-first solver test that guarantees every level is solvable.
3. **Irongrid** (Turn-based tactical board & card game, **M**, no engine changes) — An 8×8 grid where enemy attacks are telegraphed a turn ahead and knockback does the heavy lifting, giving deep tactical choices without real-time pathfinding.
4. **Pulsebeat** (Beat-synced dungeon crawler, **M**, no engine changes) — Grid movement and parries locked to a synthesised beat bar create immediate arcade energy on small floors once WebAudio scheduling is wired to the step clock.
5. **Nightshift** (Top-down stealth heist, **M**, no engine changes) — Guard sight cones, noise rings and security cameras look striking in coloured glyphs, with medium effort in patrol pathing and line-of-sight checks.
6. **Skyhook** (Side-view grappling platformer, **L**, no engine changes) — Swinging on a letter-drawn tether up a collapsing wind spire feels kinetic and distinct from Burrow's slow digging, placed last because pendulum physics and a grappling bot need the most tuning.

### Recommended engine improvements before starting

None of the six games require breaking changes to `engine/`, but three small additions (~35 lines total) will pay off across all of them:

1. **In-place texture uploads in `GlyphEngine.prototype.setTexture` (`engine/glyph-engine.js`)**: Track `value.width` and `value.height` on each texture entry and call `gl.texSubImage2D` instead of `gl.texImage2D` when dimensions match. Every existing 2D game re-uploads `u_sprites` (and often `u_map` or `u_light`) every frame; avoiding texture reallocation prevents mobile WebGL2 driver stalls.
2. **Directional step helper in `GlyphPad` (`engine/glyph-input.js`)**: Add `pad.dirPressed(axisIndex, sign)` (or stick-to-dpad edge detection with hysteresis and optional repeat) so grid-based games (`Lockwork`, `Irongrid`, `Pulsebeat`) get clean single-tile steps from an analog stick without duplicating threshold code in every `app.js`.
3. **Shared ASCII sprite compiler (`engine/glyph-art.js`)**: `Burrow`, `Joyride`, and `Bannerfall` each duplicate `compileFrames()` (packing `[textRows, colourRows]` with automatic horizontal mirroring of `/ \ ( ) < > [ ]` into an `RGBA8UI` texture). Moving `GlyphArt.compileFrames(frames, palette)` into `engine/glyph-art.js` saves ~50 lines per 2D game.

---

## 1. Ricochet: arcade disc court

### Pitch

A fast 1v1 overhead arena sport played in a walled neon court. Catch the glowing disc, aim your throw, curve it with spin, or bank it off angled bumpers to shatter the rival's three goal shields and score into their endzone.

- **Borrows from:** overhead arcade air-hockey and disc-throwing court sports.
- **Target session/run length:** 8–12 minutes for a 4-match tournament run (each match is best of 3 sets to 5 points, ~2–3 minutes per match).

### Core loop and systems

- **Move and dash:** Slide across your half of the court (`28×16` tiles, split by a centre net line `:`). Dashing (`Space`) covers 4 tiles quickly and catches a fast disc on contact, on a 1.2-second cooldown.
- **Catch and throw:** Stepping into the disc catches it. Holding the throw button charges speed (up to 1.0 second; holding longer overcharges and fumbles the disc at your feet). Releasing launches the disc along your aim vector.
- **Spin and bank shots:** Adding left/right input while releasing applies curve spin, bending the flight path. Hitting a wall (`=`, `|`, `/`, `\`) reflects the disc and adds +15% speed (up to 3 wall bounces), turning it from yellow (`@`) to orange (`*`) to critical red (`*` with trail).
- **Parry:** Pressing throw within 6 frames of catching an incoming disc triggers a perfect parry—returning it instantly at +25% speed with a brief shockwave.
- **Goal shields and scoring:** Each endzone has three shield segments (`===`). A normal hit breaks one shield segment and bounces back into play; a 2-bounce bank shot breaks two; a goal through an open segment scores 1 point (2 points into a small central bullseye pocket `[#]`) and resets the shields for the next rally.

### Content list

- **4 tournament courts (unlocked in sequence per run):**
  1. **Foundry Court:** Clean rectangular walls with two angled corner wedges (`/` and `\`).
  2. **Twin Pillar Court:** Two solid bumper pillars (`[#]`) on the centre line that deflect throws unpredictably.
  3. **Conveyor Court:** Side strips (`<<<` and `>>>`) that accelerate both players and sliding discs along the flanks.
  4. **Prism Finals:** Rotating diagonal deflectors (`/`, `-`, `\`, `|`) in mid-court that flip 45 degrees every time the disc hits them.
- **4 player archetypes (and tournament rivals):**
  - **Striker (`S`):** Fast straight throws, narrow dash, strong parry window.
  - **Spinner (`C`):** Wide curve spin arc, moderate throw speed, wide catch radius.
  - **Bastion (`B`):** Heavy frame, wide reach, dash knocks the disc loose even at max speed, slower walk.
  - **Phantom (`P`):** Longest dash and fastest foot speed, weaker direct throw (relies on bank-shot multipliers).
- **Difficulty settings:**
  - **Easy:** Rival reacts after 0.28s, rarely curves shots, never parries, aims at random goal segments.
  - **Normal:** Rival reacts after 0.16s, uses single-wall banks and spin, targets broken shield segments.
  - **Hard:** Rival reacts after 0.08s, parries predictable straight throws, chains double-bank shots and guards open goal gaps.

### Presentation

- **Camera and grid:** Fixed top-down view showing the entire `28×16` court at `3×2` cells per tile (`84×32` cells), centred on screen with `ink: false`.
- **Sprite frames (allowed glyphs only):**
  - Player (`3×3` cells):
    ```
     O     \O/    _O_
    /S\     S    / S \
    / \    / \   |   |
    (idle) (throw) (dash)
    ```
  - Disc (`1×1` cell, surrounded by a `3×3` halo on charged shots): `@` in normal flight, `*` when supercharged, with fading trail particles `.` and `:`.
  - Court tiles: Floor `.` and `,` in dim slate; centre net `:`; bounce walls `=` and `|`; corner wedges `/` and `\`; goal shields `###` (full), `===` (cracked), `---` (fragile), `   ` (open); bullseye pocket `[$]`.
- **Palette:** Deep navy court floor (`#101624`), cyan player side (`#48d0ff`), coral rival side (`#ff5a4e`), gold/orange disc (`#ffe055` / `#ff922b`), bright lime shields (`#5ce868`).
- **HUD:** Set & point scoreboard (`0 - 0`, sets pips), opponent archetype badge, charge meter bar under player, rally bounce counter (`BANK x2`), current objective/match status line, and pause/mute controls.
- **Synthesised sounds:** Crisp square-wave paddle catch, rising sine charge hum, pitched wall-bank clack (pitch rises with each bounce in a rally), glass-crunch noise on shield break, horn blast + chord sting on goal.

### Controls

| Input | Action |
|---|---|
| W/A/S/D or Arrow keys | Move on your half of the court; steer throw aim / curve while holding throw |
| J / Enter / Left-click | Hold to charge throw, release to launch; tap on impact to parry |
| K / E / Right-click | Lob / curve-spin throw |
| Space / Shift | Dash (catches nearby discs) |
| P / Esc | Pause |
| Touch | Left virtual stick moves and aims; right buttons for Throw (hold/release), Spin, and Dash |
| Gamepad | Left stick moves/aims, A throw/parry, X spin throw, B or RB dash, Start pause |

### Rules API sketch

`WIDTH, HEIGHT, STEP, COURTS, ARCHETYPES, DIFFICULTIES, newGame(seed, archetype, difficulty), step(state, input), courtTileAt(state, x, y), objective(state), score(state), save(state), restore(text)`.

Input: `{ moveX, moveY, aimX, aimY, throwHeld, throwRelease, spin, dash }`.

### Tests to write

- Deterministic simulation per seed, and `save`/`restore` round-trip without drift.
- Disc reflects accurately off horizontal (`=`), vertical (`|`), and 45-degree (`/` `\`) walls, gaining speed up to the cap.
- Spin input curves the disc trajectory smoothly without tunnelling through walls.
- Catching, charging, overcharge fumble, and frame-window parry behave as specified.
- Hitting a shielded goal segment damages the shield and rebounds; hitting an open segment awards a point and resets the rally.
- Conveyor strips and rotating prism bumpers alter disc velocity/heading deterministically.
- A plain-input bot wins the 4-match tournament on Easy on at least 3 of 4 seeds within 12 simulated minutes, and AI-vs-AI rallies always resolve without infinite loops.

### Engine changes and size estimate

- **Engine changes needed:** None.
- **Size estimate:** **S** (~450 lines `rules.js`, ~220 lines `scene.js`, ~450 lines `app.js`).
- **Riskiest part:** Preventing high-speed discs from tunnelling through diagonal corner wedges or player catch radii on a single 1/60s tick (solve with 4 sub-steps per frame on disc movement).

---

## 2. Lockwork: clockwork signal-routing puzzle

### Pitch

Restore power to 30 ancient brass vaults by sliding copper conduits, rotating mirrors, and stepping across pressure plates so every steam-lamp receives the right pulse on the same clock tick.

- **Borrows from:** grid-based block-pushing and circuit/beam-routing logic puzzles.
- **Target session/run length:** 20–35 minutes to clear all 30 vaults (or 3–5 minutes for a single chapter of 6 vaults).

### Core loop and systems

- **Step-by-step deterministic clock:** The player (an engineer automaton) moves one tile per turn on a `15×11` single-screen grid. Every player move advances the vault's clockwork by 1 tick, and signals recompute instantaneously after each step.
- **Pushable and rotatable mechanisms:**
  - Walk into a **Conduit Block (`[+]`, `[|]`, `[-]`)** on greased rails to slide it one tile.
  - Press Action (`E`/`Space`) next to a **Brass Mirror (`[/]` or `[\]`)** or **Splitter (`[T]`)** to rotate it 90 degrees.
  - **Gear Cranks (`[@]`)** shift linked sliding doors (`###`) open or closed while held down or weighted by a crate (`[#]`).
- **Signal propagation rules:**
  - **Generators (`(G)`)** emit a continuous beam (`-` or `|`) in a fixed direction.
  - **Pulse Coils (`(P)`)** emit a signal only on even clock ticks (or when stepped on).
  - **Delay Capacitors (`[1]`, `[2]`)** store an incoming signal and emit it 1 or 2 turns later, allowing synchronous timing puzzles.
  - **Phase Inverters (`[!]`)** emit a beam only when *not* receiving one.
- **Vault completion:** A vault door (`{O}` -> `{*}`) unlocks the moment all **Receptors (`(O)`)** on the floor are powered simultaneously (`(*)`), allowing the player to step onto the exit lift. Full unlimited **Undo (`Z`)** and instant **Reset (`R`)** keep experimentation frictionless.

### Content list

- **5 chapters × 6 handcrafted + seeded-variant vaults = 30 vaults:**
  1. **Copper Hall (Vaults 1–6):** Direct beams, sliding crates (`[#]`), and 90-degree mirrors (`[/]`, `[\]`).
  2. **The Splitters (Vaults 7–12):** T-splitters (`[T]`), cross-bridges (`[+]`) where vertical and horizontal beams cross without mixing, and pressure plates (`[_]`).
  3. **Phase Chambers (Vaults 13–18):** Inverters (`[!]`) and sliding shutter gates (`===`) that block beams when powered.
  4. **Chronos Works (Vaults 19–24):** Delay capacitors (`[1]`, `[2]`) and alternating pulse coils (`(P)`) where two receptors must be lit on the exact same turn.
  5. **The Grand Mainspring (Vaults 25–30):** Combines all components with dual-colour beams (Amber and Cyan) that only pass through matching filters (`{:}`).
- **Par move counts:** Every vault has a Par step count; clearing a vault at or under Par awards a Gold Cog (`*`) for that level.
- **Difficulty settings:**
  - **Relaxed:** Par limit is +4 steps more generous, and a Hint button highlights the first misplaced mechanism.
  - **Standard:** Normal par targets, unlimited undo.
  - **Master:** Strict par targets, and vaults include one additional locked bronze crate obstacle.

### Presentation

- **Camera and grid:** Fixed top-down view of the `15×11` vault at `4×3` cells per tile (`60×33` cells), giving roomy, readable mechanism glyphs on both phone and desktop (`ink: false`).
- **Sprite and tile frames (allowed glyphs only):**
  - Engineer player (`3×3` cells inside the `4×3` tile):
    ```
     [@] 
    /|#|\
     / \ 
    ```
  - Generator (`4×3`):
    ```
    +--+
    |(G>
    +--+
    ```
  - Mirror `/` (`4×3`):
    ```
    .  .
     // 
    .  .
    ```
  - Receptor unlit / lit (`4×3`):
    ```
    .().    .***.
    (OO) -> *@@*
    .().    .***.
    ```
  - Active beam cells: `----` horizontal, ` || ` vertical, `*` at intersections and mirror bounce points.
- **Palette:** Warm dark bronze background (`#18130e`), burnished brass walls (`#9e7b3b`), copper mechanisms (`#d97a38`), glowing amber beams (`#ffd447`), cyan secondary beams (`#4ce8ff`), emerald exit indicator (`#52e062`).
- **HUD:** Vault number and name (`VAULT 14 / 30 - PHASE LOCK`), step counter vs Par (`STEPS 12 / PAR 14`), Gold Cogs collected (`* 13`), Undo / Reset / Hint / Level Select buttons, and objective line.
- **Synthesised sounds:** Heavy metallic clunk when sliding a block, crisp ratchet click when rotating a mirror, warm harmonic hum chord that adds a note for each lit receptor, and a resonant chime arpeggio when all receptors lock in and the vault door opens.

### Controls

| Input | Action |
|---|---|
| W/A/S/D or Arrow keys | Step one tile (pushes movable blocks in front of you) |
| Space / E / Enter | Rotate adjacent mirror/splitter, or wait 1 tick in place |
| Z / Backspace | Undo last step |
| R | Reset current vault |
| H | Show hint (in Relaxed/Standard) |
| L / Tab | Open vault select menu |
| P / Esc | Pause |
| Touch | Tap adjacent tile or swipe to step; tap adjacent mechanism to rotate; on-screen Undo, Wait, and Reset buttons |
| Gamepad | D-pad / Left stick steps, A rotate/wait, B undo, Y reset, Select vault list, Start pause |

### Rules API sketch

`WIDTH, HEIGHT, STEP, VAULTS, DIFFICULTIES, newGame(seed, difficulty, startVault), step(state, input), undo(state), resetVault(state), selectVault(state, index), traceSignals(state), objective(state), score(state), save(state), restore(text)`.

Input: `{ moveX, moveY, action, undo, reset, hint, selectVault }`.

### Tests to write

- Signal tracer propagates beams through mirrors (`/` `\`), splitters (`T`), cross-bridges (`+`), inverters (`!`), and delay capacitors (`1`, `2`) without infinite loops even when mirrors form a closed cycle.
- Pushing blocks respects walls, rails, and other blocks; rotating only affects rotatable mechanisms.
- `undo(state)` restores the exact previous board, clock tick, and capacitor queue across multi-step chains.
- `save` and `restore` preserve unlocked vaults, best step counts, and current mid-vault history.
- A breadth-first / A* plain-input bot solves all 30 vaults via `step(state, input)` within the Par step budget on Standard difficulty.

### Engine changes and size estimate

- **Engine changes needed:** None (optional `GlyphPad` stick-step helper).
- **Size estimate:** **S** (~500 lines `rules.js` including the 30 compact ASCII vault maps, ~200 lines `scene.js`, ~420 lines `app.js`).
- **Riskiest part:** Designing all 30 vault layouts so every puzzle is non-trivial, has no unintended 2-move bypass, and is verified by the automated solver test in under 10 seconds.

---

## 3. Irongrid: turn-based tactical board & card game

### Pitch

Command a squad of three steam-walker rigs on an 8×8 island grid against surging subterranean insects. Every enemy telegraphs its exact target tile a turn in advance—use drafted command cards to shove, grapple, shield, and body-block foes into hazards and each other's attacks while defending civilian power relays.

- **Borrows from:** deterministic micro-grid turn-based tactics and card-driven board games.
- **Target session/run length:** 15–25 minutes for a full 4-sector campaign run (4 battles of 5 turns each, plus card/upgrade rewards between battles).

### Core loop and systems

- **Perfect-information turn cycle:**
  1. **Enemy Movement & Telegraph Phase:** Crawlers move and lock in directional attack arrows (`^`, `V`, `<`, `>`) or artillery target rings (`(X)`) showing exact damage and knockback for the end of the turn.
  2. **Player Phase:** Each of your 3 rigs can move (up to its Move stat, 3–4 tiles) and play one **Command Card** from your shared 4-card hand (spending Reactor Energy, 3 per turn). You can also use a rig's body to block emerging spawn fissures (`%`) for 1 HP of self-damage.
  3. **Resolution Phase:** Environmental hazards trigger (supply train `===]` barrels down its track, lightning strikes marked tiles, water tiles drown non-flying enemies), followed by surviving enemies executing their telegraphed attacks in order.
- **Positional knockback:** Pushing an enemy or rig into a solid mountain, building, or another unit deals `+1` collision damage to both. Pushing a land enemy into deep water (`~`) or a chasm (` `) kills it instantly. Shifting an enemy shifts its telegraphed attack vector with it, letting you trick enemies into shooting each other.
- **Grid Defence (Health):** Civilian Relay Towers (`[H]`) on the board share a 6-bar **Grid Power** meter. If relays take damage and Grid Power hits 0, the island falls and the run ends.

### Content list

- **3 player rigs:**
  - **Titan (`[T]`, 4 HP, 3 Move):** Melee punch with knockback; starts with *Ram Charge* and *Shockwave Slam*.
  - **Howitzer (`[A]`, 3 HP, 3 Move):** Arcing artillery that damages a centre tile and pushes all 4 orthogonal neighbours outward.
  - **Aegis (`[S]`, 3 HP, 4 Move, Flying):** Magnetic pull hook, bubble shield (`( )`) on a friendly or relay tile, and swap-teleport.
- **12 Command Cards (start with 6, draft 1 after each battle):**
  - *Iron Fist* (2 dmg + push), *Mortar Shell* (1 center dmg + 4-way push), *Grapple Hook* (pull target to rig), *Aegis Dome* (shield 1 tile), *Repulsor Pulse* (push all 4 adjacent tiles, 0 dmg), *Swap Beacon* (swap two units), *Overclock* (+2 Energy this turn), *Rail Spike* (3 dmg line shot), *Smoke Drop* (cancel enemy attack on tile), *Repair Nanites* (heal rigs 2 HP), *Mine Layer* (place `[*]` 3-dmg mine), *Seismic Stomp* (push + crack tile into pit).
- **6 enemy types:**
  - **Pincer (`<V>`):** 2 HP, melee 1 dmg + push.
  - **Spitter (`{*}`):** 2 HP, ranged 2-tile acid shot.
  - **Beetle (`[@]`):** 4 HP, charges in a straight line and pushes whatever it hits.
  - **Webber (`(&)`):** 3 HP, roots adjacent rig in place while winding up a 2-dmg bite.
  - **Hornet (`^W^`):** 2 HP, flying (ignores water/pits), strikes 2 tiles ahead.
  - **Brood Queen (`/#\`, boss):** 8 HP, 2-tile wide carapace, spawns eggs and slams a 3-tile row.
- **4 Sectors (each 3 islands + 1 Boss island):** Rust Flats (supply train track), Flooded Quarry (collapsing dam tiles), Storm Ridge (lightning strikes), The Hive Core (Brood Queen finale).
- **Difficulty settings:**
  - **Easy:** Start with 7 Grid Power, max 3 active enemies at once, +1 free Undo Move per turn.
  - **Normal:** 6 Grid Power, up to 4 active enemies, standard spawn rates.
  - **Hard:** 5 Grid Power, elite (`+2 HP`) enemy variants appear from Sector 2 onward.

### Presentation

- **Camera and grid:** Fixed top-down view of the `8×8` tactical board where each board square is `6×4` character cells (`48×32` cells for the board), giving plenty of room inside each square for terrain, unit sprite, HP pips, and telegraph arrows (`ink: false`).
- **Sprite and tile frames (allowed glyphs only):**
  - Titan Rig inside a `6×4` cell square:
    ```
     _==_ 
    /[TT]\
    | ## |
     ==== 
    ```
  - Relay Building (`6×4`):
    ```
     /^^\ 
    |[HH]|
    |[##]|
    ======
    ```
  - Pincer foe (`6×4`) with an east attack telegraph arrow (`-->>`):
    ```
     \VV/ 
    <(OO)>>
     /  \ 
    ```
  - Spawn fissure: ` /%%\ ` glowing orange; Water: `~~~~~~`; Mountain: ` /^^\ ` `/####\`.
- **Palette:** Slate-teal board grid (`#1a2430` / `#243242`), warm gold relay towers (`#ffd147`), steel-blue player rigs (`#58b8ff`), crimson enemy telegraphs (`#ff4438`), toxic green insect carapaces (`#72d648`), violet shield domes (`#b878ff`).
- **HUD:** Top bar with Grid Power blocks (`[######]`), Turn countdown (`TURN 3 / 5`), Sector progress, Energy pips (`* * *`), clickable/hotkeyed 4-card hand along the bottom, hover/selection inspector showing exact collision outcome preview, Undo Move button, and End Turn button.
- **Synthesised sounds:** Heavy hydraulic step, metallic crunch on collision knockback, warning siren chirp when new fissures appear, electric hum on shield cast, artillery whistle + bass thud, and a victorious brass fanfare on surviving Turn 5.

### Controls

| Input | Action |
|---|---|
| Mouse click / Tap | Select rig, click blue tile to move, click card then red target tile to fire |
| W/A/S/D or Arrow keys | Move board cursor |
| Space / Enter | Confirm selection / move / card target |
| 1 / 2 / 3 / 4 | Select Command Card 1–4 from hand |
| Tab / Q | Cycle through ready rigs |
| Z / Backspace | Undo rig movement (before playing a card) |
| E | End Player Turn |
| P / Esc | Pause |
| Touch | Tap rig -> tap destination tile; tap card at bottom -> tap target tile (shows live knockback preview before confirming); End Turn button |
| Gamepad | Left stick / D-pad moves cursor, A confirm, B cancel/undo move, LB/RB cycle rigs, X/Y cycle cards, Start end turn / pause |

### Rules API sketch

`BOARD_SIZE, TURNS_PER_BATTLE, RIGS, CARDS, FOES, SECTORS, DIFFICULTIES, newGame(seed, difficulty), step(state, input), previewAction(state, action), endTurn(state), chooseReward(state, cardId), objective(state), score(state), save(state), restore(text)`.

Input: `{ cursorX, cursorY, selectRig, selectCard, confirmAt, undoMove, endTurn, pickReward }`.

### Tests to write

- Board generation places relays, mountains, and spawn tiles with a valid path for ground rigs.
- Knockback into a wall or another unit deals +1 collision damage to both; knockback into water or a chasm kills non-flying enemies.
- Moving or pushing an enemy updates its telegraphed target tile accordingly; cancelling an attack with Smoke or stunning prevents resolution damage.
- Blocking a spawn fissure prevents the enemy from emerging and deals 1 HP damage to the blocking rig at resolution.
- `previewAction(state, action)` matches the exact outcome of executing that action in `step(state, input)`.
- `save` and `restore` round-trip mid-battle and between sectors.
- A plain-input heuristic bot (scoring legal rig moves + card plays by relay damage prevented and enemies killed) wins the 4-sector campaign on Normal on at least 3 of 4 seeds.

### Engine changes and size estimate

- **Engine changes needed:** None.
- **Size estimate:** **M** (~650 lines `rules.js`, ~260 lines `scene.js`, ~520 lines `app.js`).
- **Riskiest part:** Keeping the `previewAction` outcome display clear on small phone screens so players can see who gets pushed where before committing a card tap.

---

## 4. Pulsebeat: step-synced rhythm dungeon crawler

### Pitch

Descend four neon-lit catacombs where the floor, traps, and monsters only move on the beat of a synthesised bassline. Step, lunge, or parry in time with the pulse bar at the bottom of the screen to keep your resonance multiplier alive and shatter the Choir Core.

- **Borrows from:** beat-synced grid rhythm crawlers and arcade timing games.
- **Target session/run length:** 8–12 minutes for a 4-floor run (96 to 120 BPM across floors).

### Core loop and systems

- **The Beat Clock:** The game steps at 60 Hz, with a beat interval `beatDuration = 60 / bpm` seconds (e.g., `0.50s` at 120 BPM = 30 frames per beat). Players act once per beat inside a timing window around each beat marker (`±0.13s` on Normal).
  - **On-Beat action:** Moves 1 tile (or attacks an adjacent enemy) and increments the **Resonance Multiplier** (`1x` -> `2x` -> `3x` -> `4x`). At `3x+`, your weapon gains +1 damage and range (`2-tile` spear thrust or wide slash).
  - **Off-Beat or Missed Beat:** Resets the multiplier to `1x` and advances enemies anyway, so hesitation lets foes close in.
- **Telegraphed enemy rhythms:** Every monster follows a strict, readable beat pattern:
  - **Metronome Slime (`(O)`):** Hops in place on odd beats, lunges 1 tile toward you on even beats (`[!]`).
  - **Twin-Step Skeleton (`/#\`):** Steps twice, raises its blade with a bright `*` flash on beat 3, and strikes on beat 4.
  - **Bell Sentinel (`{A}`):** Fires a 4-way laser cross (`===` and `|||`) every 4th beat (warning lines `...` appear on beat 3).
  - **Bass Wyrm (`<@===`):** Moves every single beat along a loop; hitting its head on the downbeat stuns the whole chain for 2 beats.
  - **The Choir Core (Floor 4 Boss):** Pulses shockwave rings (`( * )`) outward on beats 1–3 and exposes its crystal heart (`<$>`) on beat 4.
- **Parry / Sync-Step:** Pressing Space (`Parry`) on the exact beat an enemy strikes your tile negates the hit, stuns the attacker for 1 beat, and restores 1 Resonance rank.

### Content list

- **4 Floors with ascending tempo and synth arrangements:**
  1. **Crypt of Amber (100 BPM):** Slimes, spike traps (`^^^` up on even beats, `...` down on odd beats), and brass keys.
  2. **Cobalt Vaults (110 BPM):** Skeletons, sliding beat-conveyors (`>>>`), and the **Twin-Dagger** weapon (wide 3-tile front arc).
  3. **Crimson Forge (116 BPM):** Bell Sentinels, Bass Wyrms, lava beat-geysers, and the **Volt Lance** (2-tile piercing lunge).
  4. **The Choir Core (120 BPM):** Boss arena with 4 resonance pillars (`[#]`) that must be struck on-beat before shattering the Core.
- **6 passive pickups / shrines:**
  - *Heart Crystal* (+1 max HP), *Sync Boots* (widens the on-beat window by +25 ms), *Obsidian Shield* (absorbs 1 off-beat hit per floor), *Echo Ring* (every 4th on-beat step fires a ranged bolt), *Gold Pick* (breaks cracked walls in 1 beat instead of 2), *Potion Flask* (press `Q` on-beat to heal 2 HP).
- **Difficulty settings:**
  - **Easy:** 92–108 BPM, generous `±0.17s` beat window, 5 starting hearts, optional "Stepped Mode" (enemies wait for your input like a pure turn-based game, at 0.7x score).
  - **Normal:** 100–120 BPM, `±0.13s` beat window, 4 starting hearts.
  - **Hard:** 112–132 BPM, strict `±0.09s` beat window, 3 starting hearts, extra traps.

### Presentation

- **Camera and grid:** Smoothly scrolling top-down camera centred on the player across a `32×24` floor map, with each world tile drawn at `3×2` character cells (`ink: false`).
- **Beat-reactive floor and sprites (allowed glyphs only):**
  - Checkerboard floor tiles alternate their brightness and border glyph (`.` vs `+`) on every beat so the whole room visually breathes with the music.
  - Player (`3×2` cells):
    ```
    \O/     O 
    /#\    <#>
    (beat A) (beat B)
    ```
  - Skeleton winding up (`3×2` cells):
    ```
    *@*
    /#!
    ```
  - Choir Core Boss (`5×3` cells):
    ```
     /^\ 
    <($)>
     \V/ 
    ```
  - Beat bar along the bottom of the scene shader: approaching pulse markers `|` `|` converge from left and right onto the central hit bracket `[ * ]`.
- **Palette:** Deep obsidian background (`#0b0914`), pulsing magenta/cyan checkerboard floor (`#2a1638` and `#142838`), gold on-beat flashes (`#ffe45e`), neon green slime (`#54e868`), fiery red danger telegraphs (`#ff384c`).
- **HUD:** Hearts (`<3` or `[@]` pips), Resonance Multiplier (`4X RESONANCE`), Floor & BPM badge (`FLOOR 2 · 110 BPM`), equipped weapon & potion slot, score, and the converging beat-bar indicator.
- **Synthesised sounds:** A tight WebAudio 4-bar procedural drum-and-bass loop (kick on 1 & 3, snare on 2 & 4, arpeggiated synth bassline whose chord progresses as your multiplier climbs from `1x` to `4x`), crisp hi-hat tick on on-beat steps, dull vinyl-scratch thud on missed beats, and a metallic ring on parries.

### Controls

| Input | Action |
|---|---|
| W/A/S/D or Arrow keys | Step or attack 1 tile in that direction on the beat |
| Space / E | Parry / hold position on the beat |
| Q / R | Drink healing potion on the beat |
| P / Esc | Pause |
| Touch | Four large directional pads on the lower corners + centre Parry pad (or swipe in any direction on the beat) |
| Gamepad | D-pad / Left stick steps on the beat, A parry/hold, X potion, Start pause |

### Rules API sketch

`WIDTH, HEIGHT, STEP, FLOORS, WEAPONS, ITEMS, DIFFICULTIES, newGame(seed, difficulty), step(state, input), beatPhase(state), isOnBeat(state), objective(state), score(state), save(state), restore(text)`.

Input: `{ dir, parry, heal }`, where `dir` is `'N' | 'S' | 'E' | 'W' | null` (edge-triggered on the frame the player presses a key).

### Tests to write

- Every generated floor connects the entrance, key, shrine, and exit stairs.
- Acting inside the `isOnBeat(state)` window increments the resonance multiplier and moves/attacks immediately; acting outside the window resets the multiplier.
- Missing a full beat advances all enemy rhythm counters by 1 beat and triggers any beat-scheduled enemy attacks or spike traps.
- Parrying on the exact beat of an incoming enemy strike negates damage and stuns the enemy.
- Breaking all 4 resonance pillars exposes the Choir Core, and defeating it completes the run.
- `save` and `restore` round-trip cleanly.
- A plain-input bot that issues directional/parry inputs when `beatPhase(state)` crosses `0` clears all 4 floors on Normal on at least 3 of 4 seeds within 10 simulated minutes.

### Engine changes and size estimate

- **Engine changes needed:** None.
- **Size estimate:** **M** (~560 lines `rules.js`, ~240 lines `scene.js`, ~480 lines `app.js`).
- **Riskiest part:** Keeping the visual beat bar and `rules.js` tick clock tightly aligned with the WebAudio synth loop (solve by driving WebAudio note scheduling directly from `state.time` lookahead in `app.js`, with an optional audio-offset slider in Pause).

---

## 5. Nightshift: top-down stealth heist

### Pitch

Slip into a five-floor corporate data spire after midnight with no weapons—only a noise coin, an EMP key-jammer, air vents, and the shadows. Read guard sight cones and camera sweeps, hack terminals to lift laser grids, grab the vault tape, and reach the roof helipad before lockdown.

- **Borrows from:** top-down stealth infiltration and heist puzzle-action games.
- **Target session/run length:** 15–25 minutes for a 5-floor heist run (~3–5 minutes per floor).

### Core loop and systems

- **Light, shadow, and sight cones:**
  - Every guard and security camera projects a 2D raycast sight cone (`60°` wide, `8` tiles long on lit floors, `4` tiles on dark tiles).
  - Standing on a dark shadow tile (`.`) makes you invisible outside `2.5` tiles; standing on a lit corridor tile (`:`) inside a sight cone fills the guard's **Suspicion Meter (`?` -> `!`)** over `0.8` seconds.
- **Noise and distraction:**
  - Walking is silent (`1` tile radius); sprinting (`Shift`) or kicking a door open emits a noise ring (`(( ))`, `6` tiles radius) that draws the nearest guard to investigate.
  - Throwing a **Brass Coin (`C`)** creates a deliberate chime (`4` tiles radius) at a target spot up to 7 tiles away, pulling guards off their post; you can pick the coin back up afterward.
- **Gadgets and environment:**
  - **Air Vents (`[#]`):** Connect rooms behind locked doors; crawling inside a vent hides you completely and shows room interiors ahead.
  - **Breaker Switches (`[/]`):** Flipping a wall breaker plunges a sector's corridors into darkness and shuts off laser grids (`---`) for 20 seconds, though guards will walk over to flip it back on.
  - **EMP Jammer (`Q`, 2 charges per floor):** Temporarily disables a camera (`<O>`), turret, or keypad lock within 4 tiles for 8 seconds.
  - **Pickpocketing / Takedowns:** Approaching an unalerted guard from behind lets you snatch their keycard (`$`) silently, or knock them out (`ZZZ` -> `***`) for 15 seconds (guards woken by another patrol raise the floor alarm).
- **Alarm levels (0 to 3):**
  - Being spotted (`!`) triggers a 12-second **Alert** where nearby guards chase your last known position (`[?]`). Breaking line of sight and hiding in a vent or dark alcove cools the alert off. Getting caught in melee costs 1 of your 3 Disguise/Health pips and teleports you back to the floor's service stairwell with +1 permanent floor security level.

### Content list

- **5 Heist Floors:**
  1. **Lobby & Mailroom:** Patrol guards with flashlights, glass partitions (`|`, `-`) you can see through (and be seen through!), one breaker box, and the Security Pass.
  2. **R&D Labs:** Sweeping ceiling cameras (`<O>`), laser tripwires (`===`), and air-vent shortcuts.
  3. **Executive Suites:** Sound-sensitive marble floors (walking fast makes noise; carpet runners `###` are silent), keycard safes, and elite hound patrols that smell you within 2.5 tiles even in the dark.
  4. **The Cold Vault:** Dual-lock vault doors requiring two terminal hacks (`[T]`) plus a rotating laser hall guarding the Master Tape (`[@]`).
  5. **Penthouse & Helipad (Escape):** Lockdown extraction—carry the Master Tape past spotlight sweeps to the rooftop chopper (`=H=`).
- **Optional Loot Parcels (`[$]`):** 3 side safes per floor for bonus cash/score and gadget upgrades between floors (*Silent Soles*, *Extra Jammer Battery*, *Wide-Angle Visor* that shows guard patrol paths through walls).
- **Difficulty settings:**
  - **Easy:** Guards take `1.2s` to spot you, shorter `6.5`-tile sight cones, 3 EMP charges per floor.
  - **Normal:** `0.8s` spot timer, `8`-tile sight cones, 2 EMP charges per floor.
  - **Hard:** `0.45s` spot timer, guards check open doors and dark corners when suspicious, 1 EMP charge per floor, and 3 alarms fail the floor.

### Presentation

- **Camera and grid:** Smooth top-down camera over a `48×36` tile floor at `3×2` cells per tile (`ink: false`), with real-time 2D visibility cones and noise rings rendered in the scene shader.
- **Sprite and tile frames (allowed glyphs only):**
  - Thief player (`2×2` or `3×2` cells):
    ```
     @     _@_
    /|\    / \
    (walk) (crouch/vent)
    ```
  - Guard with facing indicator and status icon above head:
    ```
     ?      ! 
    [G>    [G^
    / \    | |
    ```
  - Security Camera (`3×1` cells): `<O>` / `\O/` sweeping left and right.
  - Sight cones on the floor: tinted yellow-amber cells filled with `.` (calm), orange `:` (suspicious `?`), or crimson `+` (alert `!`).
  - Expanding sound ripple ring: `(` `)` `/` `\` `-` characters along the radius.
- **Palette:** Midnight blue shadow tiles (`#0c1220`), warm fluorescent corridor tiles (`#3a382c`), amber sight cones (`#e8a838`), crimson laser beams and alert cones (`#ff3838`), cyan vent shafts and EMP arcs (`#48e0ff`), emerald exit/terminal glow (`#4ce870`).
- **HUD:** Alarm status badge (`CLEAR` / `? SUSPICIOUS` / `! ALERT 8.4s`), Disguise pips (`@ @ @`), held Keycards (`[RED] [BLUE]`), Gadget bar (`COIN: READY`, `EMP: **`), Loot counter (`$1,400`), current objective line, and a compact floor minimap showing walls, vents, and guard cones in view.
- **Synthesised sounds:** Soft padded footsteps, sharp coin clink + ring, electric zap on EMP jam, low pulsing bass heartbeat as a guard's suspicion meter fills, rising two-tone klaxon on Alert, and a smooth jazz-chord triad when the vault opens.

### Controls

| Input | Action |
|---|---|
| W/A/S/D or Arrow keys | Walk (silent); move through vents |
| Shift (hold) | Sprint (fast, makes noise on hard floors) |
| E / Enter | Interact: open/close door, enter vent, flip breaker, hack terminal, pickpocket from behind |
| C / Right-click | Toss noise coin toward cursor / facing direction |
| Q / Space | Fire EMP jammer at nearest camera/lock/guard |
| M / Tab | Toggle floor blueprint map |
| P / Esc | Pause |
| Touch | Left stick walks (outer ring sprints); right buttons for Interact (`E`), Coin Toss (`C`), EMP (`Q`), and Map (`M`) |
| Gamepad | Left stick walks, L3/RT sprint, A interact, X toss coin, B/RB EMP jammer, Select blueprint, Start pause |

### Rules API sketch

`WIDTH, HEIGHT, STEP, FLOORS, UPGRADES, DIFFICULTIES, newGame(seed, difficulty), step(state, input), canGuardSee(state, guard, x, y), makeNoise(state, x, y, radius, kind), objective(state), score(state), save(state), restore(text)`.

Input: `{ moveX, moveY, sprint, interact, tossCoin, aimX, aimY, emp }`.

### Tests to write

- Every seeded floor has a valid stealth route from the stairwell to all required terminals, the objective, and the exit.
- `canGuardSee` respects opaque walls (`#`), sees through glass (`|`, `-`), and shortens range on dark shadow tiles.
- Noise rings (`makeNoise`) alert only guards within the radius and route them to the noise origin; tossing a coin distracts a guard off a doorway.
- Flipping a breaker disables linked lights and laser grids for 20 seconds; EMP jammer disables cameras and keypads for 8 seconds.
- Getting spotted fills suspicion -> triggers Alert -> cools down when unseen for 12 seconds.
- `save` and `restore` round-trip deterministically.
- A plain-input bot (using waypoint graph search that weights guard sight-cone tiles heavily and triggers EMP/breakers when blocked) clears all 5 floors on Normal on at least 3 of 4 seeds within 25 simulated minutes.

### Engine changes and size estimate

- **Engine changes needed:** None.
- **Size estimate:** **M** (~680 lines `rules.js`, ~280 lines `scene.js`, ~520 lines `app.js`).
- **Riskiest part:** Tuning guard patrol loops and distraction investigation so guards feel smart and predictable rather than getting stuck in doorways or spinning in place.

---

## 6. Skyhook: side-view grappling climb

### Pitch

Climb the outside and inside of a crumbling 240-tile-tall wind spire before a rising electric storm swallows the base. Fire your magnetic skyhook into ceiling rings, swing across chasms on a letter-drawn tether, ride updrafts, and vault off crumbling ledges to reach the beacon at the summit.

- **Borrows from:** side-view momentum grappling-hook and precision climbing platformers.
- **Target session/run length:** 10–18 minutes to summit the 3-zone spire (with checkpoint ledges every ~25 tiles of height).

### Core loop and systems

- **Run, jump, and grapple:**
  - On solid ground you run, jump (with a forgiving `0.10s` coyote-time window and jump buffering), and slide down walls (`|`) to slow your fall.
  - Pressing Grapple (`J` / `Space` / Click) fires a magnetic hook (`*`) up to `9` tiles toward the nearest overhead or forward **Anchor Ring (`(@)`)** (or toward your manual aim angle).
- **Pendulum swing and reel boost:**
  - While hooked, a taut tether line (`/` `|` `\`) connects you to the anchor. Pumping left/right adds tangential swing momentum; holding Up reels the cable in; releasing Grapple at the apex of a swing launches you in a high arc with preserved horizontal speed.
  - **Reel Dash (`K` / `Shift`):** Once per air-time, you can yank yourself straight toward your hooked anchor (or dash 3 tiles horizontally if unhooked) to clear tight spike corridors.
- **Environmental hazards and momentum tools:**
  - **Wind Updrafts (`^^^`):** Vertical air columns that lift you upward—even faster if you release a swing into them.
  - **Crumble Blocks (`[=]`):** Crack (`[:]`) 0.5 seconds after you step or hook onto them, then fall away and respawn 4 seconds later.
  - **Spring Bumpers (`(O)`):** Bounce you diagonally at high speed and reset your mid-air Reel Dash.
  - **The Rising Storm:** A crackling violet cloud deck (`~~~` and `***`) rises steadily from the bottom of the spire (pausing briefly at each major zone gate). Falling into the storm or touching red lightning coils (`###`) respawns you instantly at your highest activated **Beacon Checkpoint (`[!]`)** with a +5-second storm penalty, so a miss never wipes out minutes of progress.

### Content list

- **3 Vertical Zones (`80` tiles tall each, `240` tiles total height × `40` tiles wide):**
  1. **The Copper Scaffolding (0–80m):** Wide ledges, generous anchor rings (`(@)`), gentle updrafts, and optional **Star Shards (`[$]`)** tucked on side balconies.
  2. **The Gale Flues (80–160m):** Crosswind gusts (`>>>` and `<<<`), crumbling anchor blocks, spring bumpers, and moving cargo hooks that travel along overhead rails (`===`).
  3. **The Storm Crown (160–240m):** Lightning coils that cycle on/off every 2.5 seconds, long multi-swing chasms where you chain 3 anchors in mid-air without touching the floor, and the **Summit Lighthouse (`/***\`)** at `240m`.
- **Difficulty settings:**
  - **Easy:** Storm rises slowly (and stops 18 tiles below your current height so it pushes rather than overtakes you), hook auto-aims within a wide `70°` cone, extra checkpoint beacons.
  - **Normal:** Standard storm rise speed, smart auto-aim toward the best forward/upward anchor in a `50°` cone, checkpoints every ~25m.
  - **Hard:** Fast relentless storm, narrower `35°` hook cone, more crumble anchors and shorter lightning off-cycles.

### Presentation

- **Camera and grid:** Smooth side-view camera that leads slightly above and ahead of the player's velocity vector, with each world tile drawn at `3×2` character cells (`ink: false`).
- **Sprite and tile frames (allowed glyphs only):**
  - Climber player (`3×3` cells):
    ```
     O     \O/     O/
    /#\     #     /# 
    / \    / \   /   
    (stand) (swing) (wall-slide)
    ```
  - Anchor Ring (`3×2` cells): `(@)` in bright cyan when in hook range, `(O)` when out of range, `(*)` when currently hooked.
  - Tether line in the scene shader: cells along the segment from player to anchor draw `/`, `|`, `\`, or `-` in bright gold.
  - Updraft column: rising `^` and `'` glyphs; Crosswind: streaming `>` or `<`; Rising Storm at bottom: dense `~`, `%`, `#`, and flashing `*` in electric violet.
- **Palette:** High-altitude twilight sky gradient (deep indigo `#0e1428` at top to warm amber `#4a2820` near the horizon), verdigris copper girders (`#3e8c78`), bright cyan anchor rings (`#52f0ff`), gold tether and checkpoints (`#ffd84d`), crimson lightning coils (`#ff4238`), electric violet storm (`#a84cff`).
- **HUD:** Altitude meter (`142m / 240m`), Storm distance warning (`STORM 18m BELOW`), Timer (`04:12.8`), Star Shards collected (`$ 7/15`), Dash ready indicator (`[DASH]`), and current objective line.
- **Synthesised sounds:** Crisp metallic harpoon clink on hook attach, taut rope whoosh whose pitch rises with swing angular velocity, airy filtered-noise wind loop that swells inside updrafts, crumbling stone rattle, spring boing, and a triumphant ascending synth chord when lighting a checkpoint or the Summit Beacon.

### Controls

| Input | Action |
|---|---|
| A/D or ←/→ | Run on ground; pump swing momentum while hooked; steer air drift |
| W / ↑ / Space | Jump; reel in cable while hooked; release jump to detach from swing with boost |
| J / E / Left-click (hold) | Fire and hold skyhook onto nearest anchor in aim direction; release to let go |
| K / Shift / Right-click | Reel-yank toward anchor (or mid-air dash when unhooked) |
| R | Quick-respawn at last checkpoint |
| P / Esc | Pause |
| Touch | Left stick runs/pumps swing/aims; right buttons for Jump, Hook (hold to swing, release to launch), and Dash |
| Gamepad | Left stick moves/pumps/aims, A jump, RT or X hold to hook/swing, B or RB reel-dash, Start pause |

### Rules API sketch

`WIDTH, HEIGHT, STEP, ZONES, DIFFICULTIES, newGame(seed, difficulty), step(state, input), tileAt(state, x, y), findBestAnchor(state, aimX, aimY), objective(state), score(state), save(state), restore(text)`.

Input: `{ moveX, moveY, jump, hookHeld, dash, aimX, aimY }`.

### Tests to write

- Spire generator builds a continuous climbable chain of ledges, anchors, and updrafts from `0m` to `240m` where every adjacent checkpoint pair is reachable within the hook's `9`-tile radius + jump arc.
- Hook attaches to `findBestAnchor`, constrains player distance to the rope length, converts gravity into tangential swing velocity, and preserves velocity on release.
- Coyote time, wall sliding, wall jumping, spring bumpers, updrafts, and crumble blocks all behave deterministically.
- Touching lightning coils or the rising storm respawns the player at the last activated checkpoint and increments the fall counter without ending the run.
- Lighting the Summit Beacon at `240m` wins the run and records time, shards, and score.
- `save` and `restore` round-trip mid-climb.
- A plain-input bot (chaining jumps, `hookHeld` swings until upward/forward velocity peaks, and `dash` boosts along the anchor graph) reaches the 240m summit on Normal on at least 3 of 4 seeds within 15 simulated minutes.

### Engine changes and size estimate

- **Engine changes needed:** None.
- **Size estimate:** **L** (~720 lines `rules.js`, ~300 lines `scene.js`, ~520 lines `app.js`).
- **Riskiest part:** Tuning the spire generator and the bot's swing-release timing so that procedural anchor chains feel natural for human players while remaining 100% solvable by the plain-input bot across seeds.
