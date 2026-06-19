/**
 * Shared text-fitting helpers for the Search Log.
 *
 * The DOCX filler is authoritative (it reads each cell's real `w:tcW`), but the
 * review UI needs the SAME width estimate to warn when a grouped inmate field is
 * too long to fit on one line at the 6pt minimum. Keeping the metrics here avoids
 * coupling the UI to the filler and keeps both estimates in lockstep.
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

// Width (twips) of the "Inmate Name/FDC Number" column in the original DC6-2001
// Search Log template (verified from the template's <w:tcW>). Used only for the
// UI overflow warning; the filler reads the real width at fill time.
export const SEARCH_LOG_INMATE_COL_TWIPS = 4140;

// Font size candidates (half-points). Narrow columns step 10pt -> 7pt; the
// grouped inmate cell steps 10pt -> 8pt -> 7pt -> 6pt (6pt is the floor).
export const NARROW_COL_CANDIDATES = [20, 19, 18, 17, 16, 15, 14];
export const INMATE_COL_CANDIDATES = [20, 16, 14, 12];

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
 * True if a grouped inmate string is estimated to fit on one line at the 6pt
 * minimum inside the Search Log inmate column. When false, the review table
 * should warn the user to shorten/split the field before generating.
 */
export function groupedInmateFitsAtMin(text: string): boolean {
  const min = INMATE_COL_CANDIDATES[INMATE_COL_CANDIDATES.length - 1];
  const usable = usableCellTwips(SEARCH_LOG_INMATE_COL_TWIPS);
  return estimateTextTwips(inmateOneLine(text), min) <= usable;
}
