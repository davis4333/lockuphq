# Step 4L — Written-Order Path Test and Pre-UI Decision

**Version:** 1.0  
**Status:** Complete — test passing, decision made  
**Charge:** 6-1 — Disobeying Verbal or Written Order  

---

## Purpose

`order_type` in `IntakeFacts6_1` supports three values: `'verbal'`, `'written'`, and `'both'`. Every existing test case used `'verbal'`. The written-order path had no direct coverage, meaning a regression in how `order_type = 'written'` flows through `cleanFacts6_1` and `buildPrompt6_1` would not have been caught by the test suite.

This step adds the missing coverage and closes the schema-path gap before UI work begins.

---

## Why written-order path needed coverage

A 6-1 charge can arise from disobeying either a verbal or a written order. The schema explicitly supports both. Officers in the field sometimes issue written housing assignments, written directives, or written movement orders — and inmates refuse to comply. Without a test for `order_type = 'written'`:

- A change to `cleanFacts6_1.ts` that accidentally dropped or mishandled the `order_type` field would not fail any test.
- A prompt change that only referenced "verbal order" language when `order_type = 'written'` was set would not fail any test.
- The written-order path would remain trusted by assumption rather than by evidence.

---

## Test summary

**Test ID:** `TC_L01`  
**Suite:** `test:6-1` (Step 4L section in `testCases6_1.ts`)  
**File:** `src/dr-writer/charges/6-1/testCases6_1.ts`

**Fake facts used:**

| Field | Value |
|---|---|
| `officer_rank` | Officer |
| `officer_name` | T. Davis |
| `officer_post` | housing officer |
| `dorm_area` | E Dorm |
| `inmate_last_name` | Smith |
| `inmate_first_name` | John |
| `dc_number` | A12345 |
| `order_type` | `written` |
| `exact_order` | comply with the written housing reassignment order |
| `total_orders_given` | 1 |
| `acknowledgment_type` | `actions_showed_awareness` |
| `inmate_quote` | "I'm not signing that and I'm not moving." |
| `inmate_said_nothing` | false |
| `inmate_tone` | firm and refusing |
| `physical_behavior` | refused to sign the written order and remained seated on his bunk |
| `operational_impact` | delaying the housing reassignment process and requiring additional staff attention |
| `ability_to_comply` | `no_issue` |
| `force_used` | no |
| `confinement_status` | placed |
| `oic_rank` | Captain |
| `oic_last_name` | Brown |

**Assertions checked:**
- `status === 'GREEN'`
- `red_blockers.length === 0`
- `yellow_warnings.length === 0`
- `cleaned_facts !== null`
- `cleaned_facts.order_type === 'written'`
- `cleaned_facts.exact_order` preserves the order text
- `buildPrompt6_1` returns non-null prompt
- No `[REVIEW —` markers in the GREEN prompt

---

## Result

**PASS — GREEN, no blockers, no warnings.**

`order_type = 'written'` flows correctly through the full evaluation and prompt-build pipeline. The cleaner preserves the value. The prompt builder handles it without error. No changes to any backend file were required.

---

## Backend gap found

**None.** The written-order path works correctly as implemented. No changes to `evaluate6_1.ts`, `cleanFacts6_1.ts`, `buildPrompt6_1.ts`, `gate_rules.json`, or any schema file were needed.

---

## Test count

| Suite | Before Step 4L | After Step 4L |
|---|---|---|
| `test:6-1` | 64 | 65 |
| `test:6-1:generate` | 9 | 9 |
| `test:6-1:dev-runner` | 24 | 24 |
| **Total** | **97** | **98** |

---

## Pre-UI decision

### What was reviewed

Before making the recommendation, the following were considered:

1. **Step 4J prompt/KB improvement candidates** — 8 potential improvements identified from 73 practice examples (hand-restraint phrasing, silent refusal guidance, written-order guidance, medical-context handling, relocation phrasing, witness sentence patterns, ability-to-comply helper text, force/no-force helper text).

2. **Step 4K test results** — All 5 practice-inspired synthetic tests passed without any backend change. The evaluator correctly handles hand-restraint orders, silent noncompliance, relocation orders, approximate quotes with cellmate context, and optional witness staff.

3. **Step 4L test result** — Written-order path passes cleanly.

4. **Current coverage state:**

| Fact pattern | Covered by test |
|---|---|
| Verbal order, exact quote, return to cell | TC01 |
| Silent refusal, inmate_said_nothing | TC09, TC_K02 |
| Hand restraints order | TC_K01 |
| Release to GP / relocation order | TC_K03 |
| Written order | TC_L01 |
| Approximate/summary quote | TC03, TC_K04 |
| Witness staff present | TC_K05 |
| Force used / no explanation | TC06 |
| Missing force answer (null) | TC_B01 |
| Multiple charges / separate conduct | TC07 |
| RED blockers (5 types) | TC02–TC06, TC_B01 |

5. **Backend stability** — `evaluate6_1.ts`, `cleanFacts6_1.ts`, `buildPrompt6_1.ts`, and `gate_rules.json` have not changed since Step 3C-7. All 98 tests pass. No regressions. No known open gaps.

---

### Option A — Prompt/KB patch before UI

Apply one or more Step 4J prompt improvement candidates to `buildPrompt6_1.ts` or the KB before starting Step 5B.

**When to choose this:** If a specific prompt rule is known to produce incorrect or poor output for a real-world scenario that is not yet handled. For example, if a live API test (Step 4E or manual) revealed that the prompt mishandles silent refusal or written-order language in the generated narrative.

**Risk:** Changing a prompt rule requires careful testing (prompt-level assertions in the test suite) and increases the scope of Step 4L. The current prompt rules produce correct gate evaluation — the issue would only be in narrative quality, which requires a live test to observe. Making prompt changes without live validation is lower confidence.

---

### Option B — Proceed to Step 5B static UI mock

Build the first static mock form (no backend connection, no API, layout review only). Use the current locked backend as-is.

**When to choose this:** When all known schema paths are covered by tests, no open evaluation gaps exist, and the next highest-value work is getting a form in front of Tyler to review field layout, labels, and helper text.

**Risk:** Low. Step 5B has no backend connection. If a prompt improvement is identified during Step 5B layout review, it can be applied in a Step 4M patch without disrupting UI progress.

---

### Recommendation

**Proceed to Step 5B static UI mock.**

The reasoning:

1. All major 6-1 fact patterns now have test coverage (verbal, written, silent, restraint, relocation, witness, approximate quote, force, RED blockers).
2. No backend gaps were found in Steps 4K or 4L.
3. The Step 4J prompt improvement candidates are speculative improvements (better narrative quality) rather than correctness fixes. They require live API validation to assess, and no live tests have been authorized for this step.
4. Step 5B is a static form — it does not call the backend. Prompt improvements can happen in parallel with or after Step 5B without blocking anything.
5. The field contract and UI plan (Steps 4H and 5A) are fully documented. The form can be built now without additional backend prep.

**Prompt improvements to defer to Step 4M (after Step 5B layout is reviewed):**
- Hand-restraint order phrasing guidance in the prompt
- Silent refusal / no-quote paragraph 2 handling guidance
- Written-order source reference guidance
- Witness sentence pattern guidance

These become higher priority once live API testing is authorized and narrative quality can be observed directly.
