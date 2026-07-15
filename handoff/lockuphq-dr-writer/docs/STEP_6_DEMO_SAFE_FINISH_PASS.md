# STEP 6 — Demo-Safe Finish Pass

## Current Status

Step 6 completes the Charge 6-1 demo-safe finish pass for controlled fake/practice use only.

- Step 5G realistic mock narratives remain in place.
- Mock GREEN and YELLOW generate realistic synthetic six-paragraph narratives.
- RED returns blockers with `narrative: null`.
- Validate and generate are wired through the local dev server.
- Export TXT, Export JSON, Copy Narrative, and Copy JSON remain available.
- Feedback Notes and Demo Review Checklist are UI-only additions.
- No live Claude/API call was made during Step 6.
- No database, storage, auth, login, deployment, schema change, or KB rewrite was added.

## Files Checked

| Path | Status |
|------|--------|
| `src/dr-writer/charges/6-1/` | Present |
| `src/dr-writer/server/devServer6_1.ts` | Present |
| `prototypes/charge-6-1-static-form.html` | Present |
| `prototypes/charge-6-1-static-form.css` | Present |
| `docs/STEP_5G_REALISTIC_MOCK_NARRATIVES.md` | Present |
| `dev-inputs/6-1/` | Present |
| `examples/6-1/` | Present |
| `package.json` | Present |

Nothing from the expected Step 6 audit list is missing.

## Files Changed

| File | Change |
|------|--------|
| `prototypes/charge-6-1-static-form.html` | Strengthened demo warning, updated generate-mode warning, added Demo Review Checklist, added Feedback Notes fields and copy/clear handlers |
| `prototypes/charge-6-1-static-form.css` | Added styling for the demo checklist and feedback layout |
| `src/dr-writer/server/testDevServer6_1.ts` | Added S601-S604 static UI checks for Step 6 demo-safe elements |
| `docs/STEP_6_DEMO_SAFE_FINISH_PASS.md` | This file |

## Demo-Safe UI Changes

The top of the UI now includes this persistent warning:

> DEMO MODE — Use fake or practice report facts only. Do not enter real inmate names, DC numbers, case numbers, or real incident details.

The Generate Narrative area now states:

> Mock mode is local and free. Live Claude mode uses API credits and must only be used with fake/practice data.

The bottom of the form now includes:

- `Demo Review Checklist`
- `Feedback Notes`
- `Copy Feedback Notes`
- `Clear Feedback Notes`

Feedback Notes are client-side only. They do not submit to the server, write to disk, call an API, or store anything.

## Live-Mode Guard Confirmation

Confirmed in `prototypes/charge-6-1-static-form.html` and `src/dr-writer/server/devServer6_1.ts`:

- Mock mode is selected by default in the UI.
- Live Claude mode requires explicit user selection.
- Live Claude mode requires the confirmation checkbox before the browser sends a request.
- Server-side live mode requires `confirmLive === true`.
- Server-side live mode requires `ANTHROPIC_API_KEY`.
- RED returns before any mock or live client is created.
- RED never calls Claude.
- Tests use mock clients/local handlers only and do not call Claude.

No live-mode guard was weakened.

## Demo-Safe Limitations

- This is not production.
- This is not an official report submission system.
- Use fake/practice report facts only.
- Do not enter real inmate names, real DC numbers, real case numbers, or real incident details.
- GREEN still requires officer review.
- YELLOW requires review of flagged sections.
- RED means no narrative.
- Mock narratives are synthetic local output, not Claude output.
- Live Claude mode is manual only and uses API credits if explicitly selected and confirmed.

## Test Results

Required non-live scripts run for Step 6:

```text
npm run test:6-1                 65 passed / 0 failed / 65 total
npm run test:6-1:generate         9 passed / 0 failed /  9 total
npm run test:6-1:dev-runner      24 passed / 0 failed / 24 total
npm run test:6-1:ui-validate     28 passed / 0 failed / 28 total
npm run test:6-1:ui-generate     28 passed / 0 failed / 28 total
```

Step 6 total across required scripts:

```text
154 passed / 0 failed / 154 total
```

No live API tests were run.

## Manual Live UI Test Checklist

Do not run this automatically.

- Set `ANTHROPIC_API_KEY` locally.
- Run `npm run dev:6-1:ui`.
- Open `http://localhost:5176/charge-6-1`.
- Load GREEN sample.
- Validate Facts.
- Select Live Claude.
- Check confirmation box.
- Generate Narrative.
- Confirm realistic GREEN output.
- Export TXT.
- Repeat with YELLOW sample.
- Confirm RED sample never calls Claude.

Do not include or commit any actual API key.

## Next Step After Step 6

Run a controlled feedback review with trusted people using fake/practice cases only. Collect feedback with the new Feedback Notes card, then decide whether Step 7 should focus on usability refinements, additional fake examples, or a manually approved live Claude comparison pass.
