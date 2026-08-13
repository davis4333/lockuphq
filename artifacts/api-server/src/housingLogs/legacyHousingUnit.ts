import {
  getHousingLogConfig,
  isKnownHousingUnit,
  isLegacyHousingUnit,
  type HousingShift,
} from "@workspace/housing-log";

/**
 * Resolves the official worksheet name for a Housing Log row, tolerating
 * the pre-split combined "A/H" unit found in rows finalized before A Dorm
 * and H Dorm became independent physical units. Both A and H (and the
 * legacy combined value) share the same "AH" template family, so the
 * worksheet resolves identically — only the *identity* recorded on the row
 * differs, and that is never guessed or migrated here.
 *
 * Throws for any value that is neither a known nor a recognized legacy
 * housing unit, matching `getHousingLogConfig`'s behavior for bad input.
 */
export function sourceSheetForHousingLogUnit(
  housingUnit: string,
  shift: HousingShift,
): string {
  if (isKnownHousingUnit(housingUnit))
    return getHousingLogConfig(housingUnit, shift).sourceSheet;
  if (isLegacyHousingUnit(housingUnit)) return `${shift}_AH`;
  throw new Error(
    `No Housing Log configuration for ${housingUnit}, shift ${shift}`,
  );
}
