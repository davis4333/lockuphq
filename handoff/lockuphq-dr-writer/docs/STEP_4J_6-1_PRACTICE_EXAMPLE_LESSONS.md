# Step 4J — Charge 6-1 Practice Example Lessons

**Version:** 1.0  
**Status:** Documentation only — no backend or KB changes  
**Charge:** 6-1 — Disobeying Verbal or Written Order  
**Source:** `examples/6-1/notes/6-1_practice_example_analysis.md` and `6-1_practice_test_case_candidates.json`  
**Corpus size:** 73 extractable narratives from 79 practice/new-hire example DRs

---

## A. Purpose

The 73 practice examples reviewed in this step are training and new-hire examples with fake names, fake DC numbers, and invented facts. They are not real incident reports.

These examples are being used to improve:

- **Fact-pattern coverage** — which 6-1 scenarios does the current evaluator and test suite cover well, and which are missing
- **Wording realism** — what phrasing patterns appear most often in real-world-style DRs
- **Weak-spot detection** — where do officers commonly under-specify facts, and are those gaps currently caught by RED/YELLOW gates
- **Future RED/YELLOW/GREEN tests** — 8 candidate synthetic test cases documented in Section E
- **Future UI helper text** — dropdown options, placeholder text, and field warnings that reflect realistic scenarios

Practice examples must not be copied word-for-word into generated reports, KB content, or prompt files. The output of this review is pattern knowledge, not copied text.

---

## B. High-value lessons from the examples

### Pattern frequency (out of 73 narratives)

| Pattern | Count | % |
|---|---|---|
| OIC notified / authorized | 68 | 93% |
| Housing or cellmate issue as context | 48 | 66% |
| Exact inmate quote present | 45 | 62% |
| Security check / count context | 34 | 47% |
| Movement / release refusal | 26 | 36% |
| Medical rounds / refusal form | 25 | 34% |
| Witness staff present | 24 | 33% |
| Hand restraints refusal | 20 | 27% |
| Shower refusal | 13 | 18% |
| Silent or nonverbal refusal | 12 | 16% |
| Search refusal | 1 | 1% |

### Checklist coverage in the examples

| Checklist item | Present | Out of |
|---|---|---|
| OIC authorized close | 72 | 73 |
| Inmate advised of DR | 62 | 73 |
| Exact order wording | 67 | 73 |
| Chapter 33 reference | 27 | 73 |
| Pre-confinement noted | 19 | 73 |
| Explicit order count | 12 | 73 |
| Force / no force noted | 3 | 73 |
| Ability to comply noted | 1 | 73 |

### What these numbers mean

The examples confirm the most common 6-1 scenario types and show that OIC authorization and informing the inmate of the DR are near-universal. They also reveal major coverage gaps: order count, ability to comply, and force/no-force are rarely documented in the practice examples — meaning these are the weakest points in real-world 6-1 writing, and exactly the areas where LOCKUPHQ's RED/YELLOW gates add the most value.

---

## C. Weaknesses found in the examples

Many practice examples under-specify facts that the current LOCKUPHQ evaluator requires. These are not reasons to lower the standard — they confirm that the standard is correctly higher than the baseline.

### Under-specified fields

| Field | How it appears in examples |
|---|---|
| `total_orders_given` | Often omitted entirely. When present, sometimes stated as "several" or "multiple." |
| `ability_to_comply` | Present in only 1 of 73 examples. Almost universally missing. |
| `force_used` | Present in only 3 of 73 examples. Most examples do not address force or no-force. |
| `operational_impact` | Often implied ("disrupting the count") but not stated as a clear sentence. |
| `inmate_quote` vs `inmate_said_nothing` | Quotes are sometimes exact, sometimes paraphrased, and the distinction is never labeled. |
| `physical_behavior` | Often merged into the same sentence as the refusal, not described separately. |

### Style weaknesses

