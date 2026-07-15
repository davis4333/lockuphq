---
name: DR Writer frozen app
description: Constraints for the standalone LOCKUPHQ DR Writer app (artifacts/dr-writer-app) and its hosting shims.
---

The DR Writer is the user's full adaptive **LOCKUPHQ DR Writer** app, hosted as the
`dr-writer-app` API-kind artifact and embedded via iframe in cdc-coach's DR Writer tab.
Its source under `artifacts/dr-writer-app/src/dr-writer/**` is copied VERBATIM from the
user's staged `handoff/lockuphq-dr-writer/` and is FROZEN: engine, gates, validators,
benchmark, and tests must not be touched.

**Why:** the pipeline is externally owned and validated; local edits diverge it from the
source of truth and could silently change legally-sensitive report output.

**How to apply — the ONLY two files allowed to diverge from the handoff source are the
hosting shims:**
- `server/appServer.ts` — BASE_PATH prefix strip on `req.url`, `__BASE_PATH__` injected into
  served HTML, and the ephemeral `DR_WRITER_DATA_DIR` (`/dev/shm/dr-writer-app`) `rmSync`-wiped
  on boot. The shared proxy does NOT rewrite paths, so the service owns its own base path.
- `server/ui/officer-app.html` — base-path-aware `fetch`, plus a guarded `autoLogin()` that
  silently starts the synthetic demo session. There is intentionally NO sign-in screen: the
  credential form is neutralized (`renderSignIn` shows a "connecting" card, `wireSignIn`
  re-triggers `autoLogin`), so every no-session state (initial load, 401, sign-out) routes
  through auto-login and a username/password form can never render.

User's two hard hosting constraints: (1) NO login screen; (2) NO persisted reports (real
inmate PII) — hence the auto-login + tmpfs-wiped-on-boot data dir.

Key/logging rule: `ANTHROPIC_API_KEY` is read only server-side; never return it to the client,
never log it. `dr-writer-app` boots in `AI_MODE=live` and will `exit(1)` without the key.

The old Charge-6-1-only `@workspace/dr-writer` lib + `api-server` `drWriter.ts` route were
SUPERSEDED and removed from the wiring; `lib/dr-writer/` may remain on disk but is unimported.
