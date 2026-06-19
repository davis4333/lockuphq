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
- `artifacts/cdc-coach/src/lib/searchLog/` — Search Log Autofill logic: Bed Book parsing/grouping, row building, and the original-DOCX form filler (`searchLogDocxFiller.ts`).
- `artifacts/cdc-coach/public/*-template.docx` — the original government Word forms that get filled (never recreated).

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Confinement Desk Coach (cdc-coach) is a training/desk-aid command center for confinement officers. Modules include Lock-Up Slip, Strip/Property Restriction, and **Search Log Autofill** — upload a Bed Book roster (CSV with optional `SEP=|`, or XLSX/XLS), review/edit the parsed entries, and generate a completed Search Log by filling the original government Word form (continuation pages added automatically per 19 entries). Uploaded roster data is processed in-browser only — never saved, stored, or transmitted.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
