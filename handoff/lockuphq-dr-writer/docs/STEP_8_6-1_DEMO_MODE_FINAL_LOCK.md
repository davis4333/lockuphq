# Step 8 - Charge 6-1 Demo Mode Final Lock

## Current Status

Charge 6-1 demo mode is locked for controlled fake/practice use.

- GREEN live UI generation: PASS.
- YELLOW live UI generation: PASS.
- RED browser guard: PASS.
- Mock mode works without an API key.
- Live Claude mode works only when explicitly selected and confirmed.
- RED blocks generation before Claude/API.
- RED generated 0 `/api/dr-writer/6-1/generate` requests in the final browser guard check.
- Claude/API calls on RED: 0.
- No database, storage, auth, login, deployment, or new charge was added.
- Use fake/practice data only.

## Safe Demo Rules

- Use fake/practice names only.
- Use fake/practice DC numbers only.
- Use fake/practice incident dates/times only.
- Do not enter real inmate names.
- Do not enter real DC numbers.
- Do not enter real case numbers.
- Do not enter real incident facts.
- Do not paste real officer reports into the app.
- Do not paste API keys into chat, docs, screenshots, logs, or reports.

## Start The Local Demo

Open PowerShell in the project folder.

Mock mode can be used without an API key:

```powershell
npm run dev:6-1:ui
```

Open:

```text
http://127.0.0.1:5176/charge-6-1
```

For live mode only, set `ANTHROPIC_API_KEY` in the same PowerShell session that starts the dev server:

```powershell
$env:ANTHROPIC_API_KEY = "your-real-key-here"
npm run dev:6-1:ui
```

Live mode still requires explicit UI selection and confirmation before any API call.

## Recommended Demo Flow

1. Open the app.
2. Show the DEMO MODE warning.
3. Load GREEN sample.
4. Validate facts.
5. Generate in mock mode.
6. Show the officer checklist.
7. Export TXT.
8. Load YELLOW sample.
9. Show review warning behavior.
10. Remove the DC number and show RED blocking generation.
11. Only if appropriate, test Live Claude with fake/practice data.

## What Is Locked

- Charge 6-1 workflow.
- RED/YELLOW/GREEN evaluation.
- RED no-generation guard.
- Mock narrative generation.
- Live Claude guarded generation.
- AI disclosure.
- Officer checklist.
- Copy/export.
- Feedback notes.
- Demo warning.

## Not Production-Ready Yet

- No login/auth.
- No audit log.
- No user accounts.
- No admin panel.
- No secure production deployment.
- No database.
- No agency approval.
- No real inmate-data policy.
- No multi-charge expansion yet.

## Final Non-Live Test Status

Latest required non-live suite:

```text
npm run test:6-1              68 passed / 0 failed / 68 total
npm run test:6-1:generate      9 passed / 0 failed /  9 total
npm run test:6-1:dev-runner   24 passed / 0 failed / 24 total
npm run test:6-1:ui-validate  33 passed / 0 failed / 33 total
npm run test:6-1:ui-generate  33 passed / 0 failed / 33 total
```

Total:

```text
167 passed / 0 failed / 167 total
```

No live Claude/API tests were run from Codex.

## Next Recommended Step

Step 9 - First controlled feedback session using fake/practice facts only.

Use `docs/STEP_9_FIRST_CONTROLLED_FEEDBACK_SESSION.md` as the session packet.
