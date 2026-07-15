# Step 5B — Static Mock UI Form for Charge 6-1

**Version:** 1.0  
**Status:** Complete — layout review ready  
**Charge:** 6-1 — Disobeying Verbal or Written Order  

---

## Purpose

Step 5B creates the first visual layout of the Charge 6-1 DR Writer form. This is a static HTML prototype — no backend connection, no API calls, no data storage, no Claude. The purpose is to review:

- Section order and form flow
- Field labels, placeholders, and helper text
- Conditional field behavior (force, ability to comply, separate conduct, inmate said nothing)
- RED/YELLOW/GREEN status panel layout
- Button placement and disabled-state labeling
- Sample output card appearance
- Overall officer-friendly feel before any backend is wired

---

## Files created

| File | Description |
|---|---|
| `prototypes/charge-6-1-static-form.html` | Static mock form — open directly in any browser |
| `prototypes/charge-6-1-static-form.css` | Stylesheet — automatically linked by the HTML file |
| `prototypes/README.md` | Usage notes for the prototypes folder |
| `docs/STEP_5B_STATIC_UI_MOCK.md` | This document |

---

## How to open the mock locally

**Option 1 — Double-click:**  
Open `prototypes/charge-6-1-static-form.html` directly in your browser (Chrome, Safari, Firefox, Edge).  
Both files must be in the same `prototypes/` folder — the HTML links to the CSS by relative path.

**Option 2 — Terminal:**  
```
npm run mock:6-1:ui
```
This prints the file path. Then open that path in your browser.

**Option 3 — Drag to browser:**  
Drag `charge-6-1-static-form.html` onto an open browser window.

No server, no install, no dependencies required.

---

## What the mock includes

All 14 intake form sections from the Step 5A UI plan:

1. **Incident basics** — date, time, dorm/area, exact location
2. **Reporting officer / assignment** — rank, name, post, activity
3. **Inmate identification** — last name, first name, DC number, narrative reference style (pronoun radio)
4. **Location and behavior before order** — textarea with guidance
5. **Order details** — order type (verbal/written/both), exact order, total count
6. **Inmate response / acknowledgment** — acknowledgment type, quote/said-nothing toggle, summary checkbox, tone
7. **Physical behavior after order** — textarea with behavioral description guidance
8. **Operational impact** — textarea
9. **Ability to comply** — radio group, conditional explanation field
10. **Force / UOF** — yes/no radio, conditional explanation + UOF documentation status
11. **Confinement outcome** — radio group (placed/remained/none)
12. **OIC authorization** — rank select, last name, authorization checkbox
13. **Optional context** — witness staff, camera coverage, additional facts
14. **Separate conduct** — conditional section with isolatability question

**Review panel (right column):**
- RED / YELLOW / GREEN explanation cards
- Example RED blockers with blocker IDs
- Example YELLOW warnings with warning IDs
- GREEN all-clear card
- Sample output narrative placeholder
- Officer review checklist preview
- AI disclosure preview

**Action buttons:**
- Validate Facts — enabled (logs form data to browser console, shows alert)
- Generate Narrative — **disabled** with note: "Step 5C"
- Clear Form — enabled (confirms before clearing)
- Copy Narrative — disabled
- Copy JSON — disabled

---

## What is intentionally not connected

| Feature | Status | Planned step |
|---|---|---|
| `evaluate6_1` backend | Not connected | Step 5C |
| `generate6_1` / Claude API | Not connected | Step 5C |
| Real-time validation feedback | Not connected | Step 5C |
| Data persistence / localStorage | Not implemented | Step 5D |
| Copy narrative to clipboard | Not implemented | Step 5C |
| PDF export | Not in scope v1 | Step 5E+ |
| Authentication / login | Not in scope v1 | Future |

---

## Minimal JS included

Three conditional field behaviors are wired up (trivial, no libraries):

- **"Inmate said nothing"** radio → hides quote field, shows informational note, clears quote value
- **"Force used: yes"** radio → reveals force explanation textarea and UOF documentation status
- **"Ability to comply: issue"** radio → reveals explanation textarea
- **"Separate conduct: yes"** radio → reveals isolatability question
- **Validate Facts button** → collects form values into an object, logs to browser console, shows a brief alert
- **Clear Form button** → confirms, then resets all fields and hides all conditional sections

No framework. No bundler. No npm packages. Pure browser JS.

---

## Safety notes

- The safety banner at the top reads: _"This mock does not generate reports, store data, or call Claude. It is for layout review only. Do not enter real inmate data."_
- The header badge reads: _"⚠ Static Mock — No API — Fake Data Only"_
- The footer reads: _"No backend · No API · No real data"_
- The Generate Narrative button is disabled with a dashed border and note
- No form data is sent anywhere — there is no form `action` attribute

---

## What should be reviewed visually

Tyler should open the mock and review:

1. **Section order** — does the flow match how officers think about an incident?
2. **Labels and placeholders** — are any fields confusing or ambiguous?
3. **Helper text** — is the guidance under each field clear enough? Too much? Too little?
4. **Conditional logic** — does the force explanation appear at the right time? Does "said nothing" correctly gray out the quote?
5. **Review panel** — is the RED/YELLOW/GREEN explanation easy to scan?
6. **Button state** — is it obvious that Generate is disabled? Is the reason clear?
7. **Sample output card** — does the narrative format and officer checklist look right?
8. **Overall feel** — professional enough for officers during a shift? Too clinical? Too informal?
9. **Mobile view** — resize the browser window to ~600px and confirm sections stack correctly

Note anything that should change before Step 5C backend wiring begins.

---

## Next recommended step

**Step 5C — Wire the Validate Facts flow to the real backend.**

Step 5C connects the form to `evaluate6_1` server-side so that clicking Validate Facts returns a real RED/YELLOW/GREEN result and displays actual blockers and warnings. Generate Narrative remains disabled until validation passes. No Claude call in Step 5C — only the evaluator.

Before beginning Step 5C:
- Tyler reviews the Step 5B layout and reports any label/field/flow changes needed
- Any layout changes are applied to the HTML/CSS before wiring begins
- A minimal Node/Express (or similar) server is planned for the API layer

Step 5C does not require any changes to `evaluate6_1.ts`, `cleanFacts6_1.ts`, or any KB file.
