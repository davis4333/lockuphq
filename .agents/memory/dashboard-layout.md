---
name: cdc-coach Dashboard app-shell layout
description: Why the Dashboard only scrolls the module grid and keeps a spacer above it to clear the FDC seal
---

# cdc-coach Dashboard is an intentional "app-shell"

Only the module-card grid scrolls. The header/clock, warning banner, right-side
System Status / System Information panels, and the footer stay fixed. A decorative
spacer above the module console pushes it down so it never covers the FDC seal — the
seal is part of the CSS background image (`html { background-image }` in index.css),
NOT a DOM element, so the only way to "clear" it is vertical spacing.

**Why:** The user explicitly asked that (a) only the tiles scroll while the rest of
the chrome stays put, and (b) the tiles never overlap the FDC seal. An earlier plain
body-scroll version and a too-small spacer both violated this.

**How to apply:** The fixed-height behaviour (fixed container height + overflow
hidden + an inner scroll region) is gated to `xl` and up; below `xl` the page falls
back to natural document flow so short/narrow screens don't clip the panels or
footer. The spacer height and the panels column are bounded (clamp on viewport
height; panels get their own capped internal scroll) so they can't starve the grid
on short screens. Don't revert to plain body-scroll, don't remove the spacer, and
keep the responsive gating — a code review failed when the fixed shell wasn't gated.
