---
name: DR Writer persistence (testing phase)
description: Why dr-writer-app persists data during trusted-tester phase, and the hard preconditions that keep it safe.
---

# DR Writer persistence — trusted-tester phase

During the trusted-tester phase, `dr-writer-app` **persists** reports + the hash-chained
audit log across restarts/redeploys. The boot-time data-dir wipe was intentionally removed
and the data dir moved off RAM-backed `/dev/shm` onto durable disk
(`artifacts/dr-writer-app/data/app-server`, gitignored).

**Why:** the user needs to review completed reports and the audit trail after several days of
testing, instead of losing everything on every ship. Phase 7 built the store for durability
(atomic writes + fsync + append-only hash chain + torn-tail healing); the old wipe threw that
away on every boot.

**Why it's safe (and the precondition that MUST hold):** the app can only reference SYNTHETIC
fixture inmates (e.g. "Sam Synthetic", "Robin Sibling") — no real inmate PII can be entered, so
nothing sensitive is written to disk.

**How to apply / hard constraints:**
- Persistence only actually holds on a **Reserved VM (single instance)** deployment. Autoscale is
  ephemeral + multi-instance and erases/splits data regardless of the wipe flag. tmpfs (`/dev/shm`)
  is RAM and won't survive a restart either — both were the real blockers, not just the wipe.
- Removing the wipe ALONE is insufficient: you must also (a) point the data dir at durable
  non-tmpfs disk and (b) deploy as Reserved VM. All three are required together.
- **Before ANY real inmate data is ever allowed** (real add-inmate flow, roster import, live subject
  data), the boot-time wipe MUST be restored (or migrate to encrypted/managed storage with a
  retention policy). A loud revert flag lives in the `isMain` block of `appServer.ts`.
- The auto-login (no sign-in screen) is unchanged and stays.
- `deployConfig()` is NOT an available agent callback — the deployment target (autoscale ↔ vm) is a
  user choice in the Publish UI's Advanced settings; the agent cannot set it programmatically.
