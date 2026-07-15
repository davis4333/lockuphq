---
name: LOCKUPHQ standalone app handoff
description: How the full standalone LOCKUPHQ DR Writer app is packaged/deployed (separate from the cdc-coach lib copy).
---

# LOCKUPHQ DR Writer — standalone app (NOT the cdc-coach lib)

The full standalone app (from the DR_Writer zip) is a **different artifact** from the
frozen `@workspace/dr-writer` lib inside cdc-coach. It is meant to run in its **own
separate Repl**, never inside the cdc-coach monorepo. A prepped clean copy was staged at
`handoff/lockuphq-dr-writer/` (top-level, deliberately outside the pnpm `packages` globs
so the monorepo never builds/typechecks/links it).

## Durable facts about the standalone app
- **Zero npm dependencies.** Pure Node built-ins + native `fetch()`; TypeScript runs
  directly via `node --experimental-strip-types` (needs Node >= 22.6). No `npm install`.
  `package.json` intentionally has no `dependencies`.
- **Persistence is a single-writer LOCAL file store** (`data/app-server/`:
  `state.json`, append-only `audit.log`, `users.json`).
  **Must deploy Reserved VM / Always-On**, never Autoscale (would split-brain + lose disk).
- **Admin bootstrap fires only on a fresh data dir** (no `users.json`): set
  `ADMIN_USERNAME`/`ADMIN_PASSWORD` in Secrets BEFORE first boot. So exclude the runtime
  `data/` dir from any handoff copy or the one-shot provisioning won't run.
- **Live AI gate:** `AI_MODE=live` (or `--ai=live`) refuses to start without
  `ANTHROPIC_API_KEY` (fail closed). `PORT` is read from env — never hardcode it.

## Security lesson (why this matters)
The zip had a real Anthropic key committed in **more than `.env`** — also in
`src/dr-writer/server/testDevServer6_1.ts` and two `docs/*.md`.
**Why:** grepping only `.env` misses committed keys. **How to apply:** when vendoring any
external repo, `rg 'sk-ant-'`/secret patterns across ALL files, redact every hit (mask,
never print the value), and tell the user to rotate — a committed key is already burned.
