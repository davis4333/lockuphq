# Step 4I — Charge 6-1 Example DR Corpus Plan and Anonymization Workflow

**Version:** 1.0  
**Status:** Planning only — no examples ingested, no code written  
**Charge:** 6-1 — Disobeying Verbal or Written Order  

---

## 1. Purpose

Example disciplinary reports for Charge 6-1 can meaningfully improve this module before any UI is built. The value is not in the specific incidents — it is in the patterns.

Example DRs will be used only to improve:

- **Narrative structure** — how professional reports sequence facts across six paragraphs
- **FDOC-style wording** — phrasing that reads naturally in the institutional register
- **Common fact patterns** — which combinations of facts appear together most often
- **Common weak spots** — where officers typically leave gaps, use vague language, or miss required elements
- **Common RED/YELLOW issues** — which gate failures appear most in real reports
- **Tone consistency** — factual, third-person, past-tense, no speculation
- **Officer-facing helper text** — what advice would have helped the officer write a stronger report

Example DRs must not be used to memorize or reproduce real incidents. The goal is pattern extraction, not transcript retention.

---

## 2. Non-goals

- **No raw DR ingestion yet.** Raw reports may not enter the project until sanitized.
- **No UI.** This step is documentation only.
- **No API calls.** No Claude analysis of examples at this step.
- **No other charges.** This plan covers Charge 6-1 only.
- **No database or storage layer.** Anonymized examples are flat markdown files.
- **No real inmate or officer identity storage.** All names and identifiers are replaced before entry.
- **No training or fine-tuning.** This project does not fine-tune any model.
- **No copying reports word-for-word.** Phrases may inform KB wording; full text is never reproduced.

---

## 3. Required anonymization rules

Before any example DR can enter the project, it must be fully sanitized. No exceptions.

### Replacement table

| Original content | Replace with |
|---|---|
| Inmate name (first, last, or full) | `[INMATE]` |
| DC number | `[DC_NUMBER]` |
| Reporting officer name | `[OFFICER]` |
| Sergeant / Lieutenant / Captain / OIC name | `[SUPERVISOR]` or `[OIC]` |
| Witness staff name | `[WITNESS]` |
| Dorm, wing, cell, exact room | `[LOCATION]` |
| Exact date | `[DATE]` |
| Exact time | `[TIME]` |
| Case number or report number | `[CASE_NUMBER]` |
| Medical specifics | Generalized wording only (e.g., "a reported medical condition" rather than the specific diagnosis) |
| Security details | Generalized wording only |
| Any unique detail that could identify the real event | Generalized wording or removed |

### Anonymization is complete when:

- No real name can be derived from the text.
- No DC number, case number, or institutional ID is present.
- No exact date or time is retained in context that links to a real incident.
- No location is specific enough to identify the event.
- A reader with local knowledge of the institution could not identify the inmate, officer, or incident from the text alone.

### Who anonymizes

Tyler anonymizes before adding any file to the project. The project never receives raw reports.

---

## 4. Safe example format

Anonymized examples are stored as markdown files in `examples/6-1/anonymized/`. Each file follows this template:

### File naming

```
examples/6-1/anonymized/example-001.md
examples/6-1/anonymized/example-002.md
```

Numbers are sequential. Names do not reference the original incident or officer.

### Template

```markdown
# Example 6-1 DR — example-001

charge: 6-1
anonymization_status: sanitized
source_type: example_dr
quality_rating: strong | average | weak | unknown
reviewed: false | true

---

## Fact pattern tags

- direct_refusal
- repeated_order
- silent_noncompliance
- approximate_quote
- movement_refusal
- disruptive_behavior
- force_used
- oic_mentioned
- witness_present
- confinement_placed

(apply only those that match this example)

---

## Sanitized narrative

Paragraph 1 — Setting and assignment
> [OFFICER] was assigned as [LOCATION] officer on [DATE] at approximately [TIME]. While [ACTIVITY], [OFFICER] observed [INMATE], DC# [DC_NUMBER], [BEHAVIOR_BEFORE_ORDER].

Paragraph 2 — Order and response
> [OFFICER] ordered [INMATE] to [EXACT_ORDER]. [INMATE] [ACKNOWLEDGMENT_DESCRIPTION]. [INMATE] [QUOTE_OR_SAID_NOTHING].

Paragraph 3 — Repeated orders / escalation
> [OFFICER] again ordered [INMATE] to [EXACT_ORDER]. [PHYSICAL_BEHAVIOR_AFTER_ORDER].

Paragraph 4 — Physical behavior and impact
> [OFFICER] gave [INMATE] [COUNT] verbal orders in total. [INMATE] [FINAL_PHYSICAL_BEHAVIOR]. This [OPERATIONAL_IMPACT_DESCRIPTION].

Paragraph 5 — Ability to comply / force
> [INMATE] did not appear to have any medical condition or disability that would have prevented compliance. [FORCE_OR_NO_FORCE_STATEMENT].

Paragraph 6 — Confinement and OIC
> [INMATE] was placed in administrative confinement pending a disciplinary hearing. [OIC] authorized this report.

---

## Useful phrases

- "remained positioned at [LOCATION] despite being ordered to return to his assigned cell"
- "crossed his arms and stated [QUOTE]"
- "temporarily disrupting the [ACTIVITY] and drawing the attention of surrounding inmates"

(list only de-identified phrases useful for KB wording)

---

## Structure notes

- What this example does well: [NOTES]
- How the paragraphs are sequenced: [NOTES]
- Where it departs from the recommended template: [NOTES]

---

## Caution notes

- Any phrasing to avoid and why: [NOTES]
- Any factual gap that weakens this example: [NOTES]

---

## RED / YELLOW lessons

- Did this example include anything that would have triggered a RED blocker? [YES/NO — explain]
- Did this example include anything that would have triggered a YELLOW warning? [YES/NO — explain]
- What would have improved this report? [NOTES]
```

