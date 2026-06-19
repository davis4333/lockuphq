import { formatInmateCell } from "./bedBookGrouper";
import { isValidDcNumber } from "./dcNumberExtractor";
import type {
  GroupedEntry,
  ReviewRow,
  SetupFields,
  TabletValue,
  ValidationFlag,
} from "./types";

/** Pick a random "Y"/"N" — the tablet column just needs a value, mixed across rows. */
export function randomTablet(): TabletValue {
  return Math.random() < 0.5 ? "Y" : "N";
}

/**
 * Random "Y"/"N" for `count` rows. With more than one row this guarantees a
 * mix (at least one of each) so the document is never all-Y or all-N.
 */
export function randomTabletValues(count: number): TabletValue[] {
  const values: TabletValue[] = Array.from({ length: count }, () => randomTablet());
  if (count > 1 && values.every((v) => v === values[0])) {
    const flipAt = Math.floor(Math.random() * count);
    values[flipAt] = values[0] === "Y" ? "N" : "Y";
  }
  return values;
}

/** Format a yyyy-mm-dd date-input value as MM/DD/YY. */
export function formatDateMMDDYY(dateInput: string): string {
  if (!dateInput) return "";
  const m = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateInput;
  const [, yyyy, mm, dd] = m;
  return `${mm}/${dd}/${yyyy.slice(2)}`;
}

/** Format a yyyy-mm-dd date-input value as MM-DD-YY (for filenames). */
export function formatDateMMDDYYDashed(dateInput: string): string {
  return formatDateMMDDYY(dateInput).replace(/\//g, "-");
}

/**
 * Format a HH:mm (24h) value plus an offset in minutes as "h:mm A" / "h:mm P".
 * Example: ("16:45", 0) -> "4:45 P", ("16:45", 1) -> "4:46 P".
 */
export function formatTimeWithOffset(startTime: string, offsetMinutes: number): string {
  if (!startTime) return "";
  const m = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + offsetMinutes;
  total = ((total % 1440) + 1440) % 1440;
  let hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const suffix = hour24 >= 12 ? "P" : "A";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function buildOfficer(rank: string, name: string): string {
  const r = (rank ?? "").trim();
  const n = (name ?? "").trim();
  if (!r && !n) return "";
  return [r, n].filter(Boolean).join(" ");
}

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `slrow-${rowSeq}`;
}

/** Build review rows from grouped entries and the current setup fields. */
export function buildReviewRows(
  groups: GroupedEntry[],
  setup: SetupFields,
): ReviewRow[] {
  const date = formatDateMMDDYY(setup.dateOfSearch);
  const officer = buildOfficer(setup.staffRank, setup.staffName);
  const tablets = randomTabletValues(groups.length);
  return groups.map((entry, idx) => ({
    id: nextRowId(),
    include: true,
    bedId: entry.bedId,
    date,
    time: formatTimeWithOffset(setup.startTime, idx),
    area: entry.bedId,
    type: setup.searchType,
    inmate: formatInmateCell(entry),
    officer,
    discrepancies: setup.discrepancies,
    tablet: tablets[idx],
  }));
}

/** Re-sequence times for the included rows in display order, leaving excluded rows untouched. */
export function resequenceTimes(rows: ReviewRow[], startTime: string): ReviewRow[] {
  let offset = 0;
  return rows.map((row) => {
    if (!row.include) return row;
    const time = formatTimeWithOffset(startTime, offset);
    offset += 1;
    return { ...row, time };
  });
}

const DC_LINE = /\b([A-Za-z]\d{5}|\d{6})\b/;

/** Validate one review row. Returns a list of warnings (empty = OK). */
export function validateRow(row: ReviewRow): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  if (!row.area.trim()) flags.push({ field: "area", message: "Missing Area/Bunk" });
  if (!row.bedId.trim()) flags.push({ field: "bedId", message: "Missing BED-ID" });

  const lines = row.inmate.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    flags.push({ field: "inmate", message: "Missing inmate name" });
  } else {
    for (const line of lines) {
      const dcMatch = line.match(DC_LINE);
      const namePart = dcMatch ? line.slice(0, dcMatch.index).trim() : line.trim();
      if (!namePart) flags.push({ field: "inmate", message: "Missing inmate name" });
      if (!dcMatch) {
        flags.push({ field: "inmate", message: "Missing or invalid DC number" });
      } else if (!isValidDcNumber(dcMatch[1])) {
        flags.push({ field: "inmate", message: "Invalid DC number pattern" });
      }
    }
  }

  if (!row.date.trim()) flags.push({ field: "date", message: "Missing date" });
  if (!row.time.trim()) flags.push({ field: "time", message: "Missing time" });
  if (!row.type.trim()) flags.push({ field: "type", message: "Missing type of search" });
  if (!row.officer.trim()) flags.push({ field: "officer", message: "Missing officer" });
  if (!row.tablet.trim()) flags.push({ field: "tablet", message: "Missing tablet value" });
  return flags;
}

/** Flag BED-IDs that appear on more than one row (duplicate grouping warning). */
export function findDuplicateBedIds(rows: ReviewRow[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.bedId.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dups = new Set<string>();
  for (const [key, count] of counts) if (count > 1) dups.add(key);
  return dups;
}
