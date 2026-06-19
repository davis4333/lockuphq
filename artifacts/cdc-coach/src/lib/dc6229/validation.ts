import { isValidDcNumber } from "../searchLog/dcNumberExtractor";
import { startsWithDormB } from "./cellNumber";
import { isSunday } from "./weekDates";
import type { Dc6229Flag, Dc6229Record, Dc6229Setup } from "./types";

/**
 * Per-record review flags. Only a missing inmate name blocks generation (the form
 * is meaningless without it); everything else is a non-blocking warning so the
 * officer can review/fix before generating. Inmate text is never rewritten.
 */
export function validateRecord(rec: Dc6229Record): Dc6229Flag[] {
  const flags: Dc6229Flag[] = [];

  if (!rec.inmateName.trim()) {
    flags.push({ field: "Inmate Name", message: "Inmate name is required.", blocking: true });
  }

  if (!rec.cellNumber.trim()) {
    flags.push({ field: "Cell #", message: "Cell number is empty.", blocking: false });
  }
  if (rec.source === "bedbook" && rec.rawCell && !startsWithDormB(rec.rawCell)) {
    flags.push({
      field: "Cell #",
      message: `Cell "${rec.rawCell}" does not start with "B"; the form prints a "B" dorm letter. Verify the dorm.`,
      blocking: false,
    });
  }

  const fdc = rec.fdc.trim();
  if (!fdc) {
    flags.push({
      field: "FDC#",
      message:
        rec.source === "bedbook"
          ? `Could not extract an FDC# from "${rec.rawDocnum}".`
          : "FDC# is empty.",
      blocking: false,
    });
  } else if (!isValidDcNumber(fdc)) {
    flags.push({
      field: "FDC#",
      message: `FDC# "${fdc}" is not a letter+5 digits or 6-digit number. Verify.`,
      blocking: false,
    });
  }

  if (!rec.status.trim()) {
    flags.push({ field: "Status", message: "Status is empty.", blocking: false });
  }

  return flags;
}

/** Setup-level flags. A non-Sunday week start blocks generation. */
export function validateSetup(setup: Dc6229Setup): Dc6229Flag[] {
  const flags: Dc6229Flag[] = [];
  if (!setup.weekStart) {
    flags.push({ field: "Week Start", message: "Choose the week start date (a Sunday).", blocking: true });
  } else if (!isSunday(setup.weekStart)) {
    flags.push({
      field: "Week Start",
      message: "The week start date is not a Sunday. Adjust it to a Sunday before generating.",
      blocking: true,
    });
  }
  return flags;
}

export function recordHasBlocking(rec: Dc6229Record): boolean {
  return validateRecord(rec).some((f) => f.blocking);
}