---

## 5. Corpus folder plan

The following folder structure is proposed. Only `examples/6-1/README.md` exists now. Other folders are created in Step 4J.

```
examples/
  6-1/
    README.md              ← created now (Step 4I placeholder)
    raw/                   ← GITIGNORED — never committed — local only
    anonymized/            ← sanitized examples only — safe to commit
    reviewed/              ← examples approved for KB influence
```

### Folder rules

**`raw/`**
- Gitignored. Never committed to the repository.
- Tyler keeps raw files locally and sanitizes them before project entry.
- The project does not receive, read, or process raw files at any step.
- If the `raw/` folder exists locally, it is a staging area only — not a project artifact.

**`anonymized/`**
- Contains only fully sanitized examples following the template in Section 4.
- Each file passes the red flag check (Section 9) before being committed.
- Safe to commit to the repository once sanitized.
- Accumulates over time as examples are processed.

**`reviewed/`**
- Contains examples that have been through the full review workflow (Section 7).
- These examples have been confirmed to have no remaining identifiers.
- These examples have been tagged and rated.
- Phrases and patterns from reviewed examples may influence KB wording.

---

## 6. .gitignore safety

Add the following to `.gitignore` if not already present:

```gitignore
examples/6-1/raw/
examples/**/raw/
*.raw.txt
*.raw.md
```

**Current `.gitignore` state** already includes:
```gitignore
manual-validation/6-1/*.real.json
```

The `examples/**/raw/` pattern extends the same principle to the corpus folder.

**Note:** The `.gitignore` update will be made in Step 4J when the folder structure is created, so the rule is in place before any raw files could be accidentally staged.

---

## 7. Review workflow

```
Step A — Tyler collects example DRs locally.
          Raw files live only on Tyler's local machine.
          Never added to the project in raw form.

Step B — Raw DRs are anonymized before being added to the project.
          Tyler replaces all identifiers per the replacement table in Section 3.
          This happens outside the project, in a text editor, before any file is created.

Step C — Sanitized example is reviewed for remaining identifiers.
          Tyler reads the sanitized text against the red flag list in Section 9.
          If any flag is present, re-sanitize before continuing.
          Mark reviewed: false in the frontmatter until this check passes.

Step D — Each sanitized example gets tags and quality rating.
          Tags (fact_pattern_tags) are selected from the allowed list.
          Quality rating (strong / average / weak / unknown) is assigned.
          Structure notes and caution notes are written.
          File moves to anonymized/ with reviewed: false → true after Step C passes.

Step E — Strong examples influence wording patterns.
          Useful phrases are extracted and noted in the file.
          If a phrase is strong enough, it is proposed as a KB update (not automatically added).
          KB changes require their own commit and test run.

Step F — Weak examples become warning examples.
          Weak examples are kept to document what not to do.
          RED/YELLOW lessons section notes what backend gate would catch these issues.
          These inform helper text improvements in the UI (Step 5A+).

Step G — Only patterns and lessons go into the KB, not copied incident text.
          No verbatim sentence from any example is copied directly into the KB.
          Phrase patterns (stripped of identifying detail) may inform KB wording.
          All KB changes go through the normal kb/ → evaluate → test cycle.
```

---

## 8. Future analyzer plan

**Do not implement yet.** This is a design-only description for a future step.

### File location (future)

```
src/dr-writer/charges/6-1/analyzeExamples6_1.ts
```

### Behavior (future)

