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

**Fix that works:** replicate the CSS in JS. Compute the map's on-screen rect from `window.innerWidth/Height` using `cover` math (`s = max(W/imgW, H/imgH)`, horizontal center, `offsetY = 30` for `background-position: center 30px`) and a Florida bounding box stored as fractions of the 1672×941 image (`FL_FRAC` in `Dashboard.tsx` ≈ x[0.712,0.864] y[0.087,0.255], measured by cropping the bg PNG with ImageMagick). Recompute on `resize`. Node positions are then `%` within that computed box.
