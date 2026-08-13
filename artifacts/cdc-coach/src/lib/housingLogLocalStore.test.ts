import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyHousingLogLocalWorkingState,
  HOUSING_LOG_LOCAL_SCHEMA_VERSION,
  isPlausibleWorkingState,
} from "./housingLogLocalStore";

test("a freshly created working state is plausible and carries the current schema version", () => {
  const state = emptyHousingLogLocalWorkingState();
  assert.equal(state.schemaVersion, HOUSING_LOG_LOCAL_SCHEMA_VERSION);
  assert.ok(isPlausibleWorkingState(state));
  assert.ok(state.submissionId.length > 0);
});

test("every empty working state gets its own submissionId", () => {
  const a = emptyHousingLogLocalWorkingState();
  const b = emptyHousingLogLocalWorkingState();
  assert.notEqual(a.submissionId, b.submissionId);
});

test("malformed or corrupted local records are never treated as plausible", () => {
  for (const bad of [
    undefined,
    null,
    "a string",
    42,
    {},
    { schemaVersion: 1 },
    { schemaVersion: 1, submissionId: "x" },
    {
      schemaVersion: 1,
      submissionId: "x",
      values: {},
      events: "not-an-array",
      signatures: {},
      composer: {},
    },
  ]) {
    assert.equal(isPlausibleWorkingState(bad), false, JSON.stringify(bad));
  }
});

test("a structurally valid record from a different schema version is still plausible (version mismatch is checked separately)", () => {
  const state = { ...emptyHousingLogLocalWorkingState(), schemaVersion: 999 };
  assert.ok(isPlausibleWorkingState(state));
  assert.notEqual(state.schemaVersion, HOUSING_LOG_LOCAL_SCHEMA_VERSION);
});
