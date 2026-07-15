# Step 4D — Live Claude YELLOW Test

## Step 4D-1 Patch (applied after first live run)

**First live run result:** 12/13 checks passed. Failed check: `narrative includes "verbally responded in substance"`. Claude returned valid YELLOW JSON with the correct `[REVIEW — quote is a summary]` flag and did not put the summary in quotation marks — but used different phrasing instead of the required phrase.

**Root cause:** The QUOTE SUMMARY YELLOW RULE showed "verbally responded in substance" only in an example. Claude treated it as one valid option rather than a mandatory phrase.

**Patch applied:**
- Strengthened QUOTE SUMMARY YELLOW RULE in `YELLOW_JSON_SYSTEM_PROMPT` (json_schema mode) and `YELLOW_SYSTEM_PROMPT` (narrative_only mode) in `buildPrompt6_1.ts`.
- Rule now explicitly states: *"You MUST use the exact phrase 'verbally responded in substance' — this phrase is required and must appear in paragraph 2."*
- Added "Do NOT place the summary inside quotation marks" as a bullet point (was previously embedded in prose).
- Added "must appear in paragraph 2" requirement.
- Added two new test assertions (TC_F08, TC_F09) covering the strengthened rule.
- Updated TC_F02 assertion to match updated prompt wording.
- Refactored both live test scripts (`testLiveClaudeGreen6_1.ts`, `testLiveClaudeYellow6_1.ts`) to use `process.exitCode = 1` + `return` inside a `main()` function instead of `process.exit(1)` — prevents the `UV_HANDLE_CLOSING` Windows/Node assertion after async API calls.

**Re-run command:**
```powershell
npm run test:6-1:live-yellow
```

---

## Purpose

Verify the full generate6_1 pipeline handles the YELLOW quote-summary case correctly when using the real Anthropic Claude API.

TC03's `inmate_quote` field contains a paraphrase ("he said he wasn't going back to his cell"), not an exact verbatim quote. The local evaluator catches this and flags it as `quote_is_summary` (YELLOW). This step confirms that Claude:

- Receives the YELLOW system prompt (which includes the QUOTE SUMMARY YELLOW RULE)
- Returns a valid JSON response that parseResponse6_1 accepts
- Does **not** reproduce the summary inside quotation marks in the narrative
- Does include the `[REVIEW — quote is a summary]` flag in paragraph 2
- Does include `verbally responded in substance` phrasing in paragraph 2
- Passes all generate6_1 safety gates (status match, cleaned_facts match)

---

## Test Case Used

**TC03 — Quote is a summary (YELLOW)**

From `kb/charges/6-1/test_cases.json`. Fully synthetic/sample data — no real inmate or officer information.

- `inmate_quote`: `"he said he wasn't going back to his cell"` — paraphrase, not exact words
- Local evaluation result: `status: YELLOW`, `yellow_warnings: [quote_is_summary]`, `affected_paragraph: 2`
- Expected Claude output: `status: YELLOW`, narrative paragraph 2 includes `[REVIEW — quote is a summary]` and `verbally responded in substance`, no direct quote of the summary text

---

## Checks

| Check | Expected |
|---|---|
| `status` | `"YELLOW"` |
| `charge` | `"6-1"` |
| `schema_version` | `"1.1"` |
| `red_blockers` | `[]` |
| `yellow_warnings` length | `>= 1` |
| `flagged_sections` includes `2` | Yes |
| `narrative` exists | Non-empty string |
| `narrative` paragraph count | Exactly 6 |
| Narrative includes `[REVIEW — quote is a summary]` | Yes |
| Narrative includes `verbally responded in substance` | Yes |
| Narrative does NOT quote summary (lowercase) | `"he said he wasn't going back..."` absent |
| Narrative does NOT quote summary (capitalized) | `"He said he wasn't going back..."` absent |
| Narrative does NOT use `stated, "He said..."` pattern | Absent |

---

## How to Run

**Step 1 — Set your API key (PowerShell):**

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
```

**Step 2 — Run the live YELLOW test:**

```powershell
npm run test:6-1:live-yellow
```

**Expected result:**

```
Overall: PASS
```

**Optional — See raw Claude narrative:**

```powershell
$env:DEBUG_CLAUDE_RAW = "true"
npm run test:6-1:live-yellow
```

---

## Safety Notes

- `ANTHROPIC_API_KEY` is read from the environment at call time. It is **never** logged, printed, or included in error messages.
- Script exits immediately with a clear error if `ANTHROPIC_API_KEY` is not set.
- This script is **separate** from `npm run test:6-1` and `npm run test:6-1:generate`. Those scripts never make real API calls.
- Do not commit `.env` files. The `.gitignore` blocks `.env` and `.env.*`.
- Do not run this script in CI.
- Uses sample data only — TC03 is fully synthetic.

---

## Files Created in Step 4D

| File | Purpose |
|---|---|
| `src/dr-writer/charges/6-1/testLiveClaudeYellow6_1.ts` | Live YELLOW integration test script |
| `docs/STEP_4D_LIVE_CLAUDE_YELLOW_TEST.md` | This document |

**Modified:**

| File | Change |
|---|---|
| `package.json` | Added `test:6-1:live-yellow` script |

---

## Next Step

**Step 4E — Fake officer-style intake cases through live API**

Run additional realistic (but still fully synthetic) intake scenarios through the live pipeline — varying facts, edge cases, and officer writing styles — while staying strictly within TC test data. Still no UI.
