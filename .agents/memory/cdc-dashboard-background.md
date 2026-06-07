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

**Florida wireframe map (upper-right):** the bg image also has a blue dotted Florida outline baked into the upper-right. Its on-screen position does NOT match its raw % position in the image (renders further right than expected, ~`left 82% top 12.5%` for a `16.5%×23%` box on ~16:9). To overlay anything on it (e.g. red facility pulse nodes), align the fixed overlay box empirically via screenshot, not by computing from image pixels.
