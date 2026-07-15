# LOCKUPHQ DR Writer — deployment handoff

This folder is a **clean, self-contained copy** of the full LOCKUPHQ DR Writer app,
prepared for deployment in its **own separate Replit project**. It was NOT run or
deployed from the cdc-coach project it was packaged in.

## What was verified during packaging

- **Self-contained:** no imports reference `cdc-coach` or `@workspace/*`.
- **Zero npm dependencies:** the app uses only Node built-ins and native `fetch()`
  and runs TypeScript directly via `node --experimental-strip-types`. There is no
  `npm install` step. (`package.json` has no `dependencies` on purpose.)
- **PORT is read from the environment** (`process.env.PORT`, dev fallback 5177),
  so it works with Replit's assigned port.
- **Removed before handoff:** the real `.env` (secret), and the runtime `data/`
  directory (so first-boot admin provisioning fires cleanly in the new project).
- **Secret redaction:** an Anthropic API key literal that had been committed in
  `.env`, `src/dr-writer/server/testDevServer6_1.ts`, and two `docs/*.md` files was
  replaced with the placeholder `REPLACE_WITH_ROTATED_KEY_VIA_REPLIT_SECRETS`.

> ⚠️ **Rotate the leaked key.** The committed key is compromised. Create a NEW key in
> the Anthropic console and use only the new key (in Replit Secrets). Do not reuse the
> old one anywhere.

## Requirements

- Node.js **>= 22.6** (Node 24 recommended) — required for `--experimental-strip-types`.

## Environment variables

See `.env.example` for the full, documented list. Set these in the new project's
**Secrets** panel (not a committed file):

| Variable | When | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | required for live AI | the rotated key |
| `AI_MODE=live` | required for live AI | turns on live drafting (else deterministic stub) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | **before first boot** | provisions the single `system_admin` on a fresh data dir |
| `LOCKUPHQ_ALLOWED_ORIGIN` | required | the deployed domain, for CORS |
| `PORT` | do NOT set | Replit assigns it; the app reads it |
| `CLAUDE_*` | optional | model/token/temperature/timeout overrides |

## Run command (in the new project)

With `AI_MODE=live`, `ANTHROPIC_API_KEY`, and the admin vars set in Secrets:

```bash
node --experimental-strip-types src/dr-writer/server/appServer.ts --ai=live
```

(The `--ai=live` flag and `AI_MODE=live` are equivalent; either is fine. Do **not**
use the `--env-file=.env` variant on Replit — Secrets are already in `process.env`,
and `--env-file` would error if no `.env` file exists.)

## Persistence — use a Reserved VM

The app persists to a **local** directory: `data/app-server/` (`state.json`,
append-only `audit.log`, `users.json`). It is a single-writer, local file store.

- **Deploy as a Reserved VM / Always-On** so the local disk persists across
  restarts and there is exactly one writer.
- **Do NOT use Autoscale** — multiple instances would split-brain the file store,
  and the disk would not persist.

## First-boot checklist (new project)

1. Set `ADMIN_USERNAME` + `ADMIN_PASSWORD` in Secrets **first**.
2. Set `ANTHROPIC_API_KEY` (rotated) and `AI_MODE=live`.
3. Set `LOCKUPHQ_ALLOWED_ORIGIN` to the deployed domain.
4. Start the app. On the first boot with an empty `data/` dir, the app creates the
   `system_admin` account from your admin vars.
5. Two **synthetic** dev accounts are also seeded on a fresh boot
   (`officer.alex`, `sup.morgan`) for testing. These are synthetic-only — this app is
   **not authorized for real inmate data** (see the master blueprint).

## Backups

Because state lives in `data/app-server/`, back up that directory (or snapshot the
Reserved VM disk) to preserve reports and the audit chain.
