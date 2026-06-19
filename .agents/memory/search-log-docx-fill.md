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
- **The "match the end run" regex must not let its rPr capture cross a run boundary.** The end-run group's optional `<w:rPr>…</w:rPr>` must use `(?:(?!<\/w:r>)[\s\S])*?`, not a plain `[\s\S]*?`. **Why:** with a plain lazy capture, `<w:r…>` greedily latches onto the *first placeholder run* after `separate` and the inner `[\s\S]*?` expands across run boundaries to reach the real end fldChar — so the middle (discarded) group captures empty and the original placeholder runs (e.g. `<w:t>     </w:t>` + empty runs at the template's font size) **survive inside the filled field**. Those leftover spaces consume cell width and can re-introduce wrapping in narrow columns. **How to apply:** after filling, assert no stray `<w:t>\s{2,}</w:t>` remains inside any *filled* field result (blank/unfilled rows legitimately keep their placeholders).
- **Narrow table columns wrap because of width, not row height.** The data rows are `<w:trHeight w:hRule="exact">` (one line) with `vAlign="bottom"`; when a narrow value is slightly too wide it wraps and the row *looks* double-height. Fix by **per-value adaptive font sizing**, NOT a fixed shrink: keep the value at the same 10pt (sz20) as the other columns when it fits, and only step the size down (candidates 10→8pt) for values that wouldn't fit. **Why:** the user wants the columns visually uniform; force-shrinking all of them to 8pt looked inconsistent. **How to apply:** estimate single-line width with a Times-New-Roman advance-width table (em=2048 units; width twips = Σunits × szHalfPoints × 10 / 2048), read each cell's real `<w:tcW>`, subtract ~115 twips/side Word default padding + a small buffer, pick the largest fitting size. Keep non-breaking space (U+00A0) / hyphen (U+2011) so the chosen size renders as one unbroken token. Prefer this over `<w:noWrap/>` (which risks overflow/clipping in exact-height cells).
- Multi-line cell values use `\n` in the data model and become extra runs with `<w:br/>` (not literal newlines in `<w:t>`).
- **The grouped-inmate "one line, shrink the whole cell" fit is a SEPARATE, opt-in path from per-value narrow-column fitting — keep them distinct.** When a row carries `inmateFit` (set only for `byCell` grouped rows, where both bunks' inmates are joined with `" / "`), the inmate column (col 4, ~4140 twips) collapses to a single line and steps its font down through coarse candidates (`[20,16,14,12]` half-points) until the whole joined string fits. When `inmateFit` is falsy the column keeps its original multiline behavior at the template size. **Why:** users want grouped cells to show both inmates without wrapping, but separate-bunk/manual rows must look exactly as before. **How to apply:** never alter the `inmateFit`-false branch — it is the regression baseline; verify separate/manual output is byte-identical before/after any filler change.
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
