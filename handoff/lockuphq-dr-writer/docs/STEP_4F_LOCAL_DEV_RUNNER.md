# Step 4F — Local Developer Runner for Charge 6-1

## Purpose

`devRun6_1.ts` is a CLI harness that simulates an officer intake submission for Charge 6-1 (Disobey a Verbal Order of a Staff Member) without requiring a UI or a running web server. It reads a JSON intake file, runs it through the `generate6_1` pipeline, and prints a formatted summary.

This is the developer entry point for testing the full pipeline end-to-end with fake or draft intake data.

---

## Usage

```sh
# Default: mock mode (no API calls, no credits)
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json

# Live mode (requires ANTHROPIC_API_KEY; spends credits — Tyler approval required)
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --mode live

# Print generated narrative to stdout
npm run dev:6-1 -- --input dev-inputs/6-1/fake-yellow-quote-summary.json --print-narrative

# Write OutputSchema6_1 JSON to a file
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --out dev-output/6-1/out.json
```

---

## Flags

| Flag | Default | Description |
|---|---|---|
| `--input <path>` | *(required)* | Path to an `IntakeFacts6_1` JSON file |
| `--mode mock\|live` | `mock` | `mock` runs pipeline with a canned Claude response. `live` calls the real Claude API. |
| `--out <path>` | none | Write the full `OutputSchema6_1` JSON to this path (directory created if needed) |
| `--print-narrative` | false | Print the generated narrative text to stdout |

---

## Modes

### Mock mode (default, safe)

- No Claude API calls are made.
- Uses `makeMockDevClient(evaluation)` to build a canned response directly from the local `evaluate6_1` result.
- The canned response is valid and passes `validateAgainstLocalEvaluation`.
- Zero API credits spent.
- Suitable for pipeline integration testing, prompt iteration, and CI.

### Live mode

- Calls the real Claude API via `createClaudeClient()`.
- Requires `ANTHROPIC_API_KEY` in your `.env` or environment.
- **Only allowed for input files under `dev-inputs/6-1/`** — any other path is blocked with an error.
- Spends API credits. **Requires explicit Tyler approval before use.**
- Output depends on actual Claude response — may differ between runs.

---

## Fake intake files

Located in `dev-inputs/6-1/`. All use fake officer and inmate data (not real FDOC records).

| File | Expected result |
|---|---|
| `fake-green-direct-refusal.json` | GREEN — exact quote, all required facts present |
| `fake-yellow-quote-summary.json` | YELLOW — `inmate_quote` is a summary, not exact words |
| `fake-red-missing-dc.json` | RED — `dc_number: null`, pipeline short-circuits before Claude |

---

## Output

The runner prints a formatted summary:

```
════════════════════════════════════════════════════════════════════════
  LOCKUPHQ DR Writer — Charge 6-1 Developer Runner
────────────────────────────────────────────────────────────────────────
  Input:  dev-inputs/6-1/fake-green-direct-refusal.json
  Mode:   mock
════════════════════════════════════════════════════════════════════════

  Status:           GREEN
  Charge:           6-1
  Schema version:   1.1
  Red blockers:     0
  Yellow warnings:  0
  Flagged sections: []
  Claude calls:     1 (mock)
  Narrative paras:  6
```

For YELLOW, it also prints each warning and which paragraph is flagged. For RED, it lists all red blockers with their follow-up questions.

If `--out` is provided, the full `OutputSchema6_1` JSON is written to the specified path (with the directory created if it does not exist).

---

## File structure

```
src/dr-writer/charges/6-1/
  devRun6_1.ts                 CLI runner and exported utilities
  testDevRun6_1.ts             19 automated tests (no API calls)

dev-inputs/6-1/
  fake-green-direct-refusal.json
  fake-yellow-quote-summary.json
  fake-red-missing-dc.json

dev-output/                    gitignored — output files written with --out
```

---

## Exported API (for testDevRun6_1.ts)

```typescript
// Parsed argument structure
interface ParsedDevArgs {
  input: string;
  mode: 'mock' | 'live';
  out: string | null;
  printNarrative: boolean;
}

// Parses process.argv-style string array — returns ok: true with args or ok: false with error
function parseDevArgs(argv: string[]): ParseDevArgsResult

// Returns true only for paths strictly inside dev-inputs/6-1/ (uses resolve() to block traversal)
function isAllowedLiveInput(inputPath: string): boolean

// Builds a mock ClaudeJsonClient that returns a valid canned response from the evaluation result
// Returns {client, getCallCount} — getCallCount() returns number of completeJson() calls made
function makeMockDevClient(evaluation: EvaluationResult6_1): { client: ClaudeJsonClient; getCallCount: () => number }

// Runs the full dev pipeline (read file → create client → generate6_1 → optional write)
// Returns {output, claudeCalls, outFileWritten, error?}
async function executeDevRun(args: ParsedDevArgs): Promise<DevRunResult>
```

---

## Running the test suite

```sh
npm run test:6-1:dev-runner
```

19 tests. All run in mock mode. No API calls.

Tests cover:
- `parseDevArgs`: valid args, missing `--input`, invalid mode, all flags
- `isAllowedLiveInput`: allowed path, `/etc/passwd`, path traversal, wrong charge dir
- Mock client + `generate6_1` pipeline: GREEN/YELLOW/RED status, client call counts
- `executeDevRun`: GREEN/YELLOW/RED mock runs, live path block, `--out` file write, missing file

---

## Safety rules

- **Never use real inmate DC numbers or officer names in `dev-inputs/`.**
- **Never commit `.env` or `dev-output/` files.** Both are in `.gitignore`.
- **Live mode requires explicit Tyler approval before each use.** It spends API credits.
- The runner never reads `ANTHROPIC_API_KEY` in mock mode.
- `isAllowedLiveInput` uses `path.resolve()` to block `../..` traversal — it cannot be bypassed with relative paths.

---

## Related docs

- `docs/STEP_4C_LIVE_CLAUDE_CLIENT.md` — real Claude API client
- `docs/STEP_4D_LIVE_YELLOW_TEST.md` — live YELLOW integration test
- `docs/STEP_4E_LIVE_FAKE_OFFICER_CASES.md` — fake officer cases suite
