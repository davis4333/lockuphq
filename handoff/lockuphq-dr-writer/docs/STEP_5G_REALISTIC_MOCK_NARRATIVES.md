# STEP 5G — Realistic Mock Narratives

## Purpose

Replaces placeholder paragraph labels in mock generation with realistic synthetic 6-paragraph Charge 6-1 narratives built from `cleaned_facts`. The mock narrative is indistinguishable in structure and detail from a real Claude response — it is not a real Claude response.

---

## Files Changed

| File | Change |
|------|--------|
| `src/dr-writer/charges/6-1/devRun6_1.ts` | Added `buildRealisticNarrative` + helper functions; rewrote `buildMockGreenResponse` and `buildMockYellowResponse`; guarded `makeMockDevClient` against RED null `cleaned_facts` |
| `prototypes/charge-6-1-static-form.html` | Added `lastGenerateMode` state variable; added Mode line to exported TXT metadata |
| `src/dr-writer/server/testDevServer6_1.ts` | Added SG01–SG06 narrative content tests; updated runner summary |
| `docs/STEP_5G_REALISTIC_MOCK_NARRATIVES.md` | This file |

**No backend validation logic changed.** `evaluate6_1.ts`, `generate6_1.ts`, `types.ts`, and all schema files are untouched.

---

## Narrative Structure

The mock generates a 6-paragraph narrative from `CleanedFacts6_1` fields following the Charge 6-1 paragraph spec.

### Para 1 — Officer assignment and scene
`On [incident_date], at approximately [incident_time], I, [officer_rank] [officer_name], was assigned as the [officer_post] in [dorm_area]. While [officer_activity], I approached [incident_location] and observed [Inmate Last, First DC# dc_number], [inmate_behavior_before_order].`

### Para 2 — Order, acknowledgment, response, physical behavior
- Issues a direct `[order_type]` order to `[inmate_last_name]` to `[exact_order]`
- If `total_orders_given > 1`: repeat count sentence
- Acknowledgment sentence keyed on `acknowledgment_type` (eye contact, verbal, physical, etc.)
- Quote or no-response sentence (see YELLOW handling below)
- Physical behavior sentence

### Para 3 — Operational impact
`This incident resulted in [operational_impact (lower-cased, trailing period normalized)].`

### Para 4 — Ability to comply and force
- `no_issue`: "this officer observed no apparent issue with Inmate [name]'s ability to comply"
- `issue_with_explanation`: "this officer observed that [explanation]"
- Force: "No force was used" OR "Force was used during this incident. [force_explanation]" + UOF documentation status

### Para 5 — Rule violation and charge advisory (static)
`The above-described conduct by Inmate [name] is in violation of Florida Department of Corrections Rule 33-601.314, Inmate Disciplinary Procedure, specifically Prohibited Conduct Code 6-1, Disobeying a Verbal or Written Order of Any Staff Member.`

### Para 6 — Confinement and OIC
- Confinement sentence keyed on `confinement_status` (placed / remained / none)
- OIC notification sentence
- `witness_staff` and `camera_coverage` appended if present

---

## YELLOW Flag Handling

YELLOW warnings append `[REVIEW — flag_label]` to the end of the affected paragraph.

### Special case: `quote_is_summary` (paragraph 2)

When the `quote_is_summary` warning is present, the quote sentence is replaced with an in-substance paraphrase — no quotation marks around the summary text:

> `Inmate Smith verbally responded in substance that he was not going back to his cell [REVIEW — quote is a summary].`

The "He said" or "She said" attribution prefix is stripped from the intake quote before building the in-substance phrase. This satisfies both legal writing standards and the `generate6_1` validator requirement:
- `[REVIEW` present in narrative → ✓
- Summary not in quotation marks → ✓
- Direct-quote pattern (`stated, "..."`) not used → ✓

Other YELLOW flags for paragraph 2 append their `[REVIEW]` marker at the end of the paragraph after the physical behavior sentence.

---

## Mock Mode Disclosure

Mock disclosure appears in two places — never inside the narrative text itself:

1. **UI label**: The generate result card header shows `"Mock — not a real Claude response"` in the subtitle (unchanged from prior step — already present via `modeLabel`).
2. **Export TXT**: The exported `.txt` file metadata section now includes:
   ```
   Mode:      MOCK — synthetic narrative (not Claude AI)
   ```
   or for live mode:
   ```
   Mode:      LIVE — Claude AI response
   ```
   Tracked via `lastGenerateMode` state variable in the browser script.

---

## makeMockDevClient — RED Guard

The original implementation built the mock response JSON eagerly before the client was needed. With `buildRealisticNarrative` now accessing `cleaned_facts` fields, passing a RED evaluation (which has `cleaned_facts: null`) would throw.

The fix: `makeMockDevClient` now builds the response only for GREEN and YELLOW statuses. For RED, `responseJson` is `null`. If the client were somehow called with a RED evaluation, it would throw `"Mock: completeJson must not be called for RED status"` — which is correct behavior (RED never calls the client).

---

## Tests

Six new tests added to `testDevServer6_1.ts`:

| ID | Description |
|----|-------------|
| SG01 | GREEN mock narrative does not contain placeholder "Paragraph one —" |
| SG02 | GREEN mock narrative opens with "On " |
| SG03 | GREEN mock narrative has exactly 6 paragraphs |
| SG04 | YELLOW mock narrative contains "verbally responded in substance" |
| SG05 | YELLOW mock narrative does not put summary in quotation marks |
| SG06 | YELLOW mock narrative contains "[REVIEW — quote is a summary]" |

### Full test results after Step 5G

```
test:6-1             65 passed / 0 failed / 65 total
test:6-1:generate     9 passed / 0 failed /  9 total
test:6-1:dev-runner  24 passed / 0 failed / 24 total
test:6-1:ui-validate 24 passed / 0 failed / 24 total  (same file as ui-generate)
test:6-1:ui-generate 24 passed / 0 failed / 24 total

Grand total: 146 passed / 0 failed
```

No live API tests were run.

---

## Constraints Satisfied

- No backend validation logic changed
- No changes to `generate6_1.ts`, `evaluate6_1.ts`, or any type files
- No Claude API calls
- No live mode made automatic
- No database, storage, login, or auth added
- No real inmate data used
- No real officer reports used
- No schema shape changes
- No KB rewrite
- No drift

---

## How to Review

```bash
npm run dev:6-1:ui
# open http://localhost:5176/charge-6-1
```

1. Click **Load GREEN sample** → **Validate Facts** → **Generate Narrative**
   - Verify narrative opens with "On March 12, 2026…"
   - Verify exactly 6 paragraphs
   - Verify no placeholder text ("Paragraph one —")
   - Click **Export TXT** — file should contain `Mode: MOCK — synthetic narrative`

2. Click **Load YELLOW sample** → **Validate Facts** → **Generate Narrative**
   - Verify para 2 contains "verbally responded in substance that he was not going back to his cell"
   - Verify the phrase is NOT in quotation marks
   - Verify `[REVIEW — quote is a summary]` appears at end of para 2

3. Click **Load RED sample** (validate only — generate is disabled for RED)
   - Generate button remains disabled

---

## Next Recommended Step

**Step 6 — Live Claude Test**: Set `ANTHROPIC_API_KEY`, load the GREEN sample, select Live mode, confirm checkbox, click Generate — verify a real Claude narrative returns and displays correctly.
