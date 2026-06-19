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
