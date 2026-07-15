# Step 4K — Charge 6-1 Practice-Inspired Synthetic Tests

**Version:** 1.0  
**Status:** Complete — 5 tests added, all passing  
**Charge:** 6-1 — Disobeying Verbal or Written Order  
**Source:** Fake practice-example lessons from Step 4J (`docs/STEP_4J_6-1_PRACTICE_EXAMPLE_LESSONS.md`)

---

## Purpose

The 73 practice/new-hire example DRs reviewed in Step 4J revealed 8 common 6-1 fact-pattern scenarios that the existing test suite did not cover. This step adds the 5 highest-priority synthetic test cases to expand evaluator coverage before the first UI form is built.

These tests use entirely fake/synthetic data. No real inmate names, DC numbers, officer names, or incident details are used. All 5 cases are inspired by pattern frequency from the practice corpus — not copied from any specific example.

Test cases are added to `src/dr-writer/charges/6-1/testCases6_1.ts` as a new Step 4K section (`kTests`). No evaluator, cleaner, prompt, or KB files were changed.

---

## Source

Step 4J lessons document confirmed these fact patterns as most common in the practice corpus but not yet covered by any existing test case:

| Pattern | Corpus frequency |
|---|---|
| Hand restraints refusal | 27% (20/73) |
| Silent / nonverbal refusal | 16% (12/73) |
| Release to GP / relocation refusal | 36% (26/73) |
| Approximate / paraphrased quote | Very common — TC03 covered one scenario, this adds a cellmate variant |
| Witness staff present | 33% (24/73) |

---

## 5 synthetic test cases

### TC_K01 — Hand restraints refusal → GREEN

**Test ID:** `TC_K01`  
**Expected status:** GREEN  
**Fact pattern:** Officer ordered inmate to submit to hand restraints during an escort. Inmate gave an exact refusal quote. Three orders given. No force. Ability to comply not in question.  
**Fake data:** Officer T. Davis, E Dorm, Inmate Smith DC# A12345, quote: "I'm not cuffing up."  
**What it protects:**
- Confirms the evaluator handles a restraint-order context correctly (not just return-to-cell)
- Confirms an exact quote that is not a summary stays GREEN with no warnings
- Confirms `confinement_status: 'remained'` passes without issue

**Result:** PASS — GREEN, 0 red blockers, 0 yellow warnings

---

### TC_K02 — Silent noncompliance (realistic scenario) → GREEN

**Test ID:** `TC_K02`  
**Expected status:** GREEN  
**Fact pattern:** Inmate made eye contact but said nothing. `inmate_said_nothing = true`, `inmate_quote = null`. Refused by remaining seated and not moving. Three orders given. Officer activity was a scheduled security check.  
**Fake data:** Officer T. Davis, E Dorm, Inmate Smith DC# A12345, no quote.  
**What it protects:**
- Confirms silent refusal with `eye_contact` acknowledgment is GREEN — no invented quote needed
- Confirms no `quote_is_summary` warning when there is no quote
- Confirms no `missing_tone_when_inmate_spoke` warning when inmate said nothing
- Confirms `cleaned_facts.inmate_said_nothing === true` and `cleaned_facts.inmate_quote === null`
- More realistic than TC09 (security check context vs. count context)

**Result:** PASS — GREEN, no unexpected warnings

---

### TC_K03 — Release to GP / relocation refusal → GREEN

**Test ID:** `TC_K03`  
**Expected status:** GREEN  
**Fact pattern:** Inmate instructed to gather property and report for release to general population. Refused with exact quote: "I'm not going." Remained standing inside cell. Three orders given.  
**Fake data:** Officer T. Davis, E Dorm, Inmate Smith DC# A12345, quote: "I'm not going."  
**What it protects:**
- Confirms the evaluator handles a movement/relocation order correctly
- Confirms a long exact_order string (with "general population" language) passes
- Confirms `cleaned_facts.inmate_quote` is preserved exactly
- Confirms the 6-1 charge is not broken by housing/relocation context

**Result:** PASS — GREEN, 0 red blockers, 0 yellow warnings, quote preserved

---

### TC_K04 — Cellmate context with approximate quote → YELLOW

