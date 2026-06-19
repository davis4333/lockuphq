import { extractDcNumber } from "./dcNumberExtractor";
import type { GroupedEntry, ParsedBedBook, RawBedRow } from "./types";

/**
 * Group roster rows by unique BED-ID / cell assignment.
 * Two inmates assigned to the same BED-ID collapse into a single entry whose
 * `inmates` array holds both. Order of first appearance is preserved.
 */
export function groupByBedId(parsed: ParsedBedBook): GroupedEntry[] {
  const order: string[] = [];
  const byKey = new Map<string, GroupedEntry>();

  for (const row of parsed.rows) {
    const bedId = (row.bedId ?? "").trim();
    const key = bedId || `__missing__${row.sourceRow}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { bedId, inmates: [] };
      byKey.set(key, entry);
      order.push(key);
    }
    entry.inmates.push(buildInmate(row));
  }

  return order.map((k) => byKey.get(k)!);
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

/** Format the multi-line "Inmate Name/FDC Number" cell value for one entry. */
export function formatInmateCell(entry: GroupedEntry): string {
  return entry.inmates
    .map((i) => {
      const parts = [i.name, i.dc].filter((p) => p && p.length > 0);
      return parts.join(" ");
    })
    .filter((line) => line.length > 0)
    .join("\n");
}
