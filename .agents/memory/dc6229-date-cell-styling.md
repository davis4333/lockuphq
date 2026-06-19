---
name: DC6-229 daily-grid date-cell styling
description: Why the DC6-229 filler replaces each Day/Date cell's paragraph instead of appending a run.
---

# DC6-229 daily-grid date boxes are inconsistently styled in the template

The real `public/dc6-229-template.docx` daily grid has 14 `vMerge=restart` date
boxes (plus 1 header "Date" box). They are **not** uniformly formatted:

- The **first** data box (Sunday) is `pStyle=Heading3` with **no** `<w:jc>` (left-aligned).
- The other **13** are plain paragraphs with `<w:jc w:val="center"/>`.
- All target cells have `vAlign=center` and `tcW=828` twips (a narrow column).

**Rule:** to fill the 7 weekday dates consistently, **replace** each target box's
single empty `<w:p>` with one fully-controlled centered, single-spaced paragraph —
do **not** append a run to the template's own paragraph. Preserve the cell's
`<w:tcPr>` (width, borders, `vMerge`, shading, `vAlign`) untouched; only the
paragraph content changes (allowed — it does not alter column width / row height /
page size).

**Why:** appending a space-joined run ("Sun 06/14/26") inherited each cell's
differing paragraph style and let Word word-wrap differently per cell in the narrow
column, so some cells showed the day stacked over the date and others showed them
inline on one line. Replacing the paragraph makes all 7 identical.

**Day-over-date stacking:** the "Day + Date" format value is carried as
`"Sun\n06/14/26"` (newline, built in `weekDates.ts`), and the filler's
`buildResultRuns` converts each `\n` into a hard `<w:br/>`. Never go back to a
space separator and rely on wrapping.

**How to apply:** any future change to DC6-229 date filling must keep the
paragraph-replacement approach and the `\n`→`<w:br/>` hard break. There is also a
fail-loud guard: if a target box has no paragraph to replace, the filler throws
(template drift).
