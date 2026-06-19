---
name: Playwright file uploads in the testing subagent
description: How to test a file-upload UI when the testing subagent cannot read files from disk.
---

The Playwright-based testing subagent (`runTest`) cannot access the local filesystem, so it cannot pick a real file in an `<input type=file>` (including hidden inputs inside drop-zone labels).

**How to apply:** Have the test plan construct the file in the browser and assign it to the input programmatically, then fire `change`:

```js
const input = document.querySelector('input[type=file]');
const file = new File(["<file contents here>"], 'name.csv', { type: 'text/csv' });
const dt = new DataTransfer();
dt.items.add(file);
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
```

**Why:** This drives the same `onChange`/drop handlers a real upload would, so parsing/preview logic runs for real without needing disk access. Pass the file contents inline in the test plan (escape newlines as `\n`).
