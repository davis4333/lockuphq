export interface DcExtractResult {
  dc: string;
  valid: boolean;
}

const LETTER_FIVE = /[A-Za-z]\d{5}/g;
const SIX_DIGITS = /\d{6}/g;

/**
 * Extract a DC number from a raw DOCNUM field.
 *  1. Prefer the rightmost one-letter-followed-by-five-digits pattern (e.g. A12345).
 *  2. Otherwise allow a six-digit pattern (e.g. 123456).
 *  3. If neither is found, flag the row for review (valid = false).
 *
 * Never invents or rewrites numbers.
 */
export function extractDcNumber(rawDocnum: string): DcExtractResult {
  const raw = (rawDocnum ?? "").trim();
  if (!raw) return { dc: "", valid: false };

  const letterMatches = raw.match(LETTER_FIVE);
  if (letterMatches && letterMatches.length > 0) {
    const value = letterMatches[letterMatches.length - 1].toUpperCase();
    return { dc: value, valid: true };
  }

  const sixMatches = raw.match(SIX_DIGITS);
  if (sixMatches && sixMatches.length > 0) {
    const value = sixMatches[sixMatches.length - 1];
    return { dc: value, valid: true };
  }

  return { dc: "", valid: false };
}

const VALID_DC = /^([A-Za-z]\d{5}|\d{6})$/;

export function isValidDcNumber(dc: string): boolean {
  return VALID_DC.test((dc ?? "").trim());
}
