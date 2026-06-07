---
name: CDC Dashboard layout fit
description: How the Confinement Command Center dashboard fits one viewport and what breaks it when adding content.
---

The CDC dashboard (`artifacts/cdc-coach/src/pages/Dashboard.tsx`) is designed to fit a single viewport (no scroll). The flow column is header → banner row → a flexible hologram spacer (`flex-1` with a `min-h-[…]`) → lower console (module grid + right-side panels) → activity ticker → footer.

**Rule:** The hologram spacer is the slack absorber. When you add content (extra right-column panels, more System Information rows, the ticker), total non-spacer height grows; once it exceeds the viewport the spacer pins to its `min-h` and the ticker/footer get pushed below the fold (or behind the fixed bottom classification bar).

**Why:** Adding a Session Log panel + ticker + 2 extra info rows + larger padding overflowed by ~60–100px. The fix was to lower the spacer `min-h` (e.g. 150px → 70px) so cards sit higher and everything fits again.

**How to apply:** After adding any vertical content, re-screenshot at 1366×768; if the ticker/footer disappear, reduce the spacer `min-h` rather than scrolling. Per the original spec, drop the optional Session Log feed (keep the ticker) if it can't fit cleanly.
