# Step 4I — Charge 6-1 Practice DR Corpus

**Version:** 1.0  
**Status:** Structure created — no examples analyzed yet  
**Charge:** 6-1 — Disobeying Verbal or Written Order  

---

## 1. Purpose

Tyler has Charge 6-1 disciplinary reports written as practice/new-hire training examples. Names, DC numbers, dates, and facts are invented. These are not real incident reports.

This corpus gives the project a safe set of examples to learn from before any UI is built or live API calls are made. The goals are:

- Observe how real-world officers structure 6-1 narratives
- Identify strong wording and phrase patterns worth preserving
- Identify weak wording and missing facts that RED/YELLOW gates should catch
- Surface common 6-1 fact patterns to inform test cases and helper text
- Improve prompt instructions with concrete examples of good and bad structure

The examples are used for pattern extraction only. They never become output text, and no sentence is copied word-for-word into generated reports or KB content.

---

## 2. Non-goals

- No real inmate data, real DC numbers, real officer names, or real case numbers.
- No real incident reports — only confirmed fake/practice examples.
- No UI implementation at this step.
- No Claude API calls at this step.
- No other charges — this corpus covers Charge 6-1 only.
- No database or storage layer — examples are flat text files.
- No fine-tuning or model training.
- No copying example text verbatim into KB or prompt files.

---

## 3. Folder structure

```
examples/
  6-1/
    README.md              ← overview and safe-use rules
    practice/              ← fake training/new-hire examples
    reviewed/              ← examples checked and approved for KB influence
    notes/                 ← extracted lessons, patterns, and possible test cases
```

All three subfolders exist and are tracked. The `practice/` folder is not gitignored because examples are confirmed fake. The `README.md` warns that real reports must never be placed there.

### practice/

Intake point for fake examples. Files are added here first. Each file is a disciplinary report written as a training example — not a real incident. Naming convention: `example-001.txt`, `example-002.txt`, or similar. Format is free-text (plain narrative as written, not yet structured).

### reviewed/

Files from `practice/` that have been read, checked for any accidental real data, and approved for pattern extraction. Each reviewed example has an associated notes entry. If a file is in `reviewed/`, it is safe to reference when updating KB content, helper text, or test cases.

### notes/

Lesson documents extracted from reviewed examples. Each document covers one or more examples and records what was learned — strong phrases, weak spots, fact pattern tags, and possible test case ideas. These notes are the actionable output of the review workflow.

---

## 4. Safe use rules

1. **Only fake examples in `practice/`.** If any doubt exists about whether a file contains real data, do not add it. Resolve the question first.

2. **Read before referencing.** Before citing anything from a practice example in a doc, prompt, or KB file, confirm you have read the example and it is confirmed fake.

3. **Extract patterns, not text.** The output of reviewing an example is a notes document with lesson bullets — not a quote of the example. Specific phrases may be noted, but full paragraphs are not reproduced in KB or prompt files.

4. **KB changes need their own commit and tests.** If a reviewed example suggests an improvement to `gate_rules.json`, `evaluate6_1.ts`, or a prompt rule, that change goes through the normal KB update cycle — its own change, its own test, its own review.

5. **Test cases from examples need real test coverage.** If an example suggests a new RED or YELLOW case, it becomes an entry in `testCases6_1.ts` — not just a note. Until a test is written, it is a proposed test case, not a confirmed gate.

---

## 5. How practice examples should be reviewed

