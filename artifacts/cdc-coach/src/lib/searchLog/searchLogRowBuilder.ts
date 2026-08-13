import { formatInmateCell, normalizeCellKey } from "./bedBookGrouper";
import { isValidDcNumber } from "./dcNumberExtractor";
import { searchLogCellFitsAtMin } from "./searchLogTextFit";
import type {
  BunkHandling,
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

/**
 * Add `minutes` to an HH:mm (24h) time-input value and return HH:mm. Used to
 * auto-increment the manual-entry Time field by one minute after each search.
 * A blank or unparseable value is returned unchanged.
 */
export function addMinutesToTimeInput(timeInput: string, minutes: number): string {
  const m = timeInput.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return timeInput;
  let total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + minutes;
  total = ((total % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
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
 * Back-compat alias for `normalizeCellKey` (the page imports the timing-specific
 * name). Both strip a trailing L/U so a cell's two bunks share one search time.
 */
export const normalizeTimingCellKey = normalizeCellKey;

let rowSeq = 0;
function nextRowId(): string {
  rowSeq += 1;
  return `slrow-${rowSeq}`;
}

/**
 * Build Bed Book review rows from grouped entries, the current setup fields, and
 * the chosen bunk handling. Grouped-cell rows join both bunks' inmates with " / ";
 * separate-bunk rows keep one inmate per line. Either way the filler later
 * collapses the value to one line and font-fits the cell, so this only controls
 * how the inmate text is presented in the review table.
 */
export function buildReviewRows(
  groups: GroupedEntry[],
  setup: SetupFields,
  handling: BunkHandling,
): ReviewRow[] {
  const date = formatDateMMDDYY(setup.dateOfSearch);
  const officer = combineStaff(setup.staff);
  const tablets = tabletValuesForMode(setup.tabletMode, groups.length);
  const grouped = handling === "byCell";
  const rows: ReviewRow[] = groups.map((entry, idx) => ({
    id: nextRowId(),
    include: true,
    source: "bedbook",
    bedId: entry.bedId,
    date,
    time: "",
    area: entry.bedId,
    type: setup.searchType,
    inmate: formatInmateCell(entry, grouped ? " / " : "\n"),
    officer,
    discrepancies: setup.discrepancies,
    tablet: tablets[idx],
    inmateFit: grouped,
  }));
  // Times are assigned per unique cell (upper/lower bunks share one time).
  return resequenceTimes(rows, setup.startTime);
}

/** Values for one finished manual search entry (from the Manual Entry form). */
export interface ManualRowInput {
  date: string; // yyyy-mm-dd (input value)
  time: string; // HH:mm (24h input value)
  area: string;
  type: string;
  inmate: string;
  officer: string; // already combined "[RANK] [NAME]"
  discrepancies: string;
  tablet: string;
}

/**
 * Build one completed manual review row from the Manual Entry form. The date is
 * formatted MM/DD/YY and the time HH:mm → "h:mm A/P" to match Bed Book rows;
 * the user's inmate / officer / discrepancy text is preserved verbatim (trimmed).
 */
export function buildManualRow(input: ManualRowInput): ReviewRow {
  return {
    id: nextRowId(),
    include: true,
    source: "manual",
    bedId: "",
    date: formatDateMMDDYY(input.date),
    time: formatTimeWithOffset(input.time, 0),
    area: input.area.trim(),
    type: input.type,
    inmate: input.inmate.trim(),
    officer: input.officer.trim(),
    discrepancies: input.discrepancies.trim(),
    tablet: input.tablet,
    inmateFit: false,
  };
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
    const key = normalizeCellKey(row.area || row.bedId);
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

/** ReviewRow string fields that map 1:1 to the DOCX data columns. */
type FitField = "date" | "time" | "area" | "type" | "inmate" | "officer" | "discrepancies" | "tablet";

// Column index (matches SEARCH_LOG_COL_TWIPS), ReviewRow field, and the label
// shown in the one-line overflow warning.
const FIT_FIELDS: Array<[number, FitField, string]> = [
  [0, "date", "Date"],
  [1, "time", "Time"],
  [2, "area", "Area/Bunk"],
  [3, "type", "Type of Search"],
  [4, "inmate", "Inmate"],
  [5, "officer", "Officer"],
  [6, "discrepancies", "Discrepancies"],
  [7, "tablet", "Tablet"],
];

/**
 * Warn (never truncate) when any non-blank field is estimated too long to fit on
 * one line even at the 6pt floor for its column. Applies to every row regardless
 * of source — the filler shrinks the cell's font; the user shortens the value.
 */
function oneLineOverflowFlags(row: ReviewRow): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  for (const [colIndex, field, label] of FIT_FIELDS) {
    const value = row[field];
    if (!value.trim()) continue;
    if (!searchLogCellFitsAtMin(colIndex, value)) {
      flags.push({
        field,
        message: `This ${label} field may be too long to fit on one line at 6 pt. Review before generating`,
      });
    }
  }
  return flags;
}

/**
 * Validate one review row. Returns a list of warnings (empty = OK). Every row is
 * checked for one-line overflow on each filled column (see oneLineOverflowFlags).
 * Bed Book rows additionally require a BED-ID and valid DC numbers; manual rows
 * only warn on blank required fields (area may be a free location like "Dayroom"
 * and the user's inmate text is never rewritten).
 */
export function validateRow(row: ReviewRow): ValidationFlag[] {
  const flags: ValidationFlag[] = [];
  if (!row.area.trim()) flags.push({ field: "area", message: "Missing Area/Bunk" });
  if (!row.date.trim()) flags.push({ field: "date", message: "Missing date" });
  if (!row.time.trim()) flags.push({ field: "time", message: "Missing time" });
  if (!row.type.trim()) flags.push({ field: "type", message: "Missing type of search" });
  if (!row.officer.trim()) flags.push({ field: "officer", message: "Missing officer" });
  if (!row.tablet.trim()) flags.push({ field: "tablet", message: "Missing tablet value" });

  // One-line fit warnings apply to every column and both row sources.
  flags.push(...oneLineOverflowFlags(row));

  // Inmate segments: grouped rows separate inmates with " / "; separate-bunk and
  // manual rows may use newlines. Either way, validate each segment.
  const inmateLines = row.inmate.split(/[\n/]/).map((l) => l.trim()).filter(Boolean);

  if (row.source === "manual") {
    if (inmateLines.length === 0) {
      flags.push({ field: "inmate", message: "Missing inmate name / FDC number" });
    }
    return flags;
  }

  // Bed Book row.
  if (!row.bedId.trim()) flags.push({ field: "bedId", message: "Missing BED-ID" });
  if (inmateLines.length === 0) {
    flags.push({ field: "inmate", message: "Missing inmate name" });
  } else {
    for (const line of inmateLines) {
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
  return flags;
}

/**
 * Set `include` on every row (the master Select All / Deselect All control).
 * Applies to the full roster passed in, regardless of any search-box filter
 * the caller may be displaying — the master control always acts on every row.
 */
export function setIncludeAll(rows: ReviewRow[], include: boolean): ReviewRow[] {
  return rows.map((row) => ({ ...row, include }));
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
