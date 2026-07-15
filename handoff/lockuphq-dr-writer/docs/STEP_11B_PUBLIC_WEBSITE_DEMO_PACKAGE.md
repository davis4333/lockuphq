# Step 11B — Public Website Demo Package

## Purpose

Prepare LockUpHQ DR Assist — Charge 6-1 for a demo-only preview on `lockuphq.com` after the Step 11A intake wording polish.

This package is for fake/practice facts only. It is not production approval and it is not approval to use real inmate data.

## Public Demo Mode Rule

If the website is public or not protected by login/auth, run it mock-only.

Recommended environment variable:

```text
LOCKUPHQ_PUBLIC_DEMO_MODE=true
```

## Public Mode Behavior

When `LOCKUPHQ_PUBLIC_DEMO_MODE=true`:

- Mock generation remains available.
- No API key is required.
- Live Claude generation is disabled from browser/API requests.
- Any `mode=live` generate request returns a safe error before Claude/API client creation.
- No Claude/API call should be possible.
- The UI says public demo mode is mock-only.
- Fake/practice facts only.
- RED still blocks generation and returns no narrative.

## Local Private Mode Behavior

When `LOCKUPHQ_PUBLIC_DEMO_MODE` is not set to `true`:

- Mock generation remains the default.
- Live Claude can be used only when `ANTHROPIC_API_KEY` is set server-side.
- Live Claude requires explicit UI selection.
- Live Claude requires explicit confirmation.
- Live Claude must still use fake/practice data only.

## Commands

Install dependencies if needed:

```powershell
npm install
```

Run the non-live test suite:

```powershell
npm run test:6-1:all
```

Start the local demo:

```powershell
npm run dev:6-1:ui
```

Open:

```text
http://127.0.0.1:5176/charge-6-1
```

## Public Demo Command Example

PowerShell:

```powershell
$env:LOCKUPHQ_PUBLIC_DEMO_MODE = "true"
npm run dev:6-1:ui
```

## Manual Browser Checks

- GREEN mock: load GREEN practice case, check facts, draft narrative.
- YELLOW mock: load YELLOW practice case, check facts, draft narrative, confirm review flag.
- RED missing DC: remove the inmate DC number, check facts, confirm drafting is blocked and no narrative appears.
- Export TXT: generate a mock GREEN draft and confirm TXT export downloads.
- Public demo live block: with `LOCKUPHQ_PUBLIC_DEMO_MODE=true`, confirm Live Claude mode is disabled or blocked before any API call.

## Website Warning

Do not accept real data.

Do not advertise LockUpHQ DR Assist as official agency software.

Do not expose `ANTHROPIC_API_KEY` to browser JavaScript, HTML, screenshots, logs, docs, exported reports, git commits, or chat messages.

## Current Test Status

Latest non-live suite:

```powershell
npm run test:6-1:all
```

Current result after Step 11A and Step 11B packaging:

```text
181 passed / 0 failed / 181 total
```

No live Claude/API tests were run from Codex.
