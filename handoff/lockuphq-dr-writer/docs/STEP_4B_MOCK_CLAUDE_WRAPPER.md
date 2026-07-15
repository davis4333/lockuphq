# Step 4B — Mock Claude API Wrapper

**Date:** 2026-06-28
**Status:** Complete. No real API call added.

---

## What was implemented

### New files

| File | Purpose |
|---|---|
| `src/dr-writer/llm/claudeTypes.ts` | `ClaudePromptParts`, `ClaudeJsonClient`, `ClaudeCallMetadata` interface definitions |
| `src/dr-writer/charges/6-1/generate6_1.ts` | Full async pipeline: intake → evaluate → prompt → client → parse → validate → return |
| `src/dr-writer/charges/6-1/testGenerate6_1.ts` | TC_H01–TC_H09 mock test suite |
| `docs/STEP_4B_MOCK_CLAUDE_WRAPPER.md` | This document |
| `.gitignore` | Prevents `.env` from being committed |

### Modified files

| File | Change |
|---|---|
| `package.json` | Added `"test:6-1:generate"` script |

---

## No real API call was added

- `generate6_1.ts` accepts a `ClaudeJsonClient` interface parameter — the real network implementation does not exist yet.
- `claudeTypes.ts` defines the interface only — no `fetch()`, no Anthropic SDK, no HTTP code.
- No `ANTHROPIC_API_KEY` environment variable is needed to run any test.
- `testGenerate6_1.ts` uses an in-process mock client that returns strings directly.

---

## Mock test suite: TC_H01–TC_H09

All tests pass with 0 real API calls.

| Test | Scenario | Expected |
|---|---|---|
| TC_H01 | Mock returns valid GREEN JSON | `generate6_1` returns GREEN `OutputSchema6_1`, client called once |
| TC_H02 | Mock returns valid YELLOW JSON | `generate6_1` returns YELLOW `OutputSchema6_1`, client called once |
| TC_H03 | Mock returns malformed JSON | `Generate6_1Error` with "parse failed" message |
| TC_H04 | Mock returns `"charge": "6-2"` | `Generate6_1Error` with "wrong charge" message |
| TC_H05 | Mock tampers `dc_number` in `cleaned_facts` | `Generate6_1Error` with "cleaned_facts mismatch" message |
| TC_H06 | Mock returns `"status": "GREEN"` for YELLOW input | `Generate6_1Error` with "status mismatch" message |
| TC_H07 | RED input (missing DC number) | Returns RED `OutputSchema6_1` locally, `narrative: null`, client never called |
| TC_H08 | Mock wraps valid JSON in ` ```json ` fence | Fence stripped by `parseResponse6_1`, returns GREEN successfully |
| TC_H09 | Mock returns prose before JSON | `Generate6_1Error` with "parse failed" message |

---

## Safety gates enforced

All gates run inside `validateAgainstLocalEvaluation()` in `generate6_1.ts`:

- `schema_version` must be `"1.1"`
- `charge` must be `"6-1"`
- `status` must match local evaluation — Claude cannot upgrade or downgrade status
- `red_blockers` must be `[]` for GREEN/YELLOW
- `narrative` must exist and be non-empty for GREEN/YELLOW
- `narrative` must have exactly 6 paragraphs (split by blank lines)
- GREEN: `yellow_warnings` and `flagged_sections` must be `[]`, narrative must not include `[REVIEW`
- YELLOW: narrative must include `[REVIEW`, `yellow_warnings` and `flagged_sections` must match local
- `cleaned_facts` must deep-equal local cleaned facts — Claude cannot change any fact value
- Parse failures surface as `Generate6_1Error` with "parse failed" — no partial output ever returned

---

## Client injection pattern

```typescript
// Real call (Step 4C+)
const result = await generate6_1(intakeFacts, realClaudeClient);

// Test / mock call
const mockClient: ClaudeJsonClient = {
  async completeJson(parts) { return mockJsonString; }
};
const result = await generate6_1(intakeFacts, mockClient);
```

The `ClaudeJsonClient` interface is the only contract between `generate6_1.ts` and the network layer. The real implementation is never needed to run the test suite.

---

## Next step: Step 4C — Real Claude API GREEN-only test

Step 4C deliverables:
1. Create `src/dr-writer/llm/claudeClient.ts` with real `fetch()` call to Anthropic Messages API
2. Read `ANTHROPIC_API_KEY` from environment at call time — throw if missing
3. Run TC01 (GREEN) through the full live pipeline: `generate6_1(TC01_FACTS, realClient)`
4. Confirm `OutputSchema6_1` returned with `status: "GREEN"`, valid narrative, no `[REVIEW]` flags
5. Run `npm run validate:6-1:manual` after saving real response
6. All existing mock tests (TC_H01–TC_H09) must still pass

`ANTHROPIC_API_KEY` is required for Step 4C. Set it in your local environment — do not put it in any file.
