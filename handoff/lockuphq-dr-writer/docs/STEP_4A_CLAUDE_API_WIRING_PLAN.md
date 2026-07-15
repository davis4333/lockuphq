# Step 4A — Claude API Wiring Plan for Charge 6-1

**Date:** 2026-06-28
**Status:** Design only. No API code exists. No API calls made.
**Locked prerequisite:** Step 3C fully validated — manual GREEN and YELLOW JSON tests passed Overall: PASS.

---

## 1. Current Project State

### Existing 6-1 pipeline (fully local, no API)

```
IntakeFacts6_1 (officer input — messy)
    │
    ▼
cleanFacts6_1()                          src/dr-writer/charges/6-1/cleanFacts6_1.ts
    │  Normalizes time, rank, name casing, order count, etc.
    │  Returns CleanupResult { cleaned, extra_warnings, confinement_corrected }
    │
    ▼
evaluate6_1()                            src/dr-writer/charges/6-1/evaluate6_1.ts
    │  Applies gate rules from gate_rules.json
    │  Returns EvaluationResult6_1 { status, red_blockers, yellow_warnings, cleaned_facts }
    │
    ├─── RED  → stop. No prompt. Return blockers to officer.
    │
    └─── GREEN / YELLOW ──────────────────────────────────────────────────────
              │
              ▼
         buildPrompt6_1(evaluation, { outputMode: 'json_schema' })
              │                           src/dr-writer/charges/6-1/buildPrompt6_1.ts
              │  Returns PromptBuildResult { prompt, parts, status, reason, outputMode }
              │  parts: { systemPrompt: string, userPrompt: string }
              │
              ▼
         [MANUAL STEP TODAY — paste into Claude]
              │
              ▼
         Claude response (raw string)
              │
              ▼
         parseResponse6_1(raw)           src/dr-writer/charges/6-1/parseResponse6_1.ts
              │  Strips accidental ``` fences
              │  JSON.parse
              │  assertOutputShape: schema_version, charge, status, array fields
              │  Returns OutputSchema6_1
              │
              ▼
         validateManualClaudeOutputs6_1  src/dr-writer/charges/6-1/validateManualClaudeOutputs6_1.ts
              │  GREEN checks (12 assertions)
              │  YELLOW checks (12 assertions)
              ▼
         manual-validation/6-1/{green,yellow}-response.json
```

### Existing source files (all in `src/dr-writer/charges/6-1/`)

| File | Purpose |
|---|---|
| `types.ts` | All TypeScript types: IntakeFacts6_1, CleanedFacts6_1, OutputSchema6_1, etc. |
| `cleanFacts6_1.ts` | Intake normalization (no Claude) |
| `evaluate6_1.ts` | RED/YELLOW/GREEN gate evaluation (no Claude) |
| `buildPrompt6_1.ts` | Prompt construction for narrative_only and json_schema modes |
| `parseResponse6_1.ts` | Raw Claude response → OutputSchema6_1 |
| `testCases6_1.ts` | 57-test local runner (no Claude) |
| `validateManualClaudeOutputs6_1.ts` | Validates saved real Claude responses from file |
| `printGreenJsonPrompt6_1.ts` | Prints/saves GREEN json_schema prompts for copy-paste |
| `printYellowJsonPrompt6_1.ts` | Prints/saves YELLOW json_schema prompts for copy-paste |
| `printPromptSamples6_1.ts` | Prints narrative_only prompts |

### No `src/dr-writer/llm/` directory exists yet. No `.gitignore` exists yet.

---

## 2. Proposed API File Structure

Create the following new files in Step 4B/4C. **Do not create them in Step 4A.**

```
src/dr-writer/llm/
├── claudeTypes.ts          — shared types: ClaudeMessage, ClaudeRequest, ClaudeResponse
├── claudeClient.ts         — thin wrapper around fetch() or Anthropic SDK
└── callClaudeJson.ts       — sends systemPrompt + userPrompt, returns raw string

