# STEP 5D — Generate Narrative UI Wiring

## Purpose

Adds `POST /api/dr-writer/6-1/generate` to the local dev server and wires the **Generate Narrative** button in the Charge 6-1 prototype UI.

Mock generation is the default and costs nothing. Live Claude generation requires explicit confirmation and an API key — it will never happen automatically.

---

## Routes Added

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/dr-writer/6-1/generate` | Mock or guarded-live generation — returns `OutputSchema6_1` |

Existing routes are unchanged:
- `GET /` and `GET /charge-6-1` — serve HTML
- `GET /charge-6-1-static-form.css` — serve CSS
- `POST /api/dr-writer/6-1/validate` — validate only (no generation, no Claude)

---

## Request Body Shape

```json
{
  "intake": { /* IntakeFacts6_1 */ },
  "mode": "mock",
  "confirmLive": false
}
```

- `mode`: `"mock"` (default) or `"live"`. Unknown values default to `"mock"`.
- `confirmLive`: must be `true` to proceed in live mode.

---

## Mock vs Live Behavior

### Mock Mode (default)

- `mode: "mock"` — or `mode` omitted
- Uses `makeMockDevClient` from `devRun6_1.ts` (local fake, no network)
- Produces valid `OutputSchema6_1` JSON that passes all `generate6_1` safety validation
- No Claude API call. No API credits spent.
- Mock output uses canned placeholder paragraphs — obviously not a real narrative.

### Live Mode

- `mode: "live"` + `confirmLive: true` + `ANTHROPIC_API_KEY` set in environment
- Calls the real Anthropic API via `createClaudeClient()`
- Uses credits. Only use with fake/sample data.
- If any guard fails, returns a controlled 400 error — no API call is made.

---

## RED Behavior

- The generate endpoint runs `evaluate6_1` locally before touching any client.
- If status is **RED**: returns a `RED` `OutputSchema6_1` immediately.
  - `narrative` is `null`
  - `red_blockers` are populated
  - No mock client is constructed. No live Claude call is made.
- In the UI: RED blocks the Generate button entirely. It must be resolved by filling missing facts and re-validating.

---

## YELLOW Behavior

- All required facts are present but one or more are weak/flagged.
- Generate proceeds (mock or live).
- The returned narrative contains `[REVIEW — flag_label]` markers at affected paragraphs.
- `yellow_warnings` and `flagged_sections` are populated.
- The UI shows an orange warning banner and lists flagged sections.

---

## GREEN Behavior

- All facts are present and specific.
- Generate proceeds (mock or live).
- The returned narrative has no `[REVIEW]` markers.
- `yellow_warnings` and `flagged_sections` are empty arrays.
- The UI shows a clean green success banner.

---

## How to Run Mock Generation

```bash
# Start the local dev server
npm run dev:6-1:ui

# Open in browser
# http://localhost:5176/charge-6-1
```

1. Fill in the form with **fake/sample data only**.
2. Click **Validate Facts** — wait for GREEN or YELLOW result.
3. Select **Mock** (it is already the default) in the Generation Mode section.
4. Click **Generate Narrative**.
5. The narrative appears in the Generate Result card below the button area.
6. Click **Copy Narrative** to copy the text, or **Copy JSON** to copy the full `OutputSchema6_1`.

---

## How to Test Live Generation

> Only do this if you explicitly want to spend API credits. Mock mode is functionally equivalent for UI testing.

1. Set `ANTHROPIC_API_KEY` in your terminal before starting the server:
   ```bash
   $env:ANTHROPIC_API_KEY = "REPLACE_WITH_ROTATED_KEY_VIA_REPLIT_SECRETS"   # PowerShell
   # or
   export ANTHROPIC_API_KEY=REPLACE_WITH_ROTATED_KEY_VIA_REPLIT_SECRETS     # bash
   ```
2. Start the server: `npm run dev:6-1:ui`
3. Open `http://localhost:5176/charge-6-1`
4. Fill in **fake/sample data only**.
5. Validate (must be GREEN or YELLOW).
6. Select **Live Claude** in the Generation Mode section.
7. Check the confirmation checkbox: *"I understand live mode uses API credits..."*
8. Click **Generate Narrative**.

If the confirmation checkbox is not checked, the UI shows a warning and does not send the request.

---

## Safety Notes

- **No storage**: Nothing is persisted. The form is stateless.
- **No real data**: Do not enter real inmate names, DC numbers, or officer names.
- **Mock default**: The server defaults to mock if `mode` is missing or unrecognized.
- **Live requires confirmation**: Both client-side (checkbox) and server-side (`confirmLive: true`).
- **RED never calls Claude**: The server checks status locally before constructing any client.
- **API key not logged**: The `ANTHROPIC_API_KEY` is never printed in logs or error messages.

---

## Running Tests

```bash
# Existing module tests (unchanged)
npm run test:6-1            # 65/65
npm run test:6-1:generate   # 9/9
npm run test:6-1:dev-runner # 24/24

# UI server tests — TS01-TS08 (validate) + TG01-TG08 (generate)
npm run test:6-1:ui-validate   # 16/16
npm run test:6-1:ui-generate   # 16/16 (same file)
```

Both `test:6-1:ui-validate` and `test:6-1:ui-generate` run the same test file (`testDevServer6_1.ts`) which covers all 16 tests.

### Generate Test IDs

| ID | Description |
|----|-------------|
| TG01 | Mock GREEN returns GREEN with narrative |
| TG02 | Mock YELLOW returns YELLOW with narrative and [REVIEW] flags |
| TG03 | RED input returns RED — injected bomb client never called |
| TG04 | Live mode without confirmLive → controlled 400, no Claude call |
| TG05 | Live mode missing ANTHROPIC_API_KEY → controlled error, key not exposed |
| TG06 | Validate endpoint still returns EvaluationResult6_1 shape — no generate fields |
| TG07 | Unknown generate-like route → 404 |
| TG08 | Invalid JSON to generate → controlled 400 error |

---

## Next Recommended Step

**Step 5E — UI Polish**: Review the generate output rendering after Tyler runs mock generation, and refine copy/layout based on what the actual output looks like in context.

Or: **Step 5F — Copy/Export Controls**: Add copy-to-clipboard feedback, export to `.txt`, or format the narrative for direct paste into the DR form system.
