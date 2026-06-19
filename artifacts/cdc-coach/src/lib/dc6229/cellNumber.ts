/**
 * The DC6-229 form pre-prints a "B" dorm letter immediately before the cell-number
 * box, so only the portion *after* the "B" belongs in the box. We strip a single
 * leading "B" (and one optional separating space/hyphen) while preserving the rest,
 * including the L/U bunk suffix.
 *
 *   "B1-106L"  -> "1-106L"
 *   "B 2-204U" -> "2-204U"
 *   "B-3-101"  -> "3-101"
 *
 * Cells that do not start with "B" are returned unchanged (and flagged in review,
 * since the form's printed "B" would then disagree with the dorm).
 */
export function stripDormLetter(rawCell: string): string {
  const t = (rawCell ?? "").trim();
  if (/^[Bb]/.test(t)) return t.replace(/^[Bb][\s-]?/, "").trim();
  return t;
}

/** True when the raw cell begins with the "B" dorm letter the form prints. */
export function startsWithDormB(rawCell: string): boolean {
  return /^[Bb]/.test((rawCell ?? "").trim());
}

/**
 * Normalize a bunk/cell value for the DC6-229 cell box: strip the dorm "B",
 * then format the digits as `<wing>-<last 3 digits>`, preserving a trailing
 * L/U bunk letter regardless of how it was typed.
 *
 *   "1102L"   -> "1-102L"
 *   "1102"    -> "1-102"
 *   "B1-102L" -> "1-102L"
 *   "1 102 U" -> "1-102U"
 *
 * Values without at least 4 digits are returned stripped/trimmed unchanged.
 */
export function formatCellNumber(rawCell: string): string {
  const stripped = stripDormLetter(rawCell);
  const suffixMatch = /([LUlu])\s*$/.exec(stripped);
  const suffix = suffixMatch ? suffixMatch[1].toUpperCase() : "";
  const digits = stripped.replace(/\D/g, "");
  if (digits.length < 4) return stripped.trim();
  const wing = digits.slice(0, digits.length - 3);
  const cell = digits.slice(-3);
  return `${wing}-${cell}${suffix}`;
}
