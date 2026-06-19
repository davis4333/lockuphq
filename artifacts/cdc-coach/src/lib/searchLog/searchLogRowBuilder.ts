import { formatInmateCell } from "./bedBookGrouper";
import { isValidDcNumber } from "./dcNumberExtractor";
import type {
  GroupedEntry,
  ReviewRow,
  SetupFields,
  StaffMember,
  TabletMode,
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

/**
 * Tablet values for `count` rows per the chosen mode: all "Y", all "N", or a
 * guaranteed mix when "Random".
 */
export function tabletValuesForMode(mode: TabletMode, count: number): TabletValue[] {
  if (mode === "Random") return randomTabletValues(count);
  return Array.from({ length: count }, () => mode);
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

/** Format one staff member as "RANK NAME" (e.g. "C/O Davis"); "" if no name. */
export function formatStaffMember(member: StaffMember): string {
  const r = (member.rank ?? "").trim();
  const n = (member.name ?? "").trim();
  if (!n) return "";
  return [r, n].filter(Boolean).join(" ");
}

/** Combine staff members into the officer column: "C/O Davis, Sgt. Rivera". */
export function combineStaff(staff: StaffMember[]): string {
  return staff.map(formatStaffMember).filter(Boolean).join(", ");
}

let staffSeq = 0;
/** Create a blank staff member with a stable id and a default rank. */
export function createStaffMember(): StaffMember {
  staffSeq += 1;
  return { id: `staff-${staffSeq}`, name: "", rank: "C/O" };
}

/**
 * Validate the staff list for the officer column. Flags staff rows that have a
 * rank but no name, and reports when no usable officer string exists at all.
 */
export function validateStaff(staff: StaffMember[]): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  staff.forEach((member, idx) => {
    const name = (member.name ?? "").trim();
    const rank = (member.rank ?? "").trim();
    if (!name && !rank) return; // empty row — ignored
    if (!name) {
      flags.push({ field: `staff-${idx}`, message: `Staff #${idx + 1} is missing a name` });
    } else if (!rank) {
      flags.push({ field: `staff-${idx}`, message: `Staff #${idx + 1} is missing a rank` });
    }
  });
  if (combineStaff(staff).trim() === "") {
    flags.push({ field: "staff", message: "At least one staff member name is required" });
  }
  return flags;
}

/**
 * Normalize an Area/Bunk value to a timing cell key by dropping a single
 * trailing bunk letter (L = lower, U = upper). "B1-106L" and "B1-106U" both map
 * to "B1-106" so the two bunks in a cell share one search time. The original
 * Area/Bunk value is always kept for display/export — this key is internal only.
 */
export function normalizeTimingCellKey(value: string): string {
  return (value ?? "").trim().replace(/[LU]$/i, "");
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
  const officer = combineStaff(setup.staff);
  const tablets = tabletValuesForMode(setup.tabletMode, groups.length);
  const rows: ReviewRow[] = groups.map((entry, idx) => ({
    id: nextRowId(),
    include: true,
    bedId: entry.bedId,
    date,
    time: "",
    area: entry.bedId,
    type: setup.searchType,
    inmate: formatInmateCell(entry),
    officer,
    discrepancies: setup.discrepancies,
    tablet: tablets[idx],
  }));
  // Times are assigned per unique cell (upper/lower bunks share one time).
  return resequenceTimes(rows, setup.startTime);
}

/**
 * Re-sequence times for the included rows in display order, leaving excluded
 * rows untouched. Time advances by one minute per unique cell — both bunks in a
 * cell (e.g. "B1-106L" and "B1-106U") receive the same time, since their Area
 * normalizes to the same timing key.
 */
export function resequenceTimes(rows: ReviewRow[], startTime: string): ReviewRow[] {
  const timeByCell = new Map<string, string>();
  let offset = 0;
  return rows.map((row) => {
    if (!row.include) return row;
    const key = normalizeTimingCellKey(row.area || row.bedId);
    let time = timeByCell.get(key);
    if (time === undefined) {
      time = formatTimeWithOffset(startTime, offset);
      timeByCell.set(key, time);
      offset += 1;
    }
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