- Most examples are one or two long paragraphs rather than the clean 6-paragraph structure.
- Conclusory phrases appear frequently: "due to not being compliant," "was being non-cooperative," "refused to comply" (without describing observable behavior).
- Spelling/grammar errors are common: typos in "authorized," "receiving," "prescribed," "confinement type."
- Some examples mix separate conduct (assault, threats) into a 6-1 narrative without isolating the charge.
- Some examples use first-person ("I ordered...") inconsistently with third-person style.

### Conclusion

LOCKUPHQ must remain stricter than these examples. The 6-paragraph structure, explicit order count, ability-to-comply field, force/no-force field, and behavioral description requirements are all correct and justified by what is missing from even the best practice examples.

---

## D. Pattern buckets

These are the eight primary 6-1 fact-pattern categories confirmed by the practice corpus, plus one category for structurally weak examples.

### 1. Direct verbal refusal
The officer gives a verbal order; the inmate responds verbally (exact or approximate quote) and does not comply. The most basic 6-1 fact pattern. Already well-covered by TC01 and TC03 in the current test suite.

### 2. Silent refusal / nonverbal refusal
The inmate says nothing but refuses by action — remaining in place, refusing to move, refusing to place hands through the flap, continuing prior behavior. Acknowledgment must be established through proximity or behavioral cues rather than a verbal response. Current intake supports `inmate_said_nothing = true`. Evaluator behavior for silent cases needs a synthetic test.

### 3. Refusal to return to cell
The most common specific order type. Inmate is ordered to return to assigned cell and refuses. Already covered by the TC01 base case. The practice corpus confirms this pattern is realistic.

### 4. Refusal to submit to restraints
Inmate is ordered to submit to hand restraints (cuffing through the flap, applying restraints before movement, restraint during security check) and refuses. Appears in 27% of examples. Not covered by any current test case — best candidate for a new synthetic test.

### 5. Refusal related to shower
Inmate is ordered to comply with shower movement procedure (submit to restraints for escort, exit cell for shower, comply with shower-related directive) and refuses. Usually tied to hand restraint or movement. Appears in 18% of examples.

### 6. Refusal related to medical / refusal form
Inmate is instructed by medical or security staff to comply with a medical-round directive or sign a medical refusal form and refuses. Charge boundary matters: the order must be a staff-issued directive for 6-1 to apply. Appears in 34% of examples. Needs careful test case design to keep charge boundary clear.

### 7. Refusal during count / security check
The incident occurs in the context of a headcount, master roster count, security check, or scheduled movement. The inmate refuses to comply with a directive issued as part of that procedure. Appears in 47% of examples. Operational impact is often about disrupting the count.

### 8. Refusal to leave / enter assigned housing (release or relocation)
Inmate is instructed to exit confinement, relocate to general population, or accept a new housing assignment and refuses. Often tied to a cellmate objection. Appears in 36% of examples as movement refusal, 66% as housing/cellmate context. Common enough to need its own test case.

### 9. Multi-staff / witnessed refusal
Other staff are present and observed the refusal. The report includes a witness sentence. Appears in 33% of examples. Current intake has an optional `witness_staff` field. A test case confirming the witness sentence appears without affecting gate logic would be useful.

### 10. Weak / incomplete DR examples
Examples that have the right fact pattern but omit required details — most commonly: no order count, no ability-to-comply, no force/no-force statement, or conclusory physical behavior description. These are useful as warning examples and as inspiration for RED/YELLOW test cases.

---

## E. Proposed future synthetic tests

These are candidate test cases drawn from the practice corpus. They are **not yet added to any test file.** Each must be implemented as a proper test in `testCases6_1.ts` with a full fake `IntakeFacts6_1` object before it is considered covered. Step 4K will implement 5 of these.

---

### E1 — Hand restraints refusal, GREEN

**Proposed test name:** `TC_6_1_HAND_RESTRAINTS_REFUSAL_GREEN`  
**Expected status:** GREEN  
**Fact pattern:** Inmate is ordered to submit to hand restraints during a security check. Officer gives multiple orders. Inmate refuses with an exact quote. No force used. Ability to comply noted. Operational impact present.  
**Why it matters:** 27% of practice examples involve hand-restraint refusal. The current test suite only covers return-to-cell orders. This expands fact-pattern coverage without changing gate logic.  
**What it should verify:** All 6-1 elements pass with a restraint-order context. GREEN status. Evaluator correctly handles an order type other than "return to cell."

