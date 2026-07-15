# STEP 7 — Live Claude UI Test

## Purpose

Step 7 is intended to prove the real browser flow with fake/practice data only:

```text
UI form -> Validate Facts -> Live Claude generation -> parser/safety validation -> result card -> copy/export
```

This is not production, not real data, and not deployment.

## Safety Rules

- Use fake/practice sample data only.
- Do not enter real inmate names.
- Do not enter real DC numbers.
- Do not enter real case numbers.
- Do not enter real incident facts.
- Do not print or log `ANTHROPIC_API_KEY`.
- Do not paste the API key anywhere.
- Live mode must require explicit selection and confirmation.
- RED must never call Claude.

## Environment Requirement

`ANTHROPIC_API_KEY` must be set locally in the environment used by the running dev server.

The key value was not printed or logged.

## Post-Key-Update Follow-Up

After Tyler reported the API key had been updated and was working, Codex reran the local preflight without printing or logging the key value.

Observed from the Codex execution environment:

```text
Process environment: missing
Windows User environment: missing
Windows Machine environment: missing
Direct live GREEN script: blocked before API call because ANTHROPIC_API_KEY is not set
```

This does not prove the key is invalid. It only proves that the key is not visible to the Codex shell or to any dev server/test process launched from that shell.

Tyler then manually ran the live UI test from the PowerShell session where `ANTHROPIC_API_KEY` was available.

Manual live UI result reported by Tyler:

```text
GREEN live UI generation: passed
YELLOW live UI generation: passed
Codex live/API calls: not run
```

Both live outputs had the expected six-paragraph structure and correctly preserved the core 6-1 content:

- Correct order count.
- Correct physical behavior.
- Correct operational impact.
- Correct ability-to-comply/no-force paragraph.
- Correct 6-1 rule connection.
- Correct OIC authorization.
- GREEN preserved the exact inmate quote.
- YELLOW included `[REVIEW — quote is a summary]`.
- YELLOW used `verbally responded in substance`.
- YELLOW did not put the summarized quote text inside quotation marks.

Output polish issue found:

- Both live outputs rendered the ISO UI date as `On 2026-03-12`.
- Preferred narrative wording is `On March 12, 2026`.

Step 7B patch:

- Added narrative-display date formatting for mock mode so ISO-style `YYYY-MM-DD` dates render as natural written dates in generated mock narratives.
- Added live prompt guidance telling Claude to format ISO-style dates as natural written dates in the narrative.
- Added a narrow YELLOW quote-summary prompt nudge for cleaner tone placement.
- Kept `cleaned_facts.incident_date` unchanged.
- Did not change schema shape, backend validation, `generate6_1` validation, live-mode guards, storage, auth, deployment, or charge scope.

RED guard status:

- RED guard passed in browser automation:
  - Load GREEN sample.
  - Delete DC number.
  - Validate Facts.
  - Confirm status is RED.
  - Confirm Generate stays disabled.
  - Confirm no narrative appears.
- Observed RED result: `missing_dc_number`.
- Observed generate requests: `0`.
- Expected behavior remains: RED returns locally with no narrative and no Claude/API call.

Non-live regression checks were rerun after the Step 7B polish patch:

```text
npm run test:6-1                 68 passed / 0 failed / 68 total
npm run test:6-1:generate         9 passed / 0 failed /  9 total
npm run test:6-1:dev-runner      24 passed / 0 failed / 24 total
npm run test:6-1:ui-validate     33 passed / 0 failed / 33 total
npm run test:6-1:ui-generate     33 passed / 0 failed / 33 total
```

Step 7B total across non-live scripts:

```text
167 passed / 0 failed / 167 total
```

Step 7 environment checks found:

```text
Process environment: missing
Windows User environment: missing
Windows Machine environment: missing
Running dev server response to live GREEN request: ANTHROPIC_API_KEY missing
```

## What Was Tested

### Preflight

- Opened `http://127.0.0.1:5176/charge-6-1`.
- Confirmed the UI server responded.
- Confirmed the DEMO MODE warning was present.
- Confirmed fake GREEN sample validation reached GREEN.

### UI Readiness Issue Found

During the first GREEN live UI attempt, selecting Live Claude after validating GREEN caused the Generate Narrative button to become disabled.

