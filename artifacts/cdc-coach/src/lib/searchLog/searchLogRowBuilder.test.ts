import { test } from "node:test";
import assert from "node:assert/strict";
import { setIncludeAll } from "./searchLogRowBuilder";
import type { ReviewRow } from "./types";

function row(id: string, include: boolean): ReviewRow {
  return {
    id,
    include,
    source: "bedbook",
    bedId: `B1-10${id}`,
    date: "08/13/26",
    time: "9:00 A",
    area: `B1-10${id}`,
    type: "Random",
    inmate: "Doe, John A123456",
    officer: "C/O Davis",
    discrepancies: "",
    tablet: "Y",
    inmateFit: true,
  };
}

test("setIncludeAll(rows, false) clears every row's include flag", () => {
  const rows = [row("1", true), row("2", true), row("3", false)];
  const result = setIncludeAll(rows, false);
  assert.deepEqual(
    result.map((r) => r.include),
    [false, false, false],
  );
});

test("setIncludeAll(rows, true) sets every row's include flag", () => {
  const rows = [row("1", false), row("2", true), row("3", false)];
  const result = setIncludeAll(rows, true);
  assert.deepEqual(
    result.map((r) => r.include),
    [true, true, true],
  );
});

test("setIncludeAll only changes the include field, leaving every other field untouched", () => {
  const rows = [row("1", true)];
  const result = setIncludeAll(rows, false);
  assert.deepEqual({ ...result[0], include: true }, rows[0]);
});

test("setIncludeAll does not mutate the input array or its rows", () => {
  const rows = [row("1", true), row("2", true)];
  const snapshot = rows.map((r) => ({ ...r }));
  setIncludeAll(rows, false);
  assert.deepEqual(rows, snapshot);
});

test("setIncludeAll on an empty roster returns an empty array", () => {
  assert.deepEqual(setIncludeAll([], true), []);
});
