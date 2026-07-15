# Step 4E — Live Claude Fake Officer Cases

## Purpose

Validate that the full generate6_1 pipeline handles realistic messy officer-style inputs correctly across all three status paths (GREEN, YELLOW, RED), using only synthetic/fake data.

Step 4C confirmed a clean GREEN case works. Step 4D confirmed a clean YELLOW case works. Step 4E goes one level deeper: realistic fake-officer intake scenarios that mimic how a real officer might fill out a form — with exact quotes, approximate quotes, and missing facts.

This step is **not UI**. It is a controlled live integration test suite.

---

## Cases

### CASE_LIVE_01_GREEN_DIRECT_REFUSAL

**Scenario:** Fake Officer T. Davis, E Dorm master roster count, fake Inmate Smith (DC# A12345). Officer gave 3 verbal orders to return to assigned cell. Inmate made eye contact and said exact quote: *"No, I ain't doing that."* Inmate crossed arms, remained at cell door. No force, placed in confinement, OIC Captain Brown.

**Expected:** GREEN — clean certifiable draft, no `[REVIEW]` flags, quote appears correctly, "three verbal orders" present.

**Claude calls:** 1

---

### CASE_LIVE_02_YELLOW_APPROXIMATE_QUOTE

**Scenario:** Same fake base facts as Case 1. Officer types an approximate/summary quote: *"He said he was not going back to his cell."* — not the inmate's exact words. All other required facts are present and specific.

**Expected:** YELLOW — marked review draft. Narrative must use "verbally responded in substance" in paragraph 2. Narrative must include `[REVIEW — quote is a summary]`. Narrative must NOT place the summary inside quotation marks. `flagged_sections` must include `2`.

**Claude calls:** 1

---

### CASE_LIVE_03_RED_MISSING_REQUIRED_FACT

**Scenario:** Same fake base facts, but `dc_number` is `null` — officer forgot to look it up before submitting.

**Expected:** RED — local gate blocks immediately. `narrative` is `null`. `red_blockers` includes `missing_dc_number`. **Claude is never called — zero API spend for this case.**

**Claude calls:** 0

---

## How to Run

**Step 1 — Set your API key (PowerShell):**

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
```

**Step 2 — Run the live fake cases:**

```powershell
npm run test:6-1:live-fake-cases
```

**Expected result:**

```
Overall: PASS
```

**Optional — See raw Claude narratives:**

```powershell
$env:DEBUG_CLAUDE_RAW = "true"
npm run test:6-1:live-fake-cases
```

---

## Safety Notes

- **No real inmate data.** All names, DC numbers, dates, and locations are synthetic.
- **No real disciplinary reports.** These are fabricated scenarios for pipeline validation only.
- **No UI.** This is a Node.js CLI test runner only.
- **RED must not call Claude.** The counting wrapper verifies `Claude calls: 0` for the RED case. If this check fails, something has broken the RED gate — investigate immediately.
- `ANTHROPIC_API_KEY` is never logged, printed, or included in error messages.
- This script is separate from `npm run test:6-1` and `npm run test:6-1:generate`. Those scripts never make real API calls.

---

## Files Created in Step 4E

| File | Purpose |
|---|---|
| `src/dr-writer/charges/6-1/testLiveClaudeFakeOfficerCases6_1.ts` | Live fake officer case test runner |
| `docs/STEP_4E_LIVE_FAKE_OFFICER_CASES.md` | This document |

**Modified:**

| File | Change |
|---|---|
| `package.json` | Added `test:6-1:live-fake-cases` script |

---

## Next Step

**Step 4F — Local developer runner / CLI-style intake harness**

A minimal CLI-style harness that accepts structured intake input from a local file or stdin and runs the full generate6_1 pipeline — still no UI, still no real data, but usable for interactive developer testing before any web or app layer is introduced.
