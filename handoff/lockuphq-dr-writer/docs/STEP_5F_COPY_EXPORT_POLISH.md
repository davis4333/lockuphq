# STEP 5F — Copy Feedback Toast and Export TXT/JSON

## Purpose

Adds copy feedback toasts (replacing browser `alert`) and client-side file export to the Charge 6-1 prototype UI. All export logic runs in the browser — no server write, no storage, no backend route.

---

## Files Changed

| File | Change |
|------|--------|
| `prototypes/charge-6-1-static-form.html` | Added toast `<div>`, Export TXT + Export JSON buttons, updated copy/export handlers in script block |
| `prototypes/charge-6-1-static-form.css` | Added `.toast`, `.toast-visible`, `.toast-error` CSS classes |
| `src/dr-writer/server/testDevServer6_1.ts` | Added SF01-SF02 HTML element checks; updated runner summary to 18 tests |
| `docs/STEP_5F_COPY_EXPORT_POLISH.md` | This file |

**No backend files changed.** `devServer6_1.ts`, `generate6_1.ts`, `evaluate6_1.ts`, all type files, and all other test files are untouched.

---

## UI Behavior Added

### 1. Copy Feedback Toast

A fixed-position pill at the bottom center of the page. Appears on any copy or export action, then fades out after 2.5 seconds.

| Action | Toast message |
|--------|--------------|
| Copy Narrative succeeds | "Narrative copied." |
| Copy JSON succeeds | "JSON copied." |
| Export TXT | "Draft exported as lockuphq-6-1-draft.txt" |
| Export JSON | "Output exported as lockuphq-6-1-output.json" |
| Copy fails | "Copy failed. Select and copy manually." (red background) |

The toast uses `aria-live="polite"` for accessibility. No browser `alert()` is used for successful operations. If clipboard fails, the error toast shows and the data is still logged to the browser console at `F12`.

### 2. Export TXT Button

**Enabled:** only after a successful `Generate Narrative` result exists.  
**Disabled:** on Clear Form, on Load Sample (which resets state), and on page load.

When clicked:
- Builds a plain-text document in the browser (no server request)
- Uses `Blob` + `URL.createObjectURL` + `<a>.click()` — standard browser download
- Filename: `lockuphq-6-1-draft.txt` (no inmate name or DC number in filename)
- Shows toast: "Draft exported as lockuphq-6-1-draft.txt"

**TXT file contents** (in order):
1. Header: `LOCKUPHQ DR Writer — Charge 6-1`, charge name
2. Status and export timestamp (UTC)
3. RED blockers (if any)
4. YELLOW flags with suggestions (if any)
5. Section II — Statement of Facts (narrative, if present)
6. AI Disclosure
7. Officer Review Checklist (with `[ ]` prefix on each item)
8. Footer: `REVIEW AND CERTIFY BEFORE USE.` + responsibility notice

### 3. Export JSON Button

**Enabled:** after a successful validation OR generation result exists.  
**Disabled:** on Clear Form, on Load Sample, and on page load.

When clicked:
- Downloads the most recent result as JSON
  - If `lastGenerateResult` exists, downloads `OutputSchema6_1`
  - Otherwise downloads `EvaluationResult6_1` from last validate
- Filename: `lockuphq-6-1-output.json`
- Shows toast: "Output exported as lockuphq-6-1-output.json"

Export JSON is included (not skipped) because it is simple, fits in one handler, adds one button, and is genuinely useful when debugging or reviewing the full result schema. The button row is two rows of two which does not feel cluttered.

### 4. Button State Summary

| Button | Enabled when |
|--------|-------------|
| Copy Narrative | `lastGenerateResult.narrative` is non-null |
| Copy JSON | After any validate or generate result |
| Export TXT | After any generate result |
| Export JSON | After any validate or generate result |
| All 4 | Disabled by Clear Form and Load Sample |

---

## Export Behavior — Safety Notes

- **No server write.** Export is 100% client-side (`Blob` → `URL.createObjectURL` → `<a download>`).
- **No storage.** The browser downloads the file; nothing is retained by the app.
- **No new backend route.** The server has no `/export` or `/download` route. Requests to unknown routes still return 404 (verified by TG07).
- **No inmate PII in filename.** Filename is always `lockuphq-6-1-draft.txt` / `lockuphq-6-1-output.json`.
- **Development warning in TXT.** Every exported `.txt` file ends with `REVIEW AND CERTIFY BEFORE USE.`

---

## Tests

Two new tests added to `testDevServer6_1.ts`:

| ID | Description |
|----|-------------|
| SF01 | HTML prototype contains `id="btn-export-txt"` |
| SF02 | HTML prototype contains `id="copy-toast"` |

All existing tests (TS01–TS08, TG01–TG08) pass unchanged — no server or generate logic changed.

### Full test results after Step 5F

```
test:6-1             65 passed / 0 failed / 65 total
test:6-1:generate     9 passed / 0 failed /  9 total
test:6-1:dev-runner  24 passed / 0 failed / 24 total
test:6-1:ui-validate 18 passed / 0 failed / 18 total  (same file as ui-generate)
test:6-1:ui-generate 18 passed / 0 failed / 18 total

Grand total: 116 passed / 0 failed
```

No live API tests were run.

---

## How to Review

```bash
npm run dev:6-1:ui
# open http://localhost:5176/charge-6-1
```

**Test the toast:**
1. Click **Load GREEN sample** → **Validate Facts**
2. Click **Copy JSON** — toast "JSON copied." should appear and fade
3. Click **Generate Narrative** → click **Copy Narrative** — toast "Narrative copied."
4. Disconnect from the internet (or open DevTools → Application → disable clipboard permission) to test copy failure — should show red toast "Copy failed. Select and copy manually."

**Test Export TXT:**
1. Load GREEN sample → Validate → Generate
2. Click **Export TXT** — browser should download `lockuphq-6-1-draft.txt`
3. Open the file in a text editor and verify:
   - Status, timestamp, narrative, AI disclosure, checklist, and footer warning are all present
   - No real inmate name or DC number appears (fake data only)
4. Verify Export TXT button is **disabled** before generation and re-disabled after **Clear Form**

**Test Export JSON:**
1. Load GREEN sample → Validate
2. **Export JSON** should now be enabled (validate result exists)
3. Click — downloads `lockuphq-6-1-output.json` with `EvaluationResult6_1` shape
4. Generate narrative → Export JSON now downloads `OutputSchema6_1` (generate result takes precedence)

**Test Load Sample resets exports:**
1. After generating, click **Load GREEN sample**
2. Export TXT and Export JSON should both be disabled again

---

## Next Recommended Step

**Step 6 — Live Claude Test**: Set `ANTHROPIC_API_KEY`, load the GREEN sample, select Live mode, confirm checkbox, click Generate — verify a real Claude narrative returns and displays correctly. This is the first live API validation of the full pipeline.

Or: **Step 5G — Print / PDF Export**: Add a browser print stylesheet so the generate result card prints cleanly, or a `window.print()` button scoped to the result card only.
