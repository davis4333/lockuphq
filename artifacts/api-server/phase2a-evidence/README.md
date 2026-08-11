# Housing Log Phase 2A document-generation spike

This spike uses fake data only. It compares direct PDF overlay with a DOCX-first candidate against the densest first-shift B-unit form (`templateVersion=2026-04-27`, `sourceSheet=1_B`). It does not add routes, admin UI, archive behavior, ZIP packaging, recipients, scheduling, or email.

## Test fixture

- All three official B-unit pages are exercised.
- The fixture contains long synthetic officer/supervisor names, all eight accepted key-ring slots, all three radio/body-alarm/cuff/cuff-case slots, the remaining equipment inventory fields, four count blocks, 72 long fake events crossing midnight, initials, and two synthetic handwritten PNG signatures.
- The workbook's three logical form blocks were exported separately as legal-size PDF pages. Exporting the three source ranges through Excel took approximately 2.68 seconds once; this is template preparation, not per-record generation.

## PDF overlay result

`housing-log-pdf-overlay.pdf` contains the original vector PDF content for all three official legal-size pages plus three legal-size continuation pages. The spike maps the representative B-unit fields to their printed blanks and uses the source PDF itself as the background, so static form text, lines, and print geometry remain authoritative.

Single-line field values are tested at 8 pt down to a 5.5 pt minimum. A value that still cannot fit raises a typed overflow error identifying the field; it is never clipped or silently truncated. Event text uses a shared lossless wrapper and creates as many pages as necessary.

The median generation time across five warm in-process samples was **113.06 ms**. The exact samples and diagnostics are in `spike-measurements.json`.

## DOCX-first result

`housing-log-docx-first.docx` proves that the same record and lossless event paginator can produce a six-section legal-size Word package. It uses 150 dpi images of the three official pages behind fixed overlay tables, embeds both PNG signatures, and generates the same three continuation sections in entered event order.

The median DOCX package-generation time across five warm in-process samples was **196.79 ms**, before PDF conversion.

Canonical DOCX-to-PDF conversion is not available in the current runtime. LibreOffice/`soffice` is not installed. The installed Microsoft Word reports **Unlicensed Product / read and print only**; `ExportAsFixedFormat` and `SaveAs2` did not complete for either the spike document or a one-paragraph baseline document. Consequently, this environment could not produce a trustworthy canonical PDF or complete rendered visual QA for the DOCX candidate. This is itself an architectural result: DOCX-first would add a required Office/LibreOffice service and its font, process, timeout, and pagination variability to Replit.

## Comparison

| Concern | Direct PDF overlay | DOCX-first then PDF |
| --- | --- | --- |
| Official static-form fidelity | Preserves the original vector PDF exactly | Uses a rasterized official background in this proof |
| Long printed-blank values | Deterministic fit or explicit overflow error | Can reflow, but reflow can move content off fixed official blanks |
| Events | Lossless shared wrapping and unlimited continuation pages | Same lossless paginator; final pagination remains converter-dependent |
| Signatures | PNG embedded directly with exact source aspect ratio | PNG embedded with less than 1.2% aspect-ratio variance |
| Runtime | Node-only `pdf-lib`; no external process | Node `docx` plus an unavailable Office/LibreOffice conversion process |
| Median generation observed | 113.06 ms including final PDF | 196.79 ms before conversion |
| Twelve-template maintenance | One versioned coordinate map per source sheet | One versioned overlay layout plus raster assets and converter QA per source sheet |

## Continuation behavior

The official B-unit event areas are filled first (five lines on page 2 and 42 lines on page 3). Overflow creates legal-size continuation pages headed with the housing unit, shift, date, and the columns `TIME | LOG OF EVENTS / ACTIVITY | INITIALS`. Events are consumed in stored order rather than sorted by clock time, so 23:xx-to-00:xx entries remain chronologically correct. Wrapped events can span page boundaries and are marked `(continued)` on the next page. Tests reconstruct a multi-page event and verify that no character is lost.

## Template resolution and versioning

`HousingLogTemplateRegistry` resolves assets with the exact compound key `templateVersion::sourceSheet`. The test registers a synthetic `2099-synthetic::1_B` version alongside `2026-04-27::1_B`, then proves that an older finalized record still resolves to the 2026-04-27 asset.

## Replit/runtime decision

Direct PDF overlay needs only Node and committed versioned template assets, which matches the existing Replit deployment model. DOCX-first would require installing and maintaining LibreOffice (or introducing an external document-conversion service), ensuring compatible fonts, and supervising a comparatively slow child process. Those requirements are disproportionate for this prototype.

The recommended production direction is **direct PDF overlay**, backed by the versioned template registry and the shared continuation paginator. Expanding to all 12 source sheets should add sheet-specific coordinate maps and visual fixtures without changing Phase 1 storage or validation. No DOCX or Search Log/DC6-229 utility was rewritten.

## Later admin access decision

No admin authentication was needed or added in Phase 2A. The later admin routes should use one prototype-only password from a Replit/environment secret, server-side verification, and a random or signed session token in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie. Every `/api/admin/housing-logs/*` route must enforce the session server-side. This remains deliberately smaller than an officer-account or role-management system.

## Evidence and verification

- `housing-log-pdf-overlay.pdf`: render-checked on all six pages.
- `housing-log-docx-first.docx`: structurally verified as six legal-size sections with three official backgrounds and two signature images; canonical conversion is unavailable for the reasons above.
- `spike-measurements.json`: five timing samples and page/event/signature diagnostics for both candidates.
- Automated tests cover version-plus-sheet resolution, official and continuation page counts, event order, multi-page lossless text, explicit long-field overflow, and signature aspect ratios.