```typescript
// Future script — not implemented yet
// Reads anonymized examples from examples/6-1/anonymized/ and examples/6-1/reviewed/
// Never reads from examples/6-1/raw/ or any raw path
// Never calls the Claude API
// Outputs a summary report of patterns found

// Planned checks before processing any file:
// - Reject if file path contains "raw"
// - Run red flag detector (Section 9) on file content before analysis
// - If any red flag found: log warning, skip file, do not process

// Planned outputs:
// - Recurring phrase patterns across all examples
// - Common fact pattern tag combinations
// - Distribution of quality ratings
// - Most common RED/YELLOW issues across the corpus
// - Suggested KB improvements (human review required before applying)
```

### Key constraints for the future implementation

- Reads only `examples/6-1/anonymized/` and `examples/6-1/reviewed/`
- Explicitly blocks any path containing `/raw/` or `.raw.`
- Runs the red flag detector on each file before extracting patterns
- Never calls the Claude API — all analysis is local string matching
- Never modifies KB files directly — outputs suggestions only
- No network access
- Output goes to stdout or a scratchpad file — not to `kb/` or `src/`

---

## 9. Red flag detector plan

**Do not implement yet.** These are the checks a future sanitization validator will run.

A future `checkAnonymization6_1.ts` or inline check in `analyzeExamples6_1.ts` will scan each file for:

| Flag | Pattern | Why it matters |
|---|---|---|
| DC number | Letter + 5 digits: `[A-Z]\d{5}` | Standard FDOC DC number format |
| 6-digit number alone | `\b\d{6}\b` | Could be a DC number without the letter prefix |
| Full name pattern | Title-case two-word sequence not in an approved placeholder list | Could be an officer or inmate name |
| MM/DD/YYYY date | `\d{2}/\d{2}/\d{4}` | Exact dates link to real incidents |
| M/D/YYYY date | `\d{1,2}/\d{1,2}/\d{4}` | Same concern |
| Written-out dates | `(January\|February\|...) \d{1,2}, \d{4}` | Same concern |
| 4-digit military time | `\b\d{4}\s*(hours\|hrs)?\b` | Exact times link to real incidents |
| Case/report number | `\b\d{3,}-\d{3,}\b` or common DR number formats | Could identify the original report |
| Named staff | Words like "Sergeant Smith" or "Officer Jones" not replaced with a placeholder | Identifying information |
| Medical diagnosis | Known condition names that could narrow down the inmate | Privacy risk |
| Location too specific | Cell numbers, exact room names, named facilities | Could identify the event |

### Handling a red flag

If a red flag is detected in a file in `anonymized/` or `reviewed/`:
- Log a warning with the file name and flag type
- Do not process the file further
- Do not commit the file
- Return the file to Tyler for re-sanitization

---

## 10. Recommendation

Before Step 5B (first static UI form), run **Step 4J**:

1. **Create the anonymized example folder structure** (`examples/6-1/` with subdirectory README files and correct `.gitignore` entries).
2. **Add the sanitizer checklist** as a standalone markdown file (`examples/6-1/SANITIZER_CHECKLIST.md`) — a quick checklist Tyler can use for each DR before entry.
3. **Optionally create one fake/synthetic sanitized example** using the template in Section 4 — with entirely invented facts — to confirm the format works and to have a test fixture for `analyzeExamples6_1.ts` when it is eventually built.
4. **Do not add real examples** until Tyler has sanitized them using the workflow in Section 7 and the red flag check in Section 9.

### Why Step 4J before UI

The UI (Step 5B) will include officer-facing helper text. That helper text will be stronger if it is informed by real-world patterns from the corpus. Even one or two reviewed examples can improve the labels and validation messages before the form is built.

### After Step 4J is complete

- Step 5A doc (UI plan) is already written — it references helper text and wording.
- Step 5B (static mock form) can begin with improved helper text informed by any reviewed examples.
- Step 4J does not block Step 5B — it runs in parallel or just before.

---

## Appendix — Allowed fact pattern tags

These are the allowed values for `fact_pattern_tags` in the anonymized example template:

```
direct_refusal           — Inmate plainly refused the order
repeated_order           — Officer gave the order more than once
silent_noncompliance     — Inmate said nothing and did not comply
approximate_quote        — Inmate spoke but quote is paraphrased (not verbatim)
verbatim_quote           — Inmate spoke and quote is verbatim
movement_refusal         — Inmate was ordered to move and did not
return_to_cell_refusal   — Specific order to return to assigned cell
disruptive_behavior      — Inmate's behavior drew attention or disrupted operations
force_used               — Force was applied during this incident
oic_mentioned            — OIC rank and name present in the report
witness_present          — Other staff witnessed the incident
camera_documented        — Camera coverage noted
confinement_placed       — Inmate placed in administrative confinement
confinement_already      — Inmate was already in confinement
no_confinement           — No confinement noted
ability_disputed         — Officer noted possible reason inmate could not comply
conduct_outside_6_1      — Incident included conduct beyond the order refusal
```
