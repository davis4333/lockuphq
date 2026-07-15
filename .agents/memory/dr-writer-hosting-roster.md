---
name: DR Writer roster + ephemeral hosting
description: Where dr-writer-app inmate/report data comes from and why it looks "seed only"; what changes are allowed to fix it.
---

# dr-writer-app roster & persistence behavior

- The person roster is **seeded from a bundled test fixture** (`engine/tests/fixtures.ts` `addStandardPersons`, imported by `server/appServer.ts`). Both `createAppService` and `createLiveApp` call it whenever the person list is empty. Because `DR_WRITER_DATA_DIR` is wiped on every boot (PII/no-persistence shim), persons is always empty at startup, so the synthetic inmate ("Sam Synthetic Z99999") is re-seeded on every boot. This is by design ("DEMO ONLY — synthetic data"), not an accidental bundle.
- `createReport` is `OFFICER_ONLY`; `addPerson`/`listPersons` are `WORKFLOW` (officer+supervisor). The officer-app auto-logs-in `officer.alex` (officer). No `system_admin` exists unless `ADMIN_USERNAME`+`ADMIN_PASSWORD` are set at first boot (they are not).
- **To let officers create reports about real inmates**: add an inmate via the officer-app "Add a new inmate" card, which POSTs the full `Person` payload to the existing `POST /api/persons`. This is allowed **client-only wiring** in `server/ui/officer-app.html` — NOT an engine change. Do not add roster/persons logic to the frozen engine.

**Why:** engine/gates/validators/tests are frozen; the only permitted edits are hosting/wiring shims (`appServer.ts` base-path + ephemeral-dir, `officer-app.html` client wiring).

**How to apply:** any "can't create a new report / only sample data" complaint = fixture seeding + no add-inmate UI, not a broken route. Fix in the HTML client, using existing endpoints.

## Live-beta caveat (autoscale)
- Deployment is **autoscale** with the roster/reports held in an ephemeral per-instance tmpfs wiped on boot. Reports do NOT persist across restarts and are NOT shared across autoscale instances — sessions/reports created on one instance can 404/expire on another. For a real multi-user beta this needs durable, shared storage (a deliberate decision that conflicts with the current no-persistence PII constraint — confirm with the user before changing).
- A stale deployment keeps serving old code: confirm the live deploy actually runs dr-writer-app (look for "AI mode: live" / "Synthetic demo users" boot lines) rather than the old `/api/dr-writer/6-1/*` prototype routes. Republish after wiring changes.
