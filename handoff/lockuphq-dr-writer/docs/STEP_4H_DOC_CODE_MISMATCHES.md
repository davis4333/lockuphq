# Step 4H — Doc/Code Mismatches Found During Field Review

**Status:** Documentation only — no code patched here.  
**Source review:** `kb/charges/6-1/gate_rules.json` vs `src/dr-writer/charges/6-1/evaluate6_1.ts`  

---

## Summary

Four mismatches found between `gate_rules.json` (the KB authority document) and `evaluate6_1.ts` (the running code). None are critical — existing tests pass and the pipeline is correct for all current test cases. These are gaps to resolve before the UI ships, not before the next step.

---

## Mismatch 1 — `missing_force_answer`: In code, not in gate_rules.json

**Severity:** Low — code is correct, doc is missing an entry.

**What the code does:**
`evaluate6_1.ts` (line 375–381) checks:
```typescript
if (intake.force_used !== 'no' && intake.force_used !== 'yes') {
  blockers.push({
    id: 'missing_force_answer',
    missing_fact: 'Missing force-used answer',
    follow_up_question: 'Was force used during this incident? Answer yes or no.',
  });
}
```

This was added in Patch 4 (Step 3B). The test `TC_B01` explicitly validates this behavior.

**What gate_rules.json says:**
`gate_rules.json` only lists `force_no_explanation` (force used but no explanation). It does not have a `missing_force_answer` entry for when `force_used` is null/undefined.

**Risk:** None — the code behavior is correct and tested. The doc is out of date.

**Recommended fix:** Add `missing_force_answer` entry to `gate_rules.json` to match the code. Safe to do in a future cleanup step.

---

## Mismatch 2 — `facts_do_not_meet_6_1`: In gate_rules.json, not in code

**Severity:** Low — gate_rules.json documents a gate that is not yet implemented.

**What gate_rules.json says:**
```json
{
  "id": "facts_do_not_meet_6_1",
  "description": "Facts clearly indicate this incident does not meet the elements of a 6-1 charge — no order was given, or no refusal occurred.",
  "intake_field": "various",
  "check": "logic_check_in_evaluator",
  "follow_up_question": "Based on your answers, the facts may not support a 6-1 charge..."
}
```

**What the code does:**
No check for `facts_do_not_meet_6_1` exists in `evaluate6_1.ts`. This is documented as a `logic_check_in_evaluator` in the KB but no logic was implemented.

**Risk:** Low. The existing RED blockers cover the most critical missing-element cases individually (no order given, no refusal documented, etc.). A holistic `facts_do_not_meet_6_1` check would be an additional layer of protection.

**Recommended fix:** Before UI launch, consider adding a top-level holistic check in `evaluate6_1.ts` that fires when the facts collectively fail to support the charge even if individual fields are present. This is a judgment-based check and needs careful scoping. Do not implement without a test suite addition.

---

## Mismatch 3 — `implied_oic_authorization`: In gate_rules.json yellow warnings, not in code

**Severity:** Low — a documented YELLOW warning not yet implemented.

**What gate_rules.json says:**
```json
{
  "id": "implied_oic_authorization",
  "description": "OIC authorization described as implied rather than explicit...",
  "check": "implied_authorization_language",
  "affected_paragraph": 6
}
```

**What the code does:**
`evaluate6_1.ts` has no check for implied authorization language. The existing checks are `missing_oic_rank` / `missing_oic_last_name` (both RED) and `oic_incomplete` (YELLOW, partial). No language pattern check for phrases like "the captain knew about it" exists.

**Risk:** Low for now — the current intake model uses structured fields (`oic_rank`, `oic_last_name`) rather than a free-text authorization field. The implied-authorization YELLOW assumes an officer might type narrative-style OIC language somewhere, which is not currently possible in the intake schema.

**Recommended fix:** When the UI is built, if an open-text OIC field is added or if `additional_facts` is monitored for OIC language patterns, this check could be implemented. For the current structured schema, this warning does not apply and can remain unimplemented.

---

## Mismatch 4 — `unclear_confinement_status`: In gate_rules.json yellow warnings, not in code

**Severity:** Low — a documented YELLOW warning not yet implemented.

**What gate_rules.json says:**
```json
{
  "id": "unclear_confinement_status",
  "description": "Confinement status unclear or ambiguous.",
  "intake_field": "confinement_status",
  "check": "null_or_ambiguous",
  "affected_paragraph": 6
}
```

**What the code does:**
`evaluate6_1.ts` does not check for `unclear_confinement_status`. The `confinement_status` field is optional — a null value passes through without triggering a blocker or warning. The `cleanFacts6_1.ts` module does handle the `disciplinary_confinement_corrected` YELLOW via the `additional_facts` field, but there is no check for `confinement_status` being null or ambiguous.

**Risk:** Low — `confinement_status` is currently an optional enum field with three valid values (`placed`, `remained`, `none`). A null value means the officer left it blank; the confinement line is omitted from the narrative. The KB document describes "none" as "(Confinement line omitted entirely)" which is the intended behavior for null.

**Recommended fix:** Before UI launch, decide whether `confinement_status` should be:
- Required (add RED blocker for null), or
- Optional with YELLOW if null (implement `unclear_confinement_status`), or
- Truly optional with no gate (current behavior — the line is simply omitted).

This requires a policy decision before implementation.

---

## Summary table

| Mismatch | Direction | Severity | Recommended action |
|---|---|---|---|
| `missing_force_answer` | Code has it, gate_rules.json doesn't | Low | Add to gate_rules.json in future cleanup |
| `facts_do_not_meet_6_1` | gate_rules.json has it, code doesn't | Low | Implement before UI launch with tests |
| `implied_oic_authorization` | gate_rules.json has it, code doesn't | Low | Implement when UI adds OIC free-text or re-evaluate if not applicable |
| `unclear_confinement_status` | gate_rules.json has it, code doesn't | Low | Requires policy decision on whether confinement_status should be required |

---

## What was NOT changed in Step 4H

- No code was patched.
- All existing tests continue to pass.
- No schema changes were made.
- These mismatches are flagged for future resolution, not immediate action.
