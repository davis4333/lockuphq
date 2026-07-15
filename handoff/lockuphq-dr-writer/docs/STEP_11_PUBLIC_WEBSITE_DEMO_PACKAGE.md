# Step 11 - Public Website Demo Package

Updated by Step 11B after the Step 11A intake wording polish. See `docs/STEP_11B_PUBLIC_WEBSITE_DEMO_PACKAGE.md` for the current public website handoff.

## Purpose

Prepare LockUpHQ DR Assist - Charge 6-1 for a demo-only web preview on `lockuphq.com`.

This package is for fake/practice facts only. It is not production deployment approval.

## Public Demo Mode Rule

If the website is public or not protected by login/auth, run it mock-only.

Recommended environment:

```text
LOCKUPHQ_PUBLIC_DEMO_MODE=true
```

## Public Mode Behavior

When `LOCKUPHQ_PUBLIC_DEMO_MODE=true`:

- Mock generation remains available.
- No API key is required.
- Live Claude generation is disabled from browser/API requests.
- Any `mode=live` generate request returns a safe mock-only error before Claude/API client creation.
- Fake/practice facts only.
- RED still blocks generation and returns no narrative.

## Local Private Mode Behavior

When `LOCKUPHQ_PUBLIC_DEMO_MODE` is not set to `true`:

- Mock generation remains the default.
- Live Claude can be used only if `ANTHROPIC_API_KEY` is set server-side.
- Live Claude requires explicit UI selection.
- Live Claude requires explicit confirmation.
- Live Claude must still use fake/practice data only.

## Commands Before Uploading Or Deploying

```powershell
npm install
npm run test:6-1:all
npm run dev:6-1:ui
```

For public demo mode:

```powershell
$env:LOCKUPHQ_PUBLIC_DEMO_MODE = "true"
npm run dev:6-1:ui
```

Open:

```text
http://127.0.0.1:5176/charge-6-1
```

## Manual Browser Checks

- GREEN mock: load GREEN sample, validate, generate mock narrative.
- YELLOW mock: load YELLOW sample, validate, generate mock narrative, confirm review flag.
- RED missing DC: remove DC number, validate, confirm Generate disabled and no narrative.
- Export TXT: generate mock GREEN, export TXT, confirm draft downloads.

## Website Warning

Do not accept real data.

Do not advertise LockUpHQ DR Assist as official agency software.

Do not expose `ANTHROPIC_API_KEY` to browser JavaScript, HTML, screenshots, logs, docs, exported reports, git commits, or chat messages.

## Current Test Status

After adding public demo mode tests, the non-live suite passes through:

```powershell
npm run test:6-1:all
```

Latest result:

```text
181 passed / 0 failed / 181 total
```

No live Claude/API tests should be run from Codex.
