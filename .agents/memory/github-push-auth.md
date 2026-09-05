---
name: GitHub push authentication
description: How to safely publish local workspace changes when Git transport cannot use the installed GitHub connection.
---

The installed GitHub connection can have repository `push` permission while Git credential transport still rejects its askpass/token path. In that case, use the authenticated GitHub client and the repository Contents API to commit changed files to the target branch, then fetch and align the local branch with the resulting GitHub commit.

**Why:** The connection's client authenticates GitHub API requests, but `client.auth()` may return only an authentication-type object rather than a raw token, so it cannot be passed to `git push`. Reusing that object as a password fails with “Invalid username or token.”

**How to apply:** Confirm the remote branch SHA has not moved, upload only the intended changed files through the authenticated client, fetch the branch, verify local and remote file content match, and reset local HEAD to the resulting remote commit. Never expose or persist credentials.