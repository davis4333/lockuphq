# Claude Review Prompt — LOCKUPHQ 6-1 Knowledge Base Draft

You are reviewing a draft knowledge-base document for LOCKUPHQ DR Writer, a tool that helps FDOC correctional officers convert officer-provided facts into a professional Section II disciplinary report narrative for Charge 6-1 only.

Important boundaries:

- The officer remains the author and must review/certify the final narrative.
- The AI must not invent facts.
- The AI must not decide guilt or recommend punishment.
- The AI only drafts the Section II narrative based on officer-provided facts.
- This is for Charge 6-1 only: Disobeying verbal or written order.

Your task is not to rebuild the whole product. Your task is to critique and tighten the knowledge-base draft.

Review for:

1. Missing legal/reporting guardrails.
2. Missing 6-1 required facts.
3. Red blockers that should be added, removed, or changed.
4. Yellow warnings that should be added, removed, or changed.
5. Cleanup rules that may accidentally alter facts.
6. Wording that sounds too legalistic, fake, or unnatural for an FDOC DR.
7. Wording that overstates the officer's knowledge or implies motive/intent.
8. Any risk that the AI might invent facts or over-polish weak facts.
9. Any structural issues in the six-paragraph format.
10. Any implementation suggestions for turning this KB into code later.

Give your feedback in this exact format:

## Overall Verdict

Is this KB draft directionally correct? What is the biggest risk?

## Must Fix Before Locking

List critical changes only.

## Should Improve

List useful but non-critical improvements.

## Keep Exactly As-Is

List the strongest parts that should not be changed.

## Suggested Revised Language

Provide revised wording for any weak sections.

## Final Recommendation

Should this draft move to final audit after fixes, or does it need a full rewrite?

Here is the KB draft to review:

[PASTE 6-1_KB_MASTER_DRAFT.md BELOW]
