# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/cdc-coach/` — Confinement Desk Coach web app (React + Vite, dark FDOC blue-HUD theme). Routes wired in `src/App.tsx`; module cards in `src/pages/Dashboard.tsx` (`MODULES`).
- `artifacts/cdc-coach/src/components/PageShell.tsx` — shared themed shell + HUD style tokens (`hudPanel`, `hudInput`, `hudLabel`). Optional `maxWidthClass` prop widens the content column (default `max-w-3xl`).
- `artifacts/cdc-coach/src/lib/searchLog/` — Search Log Autofill logic: Bed Book parsing, grouping (`bedBookGrouper.ts` owns `normalizeCellKey` + `groupBedBook`), row building / manual rows / validation (`searchLogRowBuilder.ts`), shared Times-New-Roman text-fit metrics + per-column widths (`searchLogTextFit.ts`: `SEARCH_LOG_COL_TWIPS`, `ONE_LINE_CANDIDATES`, `searchLogCellFitsAtMin`), and the original-DOCX form filler (`searchLogDocxFiller.ts`).
- `artifacts/cdc-coach/src/lib/dc6229/` — DC6-229 Daily Record Autofill logic: `types.ts`, `cellNumber.ts` (strips the form's pre-printed "B" dorm letter, keeps L/U), `weekDates.ts` (TZ-safe Sunday-week date math), `bedBookMapper.ts` (reuses the Search Log Bed Book grid/delimiter detection + captures column H status), `validation.ts`, and `dc6229DocxFiller.ts` (clones the real 2-page form once per inmate).
- `artifacts/cdc-coach/src/pages/DC6229DailyRecord.tsx` — the DC6-229 tool page (route `/dc6-229`, two entry modes mirroring Search Log).
- `artifacts/cdc-coach/public/*-template.docx` — the original government Word forms that get filled (never recreated).

## Architecture decisions

- Search Log timing is per *physical cell*, not per row: `normalizeTimingCellKey` strips a trailing `L`/`U` so a cell's upper & lower bunks share one search time. `resequenceTimes` advances +1 min per unique *included* cell and leaves excluded rows untouched.
- The officer column is a multi-staff list (`SetupFields.staff: StaffMember[]`) combined as `"RANK NAME, RANK NAME"` via `combineStaff`. "Apply Officer" rewrites *included* rows only.
- Bed Book delimiter detection is internal and header-aware (no UI control): a leading `SEP=` wins, otherwise comma/pipe/tab/semicolon are scored by which best reveals the BED-ID/DOCNUM/INMATE-NAME header row (tie-break by column count).
- `PageShell` honors its `maxWidthClass` prop; the Search Log review uses `max-w-7xl` with a `table-fixed` + `colgroup` layout (sticky `thead`, vertical scroll) so the table never causes horizontal page scroll.
- Search Log has two **entry methods** (`EntryMethod`: `bedbook` | `manual`) and, for Bed Book, two **bunk-handling** modes (`BunkHandling`: `byCell` | `byBunk`). The page stores `parsed` + `bedBookRows` + `manualRows` separately and derives the active set, so switching entry method *hides* (never destroys) the other set and switching bunk handling re-groups losslessly from the retained `parsed`. `ReviewRow.source` drives source-aware validation; every row (both sources) is additionally checked for one-line overflow per column (see below). Manual rows otherwise only warn on blank fields (area may be a free location, inmate text is never rewritten); Bed Book rows also require BED-ID/DC numbers.
- **Global one-line fitting (all columns).** The filler keeps EVERY filled data cell on one physical line by shrinking **only** that cell's own inserted-run font down a single ladder (`ONE_LINE_CANDIDATES`, 10pt → 6pt floor); it reads each cell's real `w:tcW` (fallback `SEARCH_LOG_COL_TWIPS[idx]`). If a value still won't fit at 6pt it is **not** truncated — instead `searchLogCellFitsAtMin` raises a non-blocking per-field review warning ("This <Field> field may be too long to fit on one line at 6 pt. Review before generating") so the user shortens it. The UI and filler share the exact same width math in `searchLogTextFit.ts` (nbsp==space and the non-breaking hyphen==hyphen in the metrics, so raw-text and substituted-text measurements match). `ReviewRow.inmateFit` is now **vestigial** (a no-op kept only so callers compile) — grouping still controls whether the review table joins inmates with `" / "` vs newlines, but every column is one-lined and font-fit regardless.

## Product

Confinement Desk Coach (cdc-coach) is a training/desk-aid command center for confinement officers. Modules include Lock-Up Slip, Strip/Property Restriction, and **Search Log Autofill** — either upload a Bed Book roster (CSV with optional `SEP=|`, or XLSX/XLS) or build entries by hand (Manual Entry), then review/edit the rows and generate a completed Search Log by filling the original government Word form (continuation pages added automatically per 19 entries). For Bed Book uploads, bunks can be grouped by physical cell (both inmates in one shrunk-to-fit box) or listed separately. A second autofill module, **DC6-229 Daily Record Autofill**, also takes a Bed Book upload or Manual Entry and generates ONE downloadable DOCX packet containing a complete 2-page DC6-229 (Daily Record of Special Housing) per inmate — page 1 filled (Inmate Name, FDC#, Cell# after the form's printed "B", Status) plus the 7 Sun–Sat dates of a chosen Sunday week-start dropped into the daily grid, page 2 left untouched, each form on a new page. All roster and manually entered data is processed in-browser only — never saved, stored, or transmitted.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Two different "cell" counts exist and must stay labeled distinctly: **Entries** = review rows (grouping depends on bunk handling) vs **Unique cells** = physical cells after L/U merge (`normalizeCellKey`). They differ (e.g. 6 bunks → 3 cells); never label both "cells" or the UI looks self-contradictory.
- Never recreate or modify the DOCX filler (`searchLogDocxFiller.ts`), the `public/*-template.docx` government forms, the continuation-page logic, the footer mirroring, or the section/bookmark logic — only the data boxes get filled, and the **only** per-cell change allowed is the inserted run's font size (never column widths, row heights, or page size). Every cell is now globally one-lined and font-fit (10pt → 6pt floor); `ReviewRow.inmateFit` is vestigial — do **not** reintroduce an `inmateFit === false` multiline branch.
- The DC6-229 filler (`dc6229DocxFiller.ts`) is similarly sacrosanct: it clones the real template's first section per inmate by an absolute-index FORMTEXT fill (F1 name, F10 FDC#, F19 cell, F21 status; F18 is the PRINTED "B" anchor and must never be written) and injects the 7 dates into the 2nd top-level table's alternating `vMerge=restart` cells. For each target date box it **replaces** the cell's single empty paragraph with one fully-controlled centered, single-spaced paragraph (preserving `tcPr`: width/borders/`vMerge`/`vAlign`) — it does NOT append a run to the template's paragraph, because the template's date boxes are inconsistently styled (the first data box is `Heading3`/left, the other 13 are plain/centered) and appending let Word word-wrap differently per cell. The "Day + Date" date format is carried as `"Sun\n06/14/26"` (newline) and `buildResultRuns` turns the `\n` into a hard `<w:br/>` so the day always stacks directly over the date. It validates the field count (39), the "B" anchor position, the date-box count (14), 7 dates per form, and that each target box actually has a paragraph to replace, failing loudly on any drift. Do not recreate the DC6-229 form, change which fields are filled, or fill the remarks fields (F25–F38). The DC6-229 Bed Book parser intentionally **requires** a header row (BED-ID/DOCNUM/INMATE-NAME) just like Search Log — do not add a blind headerless positional fallback (it would silently misread arbitrary spreadsheets).
- `normalizeCellKey` lives in `bedBookGrouper.ts` (not the row builder) to avoid a circular import; `normalizeTimingCellKey` is a back-compat alias re-exported from `searchLogRowBuilder.ts`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
