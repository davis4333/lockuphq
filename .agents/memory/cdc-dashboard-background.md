---
name: CDC Dashboard background composition
description: How the FDOC seal background image constrains the Dashboard layout
---

# CDC Dashboard background (FDOC hologram)

The page background (`artifacts/cdc-coach/public/bg-fdoc-command.png`) is a ~16:9 image with the FDOC seal baked in near the **top third** and a floor/projection glow filling the lower portion. It's set as a fixed, `cover` html background.

**Constraint:** the seal's on-screen vertical position is essentially fixed by the image composition. On common laptop aspect ratios (~16:9) the image maps almost 1:1, so `background-position-y` and modest zoom barely move the seal. Do NOT try to push the seal to mid-screen via `background-position` — it won't move and zooming crops the watchtowers at the edges.

**How to apply when laying out:**
- The seal is centered horizontally and sits high. Keep the centered upper-middle zone clear of cards/panels.
- The amber warning banner is top-left; narrow its `max-width` (~480px) so it clears the centered seal's left edge instead of trying to relocate the seal.
- Brightness: the seal can look dim under dark overlays. Keep `body::before` light over the top (~0.18-0.22 alpha) and darker toward the bottom for card contrast; a soft blue radial centered at ~`50% 22%` brightens the seal.
- Single-screen fit: content container uses `h-[100dvh]` + `overflow-y-auto` (graceful scroll on very short/stacked viewports), with a flexible `flex-1` spacer ABOVE the cards acting as the reserved hologram zone so cards are pushed below the seal.

**Florida wireframe map (upper-right):** the bg image has a blue dotted Florida outline baked in. To overlay anything on it (e.g. red facility pulse nodes), do NOT use static viewport percentages — a `fixed` `cover` background shifts the map by viewport aspect ratio, so a static box drifts off (looked aligned in a 16:9 dev screenshot but landed far right of the map in the user's canvas iframe).

**Pulse "not pulsing" — two real causes:** (1) the global `@media (prefers-reduced-motion: reduce)` `* { animation-duration:0.001ms !important }` freeze silently kills it if the viewer's OS has reduce-motion on (very common, easy to miss). Fix: exclude the ambient node classes from that selector via `*:not(.cdc-node-dot):not(.cdc-node-ring):not(.cdc-fl-heartbeat)` — a deliberate exception for a slow non-vestibular accent the design relies on. (2) the user views the 1920px canvas iframe zoomed to ~50%, so 5px dots → ~2.5px on screen and the pulse is imperceptible. Fix: make dots ~8px and the scale-pulse dramatic (~0.45→1.5) with animated `box-shadow` glow. A *static* inline glow also masks an opacity-only pulse. Slow = ~6–8s, staggered per node.

**Verify overlay placement on the REAL render at the user's iframe size (1920×1080), NOT a smaller screenshot.** The cover-math aligns differently per aspect ratio, so dots that look right at 1366×768 are off at 1920×1080 (the canvas iframe size). The bg-image crop (`fl_box.png` of FL_FRAC) is NOT a reliable proxy for placement — it repeatedly looked correct while the live render was wrong. Workflow that works: screenshot at 1920×1080, grid-overlay the map region to measure the baked outline's true screen bbox, then overlay candidate dot positions directly onto that screenshot (compute screen = boxOrigin + node%·boxSize using the cover transform; validate the transform by checking it reproduces existing dots) and iterate BEFORE editing code. At 1920×1080 the image (1672×941, 16:9) fills with scale≈1.148, offsetX≈0, so screen_x≈fx·1920, screen_y≈30+fy·1080. FL_FRAC must be tuned so the box bottom reaches the actual southern tip — too small a y1 squeezes all dots into the top ⅔ and leaves the south empty.

**Scrollbar flips the cover axis — use `document.documentElement.clientWidth/clientHeight`, NOT `window.innerWidth/innerHeight`, in the JS cover-math.** `background-attachment: fixed` paints into the viewport EXCLUDING the scrollbar gutter, but `window.innerWidth/Height` INCLUDE it. Near 16:9, that ~15px difference flips the cover from width-driven to height-driven for the real background while the JS still thinks width-driven, shifting the map sideways. Symptom that pinpoints this: dots align at one size (e.g. 1920×1080, no scrollbar) but are shifted right at another SAME-ASPECT size (e.g. 1366×768, page scrolls). Same aspect ratio should give identical layout — if it doesn't, suspect the scrollbar. Always verify at a size where the page actually scrolls, not just one where it fits.

**Fix that works:** replicate the CSS in JS. Compute the map's on-screen rect from `document.documentElement.clientWidth/clientHeight` (see scrollbar note above) using `cover` math (`s = max(W/imgW, H/imgH)`, horizontal center, `offsetY = 30` for `background-position: center 30px`) and a Florida bounding box stored as fractions of the 1672×941 image (`FL_FRAC` in `Dashboard.tsx`, tuned to ≈ x[0.717,0.853] y[0.108,0.283] against the live 1920×1080 render — see the verification note above; do not trust a bg-PNG crop alone). Recompute on `resize`. Node positions are then `%` within that computed box.
