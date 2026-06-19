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
- `artifacts/cdc-coach/src/lib/searchLog/` — Search Log Autofill logic: Bed Book parsing, grouping (`bedBookGrouper.ts` owns `normalizeCellKey` + `groupBedBook`), row building / manual rows / validation (`searchLogRowBuilder.ts`), shared Times-New-Roman text-fit metrics (`searchLogTextFit.ts`), and the original-DOCX form filler (`searchLogDocxFiller.ts`).
- `artifacts/cdc-coach/public/*-template.docx` — the original government Word forms that get filled (never recreated).

## Architecture decisions

- Search Log timing is per *physical cell*, not per row: `normalizeTimingCellKey` strips a trailing `L`/`U` so a cell's upper & lower bunks share one search time. `resequenceTimes` advances +1 min per unique *included* cell and leaves excluded rows untouched.
- The officer column is a multi-staff list (`SetupFields.staff: StaffMember[]`) combined as `"RANK NAME, RANK NAME"` via `combineStaff`. "Apply Officer" rewrites *included* rows only.
- Bed Book delimiter detection is internal and header-aware (no UI control): a leading `SEP=` wins, otherwise comma/pipe/tab/semicolon are scored by which best reveals the BED-ID/DOCNUM/INMATE-NAME header row (tie-break by column count).
- `PageShell` honors its `maxWidthClass` prop; the Search Log review uses `max-w-7xl` with a `table-fixed` + `colgroup` layout (sticky `thead`, vertical scroll) so the table never causes horizontal page scroll.
- Search Log has two **entry methods** (`EntryMethod`: `bedbook` | `manual`) and, for Bed Book, two **bunk-handling** modes (`BunkHandling`: `byCell` | `byBunk`). The page stores `parsed` + `bedBookRows` + `manualRows` separately and derives the active set, so switching entry method *hides* (never destroys) the other set and switching bunk handling re-groups losslessly from the retained `parsed`. `ReviewRow.source` drives source-aware validation; manual rows only warn on blank fields (area may be a free location, inmate text is never rewritten).
- Grouped-cell (`byCell`) rows join both bunks' inmates onto ONE line (`" / "`) and set `ReviewRow.inmateFit = true`; the filler then shrinks **only** that inmate cell (column 4) via `INMATE_COL_CANDIDATES` to keep it single-line. This `inmateFit` path is strictly opt-in — when `inmateFit` is false the inmate column keeps its original multiline `RUN_PR` behavior, so separate/manual DOCX output is unchanged (no regression).

## Product

Confinement Desk Coach (cdc-coach) is a training/desk-aid command center for confinement officers. Modules include Lock-Up Slip, Strip/Property Restriction, and **Search Log Autofill** — either upload a Bed Book roster (CSV with optional `SEP=|`, or XLSX/XLS) or build entries by hand (Manual Entry), then review/edit the rows and generate a completed Search Log by filling the original government Word form (continuation pages added automatically per 19 entries). For Bed Book uploads, bunks can be grouped by physical cell (both inmates in one shrunk-to-fit box) or listed separately. All roster and manually entered data is processed in-browser only — never saved, stored, or transmitted.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Two different "cell" counts exist and must stay labeled distinctly: **Entries** = review rows (grouping depends on bunk handling) vs **Unique cells** = physical cells after L/U merge (`normalizeCellKey`). They differ (e.g. 6 bunks → 3 cells); never label both "cells" or the UI looks self-contradictory.
- Never recreate or modify the DOCX filler (`searchLogDocxFiller.ts`), the `public/*-template.docx` government forms, or the continuation-page logic — only the data boxes get filled. The `inmateFit` grouped-cell path must stay opt-in: do not change the `inmateFit === false` branch or separate/manual output will regress.
- `normalizeCellKey` lives in `bedBookGrouper.ts` (not the row builder) to avoid a circular import; `normalizeTimingCellKey` is a back-compat alias re-exported from `searchLogRowBuilder.ts`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