---

### E2 — Release to GP refusal, GREEN

**Proposed test name:** `TC_6_1_RELEASE_TO_GP_REFUSAL_GREEN`  
**Expected status:** GREEN  
**Fact pattern:** Inmate is instructed to exit confinement and relocate to general population. Inmate refuses to move. Officer gives multiple orders. Refusal documented verbally or by action. Operational impact: delayed movement or count disruption.  
**Why it matters:** Very common pattern (36%). Confirms that movement/relocation orders are handled the same way as cell return orders by the evaluator.  
**What it should verify:** GREEN status. Order wording with housing/movement context passes all required checks.

---

### E3 — Cellmate / housing issue with approximate quote, YELLOW

**Proposed test name:** `TC_6_1_CELLMATE_HAND_RESTRAINTS_YELLOW`  
**Expected status:** YELLOW  
**Fact pattern:** Inmate refuses to submit to restraints, citing a housing objection. Quote is paraphrased rather than verbatim (e.g., "stated that he was not going to accept a cellmate").  
**Why it matters:** Housing/cellmate context is the most common scenario in the corpus (66%). Paraphrased quotes are common. This tests that `quote_is_summary` is flagged correctly in a realistic non-cell-return scenario.  
**What it should verify:** YELLOW status with `quote_is_summary` warning. Paragraph 2 has `[REVIEW — quote is a summary]` marker.

---

### E4 — Shower refusal, GREEN

**Proposed test name:** `TC_6_1_SHOWER_REFUSAL_GREEN`  
**Expected status:** GREEN  
**Fact pattern:** Inmate is ordered to comply with shower movement procedure (submit to restraints for escort). Inmate refuses. Multiple orders given. No apparent medical/compliance issue. No force used. Operational impact: delayed shower movement.  
**Why it matters:** 18% of examples involve shower refusal. Tests that the evaluator is order-type-agnostic — the specific order content does not affect gate logic.  
**What it should verify:** GREEN status. Shower-context order passes all checks. Ability-to-comply and force/no-force fields are present and correct.

---

### E5 — Medical / refusal form context, GREEN

**Proposed test name:** `TC_6_1_MEDICAL_REFUSAL_FORM_GREEN`  
**Expected status:** GREEN (with carefully specified facts)  
**Fact pattern:** Officer directs inmate to comply with a medical-round directive (e.g., present for medication or sign a refusal-of-treatment form per staff instruction). Inmate refuses. Charge boundary is clear: the order is a staff-issued directive, not a medical judgment.  
**Why it matters:** 34% of examples involve medical context. Tests that the evaluator correctly handles medical-round orders as 6-1-eligible when the order is staff-issued.  
**What it should verify:** GREEN status. Medical-context facts pass. Order is clearly a staff directive (not a medical recommendation). No charge-boundary confusion.

---

### E6 — Silent noncompliance, GREEN

**Proposed test name:** `TC_6_1_SILENT_NONCOMPLIANCE_GREEN`  
**Expected status:** GREEN  
**Fact pattern:** Inmate says nothing but refuses by action — remains on bunk, does not place hands through flap, refuses to move. `inmate_said_nothing = true`. Acknowledgment established by eye contact or proximity. Physical behavior described observationally.  
**Why it matters:** 16% of examples involve silent refusal. Current TC09 covers `inmate_said_nothing = true` for GREEN, but a synthetic test with a realistic silent-restraint-refusal scenario adds behavioral coverage.  
**What it should verify:** GREEN status. `inmate_said_nothing` does not trigger any RED or YELLOW. Physical behavior is sufficient even without a quote.

---

### E7 — Written order refusal, GREEN

