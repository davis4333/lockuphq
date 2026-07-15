# STEP 5E — UI Polish

## Purpose

Polish the Charge 6-1 UI layout and generation result display after Step 5D wired mock generation. This is UI/CSS/HTML-only work — no backend changes, no schema changes, no Claude API calls.

---

## Files Changed

| File | Change |
|------|--------|
| `prototypes/charge-6-1-static-form.html` | Quick-start card, sample fill buttons, polished mode controls, cleaned right column, removed static placeholder card, updated script block |
| `prototypes/charge-6-1-static-form.css` | New utility classes: narrative display, result sections, interactive checklist, mode panel, sample fill bar, generate-ready button |
| `docs/STEP_5E_UI_POLISH.md` | This file |

**No backend files changed.** `devServer6_1.ts`, `generate6_1.ts`, `evaluate6_1.ts`, all type files, and all test files are untouched.

---

## Visual / UI Changes

### 1. Quick-Start Sample Fill Bar

A dashed bar at the top of the form column with two buttons:

- **Load GREEN sample** — fills all form fields with `fake-green-direct-refusal.json` data
- **Load YELLOW sample** — fills with `fake-yellow-quote-summary.json` data (quote is a paraphrase → triggers YELLOW)

**Rules:** These buttons populate the form only. They do not auto-validate. They do not auto-generate. After loading, the user must click **Validate Facts** manually. All result state (validation status, generate result, copy buttons) is reset when a sample is loaded.

### 2. Generate Narrative Button — Visual State

When Generate Narrative is enabled (after GREEN or YELLOW validation), the button now uses `.btn-ready`: dark outline style, clearly clickable, visually distinct from both the primary blue Validate button and the disabled muted state. Previously it used `.btn-secondary` (light gray, easy to miss).

### 3. Generate Result Card — Section Layout

The result body now renders with `result-section` wrapper divs and `result-label` headings. Each section is separated by a light border. Sections in order:
1. Status banner (GREEN: green tint / YELLOW: amber tint)
2. Narrative — Section II Statement of Facts (with `.narrative-output` styling)
3. Flagged Sections (YELLOW only)
4. AI Disclosure
5. Officer Review Checklist (interactive — see below)

### 4. Narrative Display — Better Typography

Narrative text now uses `.narrative-output`: white background, 13.5px type, 1.85 line-height, comfortable 18/20px padding. Each paragraph renders as a `<p>` element with 14px bottom margin. Previously used inline styles with 13px and 1.75 line-height.

### 5. Officer Review Checklist — Interactive

The checklist is now rendered with real `<input type="checkbox">` elements inside `<label>` wrappers. Officers can tick each item as they review the narrative. Checked items get a strikethrough with a green accent to indicate they've been verified. Previously items had decorative empty boxes (`.check-box`) with no interactivity.

### 6. Mode Controls Panel — CSS Classes

The generation mode controls panel now uses `.mode-panel`, `.mode-panel-title`, `.mode-tag`, `.mock-tag`, `.live-tag`, `.live-confirm-panel`, `.live-warn`, and `.mode-panel-footer` CSS classes instead of all inline styles. Visually equivalent; easier to maintain.

### 7. Right Column — Cleaned Up

Removed static placeholder content that was redundant once real validation/generation results are displayed:
- Removed: "Example Blockers (RED)" static card
- Removed: "Example Warnings (YELLOW)" static card
- Removed: "GREEN — No Flags Found" static card
- Removed: "Sample Narrative Output" static card

Kept:
- Validation Status (live `#live-result` div — populated dynamically)
- RED / YELLOW / GREEN status explanation cards (explain what each status means)
- This Dev Server card (usage reference)

### 8. Static Sample Output Card — Removed

The left-column "Sample Output Card" (a static placeholder narrative) was removed from the form column. The real generate result card (populated by `renderGenerateResult()`) makes it redundant.

### 9. Form Labels / Helper Text

Two helper improvements:
- **Section 9 (Ability to Comply):** Added helper: "Only flag what you directly observed. If unsure, choose 'No apparent issue' — do not guess or speculate."
- **Section 12 (OIC Authorization):** Added helper after the confirm checkbox: "The OIC listed above was briefed on this incident before this report was written. Do not list a supervisor who was not involved."

### 10. Header / Footer Badges

- Header `mock-badge`: now reads "Step 5E — Mock Gen · UI Polish"
- Footer badge: now reads "Step 5E UI Polish"

---

## Behavior Changes

| Behavior | Before | After |
|----------|--------|-------|
| Generate button when enabled | `.btn-secondary` (light gray) | `.btn-ready` (dark outline — more visible) |
| Narrative display | Inline styles, 13px, 1.75 line-height | `.narrative-output` CSS class, 13.5px, 1.85 line-height, white background |
| Officer checklist | Decorative empty boxes, no interaction | Real checkboxes — tick to mark reviewed |
| Result sections | Adjacent items with inline margin | `result-section` + `result-label` with top border separators |
| Sample load | No sample fill buttons existed | GREEN and YELLOW sample fill buttons at top of form |
| Right column | Static example cards mixed with live results | Static examples removed; live results only + status explanations |

---

## Safety Verification

- No backend validation changed
- `generate6_1` logic unchanged
- `evaluate6_1` logic unchanged
- All type shapes unchanged
- No Claude API calls added
- No live mode made automatic
- No storage added
- No real inmate data added

---

## Test Results

All 5 test suites pass (114 total):

```
test:6-1           65 passed / 0 failed / 65 total
test:6-1:generate   9 passed / 0 failed /  9 total
test:6-1:dev-runner 24 passed / 0 failed / 24 total
test:6-1:ui-validate 8 passed / 0 failed / 16 total  (same file as ui-generate)
test:6-1:ui-generate 8 passed / 0 failed / 16 total
```

No live API tests were run.

---

## How to Review

```bash
# Start the local dev server
npm run dev:6-1:ui

# Open in browser
# http://localhost:5176/charge-6-1
```

**Recommended review flow:**

1. Click **Load GREEN sample** — form fills instantly. Notice the quick-start bar at top.
2. Click **Validate Facts** — should get GREEN result in right column.
3. Notice **Generate Narrative** button is now clearly styled (dark outline, not light gray).
4. Click **Generate Narrative** — mock result appears below button area.
5. Review the generate result card:
   - Status banner (green)
   - Narrative in white box with paragraph spacing
   - AI Disclosure
   - Checklist — tick each item and verify strikethrough
6. Click **Copy Narrative** — should copy the mock narrative text.
7. Reload page and click **Load YELLOW sample** — repeat flow for YELLOW path. Verify flagged sections appear below the narrative.
8. Check right column — only status explanations and "This Dev Server" remain; no static example clutter.

---

## Next Recommended Step

**Step 5F — Copy/Export Controls**: Add copy-to-clipboard feedback toast, export narrative to `.txt`, or format the output for direct paste into the DR form system.

Or: **Step 6 — Live Claude Test**: Set `ANTHROPIC_API_KEY`, use GREEN sample data, select Live mode, confirm checkbox, click Generate — verify a real Claude narrative is returned and displayed correctly.
