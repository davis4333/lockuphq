# Step 4C — Live Claude GREEN Test

## Purpose

Verify the full generate6_1 pipeline against the real Anthropic Claude API using TC01 (clean GREEN case). This is a one-shot integration test — it makes a single live API call and validates the returned OutputSchema6_1.

This script is **not** part of the normal test suite. It must be run manually by Tyler after setting `ANTHROPIC_API_KEY`.

---

## What This Tests

| Check | Expected |
|---|---|
| `status` | `"GREEN"` |
| `charge` | `"6-1"` |
| `schema_version` | `"1.1"` |
| `red_blockers` | `[]` |
| `yellow_warnings` | `[]` |
| `flagged_sections` | `[]` |
| `narrative` exists | Non-empty string |
| `narrative` paragraph count | Exactly 6 (split by `\n\n`) |
| No `[REVIEW` markers | Absent (GREEN narratives must not have review flags) |
| Phrase: "assigned as the housing officer" | Present |
| Phrase: "two additional times" | Present |
| Phrase: "three verbal orders" | Present |
| Inmate quote ("No, I ain't doing that.") | Present |

---

## Data Used

TC01 from `kb/charges/6-1/test_cases.json` — fully synthetic/sample data. No real inmate or officer information.

---

## How to Run

**Step 1 — Set your API key (PowerShell):**

```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
```

**Step 2 — Run the live test:**

```powershell
npm run test:6-1:live-green
```

**Optional — See raw Claude narrative:**

```powershell
$env:DEBUG_CLAUDE_RAW = "true"
npm run test:6-1:live-green
```

**Optional — Override the model:**

```powershell
$env:CLAUDE_MODEL = "claude-sonnet-4-6"
npm run test:6-1:live-green
```

---

## Safety Notes

- `ANTHROPIC_API_KEY` is read from the environment at call time. It is **never** logged, printed, or included in error messages.
- This script will exit with an error immediately if `ANTHROPIC_API_KEY` is not set — it will not silently fall back to a mock.
- This script is **separate** from `npm run test:6-1` and `npm run test:6-1:generate`. Those two scripts never make real API calls.
- Do not commit `.env` files. The `.gitignore` blocks `.env` and `.env.*`.
- Do not run this script in CI. It is for manual Tyler approval only.

---

## Files Created in Step 4C

| File | Purpose |
|---|---|
| `src/dr-writer/llm/claudeClient.ts` | Real Claude API client (fetch-based, no SDK) |
| `src/dr-writer/charges/6-1/testLiveClaudeGreen6_1.ts` | Live GREEN integration test script |
| `.env.example` | Template for local environment variables (committed, no real keys) |
| `.gitignore` | Updated to block `.env`, `.env.*`, `prompt-output/`, `*.real.json` |
| `docs/STEP_4C_LIVE_CLAUDE_GREEN_TEST.md` | This document |

---

## Default Model

`claude-sonnet-4-6` — can be overridden with the `CLAUDE_MODEL` env var or by passing `metadata` to `createClaudeClient()`.

---

## After Step 4C

- Step 4D: Live YELLOW test (same client, TC03 facts)
- Step 4E: Fake intake CLI integration
- Step 4F: UI (out of scope — do not build)