src/dr-writer/charges/6-1/
└── generate6_1.ts          — full pipeline: intake → evaluate → prompt → Claude → parse → validate
```

### File responsibilities

**`claudeTypes.ts`**
- `ClaudeMessage`: `{ role: 'user' | 'assistant', content: string }`
- `ClaudeRequest`: `{ model: string, max_tokens: number, system: string, messages: ClaudeMessage[] }`
- `ClaudeApiResponse`: shape of the Anthropic Messages API response
- `ClaudeCallOptions`: `{ model?: string, maxTokens?: number }`

**`claudeClient.ts`**
- Reads `ANTHROPIC_API_KEY` from environment at call time (never at module load time)
- Throws clearly if key is missing
- In Step 4B: replaced entirely by a mock
- In Step 4C+: uses `fetch()` to `https://api.anthropic.com/v1/messages` with proper headers
- Never logs the API key or raw response in production mode

**`callClaudeJson.ts`**
- Accepts `systemPrompt: string`, `userPrompt: string`, `options?: ClaudeCallOptions`
- Calls `claudeClient` and returns the raw content string from Claude's first message
- This is the only file that knows about the Anthropic API shape
- Throws `ClaudeCallError` (typed) on HTTP errors, timeouts, or empty responses

**`generate6_1.ts`**
- The single entry point for the full 6-1 generation pipeline
- Accepts `IntakeFacts6_1`
- Runs the full local chain first (clean → evaluate)
- If RED: returns immediately without any Claude call
- If GREEN/YELLOW: builds json_schema prompt, calls `callClaudeJson`, parses, validates
- Returns `GenerateResult6_1` (see section 4 below)
- Never exposes raw Claude output to callers unless in dev mode

---

## 3. Environment Variable Plan

### Required

```
ANTHROPIC_API_KEY=<your key here>
```

- Read at call time via `process.env.ANTHROPIC_API_KEY`
- If missing or empty, `claudeClient.ts` throws: `"ANTHROPIC_API_KEY is not set. Set it in your environment before calling the Claude API."`
- Never hardcoded. Never printed. Never committed.

### Optional (with defaults)

```
CLAUDE_MODEL=claude-sonnet-4-6
CLAUDE_MAX_TOKENS=4096
CLAUDE_MAX_RETRIES=1
```

Defaults if not set:
- `CLAUDE_MODEL` → `"claude-sonnet-4-6"` (current model in this session)
- `CLAUDE_MAX_TOKENS` → `4096` (6-paragraph narrative fits well under this)
- `CLAUDE_MAX_RETRIES` → `1` (retry once on transient 5xx, never on 4xx)

### `.gitignore` (create in Step 4B, before any `.env` file is written)

```gitignore
.env
.env.local
.env.*.local
node_modules/
```

**Rule:** The `.env` file must never be created before `.gitignore` exists. Create `.gitignore` first in Step 4B, before touching any API key.

---

## 4. API Execution Flow

### `generate6_1(intakeFacts: IntakeFacts6_1): Promise<GenerateResult6_1>`

```
generate6_1(intakeFacts)
    │
    ├── cleanFacts6_1(intakeFacts)
    │       → CleanupResult
    │
    ├── evaluate6_1(intakeFacts)
    │       → EvaluationResult6_1 { status, red_blockers, yellow_warnings, cleaned_facts }
    │
    ├── if status === 'RED'
    │       → return { status: 'RED', red_blockers, yellow_warnings: [], output: null, raw: null }
    │       → NO Claude call. No exceptions.
    │
    ├── buildPrompt6_1(evaluation, { outputMode: 'json_schema' })
    │       → PromptBuildResult { parts: { systemPrompt, userPrompt } }
    │
    ├── callClaudeJson(systemPrompt, userPrompt, options)
    │       → raw: string   (Claude's full text response)
    │
    ├── parseResponse6_1(raw)
    │       → OutputSchema6_1   (throws ParseError on invalid JSON or shape)
    │
    ├── validateOutputAgainstLocal(parsed, evaluation)
    │       → throws GenerateValidationError if any gate fails (see section 5)
    │
    └── return { status, red_blockers: [], yellow_warnings, output: parsed, raw: devModeOnly }
```

### `GenerateResult6_1` type (to be defined in `generate6_1.ts`)

```typescript
export interface GenerateResult6_1 {
  status: 'RED' | 'YELLOW' | 'GREEN';
  red_blockers: RedBlocker[];
  yellow_warnings: YellowWarning[];
  output: OutputSchema6_1 | null;   // null for RED or on parse failure
  error?: string;                   // set on ParseError or validation failure
}
```