**Proposed test name:** `TC_6_1_WRITTEN_ORDER_REFUSAL_GREEN`  
**Expected status:** GREEN  
**Fact pattern:** Inmate is issued a written housing directive or movement order and refuses to comply. `order_type = 'written'`. Source of the written order is clear. Inmate's awareness of the order is documented.  
**Why it matters:** The current intake type supports `order_type = 'written'` but no test covers this path. Written orders are a documented 6-1 pattern.  
**What it should verify:** GREEN status. Written-order path produces a valid narrative. `order_type` is correctly reflected in the prompt and output.

---

### E8 — Witness staff present, GREEN

**Proposed test name:** `TC_6_1_WITNESS_STAFF_PRESENT_GREEN`  
**Expected status:** GREEN  
**Fact pattern:** All facts present. `witness_staff` field is populated with rank and last name. Vague witness entries like "other officers" are not used.  
**Why it matters:** 33% of examples include witness staff. The optional `witness_staff` field needs a test confirming it adds a witness sentence without affecting gate logic or status.  
**What it should verify:** GREEN status. Witness sentence appears in expected paragraph. Gate logic is unaffected by the optional witness field.

---

## F. Prompt / KB improvement candidates

These are proposals only. No KB changes are made in this step. Each item requires its own change, its own test, and its own review before implementation.

| Candidate | What it would add | Priority |
|---|---|---|
| Hand-restraint refusal guidance | Prompt examples for restraint-order phrasing in paragraphs 1–3 | High — 27% frequency |
| Silent refusal / no-quote guidance | Clearer prompt rules for when `inmate_said_nothing = true` — how paragraph 2 should read | High — 16% frequency |
| Written order refusal guidance | Prompt examples for how to reference a written directive vs verbal order in paragraph 2 | Medium |
| Medical / refusal form context | Prompt note on how to handle medical-context orders while keeping charge boundary clear | Medium — 34% frequency |
| Release / relocation refusal | Prompt examples for exit-confinement and housing-relocation order phrasing | Medium — 36% frequency |
| Witness staff sentence patterns | Prompt examples for a well-formed witness sentence in paragraph 4 or 5 | Low — optional field |
| Ability-to-comply helper text | UI helper text improvement — field appears in only 1% of practice examples, meaning officers rarely think to include it | High for UI |
| Force / no-force helper text | UI helper text improvement — field appears in only 4% of practice examples | High for UI |

---

## G. Recommendation

**Next recommended step: Step 4K — Select 5 synthetic practice-inspired cases and add them as non-live tests.**

### Why Step 4K before UI

The practice corpus confirmed 8 common fact-pattern scenarios that the current test suite does not cover. Before the first UI form is built (Step 5B), the evaluator should be verified to handle at least the most common of these patterns correctly.

### Which 5 to implement first in Step 4K

Recommended priority order:

1. `TC_6_1_HAND_RESTRAINTS_REFUSAL_GREEN` — highest frequency gap (27%)
2. `TC_6_1_SILENT_NONCOMPLIANCE_GREEN` — validates no-quote path with realistic scenario
3. `TC_6_1_RELEASE_TO_GP_REFUSAL_GREEN` — very common pattern (36%)
4. `TC_6_1_CELLMATE_HAND_RESTRAINTS_YELLOW` — tests YELLOW path with realistic scenario
5. `TC_6_1_WITNESS_STAFF_PRESENT_GREEN` — confirms optional witness field behavior

The remaining 3 candidates (shower, medical form, written order) are Step 4K follow-ons or Step 4L.

### What Step 4K is not

- Step 4K does not change `evaluate6_1.ts`, `cleanFacts6_1.ts`, or any KB file.
- Step 4K only adds new entries to `testCases6_1.ts` with new fake `IntakeFacts6_1` objects.
- If a test reveals a real gap in the evaluator, that gap becomes a separate patch step.

### Do not jump to UI until Step 4K is complete

Step 5B (static mock form) should only begin after Step 4K test cases are passing. The practice corpus shows scenarios the evaluator has not yet been exercised against. Discovering a gap after the UI is built is harder to fix than discovering it in tests.
