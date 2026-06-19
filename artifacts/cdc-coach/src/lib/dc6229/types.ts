// Types for the DC6-229 Daily Record of Special Housing fill tool.
// All data is session-only — never persisted, stored, or transmitted.

/** How the 7 Sun–Sat dates are rendered in the daily grid. */
export type Dc6229DateFormat = "mmddyy" | "dayPrefixed";

/** Which entry workflow is active (mirrors the Search Log tool). */
export type Dc6229EntryMethod = "bedbook" | "manual";

/** Where a review row originated (drives source-aware validation). */
export type Dc6229RowSource = "bedbook" | "manual";

/** One inmate => one complete 2-page DC6-229 form in the output packet. */
export interface Dc6229Record {
  id: string;
  include: boolean;
  source: Dc6229RowSource;
  /** Original Bed Book cell (column A), e.g. "B1-106L". Blank for manual rows. */
  rawCell: string;
  /** Column A with the leading printed "B" dorm letter removed; L/U kept. */
  cellNumber: string;
  /** Column C — inmate name (free text, never rewritten). */
  inmateName: string;
  /** Original Bed Book DOCNUM (column B). Blank for manual rows. */
  rawDocnum: string;
  /** Extracted / entered FDC number. */
  fdc: string;
  /** Whether the FDC number matches a valid pattern (letter+5 or 6 digits). */
  fdcValid: boolean;
  /** Column H — housing status (free text). */
  status: string;
}

export interface Dc6229Setup {
  /** yyyy-mm-dd — must be a Sunday (the week start). */
  weekStart: string;
  dateFormat: Dc6229DateFormat;
  /** Optional filename prefix for the downloaded packet. */
  filePrefix: string;
}

export interface Dc6229Flag {
  field: string;
  message: string;
  blocking: boolean;
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