---

## 5. Safety Gates

All gates run in `validateOutputAgainstLocal()` inside `generate6_1.ts`, after `parseResponse6_1` succeeds.

| Gate | What it checks | Failure action |
|---|---|---|
| **RED never calls Claude** | Enforced structurally — Claude call is behind `if status !== 'RED'` | Never reaches call site |
| **Charge must match** | `parsed.charge === '6-1'` | Throw `GenerateValidationError` |
| **Schema version must match** | `parsed.schema_version === '1.1'` | Throw `GenerateValidationError` |
| **Status must match local** | `parsed.status === evaluation.status` | Throw `GenerateValidationError` — Claude cannot upgrade or downgrade status |
| **cleaned_facts must match local** | Deep-compare `parsed.cleaned_facts` against `evaluation.cleaned_facts` — all fields must be identical | Throw `GenerateValidationError` — Claude cannot modify facts |
| **RED blockers must be empty** | `parsed.red_blockers.length === 0` for GREEN/YELLOW | Throw `GenerateValidationError` |
| **GREEN: no warnings or flags** | `parsed.yellow_warnings.length === 0` and `parsed.flagged_sections.length === 0` | Throw `GenerateValidationError` |
| **YELLOW: warnings must be preserved** | `parsed.flagged_sections` must include all paragraph numbers from local `yellow_warnings` | Throw `GenerateValidationError` |
| **Parser failure is controlled** | `parseResponse6_1` throws `ParseError` | Caught in `generate6_1`, returned as `{ output: null, error: e.message }` — never partial output |
| **Raw output logging** | Raw Claude response only logged when `process.env.CLAUDE_DEV_LOG === 'true'` | Default: not logged. Never logged in production. Never logged with real inmate data. |

### `validateOutputAgainstLocal` signature (to implement in Step 4B)

```typescript
function validateOutputAgainstLocal(
  parsed: OutputSchema6_1,
  evaluation: EvaluationResult6_1
): void   // throws GenerateValidationError on any failure
```

---

## 6. Test Plan for Step 4B/4C

All tests run locally with a **mock Claude client** — no real API calls until Step 4C.

### Test suite: `testGenerate6_1.ts` (new file, Step 4B)

| Test ID | Scenario | Mock response | Expected result |
|---|---|---|---|
| TC_H01 | RED input → no Claude call | — (call must not occur) | `{ status: 'RED', output: null }`, mock verifies 0 calls |
| TC_H02 | GREEN input → mock returns valid GREEN JSON | Valid GREEN OutputSchema6_1 | `{ status: 'GREEN', output: parsed }` |
| TC_H03 | YELLOW input → mock returns valid YELLOW JSON | Valid YELLOW OutputSchema6_1 | `{ status: 'YELLOW', output: parsed }` |
| TC_H04 | GREEN input → mock returns invalid JSON | `"Here is the JSON: { broken"` | `{ output: null, error: "..." }` — ParseError caught |
| TC_H05 | GREEN input → mock returns wrong charge | `"charge": "6-2"` | `GenerateValidationError` — charge mismatch |
| TC_H06 | GREEN input → mock modifies cleaned_facts | Alters `inmate_last_name` | `GenerateValidationError` — facts mismatch |
| TC_H07 | YELLOW input → mock returns status GREEN | `"status": "GREEN"` | `GenerateValidationError` — status mismatch |
| TC_H08 | GREEN input → mock returns fenced JSON | ` ```json\n{...}\n``` ` | Parsed successfully via `parseResponse6_1` fence stripping |
| TC_H09 | GREEN input → mock returns prose before JSON | `"Here you go: {...}"` | ParseError caught, `{ output: null, error: "..." }` |

### Test structure (Step 4B)

- `mockClaudeClient.ts` — in-memory mock implementing the same interface as `claudeClient.ts`
- `generate6_1.ts` accepts a `client` parameter (or uses module-level injection) so tests can inject the mock
- No `fetch()` calls in any test
- No `ANTHROPIC_API_KEY` required to run the test suite

---

## 7. Manual-First API Rollout Order

