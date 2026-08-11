import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCountTotal,
  fieldsForConfig,
  getHousingLogConfig,
  housingLogConfigs,
  prepareHousingLog,
  validateHousingLog,
  type HousingLogDraftInput,
  type HousingLogValue,
} from "./index";

const signature = "data:image/png;base64,dGVzdA==";

function completeInput(unit: "A/H" | "B" | "Infirmary" = "A/H", shift: "1" | "2" | "3" = "1"): HousingLogDraftInput {
  const config = getHousingLogConfig(unit, shift);
  const values: Record<string, HousingLogValue> = {};
  for (const item of fieldsForConfig(config)) {
    if (item.inputType === "number") values[item.key] = 1;
    else if (item.inputType === "time") values[item.key] = "08:30";
    else if (item.inputType === "choice") values[item.key] = item.options?.[0] ?? "Yes";
    else values[item.key] = "Test value";
  }
  return {
    logDate: "2026-08-11",
    housingUnit: unit,
    shift,
    templateVersion: config.templateVersion,
    values,
    events: [],
    signatures: Object.fromEntries(config.signatures.map((item) => [item.key, signature])),
  };
}

test("all official unit and shift combinations have configurations", () => {
  assert.equal(housingLogConfigs.length, 24);
  assert.equal(getHousingLogConfig("A/H", "1").sourceSheet, "1_AH");
  assert.equal(getHousingLogConfig("D", "2").sourceSheet, "2_CDEFG");
  assert.equal(getHousingLogConfig("Infirmary", "3").sourceSheet, "3_INF");
  assert.equal(getHousingLogConfig("B", "3").securityCheckCount, 17);
});

test("required fields are rejected", () => {
  const input = completeInput();
  delete input.values["staff.1.name"];
  const issues = validateHousingLog(input);
  assert.ok(issues.some((issue) => issue.path === "values.staff.1.name"));
});

test("partial events and missing initials are rejected", () => {
  const input = completeInput();
  input.events = [{ id: "event-1", time: "09:10", activity: "Security round", initials: "" }];
  const issues = validateHousingLog(input);
  assert.ok(issues.some((issue) => issue.path === "events.event-1.initials"));
});

test("missing required signature is rejected and first-shift Infirmary follows its N/A officer signature", () => {
  const input = completeInput("Infirmary", "1");
  delete input.signatures.housingSupervisor;
  const issues = validateHousingLog(input);
  assert.ok(issues.some((issue) => issue.path === "signatures.housingSupervisor"));
  assert.ok(!issues.some((issue) => issue.path === "signatures.housingOfficer"));
});

test("count totals are calculated from the selected configuration", () => {
  const input = completeInput("B", "2");
  input.values["counts.beginning.components.Wing One"] = 30;
  input.values["counts.beginning.components.Wing Two"] = 31;
  input.values["counts.beginning.components.Wing Three"] = 29;
  const config = getHousingLogConfig("B", "2");
  assert.equal(calculateCountTotal(config, "beginning", input.values), 90);
  assert.equal(prepareHousingLog(input).values["counts.beginning.total"], 90);
});

test("complete logs validate and events are stored chronologically", () => {
  const input = completeInput();
  input.events = [
    { id: "late", time: "13:30", activity: "Later event", initials: "AB" },
    { id: "early", time: "09:15", activity: "Earlier event", initials: "AB" },
  ];
  assert.deepEqual(validateHousingLog(input), []);
  assert.deepEqual(prepareHousingLog(input).events.map((event) => event.id), ["early", "late"]);
});
