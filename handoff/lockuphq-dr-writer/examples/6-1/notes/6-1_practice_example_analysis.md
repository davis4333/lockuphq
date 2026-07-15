# Charge 6-1 Practice DR Example Analysis

> **Resolution note (2026-07-01) — read this before treating the "weakness" section below as a mandate to lower the standard.**
>
> This analysis's "Important weakness found in the examples" section (below) flags that most practice examples are "one long paragraph instead of clean sections" and treats that as a weakness alongside real content gaps (missing order counts, missing ability-to-comply, conclusory language). That framing conflated two different things: **format** (one paragraph vs. the six-paragraph structure this project built) and **content quality** (vague order counts, missing disclaimers, conclusory language like "disobedient" with no observable facts behind it).
>
> A separate check against 62 real, accepted FDOC Charge 6-1 reports (Okeechobee CI, 2018-2023) confirmed those are the same underlying real-world data as the 73 extractable practice narratives referenced here — not a conflicting source. Every one of those real accepted reports was a single continuous paragraph (median 145 words, range 89-240). FDOC accepts and expects the one-paragraph format; the six-paragraph structure was never required by FDOC, it was a project-internal design choice.
>
> The resolution: `docs/lockuphq_dr_writer_master_prompt_corrected.md` is now the source of truth. It restores the real single-paragraph structure but **keeps a stricter standard than loose real-world practice** on the two things that were genuinely weak in both the practice examples and real accepted reports — order counts (always require a specific number, never "several/multiple times") and behavior language (flag conclusory terms like "disobedient" or "noncompliant" when no observable fact backs them up). This is not lowering the bar; it's fixing a structural mismatch (paragraph count) while holding or raising the content bar (specificity, non-conclusory language).
>
> If a future session (including the 6-2 build) re-reads the weakness section below and concludes the six-paragraph format needs restoring or defending, that conclusion is stale — check `docs/lockuphq_dr_writer_master_prompt_corrected.md` first.

## Scope reviewed

- Uploaded package: `6-1.zip`
- Files found: 79
- Formats: {'.xlsx': 71, '.docx': 1, '.ods': 6, '.xls': 1}
- Narratives/extractable example text found: 73
- Files that appeared blank/unextractable for narrative text: 6

I treated these as practice/new-hire training examples, but I still avoided copying raw names/DC numbers into this analysis. The value here is pattern extraction, not memorizing individual examples.

## Most common practice-example patterns

- `oic_notified`: 68
- `housing_cellmate_issue`: 48
- `exact_quote_present`: 45
- `security_check_count_context`: 34
- `movement_release_refusal`: 26
- `medical_rounds_refusal`: 25
- `witness_staff`: 24
- `hand_restraints_refusal`: 20
- `shower_refusal`: 13
- `silent_or_nonverbal_refusal`: 12
- `search_refusal`: 1

## Key checklist coverage found in the examples

- `explicit_multiple_orders`: 12/73
- `oic_authorized`: 72/73
- `preconfinement`: 19/73
- `force`: 3/73
- `ability_comply`: 1/73
- `chapter_33`: 27/73
- `advised_dr`: 62/73
- `exact_order_word`: 67/73

## What the examples are strongest for

These practice examples are useful for building a realistic 6-1 fact-pattern library. The strongest recurring patterns are:

1. **Refusal to submit to hand restraints** during confinement operations or security checks.
2. **Refusal to exit confinement / relocate to general population.**
3. **Refusal connected to receiving a cellmate or housing assignment.**
4. **Shower-related refusals**, usually tied to hand restraints or movement.
5. **Medical-rounds refusals**, including refusal to sign a medical refusal form.
6. **Silent or nonverbal refusal**, including no response, no movement, or continued noncompliance.
7. **Witness staff present** when the refusal occurred.
8. **OIC notified/authorized** at the end of the report.

## Most useful structure pattern

The common structure is:

1. Officer assignment/post.
2. Date/time/location/activity.
3. Inmate identification and housing/location.
4. Direct order or directive.
5. Inmate refusal/quote/noncompliance.
6. Warning that failure to comply would lead to DR.
7. Charge language.
8. Witness/OIC close.

## Important weakness found in the examples

These examples are good for fact patterns, but many are weaker than the current LOCKUPHQ 6-1 standard.

