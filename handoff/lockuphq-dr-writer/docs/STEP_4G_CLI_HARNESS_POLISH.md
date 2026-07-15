# Step 4G — CLI Harness Polish, Output/Save Review, and Secret-Safety Cleanup

## Purpose

Polish the local developer runner (`devRun6_1.ts`) for safer, cleaner use before any UI planning begins. This step adds explicit live-mode confirmation, a JSON print flag, improved `.gitignore` coverage, and verifies no secrets exist in the project files.

---

## What changed

### `src/dr-writer/charges/6-1/devRun6_1.ts`

- Added `--confirm-live` flag: live mode now requires BOTH `--mode live` AND `--confirm-live`. Without it, the runner aborts before any API call and prints a clear message.
- Added `--print-json` flag: prints the full `OutputSchema6_1` JSON to stdout. Default behavior (safe summary) never prints full JSON unless requested.
- Added `--safe-summary` flag: recognized as a no-op (it is the default behavior; included so scripts can be explicit).
- Updated `printUsage()` with new flags and examples.
- Updated `ParsedDevArgs` interface with `printJson: boolean` and `confirmLive: boolean`.
- Live guard order: `confirmLive` → `ANTHROPIC_API_KEY` → path check. The first guard fires first.

### `src/dr-writer/charges/6-1/testDevRun6_1.ts`

- Updated all `executeDevRun` calls to pass full `ParsedDevArgs` (including new `printJson` and `confirmLive`).
- Updated TD01 to check new default values (`printJson: false`, `confirmLive: false`).
- Updated TD17 to pass `confirmLive: true` (required to reach the path check).
- Added TD20: `--print-json` flag parsing.
- Added TD21: `--confirm-live` flag parsing.
- Added TD22: live mode without `--confirm-live` fails cleanly, 0 Claude calls.
- Added TD23: live mode + RED input + `confirmLive: true` → 0 Claude calls (RED short-circuits before client).
- Added TD24: error messages do not leak `ANTHROPIC_API_KEY` value.
- Total: 24 tests.

### `.gitignore`

Added:
```
*.log
logs/
pasted-logs/
terminal-output/
```

### `.env.example`

Updated `CLAUDE_MODEL` from blank to `claude-sonnet-4-6` (explicit placeholder).

---

## Secret-safety warning

**A previous terminal session exposed an Anthropic API key in a pasted log. That key must be revoked.**

Rules going forward:
- **Never paste terminal output containing an API key into chat, logs, or documents.**
- **Never commit `.env` or any file containing a real key.** Both `.env` and `.env.*` are in `.gitignore`.
- **If a key is exposed:** revoke it immediately at [console.anthropic.com](https://console.anthropic.com), then generate a new key. An exposed key cannot be "un-exposed."
- `ANTHROPIC_API_KEY` must never appear in thrown errors, console output, or log files. `claudeClient.ts` reads the key at call time and never includes it in error messages.
- `DEBUG_CLAUDE_RAW` must be `"true"` to see raw Claude responses — off by default.

### Secret scan result (Step 4G)

Searched all project files for:
- `REPLACE_WITH_ROTATED_KEY_VIA_REPLIT_SECRETS` → **no matches**
- `ANTHROPIC_API_KEY=<value>` → **no matches** (only placeholder in `.env.example`)
- `x-api-key: <hardcoded>` → **no matches**
- `.env` content → **not tracked** (gitignored)
- Log files / pasted logs → **no files found**

Project is clean.

---

## CLI flag reference

| Flag | Default | Description |
|---|---|---|
| `--input <path>` | *(required)* | Path to an `IntakeFacts6_1` JSON file |
| `--mode mock\|live` | `mock` | `mock` = no API cost; `live` = real Claude call |
| `--confirm-live` | false | Required to actually run in live mode |
| `--out <path>` | none | Write `OutputSchema6_1` JSON to this file |
| `--print-narrative` | false | Print the generated narrative to stdout |
| `--print-json` | false | Print the full output JSON to stdout |
| `--safe-summary` | *(default)* | Explicit no-op; summary-only is the default |

---

## Safe mock commands (no API cost)

```sh
# GREEN case
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json

# YELLOW case
npm run dev:6-1 -- --input dev-inputs/6-1/fake-yellow-quote-summary.json

# RED case (blocker list, Claude never called)
npm run dev:6-1 -- --input dev-inputs/6-1/fake-red-missing-dc.json

# With narrative
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --print-narrative

# With full JSON output
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --print-json

# Save to file
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --out dev-output/6-1/green-output.json
```

---

## Live mode now requires --confirm-live

Live mode requires both flags to prevent accidental API spending:

```sh
# This FAILS — missing --confirm-live
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --mode live

# Output:
#   Error: Live mode uses API credits and must only use fake/sample data.
#   Re-run with --confirm-live if you intend to make a live API call.

# This WORKS (requires Tyler approval + ANTHROPIC_API_KEY set in .env)
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --mode live --confirm-live
```

Live mode additional requirements:
- `ANTHROPIC_API_KEY` must be set in `.env`
- Input file must be under `dev-inputs/6-1/`
- Only fake/sample data — never real inmate or officer data

---

## Output write examples

```sh
# Mock mode — save output JSON
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --out dev-output/6-1/green-output.json

# Live mode — save output JSON (requires Tyler approval)
npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --mode live --confirm-live --out dev-output/6-1/live-green-output.json
```

`dev-output/` is gitignored. Output files are never committed.

---

## Test results (Step 4G)

| Suite | Result |
|---|---|
| `npm run test:6-1` | 59/59 |
| `npm run test:6-1:generate` | 9/9 |
| `npm run test:6-1:dev-runner` | 24/24 |

No live API run was made during Step 4G.

---

## Next recommended step

**Step 4H — Fake intake field review / future UI contract planning**

Review all fields in `IntakeFacts6_1` as a pre-UI audit:
- Which fields map to form inputs?
- Which fields have complex validation that the UI must surface?
- Which fields can the UI pre-fill from officer profile/assignment data?
- Which fields are officer-authored narrative (never AI-invented)?

This produces the UI contract spec before any form or page is designed.