Cause:

- The form-wide input reset handler treated generation-mode controls as fact edits.
- Changing `generate_mode` reset `lastValidationStatus`.

Patch:

- Updated `prototypes/charge-6-1-static-form.html` so changes inside `#generate-mode-controls` do not reset fact validation.
- Also excluded `.feedback-input` controls from resetting fact validation.
- Added S605 static regression coverage in `src/dr-writer/server/testDevServer6_1.ts`.

This patch does not weaken backend validation, `generate6_1` validation, schema shape, or live-mode guards. It only prevents non-fact UI controls from invalidating a completed fact validation.

### GREEN Live Result

Status: PASSED manually by Tyler from the PowerShell session where `ANTHROPIC_API_KEY` was available.

Observed:

- GREEN fake sample validated successfully.
- Live Claude mode selection remained enabled after the UI patch.
- Live confirmation checkbox was checked.
- Manual live UI generation produced a structurally correct six-paragraph GREEN narrative.
- Output polish issue: the narrative opened with `On 2026-03-12` instead of `On March 12, 2026`.
- Codex follow-up direct live GREEN script still stopped before any API call because the Codex process environment did not contain `ANTHROPIC_API_KEY`.

Result:

```text
GREEN live UI generation: manually passed by Tyler
Codex live/API call: not run
Polish issue: ISO date rendered in narrative
```

### YELLOW Live Result

Status: PASSED manually by Tyler from the PowerShell session where `ANTHROPIC_API_KEY` was available.

Observed:

- YELLOW fake sample validated successfully.
- Manual live UI generation produced a structurally correct six-paragraph YELLOW narrative.
- The narrative included `[REVIEW — quote is a summary]`.
- The narrative used `verbally responded in substance`.
- The summarized quote text was not placed inside quotation marks.
- Step 7B date polish passed manually: the narrative opened with `On March 12, 2026`.
- Tiny wording polish found: the live YELLOW output placed the tone phrase after the review marker. A narrow prompt nudge was added to prefer `verbally responded in substance, in a [tone] tone, that...`.
- Codex did not run the YELLOW live/API test.

### RED No-Call Result

Status: PASSED in browser automation.

Observed:

- GREEN sample was loaded.
- DC number was deleted.
- Validate Facts returned `RED — 1 BLOCKER`.
- RED blocker was `missing_dc_number`.
- Generate Narrative stayed disabled.
- Generate result card stayed hidden.
- Generate result body stayed empty.
- Browser request count to `/api/dr-writer/6-1/generate`: `0`.
- No narrative appeared.

### Live-Without-Confirmation Guard Result

Status: NOT RUN in Step 7.

Reason:

- Live test sequence stopped after the environment key failure.
- Existing non-live UI tests still verify `confirmLive` server guard behavior.

### Mock-After-Live Result

Status: NOT RUN in Step 7.

Reason:

- No successful live generation occurred.
- Required non-live tests were run after the patch to verify mock behavior.

## Issues Found

1. Live mode selection after validation reset the Generate button.
   - Fixed safely in the UI.
   - Regression test added.

2. Codex cannot see `ANTHROPIC_API_KEY`.
   - Expected for this environment.
   - Codex must not force live tests from its own process.

3. Live output used ISO-style dates in the narrative.
   - GREEN and YELLOW live UI outputs rendered `On 2026-03-12`.
   - Step 7B added prompt guidance and mock display formatting so narrative text prefers `On March 12, 2026`.

## UI/Backend Patch Needed

UI patch for the generate-mode reset issue was needed and applied.

Step 7B output polish patch was needed and applied.

No backend validation patch was needed.

No validation logic was weakened.

## Final Recommendation

Use the PowerShell session where `ANTHROPIC_API_KEY` is available for any future manual live UI checks.

Do not paste the key into chat or documentation.

If the key is already set in a separate PowerShell window, run the dev server and live tests from that same window. Environment variables set only in one shell are not inherited by already-running Codex/tool processes.

After Step 7B, manually re-check GREEN and YELLOW live UI output with fake/practice data and confirm the narrative opens with `On March 12, 2026`. Manually confirm the RED guard if it has not already been confirmed.
