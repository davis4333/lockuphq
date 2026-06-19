---
name: Search Log DOCX form-fill approach
description: How cdc-coach fills the original Search Log (and similar legacy FORMTEXT) DOCX forms, and the constraints that keep it correct.
---

# Filling original legacy DOCX forms (FORMTEXT) in cdc-coach

The cdc-coach app fills the *original* government Word forms (Search Log DC6-2001,
Property Restriction) instead of recreating them. Method = PizZip read
`word/document.xml`, do regex string surgery, write it back, `zip.generate`.

## Rules / constraints (non-obvious; keep these)
- A FORMTEXT field's editable value is the run(s) **between** `<w:fldChar w:fldCharType="separate"/>` and the `<w:fldChar w:fldCharType="end"/>` run. Replace that middle, not the whole field — the `begin`/`separate`/`end` fldChars and field codes must survive or Word shows a broken field.
- Multi-line cell values use `\n` in the data model and become extra runs with `<w:br/>` (not literal newlines in `<w:t>`).
- **Continuation pages** are made by cloning the entire page fragment (everything in `<w:body>` except the single trailing `<w:sectPr>`) once per N data rows, joined by a real page break paragraph. Keep exactly one trailing `sectPr`.
- **Strip `<w:bookmarkStart>`/`<w:bookmarkEnd>` from cloned pages.** Word bookmark IDs must be unique; cloning duplicates them and corrupts the doc. **Why:** duplicate bookmark IDs across cloned pages = "unreadable content" repair prompt.
- This regex approach is **template-specific** — it relies on the exact inspected structure (Search Log = Location table + 19-row data table). Do not generalize it into a generic DOCX filler. Validate structure and **fail loudly** (throw) when the template doesn't match (e.g. data-row capacity < expected rows-per-page) rather than silently dropping entries.
- Escape user text for XML (`& < > "`) and strip XML-1.0-illegal control chars before injecting.
- Never persist/transmit uploaded roster data — parsing is fully client-side, in React state only (cleared on refresh). No localStorage, no DB, no API, no AI.

## TS gotcha that bit here
`someString.match(re) ?? []` has type `RegExpMatchArray | never[]`; calling
`.find`/`.some` on that union collapses the callback param to `never`
(`string & never`). Annotate the binding as `string[]` to fix.

## Verifying changes
Bundle a lib module standalone with the api-server esbuild and run under node:
`artifacts/api-server/node_modules/.bin/esbuild <entry>.ts --bundle --platform=node --format=cjs --outfile=/tmp/x.cjs`. Assert balanced `<w:tbl>/<w:tr>/<w:tc>`, balanced `fldChar begin/end`, 0 bookmarks left, and re-zip into a valid `.docx`.