**Step A — Add to practice/**  
Place the fake example file in `examples/6-1/practice/`. Name it sequentially. Do not modify the original text — preserve it as-is for reference.

**Step B — Read the full example**  
Read the entire narrative. Note the paragraph structure, wording choices, and what facts are present or absent. Do not skim.

**Step C — Check for accidental real data**  
Confirm: no real DC number format (`[A-Z]\d{5}`), no real date, no real case number, no real named staff or facility. If anything looks real, stop and resolve before continuing.

**Step D — Copy to reviewed/**  
If the file passes Step C, copy it to `examples/6-1/reviewed/`. Do not delete the original from `practice/`.

**Step E — Write a notes entry**  
Create a notes document in `examples/6-1/notes/` for the example (e.g., `notes-example-001.md`). Populate it using the extraction guide in Section 6.

**Step F — Update this doc or the README if a pattern is significant**  
If the review surfaces a new insight that should inform future work (a new fact pattern tag, a new test case class, a new helper text idea), note it here under an addendum or open it as a future task.

---

## 6. What to extract from examples

Each notes document should cover these categories.

### Strong wording

Phrases and sentence constructions that are specific, factual, and professional. Examples:

- A clear behavioral description with position and action: "remained in the corridor with his arms crossed, facing this officer"
- A precise operational impact statement: "temporarily interrupting the master roster count and drawing the attention of surrounding inmates in [LOCATION]"
- A clean order statement: "ordered [INMATE] to return to his assigned cell"

Note the phrase, note which paragraph it appeared in, and note why it works.

### Weak wording

Phrases that are vague, conclusory, or would trigger a RED/YELLOW gate. Examples:

- "was noncompliant" — conclusory, describes conclusion not behavior
- "refused to comply" — describes outcome, not observable action
- "several times" — vague count
- "he was being difficult" — opinion, not observation
- "I believe he understood" — speculation

Note the phrase and which gate would catch it.

### Common missing facts

Facts that officers frequently omit in practice examples. Examples:

- No mention of what the inmate physically did after the order
- No acknowledgment of whether the inmate heard the order
- No operational impact described
- No OIC authorization mentioned

Each missing fact type is a candidate for an additional helper text improvement in the UI.

### Common 6-1 fact patterns

Tag each example with one or more fact pattern tags from this list:

```
direct_refusal           — Inmate plainly refused the order
repeated_order           — Officer gave the order more than once
silent_noncompliance     — Inmate said nothing and did not comply
approximate_quote        — Quote is paraphrased, not verbatim
verbatim_quote           — Exact words quoted
movement_refusal         — Ordered to move, did not
return_to_cell_refusal   — Specifically ordered back to assigned cell
disruptive_behavior      — Drew attention or disrupted operations
force_used               — Force applied
oic_mentioned            — OIC rank and name present
witness_present          — Other staff witnessed
confinement_placed       — Placed in administrative confinement
no_confinement_noted     — No confinement mentioned
ability_noted            — Officer noted compliance ability
conduct_outside_6_1      — Additional conduct beyond refusal
```

Tracking which tags appear most often shows which fact patterns are most common, and which test cases may be missing from `testCases6_1.ts`.

### Useful transition phrases

Phrases that connect paragraphs or events smoothly in FDOC-style writing. Examples:

- "At that time, this officer..."
- "Despite being given [COUNT] direct orders..."
- "In an effort to gain compliance..."
- "This inmate's refusal to comply with a direct order..."

### Bad habits to avoid

Recurring patterns across examples that should never appear in generated output. Examples:

- Using "disciplinary confinement" instead of "administrative confinement"
- Referring to the inmate by first name only
- Starting the report mid-action without establishing location and assignment
- Ending without OIC authorization

These feed directly into helper text and validation rules.

### Possible RED/YELLOW test cases

For each weak spot identified, ask: "Does our current evaluator catch this?" If no, document it as a proposed test case:

```
Proposed test: TC_XX — [description]
Input: [what the intake would look like]
Expected: RED (blocker: [id]) or YELLOW (warning: [id])
Gap: [confirm whether evaluator currently handles this]
```

These become candidates for `testCases6_1.ts` in a future patch step.

---

## 7. Future script proposal

**Do not implement yet.** Design only.

### File location (future)

```
src/dr-writer/charges/6-1/reviewPracticeExamples6_1.ts
```

### Planned behavior

- Reads all `.txt` or `.md` files in `examples/6-1/reviewed/` only
- Never reads from `examples/6-1/practice/` directly (requires human review first)
- Runs a basic red flag scan on each file (DC number format, date patterns, case number patterns)
- If any red flag found: logs a warning and skips the file — does not process it
- Extracts recurring phrase patterns using string matching (no API)
- Counts fact pattern occurrences by reading note file tags (if structured)
- Outputs a summary to stdout — candidate KB improvements, common gaps, most frequent patterns
- Never modifies KB files directly
- Never calls Claude or any external API
- No network access

### Key constraints for the future implementation

- Read-only: never modifies any source file
- `examples/**/practice/` is never read directly by the script
- Red flag scan runs before any extraction on each file
- Output is a text summary only — human reviews before any KB change is made

---

## 8. Recommendation

**Next step: Step 4J — Analyze uploaded practice examples and create a lessons document.**

- Tyler places confirmed fake practice DRs in `examples/6-1/practice/`
- Each example is read and checked per the workflow in Section 5
- Approved examples are copied to `examples/6-1/reviewed/`
- A lessons notes document is created in `examples/6-1/notes/` summarizing patterns found
- Any proposed new test cases are noted for a future patch step
- Any proposed helper text improvements are noted for Step 5B UI planning
- No KB changes are made in Step 4J — only the notes document is the output

Step 4J does not require any code changes. It is a review and documentation step only. It can run in parallel with or just before Step 5B (static mock form).
