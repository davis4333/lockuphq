---
name: Verifying DOCX fillers (cdc-coach)
description: How to end-to-end verify a Word-form filler in this repo when LibreOffice and esbuild CLI are unavailable.
---

# Verifying DOCX fillers without LibreOffice

The cdc-coach autofill tools (Search Log, DC6-229) fill real government `.docx`
templates by string-transforming `word/document.xml`. To verify a filler end-to-end
against the real template:

**Why this approach:** LibreOffice/`soffice` is NOT installed (can't render to PDF to
count pages), and `esbuild` is not resolvable from the repo root (`require.resolve('esbuild')`
fails; there's no `node_modules/.bin/esbuild`). So bundling the TS filler the obvious way
doesn't work.

**How to apply:** Write a `/tmp/*.cjs` harness that:
1. Resolves `typescript` and `pizzip` from the artifact dir, e.g.
   `require(require.resolve('typescript', { paths: [ARTIFACT_ROOT] }))`.
2. Reads the filler `.ts`, runs `ts.transpileModule(src, { compilerOptions: { module: CommonJS }})`,
   and loads it via `new Function('require','module','exports', js)(...)` with a `require` shim
   that returns the PizZip instance for `'pizzip'`.
3. Calls the filler's **pure** `buildFilled*DocumentXml(documentXml, input)` function (these
   fillers separate the pure XML transform from the `fetch`+zip wrapper precisely so it can be
   unit-tested without a browser).
4. Re-zips with PizZip, re-opens the buffer, and asserts on counts in `document.xml`
   (FORMTEXT `separate` fldChars, `sectPr`, bookmarks, per-form field text, dates, page-2
   marker strings preserved per cloned section).

This catches structural drift (field count, section/page count, duplicate-id bookmarks)
that a typecheck never would.
