---
name: Search Log DOCX one-line cell fitting
description: How the cdc-coach Search Log filler keeps every data cell on one line, and the invariant that the UI and filler must share width math.
---

# Search Log DOCX one-line cell fitting

The Search Log DOCX filler keeps EVERY filled data cell (Date, Time, Area, Type, Inmate, Officer, Discrepancies, Tablet) on one physical line by shrinking only that cell's own inserted-run font size — never by changing table layout, column widths, row heights, page size, continuation-page logic, footer mirroring, or section/bookmark logic.

- One font ladder for all columns: start at the form's 10pt and step down (0.5pt steps) only as far as needed, with a 6pt floor. If a value still won't fit at 6pt the filler does NOT truncate.
- Overflow is surfaced as a non-blocking per-field review-table warning: "This <Field> field may be too long to fit on one line at 6 pt. Review before generating". Warnings never block generation (generation needs only: ≥1 included row, a Location, and the confirm checkbox checked).
- The review UI and the filler MUST share identical width math: per-column widths live in `SEARCH_LOG_COL_TWIPS` and the fit estimate in `searchLogTextFit.ts`. The filler reads each cell's real `w:tcW` at fill time and falls back to `SEARCH_LOG_COL_TWIPS[idx]`. In the metrics, nbsp == space and the non-breaking hyphen == hyphen, so the UI measuring raw text matches the filler measuring the nbsp/nbhyphen-substituted string.

**Why:** Originally only the grouped inmate cell was font-fit (opt-in `ReviewRow.inmateFit`); Officer/Discrepancies/etc. stayed at 10pt and could wrap to a second line. The requirement became: fit ALL cells globally to one line.

**How to apply:** `ReviewRow.inmateFit` is now vestigial (a no-op kept only so callers compile). Do NOT reintroduce an `inmateFit === false` multiline branch in the filler. Any filler change must preserve the protected pieces (the `public/*-template.docx` government forms, continuation pages, footer mirroring, single `sectPr`, bookmark strip). Verify by filling the real template for 1/2/3 pages and checking: balanced `w:tbl`/`w:tr`/`w:tc`, `fldChar` begin == end, exactly one `sectPr`, page-breaks == pages-1, footer first+default both present, zero bookmarks, and every filled cell carrying a single sized run with no `<w:br/>`.