**Test ID:** `TC_K04`  
**Expected status:** YELLOW (`quote_is_summary`)  
**Fact pattern:** Inmate blocking cell doorway, ordered to return to cell. Quote is a paraphrase: "he said he was not moving back into the cell with his cellmate." Three orders given. Cellmate context present.  
**Fake data:** Officer T. Davis, E Dorm, Inmate Smith DC# A12345.  
**What it protects:**
- Confirms the `quote_is_summary` YELLOW fires for cellmate-context paraphrased quotes
- Confirms `affected_paragraph === 2` for this warning
- Confirms cellmate context in `physical_behavior` and `operational_impact` does not break gate logic
- Confirms separate conduct is not triggered by mentioning cellmate — the refusal is still isolatable as 6-1
- Adds a realistic YELLOW variant beyond the original TC03

**Result:** PASS — YELLOW, `quote_is_summary` on paragraph 2, 0 red blockers

---

### TC_K05 — Witness staff present → GREEN

**Test ID:** `TC_K05`  
**Expected status:** GREEN  
**Fact pattern:** All facts present. `witness_staff = 'Officer J. Jones'` (fake). Exact quote given. All other facts match base green pattern.  
**Fake data:** Officer T. Davis, E Dorm, Inmate Smith DC# A12345, witness Officer J. Jones (fake).  
**What it protects:**
- Confirms the optional `witness_staff` field is preserved in `cleaned_facts`
- Confirms a populated witness field does not cause any RED or YELLOW
- Confirms the optional field does not affect gate logic in either direction
- Provides a baseline for prompt-level witness sentence tests if added later

**Result:** PASS — GREEN, 0 red blockers, 0 yellow warnings, witness preserved

---

## Code gaps discovered

**None.** All 5 tests passed on the first run without any change to evaluator, cleaner, prompt, or KB logic. The existing gate logic correctly handled:

- A non-cell-return order context (`submit to hand restraints`, `release to general population`)
- Silent noncompliance with eye-contact acknowledgment
- A longer `exact_order` string with housing language
- Cellmate context in physical behavior and operational impact (did not incorrectly trigger conduct isolation)
- A populated optional `witness_staff` field (no unexpected warnings)

The practice corpus-to-evaluator coverage check is clean.

---

## Test count before and after

| Suite | Before Step 4K | After Step 4K |
|---|---|---|
| `test:6-1` | 59 | 64 |
| `test:6-1:generate` | 9 | 9 (unchanged) |
| `test:6-1:dev-runner` | 24 | 24 (unchanged) |
| **Total** | **92** | **97** |

---

## What was not changed

- `evaluate6_1.ts` — unchanged
- `cleanFacts6_1.ts` — unchanged
- `buildPrompt6_1.ts` — unchanged
- `kb/charges/6-1/gate_rules.json` — unchanged
- `kb/charges/6-1/test_cases.json` — unchanged (new tests are inline in the test file)
- All schema types — unchanged

---

## Remaining Step 4J candidates (not yet implemented)

Three candidates from the Step 4J list were not implemented in this step. They can be Step 4L or later:

| Candidate | Why deferred |
|---|---|
| `TC_6_1_SHOWER_REFUSAL_GREEN` | Same gate coverage as TC_K01 (restraint/movement order) — lower incremental value |
| `TC_6_1_MEDICAL_REFUSAL_FORM_GREEN` | Needs careful charge-boundary fact design before adding |
| `TC_6_1_WRITTEN_ORDER_REFUSAL_GREEN` | `order_type = 'written'` path is untested — good candidate for Step 4L |

---

## Recommendation

**Next recommended step: Step 4L — decide whether to patch KB/prompt from practice lessons or proceed to Step 5B static UI mock.**

### Option A — Step 4L: Written order test + prompt improvement

Add `TC_6_1_WRITTEN_ORDER_REFUSAL_GREEN` (the `order_type = 'written'` path is currently untested). Then consider whether any of the Step 4J prompt improvement candidates (hand-restraint phrasing, silent refusal guidance, witness sentence patterns) should be applied to `buildPrompt6_1.ts` before the UI is built.

### Option B — Proceed to Step 5B: Static mock form

Step 5A (UI plan) is already written. Step 5B is the static mock form — no backend connection, no API calls, layout review only. The current test coverage is sufficient to begin UI layout work in parallel with any remaining Step 4L backend work.

### Recommended path

Do both: write `TC_6_1_WRITTEN_ORDER_REFUSAL_GREEN` as Step 4L (it is a quick single-test addition), then proceed to Step 5B. Written order is the only untested schema path — all other practice patterns are now covered.