| Step | What gets built | Real API? | Tests required before proceeding |
|---|---|---|---|
| **Step 4A** (this step) | Design plan only | No | — |
| **Step 4B** | `claudeTypes.ts`, `claudeClient.ts` (mock), `callClaudeJson.ts`, `generate6_1.ts`, `testGenerate6_1.ts` | No — mock only | TC_H01–TC_H09 all pass |
| **Step 4C** | Real `claudeClient.ts` using `fetch()`, `.gitignore`, TC01 GREEN real call only | Yes — TC01 only | Mock suite still passes; manual GREEN validation passes |
| **Step 4D** | TC03 YELLOW real call | Yes — TC03 only | Step 4C locked; manual YELLOW validation passes |
| **Step 4E** | Offline officer-style intake test cases (realistic fake data, no real inmates) | Yes — per case | Each case passes `validateOutputAgainstLocal` |
| **Step 4F** | Plan intake form / UI (design only) | No | Step 4E locked |

**Note:** Steps 4C–4E require `ANTHROPIC_API_KEY` set in the local environment. The key must never appear in any committed file.

---

## 8. Risk Notes

| Risk | Description | Mitigation |
|---|---|---|
| **API cost** | Each generate call costs tokens. Test calls at TC01/TC03 scale are cheap but could add up. | Run real API only in Steps 4C+. Mock all Step 4B tests. Log token usage from API response in dev mode. |
| **Model drift** | Claude model updates may change output style, escaping behavior, or JSON structure. | Pin `CLAUDE_MODEL` via env var. Run `validate:6-1:manual` after any model change. |
| **Invalid JSON** | Claude may return unescaped inner quotes or malformed JSON despite prompt hardening. | `parseResponse6_1` is the hard gate — partial output is never returned. `JSON STRING ESCAPING RULE` is in the system prompt. |
| **Quote escaping** | Inmate dialogue inside narrative strings requires `\"` escaping in JSON. Manual testing confirmed this is now instructed in system prompts. | Gate TC_G02/TC_G03 confirm parser rejects unescaped quotes. Re-run `validate:6-1:manual` after each model change. |
| **Prompt injection from officer input** | Officer may paste adversarial text into intake fields (e.g., `inmate_quote` containing `"Ignore previous instructions..."`). | `buildPrompt6_1` formats officer input as labeled data fields, not as instructions. Claude's system prompt defines its role strictly. Never interpret intake fields as commands. |
| **Sensitive inmate/officer data** | Real names, DC numbers, incident dates must not be logged to console or written to files in production. | Default: no raw logging. `CLAUDE_DEV_LOG=true` is opt-in. Never use real inmate data in test cases or prompt-output files. |
| **Accidental invention** | Claude may add facts not provided by the officer (dates, names, behaviors). | `validateOutputAgainstLocal` deep-compares `cleaned_facts` — any invented field causes a hard failure. System prompt states "You NEVER invent facts." |
| **Status mismatch** | Claude may return `"status": "GREEN"` when local evaluation is YELLOW, or vice versa. | Gate: `parsed.status === evaluation.status` is enforced in `validateOutputAgainstLocal`. Claude cannot change the gate decision. |

---

## 9. Recommendation

**Do not build UI yet.** The intake form design should wait until Step 4F, after the API pipeline is verified end-to-end with real calls on TC01 and TC03.

**Do not connect the real Claude API until mock client tests pass.** The mock suite (TC_H01–TC_H09) must reach 9/9 before any `fetch()` call is written.

**Next step: Step 4B — Mock Claude API wrapper.**

Step 4B deliverables:
1. Create `.gitignore` (before anything else)
2. Create `src/dr-writer/llm/claudeTypes.ts`
3. Create `src/dr-writer/llm/claudeClient.ts` (mock version — throws if called without mock injection)
4. Create `src/dr-writer/llm/callClaudeJson.ts`
5. Create `src/dr-writer/charges/6-1/generate6_1.ts`
6. Create `src/dr-writer/charges/6-1/testGenerate6_1.ts` with TC_H01–TC_H09
7. Add `"test:6-1:generate"` script to `package.json`
8. All existing 57 tests still pass
9. All 9 new TC_H tests pass with mock — zero real API calls

The real `ANTHROPIC_API_KEY` is not needed until Step 4C.
