# Agent Mode 5-Run Test Plan - Charge 6-1

Use this after website deployment to ask ChatGPT, an agent, or a browser tester to verify the demo-only website flow.

Do not use real inmate data. Do not use real officer reports.

## Run 1 - GREEN Exact Quote

Steps:

1. Load or fill GREEN 6-1 facts.
2. Validate.
3. Generate mock narrative.

Expected:

- GREEN status.
- Narrative generated.
- No review flag.

## Run 2 - YELLOW Quote Summary

Steps:

1. Use summarized quote facts.
2. Validate.
3. Generate mock narrative.

Expected:

- YELLOW status.
- `[REVIEW — quote is a summary]`.
- `verbally responded in substance`.
- No quoted summary.

## Run 3 - RED Missing DC

Steps:

1. Remove DC number.
2. Validate.

Expected:

- RED status.
- Generate disabled.
- No narrative.
- No generate request.

## Run 4 - RED Missing Order

Steps:

1. Remove the direct order.
2. Validate.

Expected:

- RED blocker.
- Generate disabled.
- No narrative.

## Run 5 - Export/Checklist

Steps:

1. Generate mock GREEN.
2. Export TXT.

Expected:

- Narrative present.
- AI disclosure present.
- Officer checklist present.
- Demo/mock mode label present.

## Copy/Paste Result Format

```text
Website URL:
Run 1 result:
Run 2 result:
Run 3 result:
Run 4 result:
Run 5 result:
Issues found:
Screenshots taken:
Final score 1-10:
Ready for next step: Yes/No
```
