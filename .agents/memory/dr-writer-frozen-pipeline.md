---
name: DR Writer frozen pipeline
description: Constraints for the @workspace/dr-writer lib and its Claude-backed routes (Charge 6-1).
---

The `@workspace/dr-writer` lib holds the LOCKUPHQ DR Writer pipeline copied VERBATIM from an external module. The only edit ever allowed on `src/charges/6-1/*` and `src/llm/*` is stripping `.ts` from relative import specifiers (this repo is `moduleResolution: bundler`). Do not touch the evaluator/prompt/parser/cleaner/generator/types/Claude-client logic or the frozen `DEFAULT_CLAUDE_MODEL`.

**Why:** the pipeline is externally owned and validated; local edits would diverge it from the source of truth and could silently change legally-sensitive report output.
**How to apply:** override model/timeout/tokens/temperature at runtime via env (`CLAUDE_MODEL`, `CLAUDE_TIMEOUT_MS`, `CLAUDE_MAX_TOKENS`, `CLAUDE_TEMPERATURE`), never by editing files. If the source module updates, re-copy the whole file rather than hand-patching.

Two-entry rule: `@workspace/dr-writer` (barrel) pulls in the node-only Claude client → server code only. Browser code must import from `@workspace/dr-writer/types` (types-only). Mixing these leaks server code into the client bundle.

Key/logging rule: `ANTHROPIC_API_KEY` is read only server-side (`createClaudeClient` via `process.env`). Never return it to the client, never log it. The route logs only `err.name` — intake facts and generated narratives are NEVER logged. RED evaluation short-circuits before any Claude call, so RED works with no key configured.
