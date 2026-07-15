# Step 3C Manual JSON Validation Lock — Charge 6-1

**Date locked:** 2026-06-27
**Tests at lock:** 48/48 passing

---

## What was validated manually

### GREEN JSON test — PASSED

- TC01 (clean GREEN case) prompt was generated via `npm run prompt:6-1:green-json`
- Pasted into Claude (claude-sonnet-4-6 or equivalent)
- Claude returned raw JSON with no markdown fences
- Narrative had correct article: "assigned as the housing officer"
- Order count spelled out: "two additional times, for a total of three verbal orders"
- No `[REVIEW` flags present
- Parsed successfully through `parseResponse6_1`

### YELLOW JSON test — PASSED

- TC03 (quote-is-a-summary YELLOW case) prompt was generated via `npm run prompt:6-1:yellow-json`
- Pasted into Claude
- Claude returned raw JSON with no markdown fences
- Narrative did NOT wrap the summary in quotation marks
- Narrative used "verbally responded in substance" pattern
- `[REVIEW — quote is a summary]` flag placed correctly after summarized response
- Parsed successfully through `parseResponse6_1`

---

## Issues found and fixed during manual testing

### 1. Claude wrapped response in ` ```json ` fence (Step 3C-3)

**Problem:** Despite prompt instructions, Claude wrapped the JSON in a ` ```json ``` ` code fence.

**Fix:**
- Added `STRICT RESPONSE RULE` block to `GREEN_JSON_SYSTEM_PROMPT` and `YELLOW_JSON_SYSTEM_PROMPT` with explicit first/last character rules
- Hardened `extractJson()` in `parseResponse6_1.ts` to strip accidental ` ```json ``` ` and ` ``` ``` ` fences gracefully
- Parser still rejects prose outside fences — only a bare fence wrapping the entire response is accepted

### 2. Numeric order counts in narrative (Step 3C-4)

**Problem:** Claude wrote "2 additional times, for a total of 3 verbal orders" (numeric).

**Fix:**
- Added `toWordNum()` helper to spell out 1–10 as words
- `buildOrderCountSentence()` now produces "two additional times, for a total of three verbal orders"
- Counts above 10 remain numeric (acceptable per spec)

### 3. Missing article on officer post (Step 3C-4)

**Problem:** Claude wrote "assigned as housing officer" (missing "the").

**Fix:**
- Updated `NARRATIVE_PARAGRAPH_RULES` Paragraph 1 template to show `the [POST]` explicitly
- Added `withArticle()` display helper and `buildAssignmentNote()` to inject a concrete wording example in every user prompt

### 4. YELLOW summary inside quotation marks (Step 3C-5)

**Problem:** Claude wrote `Inmate Smith stated, "He said he wasn't going back to his cell." [REVIEW — quote is a summary]`

**Fix:**
- Added `QUOTE SUMMARY YELLOW RULE` to both `YELLOW_SYSTEM_PROMPT` and `YELLOW_JSON_SYSTEM_PROMPT` with correct/incorrect examples
- Added per-warning injection in `formatYellowWarningsForJson()` when `flag_label === 'quote is a summary'`

---

## Current system hardening summary

| Layer | What it does |
|---|---|
| System prompt | `STRICT RESPONSE RULE` — first char `{`, last char `}`, no markdown |
| System prompt (YELLOW) | `QUOTE SUMMARY YELLOW RULE` — summaries go unquoted with `[REVIEW]` flag |
| User prompt | `ASSIGNMENT WORDING NOTE` — concrete article example for officer post |
| User prompt (YELLOW) | Per-warning no-quotes instruction for `flag_label === 'quote is a summary'` |
| `parseResponse6_1` | Strips ` ```json ` and ` ``` ` fences; rejects prose outside fences; validates `schema_version`, `charge`, `status`, array fields |

---

## How to validate saved Claude responses

```
npm run validate:6-1:manual
```

Reads:
- `manual-validation/6-1/green-response.json`
- `manual-validation/6-1/yellow-response.json`

If either file contains a placeholder, the script will print instructions to paste the real JSON.

Validation checks (GREEN):
- schema_version, charge, status, empty red_blockers, empty yellow_warnings, empty flagged_sections
- narrative exists, exactly 6 paragraphs
- no `[REVIEW` flags, correct article, word numbers for order count

Validation checks (YELLOW):
- schema_version, charge, status, empty red_blockers, yellow_warnings >= 1, flagged_sections includes 2
- narrative exists, exactly 6 paragraphs
- includes `[REVIEW — quote is a summary]` and "verbally responded in substance"
- does NOT quote the summary verbatim

---

## What is NOT done yet (and must NOT be done without authorization)

- Step 4: Wire Claude API — NOT started, NOT authorized yet
- Full field-level output validation in `parseResponse6_1` — TODOs remain in file
- UI — explicitly prohibited at this stage
- RED JSON manual test — RED cases must not produce a narrative; no manual test defined yet

---

## Next steps (once manual validation files are populated)

1. Run `npm run validate:6-1:manual` — confirm PASS/PASS/PASS
2. Plan Step 3D (if defined) or proceed to Step 4 planning discussion
3. Step 4 entry point: wire Claude API, no UI, single charge only
