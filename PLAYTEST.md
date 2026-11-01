# Glyph Arcade — Visual Playtest & Ergonomics Report

Mid-gameplay screenshots were captured in Chromium via Playwright across three target viewports for both **Delve** and **Inkfire**:
- **Mobile Portrait (`360×640`)**: `delve-360x640-portrait.png`, `inkfire-360x640-portrait.png` (touch mode active)
- **Mobile Landscape (`844×390`)**: `delve-844x390-landscape.png`, `inkfire-844x390-landscape.png` (touch mode active)
- **Desktop (`1280×720`)**: `delve-1280x720-desktop.png`, `inkfire-1280x720-desktop.png`

---

## 1. Overall Readability & Letter Art Assessment

- **Desktop (`delve-1280x720-desktop.png`, `inkfire-1280x720-desktop.png`)**:
  - **Letter Art Clarity**: Excellent. In `delve-1280x720-desktop.png`, the giant `S` skeleton silhouette, brick wall mortar (`+`, `-`, `|`), and floor grit (`.`, `,`, `'`) are immediately legible at a glance. In `inkfire-1280x720-desktop.png`, the procedural atlas sprites (`brute` with `M` teeth and `X`/`%` shading, `medkit` with red `+` cross, `trooper`, and the first-person shotgun viewmodel) read cleanly against the dark industrial walls.
  - **HUD Layout**: Clean separation on `1280×720`, with generous breathing room between `.stats` (top-left), `#minimap` (top-right), and `#log` (bottom-left).
- **Mobile Portrait & Landscape (`360×640` and `844×390`)**:
  - While the WebGL2 character-cell canvas scales cleanly to `[7, 10]` cells, the DOM HUD overlays (`.stats`, `#minimap`, `#log`, and `#touch`) suffer from several concrete bounding-box collisions, undersized tap targets, and awkward two-thumb ergonomics documented below.

---

## 2. Concrete Defects Catalog

### D1. Top HUD `.stats` Overlaps `#minimap` in Delve Portrait
- **Screenshot**: `delve-360x640-portrait.png`
- **Measured Bounds**:
  - `.stats`: `left: 14px, right: 239px, top: 14px, bottom: 156px` (`225×142`)
  - `#minimap`: `left: 226px, right: 346px, top: 14px, bottom: 204px` (`120×190`)
- **Defect**: `.stats` and `#minimap` overlap horizontally by **13px** (`226px..239px`). The minimap border cuts directly through the `7/20` HP readout and `2 Scroll ×0` text.

### D2. Combat `#log` Overlaps `.stats` Panel in Landscape Mode (Both Games)
- **Screenshots**: `delve-844x390-landscape.png`, `inkfire-844x390-landscape.png`
- **Measured Bounds**:
  - In `delve-844x390-landscape.png`: `.stats` spans `top: 14px..174px` while `#log` (`bottom: 142px`) spans `top: 151px..248px` — a **23px vertical overlap**. The log line `"You hit the skeleton for 4."` renders directly on top of the `Sound on` button.
  - In `inkfire-844x390-landscape.png`: `.stats` spans `top: 14px..161px` while `#log` spans `top: 151px..248px` — a **10px vertical overlap** over the bottom of `.stats`.

### D3. Combat `#log` Overlaps Right Touch Pad (`#touch .side`) and Center Viewport in Portrait Mode
- **Screenshots**: `delve-360x640-portrait.png`, `inkfire-360x640-portrait.png`
- **Measured Bounds**:
  - `#log`: `left: 14px..230px, top: 387px..498px`
  - `#touch .side`: `left: 211px..346px, top: 454px..624px`
- **Defect**: `#log` overlaps the top-left button of `#touch .side` (`1 potion` in Delve, `FIRE` in Inkfire) by `19px × 44px`. In `inkfire-360x640-portrait.png`, the 4-line combat log also intrudes into the center aiming area right below the crosshair, partially obscuring the oncoming Brute enemy.

### D4. `#minimap` Collides with `#touch .side` in Delve Landscape
- **Screenshot**: `delve-844x390-landscape.png`
- **Measured Bounds**:
  - `#minimap`: `top: 14px..204px, left: 710px..830px`
  - `#touch .side`: `top: 204px..374px, left: 695px..830px`
- **Defect**: `0px` vertical clearance between the bottom border of `#minimap` (`204px`) and the top buttons (`1 potion`, `2 scroll`) of `#touch .side` (`204px`).

### D5. HUD Buttons Violate 44×44px Minimum Mobile Tap Target
- **Screenshots**: `delve-360x640-portrait.png`, `delve-844x390-landscape.png`, `inkfire-360x640-portrait.png`, `inkfire-844x390-landscape.png`
- **Measured Bounds**:
  - Delve `#mute` (`Sound on`): `78×24px`
  - Inkfire `#mute` (`Sound on`): `78×24px`; `#pause-btn` (`Pause`): `56×24px`
- **Defect**: `button.small` has a rendered height of only **24px**, well under the **44px** minimum touch target size.

### D6. Two-Thumb Touch Ergonomics & Missing Launcher Button in Inkfire
- **Screenshots**: `delve-360x640-portrait.png`, `inkfire-360x640-portrait.png`, `inkfire-844x390-landscape.png`
- **Defect**:
  1. Both games place `turnLeft` (`↺`) and `turnRight` (`↻`) on the **left** thumb pad alongside forward/back/strafe. In a first-person game (especially real-time Inkfire), the player needs the **left thumb** dedicated to movement (forward/back/strafe stick/pad) and the **right thumb** dedicated to turning/aiming (`↺` / `↻`), firing (`FIRE`), and actions.
  2. In `inkfire-360x640-portrait.png` and `inkfire-844x390-landscape.png`, the right touch pad only provides weapon buttons `1`, `2`, and `3` — there is no touch button to select Weapon `4` (Rocket Launcher) or cycle weapons.
  3. At `360px` width, the left pad (`right: 202px`) and right pad (`left: 211px`) leave only a `9px` gap in the center.

### D7. Missing Safe-Area Insets and Mobile Gesture Locks
- **Screenshots**: `delve-360x640-portrait.png`, `delve-844x390-landscape.png`, `inkfire-360x640-portrait.png`, `inkfire-844x390-landscape.png`
- **Defect**:
  - `.stats`, `#minimap`, `#touch .pad`, and `#touch .side` use hardcoded `14px`/`16px` offsets without `env(safe-area-inset-top/right/bottom/left)`.
  - `html, body` lack `overscroll-behavior: none`, `user-select: none`, and `touch-action: none` to prevent accidental pull-to-refresh, text selection, or double-tap zoom during intense thumb play.
