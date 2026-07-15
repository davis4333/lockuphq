# Step 5C — Validate Facts UI Wiring for Charge 6-1

**Version:** 1.0  
**Status:** Complete — local evaluator connected  
**Charge:** 6-1 — Disobeying Verbal or Written Order

---

## Purpose

Step 5C connects the Charge 6-1 form to the real local evaluator (`evaluate6_1`).

When the officer clicks **Validate Facts**, the form:
1. Collects all 36 intake fields into an `IntakeFacts6_1`-shaped JSON object
2. POSTs to `POST /api/dr-writer/6-1/validate` on the local dev server
3. Receives a real `EvaluationResult6_1` (RED / YELLOW / GREEN)
4. Renders the status, blockers, or warnings inline in the review panel

No Claude call is made. No narrative is generated. No data is stored.

---

## What is connected

| Feature | Status |
|---|---|
| `evaluate6_1` (local evaluator) | **Connected** via POST /api/dr-writer/6-1/validate |
| `cleanFacts6_1` | **Connected** (called internally by evaluate6_1) |
| RED blocker display | **Connected** — list of blocker IDs and follow-up questions |
| YELLOW warning display | **Connected** — list of warning IDs and affected paragraphs |
| GREEN confirmation | **Connected** — all-clear message in review panel |
| Copy Validation JSON | **Enabled** after successful validation |

## What remains disabled

| Feature | Status | Planned step |
|---|---|---|
| `generate6_1` / Claude API | Not connected | Step 5D |
| Generate Narrative button | Disabled | Step 5D |
| Copy Narrative button | Disabled | Step 5D |
| Data persistence / localStorage | Not implemented | Step 5D |
| PDF export | Not in scope v1 | Step 5E+ |
| Authentication / login | Not in scope v1 | Future |

---

## How to run

```
npm run dev:6-1:ui
```

Then open in your browser:

```
http://localhost:5176/charge-6-1
```

The server:
- Serves the form HTML and CSS
- Exposes `POST /api/dr-writer/6-1/validate`
- Returns real `EvaluationResult6_1` JSON from the local pipeline
- Does not call Claude
- Does not require `ANTHROPIC_API_KEY`
- Does not persist any data

---

## Files created or modified

| File | Change |
|---|---|
| `src/dr-writer/server/devServer6_1.ts` | Created — Node HTTP server, validate endpoint, file serving |
| `src/dr-writer/server/testDevServer6_1.ts` | Created — 8 tests for handler functions |
| `prototypes/charge-6-1-static-form.html` | Modified — validate wired, result rendering, IDs added |
| `package.json` | Modified — `dev:6-1:ui` and `test:6-1:ui-validate` scripts added |
| `docs/STEP_5C_VALIDATE_FACTS_UI_WIRING.md` | Created — this document |

---

## Server routes

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/` | Serves `prototypes/charge-6-1-static-form.html` |
| `GET` | `/charge-6-1` | Same as `/` |
| `GET` | `/charge-6-1-static-form.css` | Serves the CSS file |
| `POST` | `/api/dr-writer/6-1/validate` | Runs clean + evaluate, returns `EvaluationResult6_1` |
| any | any other path | 404 JSON response |

The `/api/dr-writer/6-1/generate` route does **not exist** — intentionally 404.

---

## Run tests

```
npm run test:6-1:ui-validate
```

Tests run against exported handler functions directly — no server startup, no network.

### Tests included (TS01–TS08)

| ID | Name |
|---|---|
| TS01 | handleValidate: GREEN intake → status GREEN, 0 blockers |
| TS02 | handleValidate: YELLOW (quote summary) → YELLOW, quote_is_summary warning |
| TS03 | handleValidate: RED (missing DC) → RED, missing_dc_number blocker |
| TS04 | handleRequest: POST with invalid JSON → 400 error |
| TS05 | handleRequest: GET / → 200 HTML |
| TS06 | handleRequest: GET /charge-6-1-static-form.css → 200 CSS |
| TS07 | handleRequest: GET /api/dr-writer/6-1/generate → 404 (generate must not exist) |
| TS08 | handleValidate result has no narrative or ai_disclosure (evaluate6_1 only) |

---

## Safety notes

- No Claude call. `ANTHROPIC_API_KEY` is not read or required.
- No data storage. Every request is stateless.
- No narrative generation. `generate6_1` is never called.
- The validate endpoint accepts the same `IntakeFacts6_1` schema the backend expects — blank fields naturally produce RED blockers.
- If the server is not running, the form shows a helpful error message in the review panel instead of crashing.
- Do not enter real inmate names, DC numbers, or officer information.

---

## Next recommended step

**Step 5D — Enable Generate Narrative.**

Step 5D adds the `POST /api/dr-writer/6-1/generate` endpoint, which:
- Accepts `IntakeFacts6_1`
- Runs `evaluate6_1` — if RED, returns immediately with blockers (no Claude call)
- If GREEN or YELLOW, calls `generate6_1` with the mock client (dev mode) or real Claude client (requires `ANTHROPIC_API_KEY` and explicit `--confirm-live`)
- Returns `OutputSchema6_1` including the narrative
- Enables the Generate Narrative button in the form
- Enables Copy Narrative after generation

Before beginning Step 5D:
- Tyler reviews the Step 5C validation UI behavior
- Any blocker/warning display changes are applied before wiring generation
- Step 5D does not require changes to `evaluate6_1`, `cleanFacts6_1`, or KB files
