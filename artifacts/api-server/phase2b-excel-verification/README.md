# Phase 2B Excel verification evidence

This directory contains fake-data-only representative outputs for all 12 official Housing Log worksheets. Each workbook is generated from the untouched, versioned `2026-04-27` source workbook (SHA-256 `1a550216dfd8320b01e0fdbe6cc0e42e87d58268f8029909c733ad1d75470c3d`) with 72 deliberately long, cross-midnight events.

Verification performed:

- `verification-manifest.json` records field coverage, event capacity, continuation-sheet counts, signature counts, semantic fingerprints, and repeated-generation byte hashes.
- `excel-desktop-verification.json` records normal read-only opening of all 12 outputs through Microsoft Excel desktop without its repair/corrupt-load mode, plus print-area, legal-paper, orientation, shape, and editable-cell checks.
- `artifact-tool-verification.json` records independent XLSX import, formula-error inspection, drawing inspection, and page-range rendering.
- `openxml-sdk-verification.json` records strict Open XML SDK validation of every output package.
- `rendered-sheets/` contains a full print-area preview for each populated official worksheet for human visual review.

Repeated generation was originally nondeterministic because JSZip created implicit folder entries with current timestamps. The generator now writes all ZIP entries with a fixed date and disables implicit folder creation, making identical inputs byte-for-byte reproducible. Semantic fingerprints remain as an additional content check.

Official-source details intentionally preserved:

- Worksheet `3_B` repeats “completed in AC wing” after the DC-wing start row. The generator preserves that wording pending administrative confirmation.
- Worksheet `3_B` has an official print area ending in column E; it is not normalized to the other sheets.
- Worksheet `3_INF` contains legacy controls/VML and an existing drawing relationship. These parts remain intact while signatures are added to the existing drawing.
- Worksheet `2_AH` contains residual historical entries in the source file. Generation explicitly replaces mapped variable cells and clears time, initials, and signature-cell values so a new output cannot inherit those entries; fixed official wording and formatting remain unchanged.

No admin dashboard, archive, ZIP packaging, email, or scheduling work is included in this phase.
