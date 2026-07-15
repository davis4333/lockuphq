# Website Demo Launch Checklist

Use this before placing LockUpHQ DR Assist - Charge 6-1 on a website demo page.

## Before Launch

- [ ] Confirm demo warning is visible.
- [ ] Confirm no real sample data is present.
- [ ] Confirm mock mode works.
- [ ] Confirm RED blocks generation.
- [ ] Confirm YELLOW review warning appears.
- [ ] Confirm export says demo/mock where applicable.
- [ ] Confirm no API key is in frontend files.
- [ ] Confirm no `.env` file is committed.
- [ ] Confirm no real reports are in examples.
- [ ] Confirm `npm run test:6-1:all` passes.

## If Deploying Public

- [ ] Prefer mock-only.
- [ ] Set `LOCKUPHQ_PUBLIC_DEMO_MODE=true`.
- [ ] Do not expose live Claude publicly.
- [ ] Do not store submitted data.
- [ ] Add clear disclaimer.
- [ ] Do not advertise as official agency software.

## If Deploying Private/Protected

- [ ] Keep `ANTHROPIC_API_KEY` server-side only.
- [ ] Confirm live mode requires explicit confirmation.
- [ ] Confirm rate/cost risk is understood.
- [ ] Use fake/practice data only.

## Final Go/No-Go

Go only if the demo is clearly labeled as fake/practice-only and no real inmate data can be mistaken as approved for use.
