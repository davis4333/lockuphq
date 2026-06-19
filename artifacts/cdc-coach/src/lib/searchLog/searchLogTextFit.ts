/**
 * Shared text-fitting helpers for the Search Log.
 *
 * Every filled data cell is kept on one physical line by shrinking ONLY that
 * cell's font (10pt down to a 6pt floor). The DOCX filler is authoritative (it
 * reads each cell's real `w:tcW`), but the review UI needs the SAME width math to
 * warn when a field is still too long to fit on one line at 6pt. Keeping the
 * metrics here keeps both estimates in lockstep without coupling the UI to the filler.
 */

// Times New Roman advance widths in font design units (1 em = 2048 units).
// Bias toward real metrics; unknown chars fall back to a wide default so we
// under- rather than over-fill.
export const TNR_EM_UNITS = 2048;
export const TNR_DEFAULT_UNITS = 1024;
export const TNR_WIDTHS: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const d of "0123456789") m[d] = 1024;
  const upper: Record<string, number> = {
    A: 1479, B: 1366, C: 1366, D: 1479, E: 1251, F: 1139, G: 1479, H: 1479,
    I: 682, J: 797, K: 1479, L: 1251, M: 1821, N: 1479, O: 1479, P: 1139,
    Q: 1479, R: 1366, S: 1139, T: 1251, U: 1479, V: 1479, W: 1933, X: 1479,
    Y: 1479, Z: 1251,
  };
  const lower: Record<string, number> = {
    a: 909, b: 1024, c: 909, d: 1024, e: 909, f: 682, g: 1024, h: 1024,
    i: 569, j: 569, k: 1024, l: 569, m: 1593, n: 1024, o: 1024, p: 1024,
    q: 1024, r: 682, s: 797, t: 569, u: 1024, v: 1024, w: 1479, x: 1024,
    y: 1024, z: 909,
  };
  Object.assign(m, upper, lower);
  m[" "] = 512;
  m["\u00A0"] = 512; // non-breaking space
  m["-"] = 682;
  m["\u2011"] = 682; // non-breaking hyphen
  m["/"] = 569;
  m[":"] = 569;
  m["."] = 512;
  m[","] = 512;
  return m;
})();

export const CELL_SIDE_MARGIN_TWIPS = 115; // Word default cell padding (~0.08in) per side
export const FIT_BUFFER_TWIPS = 10; // small cushion so a borderline value never overflows

// Data-row column widths (twips) of the original DC6-2001 Search Log table,
// verified from the template's <w:tcW>, in column order:
// [Date, Time, Area/Bunk, Type, Inmate, Officer, Discrepancies, Tablet].
// The filler reads each cell's real width at fill time; these serve as the
// fallback and as the source of truth for the review UI's per-field overflow
// warning so both use identical width math.
export const SEARCH_LOG_COL_TWIPS = [990, 900, 1260, 1080, 4140, 2880, 2520, 907];

// Index of the Inmate Name/FDC Number column (its value is joined with " / ").
export const SEARCH_LOG_INMATE_COL = 4;

// Single font-size ladder (half-points) used for EVERY filled data cell: start at
// the form's normal 10pt and step down (0.5pt at a time) only as far as needed to
// keep the value on one line, with 6pt as the hard floor. Includes the 8/7/6pt
// stops; the finer steps keep text as large as possible before reaching the floor.
export const ONE_LINE_CANDIDATES = [20, 19, 18, 17, 16, 15, 14, 13, 12];

// The 6pt floor (half-points) — the smallest size any cell is shrunk to.
export const SEARCH_LOG_MIN_SZ = ONE_LINE_CANDIDATES[ONE_LINE_CANDIDATES.length - 1];

/** Usable inner width of a cell after side padding and the safety buffer. */
export function usableCellTwips(colTwips: number): number {
  return colTwips - 2 * CELL_SIDE_MARGIN_TWIPS - FIT_BUFFER_TWIPS;
}

/** Estimate the rendered width (twips) of one line of text at the given size. */
export function estimateTextTwips(text: string, szHalfPoints: number): number {
  let units = 0;
  for (const ch of text) units += TNR_WIDTHS[ch] ?? TNR_DEFAULT_UNITS;
  // em width in twips = points * 20 = (sz/2) * 20 = sz * 10
  return (units * szHalfPoints * 10) / TNR_EM_UNITS;
}

/**
 * Largest candidate size (half-points) at which `text` is estimated to fit on
 * one line of the cell; if even the smallest candidate doesn't fit, returns that
 * floor size.
 */
export function fitFontSize(text: string, colTwips: number, candidates: number[]): number {
  const usable = usableCellTwips(colTwips);
  for (const sz of candidates) {
    if (estimateTextTwips(text, sz) <= usable) return sz;
  }
  return candidates[candidates.length - 1];
}

/**
 * Collapse a grouped inmate value to a single line. Multiple inmates separated
 * by newlines (e.g. from a manual edit) are re-joined with " / "; an already
 * " / "-joined value is returned unchanged.
 */
export function inmateOneLine(text: string): string {
  return (text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

/**
 * Collapse any value to a single physical line: turn line breaks into a single
 * space and trim the ends, while preserving the text's own internal spacing.
 * (The inmate column uses `inmateOneLine` instead so its segments join with " / ".)
 */
export function collapseToLine(text: string): string {
  return (text ?? "").replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/**
 * Normalize a cell's raw value to the exact single-line string the DOCX filler
 * writes, so the review UI measures precisely what will be rendered: the inmate
 * column joins its segments with " / "; every other column collapses line breaks.
 */
export function normalizeSearchLogCellText(colIndex: number, value: string): string {
  return colIndex === SEARCH_LOG_INMATE_COL ? inmateOneLine(value) : collapseToLine(value);
}

/** True if `text` is estimated to fit on one line at the 6pt floor in `colTwips`. */
export function fitsOnOneLineAtMin(text: string, colTwips: number): boolean {
  return estimateTextTwips(text, SEARCH_LOG_MIN_SZ) <= usableCellTwips(colTwips);
}

/**
 * True if a Search Log cell's value is estimated to fit on one line at the 6pt
 * floor in its column. When false, the review table should warn the user to
 * shorten the field before generating (the filler never truncates it).
 */
export function searchLogCellFitsAtMin(colIndex: number, value: string): boolean {
  const twips = SEARCH_LOG_COL_TWIPS[colIndex] ?? SEARCH_LOG_COL_TWIPS[1];
  return fitsOnOneLineAtMin(normalizeSearchLogCellText(colIndex, value), twips);
}
