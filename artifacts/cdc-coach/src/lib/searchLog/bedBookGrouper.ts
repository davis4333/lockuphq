import { extractDcNumber } from "./dcNumberExtractor";
import type { BunkHandling, GroupedEntry, ParsedBedBook, RawBedRow } from "./types";

/**
 * Normalize an Area/Bunk value to a physical-cell key by dropping a single
 * trailing bunk letter (L = lower, U = upper): "B1-106L" and "B1-106U" both map
 * to "B1-106". Used to merge bunks in grouped mode and to share one search time
 * per cell. The original Area/Bunk value is always kept for display/export.
 */
export function normalizeCellKey(value: string): string {
  return (value ?? "").trim().replace(/[LU]$/i, "");
}

/**
 * Group roster rows into review entries according to the chosen bunk handling.
 *
 * - `byBunk`  — one entry per EXACT BED-ID, so "B1-106L" and "B1-106U" stay
 *   separate rows (two inmates sharing the same exact BED-ID still collapse).
 * - `byCell`  — one entry per physical cell: trailing L/U is stripped so
 *   "B1-106L" and "B1-106U" merge into a single "B1-106" entry whose `inmates`
 *   array holds both bunks. First-appearance order is preserved either way.
 */
export function groupBedBook(parsed: ParsedBedBook, handling: BunkHandling): GroupedEntry[] {
  const order: string[] = [];
  const byKey = new Map<string, GroupedEntry>();

  for (const row of parsed.rows) {
    const bedId = (row.bedId ?? "").trim();
    const display = handling === "byCell" ? normalizeCellKey(bedId) : bedId;
    const key = display || `__missing__${row.sourceRow}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { bedId: display, inmates: [] };
      byKey.set(key, entry);
      order.push(key);
    }
    entry.inmates.push(buildInmate(row));
  }

  return order.map((k) => byKey.get(k)!);
}

/** Back-compat alias: group by exact BED-ID (separate lower/upper bunks). */
export function groupByBedId(parsed: ParsedBedBook): GroupedEntry[] {
  return groupBedBook(parsed, "byBunk");
}

function buildInmate(row: RawBedRow) {
  const { dc, valid } = extractDcNumber(row.docnum);
  return {
    name: (row.inmateName ?? "").trim(),
    dc,
    dcValid: valid,
    rawDocnum: (row.docnum ?? "").trim(),
  };
}

/**
 * Format the "Inmate Name/FDC Number" cell value for one entry.
 * `sep` is " / " for grouped-cell rows (one line) or "\n" for separate bunks.
 */
export function formatInmateCell(entry: GroupedEntry, sep: string = "\n"): string {
  return entry.inmates
    .map((i) => {
      const parts = [i.name, i.dc].filter((p) => p && p.length > 0);
      return parts.join(" ");
    })
    .filter((line) => line.length > 0)
    .join(sep);
}