Common weaknesses:
- Often one long paragraph instead of clean sections.
- Many do **not** clearly state the exact number of orders given.
- Ability to comply is usually missing.
- Force/no-force is usually missing.
- Operational impact is often implied but not explained.
- Quotes are sometimes exact, sometimes approximate, and not always labeled.
- Spelling/grammar errors appear often, such as approximate/authorized/receiving/prescribed/confinement-type errors.
- Some reports use generic wording like “due to not being compliant,” which is weaker than describing the actual conduct.
- Some examples mix extra conduct into a 6-1 narrative, which should be isolated or flagged.

## What this means for our current 6-1 writer

The current LOCKUPHQ 6-1 writer should **not copy the practice examples’ style wholesale**. Our current locked 6-paragraph structure is cleaner and safer.

Use these examples for:
- realistic scenario coverage
- future fake test cases
- UI helper text
- dropdown/fact-pattern options
- common missing-fact warnings
- officer training examples

Do not use them to lower the standard.

## Recommended new fake test cases

Add these as future synthetic tests:

1. `TC_6-1_HAND_RESTRAINTS_REFUSAL_GREEN`
   - Order: submit to hand restraints.
   - Refusal quote exact.
   - Staff witness optional.
   - Expected GREEN if all facts present.

2. `TC_6-1_RELEASE_TO_GP_REFUSAL_GREEN`
   - Order: exit confinement / relocate to general population.
   - Inmate refuses to leave.
   - Expected GREEN.

3. `TC_6-1_CELLMATE_HAND_RESTRAINTS_YELLOW`
   - Inmate refuses cuffs because of cellmate issue.
   - Quote is approximate.
   - Expected YELLOW quote-summary.

4. `TC_6-1_SHOWER_REFUSAL_GREEN`
   - Inmate ordered to submit to restraints for shower/movement.
   - Refusal documented.
   - Expected GREEN if operational impact and ability-to-comply are present.

5. `TC_6-1_MEDICAL_REFUSAL_FORM_GREEN_OR_YELLOW`
   - Inmate ordered to sign medical refusal form or comply with medical-round directive.
   - Needs careful wording so the order is staff-authorized and charge remains 6-1.

6. `TC_6-1_SILENT_NONCOMPLIANCE_YELLOW`
   - Inmate does not speak but refuses by action/no movement.
   - Expected GREEN if acknowledgment is clear; YELLOW if acknowledgment is vague.

7. `TC_6-1_WRITTEN_ORDER_REFUSAL`
   - Inmate disobeys written movement/housing directive.
   - Expected GREEN if written order source and refusal facts are clear.

8. `TC_6-1_WITNESS_STAFF_PRESENT`
   - Optional witness field included.
   - Should add witness sentence without changing charge logic.

## UI field lessons

The future UI should support quick scenario context without overcomplicating the first build:

- Order category dropdown:
  - return to assigned cell
  - submit to hand restraints
  - exit dorm/confinement
  - relocate to assigned housing/general population
  - submit to search
  - comply with shower/movement procedure
  - sign/refuse medical form
  - other

- Response type:
  - exact quote
  - summary/approximate quote
  - said nothing
  - refused by action only

- Physical behavior examples:
  - remained at cell door
  - stayed on bunk
  - crossed arms
  - refused to place hands through flap
  - refused to exit cell
  - refused to enter assigned area
  - refused to sign form

- Optional witness staff:
  - witness rank/name
  - what witness observed

## Prompt/KB lessons

Potential future KB improvements:
- Add stronger 6-1 examples for hand-restraint refusal.
- Add guidance for silent refusal/no quote.
- Add guidance for written-order refusal.
- Add guidance for medical-round/refusal-form cases.
- Add guidance for witness staff sentences.
- Add explicit warning to avoid copying extra conduct into 6-1 if it belongs to another charge.

## Bottom-line recommendation

Run a new Step 4J:

**Step 4J — Practice example lessons integration plan**

Do not rewrite the KB yet. First create:
- a lessons doc inside the project
- a synthetic test-case candidate list
- a phrase-pattern bank
- a list of potential YELLOW/RED scenarios pulled from the practice examples

Then decide which lessons are safe enough to become tests or prompt improvements.
