# Phase 2A editable Excel proof

This evidence uses fake data only. The PDF-coordinate spike remains in the repository for reference, but editable Excel is now the proposed primary Housing Log output.

## Source and approach

- Versioned template: `assets/housing-logs/2026-04-27/Housing Unit Logs (REVISED 4.27.26).xlsx`
- Source SHA-256: `1a550216dfd8320b01e0fdbe6cc0e42e87d58268f8029909c733ad1d75470c3d`
- Resolver key: `templateVersion=2026-04-27` plus `sourceSheet=1_B`
- Generator: JSZip with narrow OOXML mutations. It edits cells, sheet metadata, relationships, drawings, and continuation-sheet parts while leaving unsupported official workbook parts byte-for-byte intact.

The source workbook contains legacy controls, VML, embedded printer settings, and other Excel-specific parts. A full workbook object-model rewrite would risk discarding or normalizing those parts, so the proof avoids rebuilding the workbook.

## Proof contents

- All 175 required Phase 1 fields for B-unit first shift, including every one of the 17 security-check rows
- Staff names, duty times, equipment, counts, formal-count wording, activities, initials, and handwritten PNG signatures
- 72 deliberately long fake events in entered order, including a midnight crossover
- Three continuation worksheets cloned from the official event-page layout
- Six embedded signatures on the official three-page worksheet and two on each continuation worksheet
- Explicit overflow failure for values that cannot be printed safely; no silent truncation

## Verification

- JSZip CRC reload passed and reconstructed all 72 event values without loss.
- The official B worksheet retained its columns, merged cells, row heights, cell styles, margins, legal-page setup, headers/footers, print area, and manual page breaks.
- Styles, shared strings, theme, all 12 original printer-setting binaries, and all 11 untouched official worksheets remained byte-for-byte identical to the source.
- Artifact Tool independently reloaded the workbook, found all 15 worksheets and 12 signature images, rendered the official sheet plus all continuations, and found no cell formula-error values.
- Microsoft Excel desktop opened the generated workbook through the normal open path without repair. Excel reported legal paper, portrait orientation, the original three-page print area, and editable cell content.

Machine-readable details are in `excel-proof-qa.json` and `excel-desktop-verification.json`. Rendered evidence is in `rendered-sheets/`.

Editing this downloaded workbook changes only the external copy. It does not mutate or revise the finalized LockUpHQ database record.
