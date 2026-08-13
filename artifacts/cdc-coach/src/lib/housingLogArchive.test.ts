import assert from "node:assert/strict";
import test from "node:test";
import type { HousingLogArchiveRecord } from "@workspace/housing-log";
import {
  buildHousingLogArchiveTree,
  formatArchiveDate,
  formatLogDateForDisplay,
} from "./housingLogArchive";

const record = (
  id: string,
  logDate: string,
  shift: HousingLogArchiveRecord["shift"],
  housingUnit: HousingLogArchiveRecord["housingUnit"],
): HousingLogArchiveRecord => ({
  id,
  logDate,
  shift,
  housingUnit,
  templateVersion: "2026-04-27",
  sourceSheet: `${shift}_TEST`,
  finalizedAt: `2026-08-12T1${id.length}:00:00.000Z`,
});

test("archive groups by logDate year, month, date, shift, and housing unit", () => {
  const tree = buildHousingLogArchiveTree(
    [
      record("one", "2026-08-12", "2", "A"),
      record("two", "2026-07-31", "1", "B"),
      record("three", "2025-12-01", "3", "Infirmary"),
    ],
    ["A", "B", "Infirmary"],
  );
  assert.deepEqual(
    tree.map((year) => year.year),
    [2026, 2025],
  );
  assert.deepEqual(
    tree[0]!.months.map((month) => month.label),
    ["August", "July"],
  );
  assert.equal(tree[0]!.months[0]!.dates[0]!.logDate, "2026-08-12");
  assert.deepEqual(
    tree[0]!.months[0]!.dates[0]!.shifts.map((shift) => shift.shift),
    ["1", "2", "3"],
  );
  assert.equal(formatArchiveDate("2026-08-12"), "August 12");
});

test("archive preserves duplicates and marks missing configured units without fake records", () => {
  const tree = buildHousingLogArchiveTree(
    [
      record("duplicate-a", "2026-08-12", "2", "A"),
      record("duplicate-b", "2026-08-12", "2", "A"),
    ],
    ["A", "B"],
  );
  const secondShift = tree[0]!.months[0]!.dates[0]!.shifts[1]!;
  assert.equal(secondShift.packageState, "missing-and-duplicates");
  const duplicate = secondShift.units[0]!;
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.missing, false);
  assert.deepEqual(duplicate.records.map((item) => item.id).sort(), [
    "duplicate-a",
    "duplicate-b",
  ]);
  const missing = secondShift.units[1]!;
  assert.equal(missing.missing, true);
  assert.equal(missing.records.length, 0);
});

test("formatLogDateForDisplay converts canonical ISO to MM-DD-YYYY", () => {
  assert.equal(formatLogDateForDisplay("2026-08-13"), "08-13-2026");
});

test("formatLogDateForDisplay zero-pads single-digit month and day", () => {
  assert.equal(formatLogDateForDisplay("2026-01-05"), "01-05-2026");
});

test("formatLogDateForDisplay leaves the canonical ISO string itself unchanged", () => {
  const logDate = "2026-08-13";
  formatLogDateForDisplay(logDate);
  assert.equal(logDate, "2026-08-13");
});

test("archive exposes complete and incomplete shift package states", () => {
  const tree = buildHousingLogArchiveTree(
    [
      record("a", "2026-08-12", "1", "A"),
      record("b", "2026-08-12", "1", "B"),
      record("duplicate-a", "2026-08-12", "2", "A"),
      record("duplicate-b", "2026-08-12", "2", "A"),
      record("second-b", "2026-08-12", "2", "B"),
    ],
    ["A", "B"],
  );
  const shifts = tree[0]!.months[0]!.dates[0]!.shifts;
  assert.equal(shifts[0]!.packageState, "complete");
  assert.equal(shifts[1]!.packageState, "duplicates");
  assert.equal(shifts[2]!.packageState, "missing");
});
