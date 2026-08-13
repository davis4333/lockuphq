import {
  formatHousingLogDateForDisplay,
  housingShifts,
  type HousingLogArchiveRecord,
  type HousingShift,
  type HousingUnit,
} from "@workspace/housing-log";

export type HousingLogArchiveUnitSlot = {
  housingUnit: HousingUnit;
  records: HousingLogArchiveRecord[];
  missing: boolean;
  duplicate: boolean;
};

export type HousingLogArchiveShiftNode = {
  shift: HousingShift;
  units: HousingLogArchiveUnitSlot[];
  packageState:
    | "complete"
    | "missing"
    | "duplicates"
    | "missing-and-duplicates";
};

export type HousingLogArchiveDateNode = {
  logDate: string;
  shifts: HousingLogArchiveShiftNode[];
};

export type HousingLogArchiveMonthNode = {
  month: number;
  label: string;
  dates: HousingLogArchiveDateNode[];
};

export type HousingLogArchiveYearNode = {
  year: number;
  months: HousingLogArchiveMonthNode[];
};

const dateParts = (logDate: string) => {
  const [year, month, day] = logDate.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
};

export function formatArchiveMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function formatArchiveDate(logDate: string): string {
  const { year, month, day } = dateParts(logDate);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * User-facing display format for a canonical YYYY-MM-DD Housing Log date —
 * MM-DD-YYYY. Re-exported under this page's established name; the actual
 * conversion lives in `@workspace/housing-log` so the web app, the Excel
 * DATE cell, and the delivery email all render the same format.
 */
export const formatLogDateForDisplay = formatHousingLogDateForDisplay;

export function buildHousingLogArchiveTree(
  records: readonly HousingLogArchiveRecord[],
  expectedHousingUnits: readonly HousingUnit[],
): HousingLogArchiveYearNode[] {
  const dates = new Map<string, HousingLogArchiveRecord[]>();
  for (const record of records) {
    const existing = dates.get(record.logDate) ?? [];
    existing.push(record);
    dates.set(record.logDate, existing);
  }

  const years = new Map<number, Map<number, HousingLogArchiveDateNode[]>>();
  for (const [logDate, dateRecords] of dates) {
    const { year, month } = dateParts(logDate);
    const shifts = housingShifts.map((shift) => {
      const units = expectedHousingUnits.map((housingUnit) => {
        const slotRecords = dateRecords
          .filter(
            (record) =>
              record.shift === shift && record.housingUnit === housingUnit,
          )
          .sort((left, right) =>
            right.finalizedAt.localeCompare(left.finalizedAt),
          );
        return {
          housingUnit,
          records: slotRecords,
          missing: slotRecords.length === 0,
          duplicate: slotRecords.length > 1,
        };
      });
      const hasMissing = units.some((unit) => unit.missing);
      const hasDuplicates = units.some((unit) => unit.duplicate);
      return {
        shift,
        units,
        packageState:
          hasMissing && hasDuplicates
            ? ("missing-and-duplicates" as const)
            : hasMissing
              ? ("missing" as const)
              : hasDuplicates
                ? ("duplicates" as const)
                : ("complete" as const),
      };
    });
    const months = years.get(year) ?? new Map();
    const monthDates = months.get(month) ?? [];
    monthDates.push({ logDate, shifts });
    months.set(month, monthDates);
    years.set(year, months);
  }

  return [...years.entries()]
    .sort(([left], [right]) => right - left)
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort(([left], [right]) => right - left)
        .map(([month, monthDates]) => ({
          month,
          label: formatArchiveMonth(year, month),
          dates: monthDates.sort((left, right) =>
            right.logDate.localeCompare(left.logDate),
          ),
        })),
    }));
}
