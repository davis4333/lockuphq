# Step 9 - First Controlled Feedback Session

## Purpose

First controlled feedback session for Charge 6-1 using fake/practice facts only.

The goal is to learn whether the demo form, RED/YELLOW/GREEN behavior, generated narrative, officer checklist, and copy/export workflow make sense before expanding scope.

## Who Should Test

- Tyler first.
- One trusted coworker if appropriate.
- Someone who understands DR writing but will follow demo-only rules.

## Who Should Not Test Yet

- General staff.
- Supervisors/admin as an official product.
- Anyone using real inmate data.
- Anyone expecting production security.

## Demo Safety Rule

DEMO ONLY - Use fake/practice facts only. Do not enter real inmate names, DC numbers, case numbers, or real incident details.

## Recommended Session Length

10-15 minutes.

## Recommended Test Flow

1. Open local app.
2. Point out DEMO MODE warning.
3. Load GREEN sample.
4. Validate facts.
5. Generate mock narrative.
6. Review officer checklist.
7. Export TXT.
8. Load YELLOW sample.
9. Validate and generate mock narrative.
10. Explain quote-summary warning.
11. Delete DC number.
12. Validate RED block.
13. Ask tester feedback questions.
14. Record feedback in the checklist.

## Optional Live Mode

Only Tyler should use Live Claude mode.

- Use live mode only with fake/practice facts.
- Use live mode only if Tyler intentionally sets `ANTHROPIC_API_KEY` in the same PowerShell session that starts the dev server.
- Do not let testers see or handle the API key.
- Do not paste the API key into chat, docs, screenshots, logs, or reports.
- Live mode still requires explicit UI selection and confirmation.

## Feedback That Matters Most

- Does the form make sense?
- Are any fields missing?
- Does the narrative sound like a professional DR?
- Does the narrative stay factual?
- Does YELLOW review language make sense?
- Does RED blocking make sense?
- Would this save time?
- What wording sounds unnatural?
- What would make this easier at work?

## Feedback Not To Act On Yet

- Add every charge now.
- Add real inmate data.
- Add storage/database.
- Deploy it publicly.
- Remove demo warnings.
- Skip officer review.
- Auto-submit reports.

## Session Result Format

Copy/paste this after the feedback session:

```text
Tester:
Mode used:
What worked:
What confused them:
Missing fields:
Narrative quality:
Safety/RED/YELLOW feedback:
Would this save time:
Score 1-10:
Top 3 fixes:
Should we proceed to next charge or polish 6-1 more:
```

## Supporting Docs

- `docs/CHARGE_6-1_DEMO_FEEDBACK_CHECKLIST.md`
- `docs/STEP_9_FEEDBACK_SUMMARY_TEMPLATE.md`
- `docs/STEP_9_NEXT_DECISION_GATE.md`
