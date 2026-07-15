# Step 11A — Intake Form Wording Polish

## Purpose

Polish the visible Charge 6-1 intake form wording so a tired officer can understand each question without training. This pass focuses on labels, helper text, answer-choice wording, buttons, status messages, demo warnings, and mode copy.

## Files Reviewed

- `prototypes/charge-6-1-static-form.html`
- `prototypes/charge-6-1-static-form.css`
- `src/dr-writer/server/devServer6_1.ts`
- `src/dr-writer/server/testDevServer6_1.ts`
- `docs/STEP_4H_6-1_INTAKE_FIELD_CONTRACT.md`
- `docs/STEP_8_6-1_DEMO_MODE_FINAL_LOCK.md`
- `docs/STEP_10_WEBSITE_DEMO_READINESS.md`

## Major Wording Changes

- Renamed the app header from DR Writer wording to `LockUpHQ DR Assist`.
- Strengthened the warning to: `DEMO ONLY — Use fake/practice facts only.`
- Changed action wording from `Validate Facts` / `Generate Narrative` to `Check Facts` / `Draft Narrative`.
- Reworked labels into direct questions, including:
  - `What date did this happen?`
  - `What dorm, wing, or area was involved?`
  - `What name should appear on the report?`
  - `How many direct orders did you give?`
  - `What was the inmate's verbal response?`
  - `What did the refusal disrupt?`
  - `Was there any clear reason the inmate could not comply?`
  - `What happened after the refusal?`
- Simplified status wording:
  - `GREEN — Ready to draft after officer review.`
  - `YELLOW — Draft allowed, but review flagged items carefully.`
  - `RED — Missing required facts. Drafting is blocked.`

## Select / Answer-Choice Changes

Display text was polished while preserving existing internal values.

- Order type:
  - `Verbal order`
  - `Written order`
  - `Verbal and written order`
- Inmate verbal response:
  - `Exact quote`
  - `No verbal response`
- Quote summary:
  - `Summary of what the inmate said — I do not remember the exact words`
- Ability to comply:
  - `No clear barrier observed`
  - `Yes — explain the medical, mental health, physical, or language barrier`
- Force:
  - `No force used`
  - `Force was used`
- Use-of-force documentation:
  - `Yes — UOF report completed`
  - `Not confirmed yet`
- After refusal:
  - `Placed in administrative confinement`
  - `Remained in assigned housing or current confinement`
  - `Referred to supervisor/OIC; no confinement action`

## Helper Text Changes

- Date/time helper text now asks for clear practice dates/times.
- DC number helper text clearly says fake/practice DC numbers only.
- Quote helper text explains when quotation marks are appropriate.
- Summary quote helper text explains that summaries are not placed in quotation marks.
- Tone, physical behavior, and operational impact helpers now give plain examples.
- Ability-to-comply helper text warns not to guess.
- OIC helper text asks for the rank/name of the OIC who authorized the DR.

## What Did Not Change

- Schema shape did not change.
- Field IDs, names, and submitted values did not change.
- Validation gates did not change.
- RED guard did not change.
- Backend generation did not change.
- Live mode guard did not change.
- Demo warnings were not removed.
- No real inmate data or real officer reports were added.

## Test Results

- `npm run test:6-1:all` passed.
- Aggregate: 181/181 PASS.
- No live Claude/API tests were run from Codex.
