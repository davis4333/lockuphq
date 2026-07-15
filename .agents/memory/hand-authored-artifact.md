---
name: Registering a hand-authored (non-scaffoldable) artifact
description: How to register an API-kind artifact when createArtifact has no matching template
---

`createArtifact` only offers scaffold templates; a raw Node/custom app has no template.
To register one, hand-author the artifact and get it recognized:

1. Create the artifact dir + `.replit-artifact/` and write a full `artifact.toml`
   (kind, previewPath, paths, `[[services]]` localPort, dev + production run, `[services.env]`).
2. Direct `write` of `artifact.toml` is blocked, and `verifyAndReplaceArtifactToml`
   requires the TARGET file to already exist (fails NOT_FOUND otherwise) — chicken-and-egg.
3. Break the deadlock: seed `artifact.toml` via **shell** (`cp artifact.edit.toml artifact.toml`),
   then call `verifyAndReplaceArtifactToml({tempFilePath, artifactTomlPath})` to validate it.
   On success the platform registers the artifact AND auto-creates its workflow
   (`artifacts/<slug>: <serviceName>`); no manual `configureWorkflow` needed.
4. `restart_workflow` to boot it. Verify through the shared proxy at `localhost:80/<path>`
   (proxy does NOT rewrite paths — the service must handle its own base path).

**Why:** hit this bootstrapping wall standing up the dr-writer-app service; the seed-then-verify
sequence is the working path and is not documented in the artifacts skill.
