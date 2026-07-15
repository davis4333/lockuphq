# Step 10 - Website Demo Readiness

## Product

LockUpHQ DR Assist

## Current Supported Charge

Charge 6-1 - Disobeying verbal or written order.

## Website Status

This is a demo-only preview.

- Fake/practice data only.
- Not approved for real inmate data.
- Not production-ready.
- Not an official agency system.
- Not an official report submission system.

## Public Demo Rule

If deployed publicly without login/auth, the safest mode is mock-only.

Live Claude mode should not be exposed publicly unless the app is private/protected and the API key remains server-side only.

## API Key Rule

`ANTHROPIC_API_KEY` must never appear in:

- Frontend JavaScript.
- HTML.
- Docs.
- Screenshots.
- Logs.
- Exported reports.
- Git commits.
- Chat messages.

## Data Rule

Do not use:

- Real inmate names.
- Real DC numbers.
- Real incident details.
- Real case numbers.
- Pasted real reports.

## What Is Ready

- Charge 6-1 intake form.
- Validation.
- RED/YELLOW/GREEN gating.
- RED no-generation guard.
- Mock narrative generation.
- Guarded live generation locally.
- Officer checklist.
- AI disclosure.
- Copy/export.
- Feedback notes.

## What Is Not Ready

- Real deployment security.
- Authentication.
- Audit logs.
- User roles.
- Data retention policy.
- Real inmate data handling.
- Official approval.
- Multi-charge support.

## Website Deployment Position

This project can be shown as a demo-only web preview only if the site clearly warns users to use fake/practice facts and does not represent the tool as approved production software.

For any public preview, prefer mock-only mode. Do not expose live Claude mode publicly unless the app is private/protected and the API key stays server-side.

Step 11 adds the public demo guard:

```text
LOCKUPHQ_PUBLIC_DEMO_MODE=true
```
