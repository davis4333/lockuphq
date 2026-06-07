---
name: CDC Coach page theming
description: How CDC sub-pages stay visually consistent with the Dashboard command-center theme
---

# CDC Coach page theming

All CDC pages must share the dark-futuristic blue-HUD command-center look (defined by `Dashboard.tsx`).

**Rule:** New sub-pages (forms, tools) should wrap their content in `src/components/PageShell.tsx` and style controls with its exported tokens (`hudPanel`, `hudInput`, `hudLabel`) instead of the generic shadcn classes (`bg-card`, `border-input bg-background`, `text-muted-foreground`, etc.).

**Why:** Sub-pages were originally built on the generic shadcn theme and looked nothing like the Dashboard; the FDOC seal hologram (baked into the global background image) also bled through plain forms. PageShell provides the matching background scrims (incl. a soft top scrim that calms the hologram), the FDOC-seal HUD header + "Back to Command Center" action, and the footer disclaimer.

**How to apply:** Use `<PageShell title=… subtitle=… icon={LucideIcon}>` as the page root; opaque `hudPanel` cards block the hologram bleed-through. Primary buttons use the blue HUD style (`border-blue-300/50 bg-blue-600/85` + blue glow); the sandbox warning banner uses the amber style (`border-amber-400/70 bg-[rgba(28,18,2,0.72)]`).
