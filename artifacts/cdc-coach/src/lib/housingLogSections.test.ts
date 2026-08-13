import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldsForConfig,
  getHousingLogConfig,
  type HousingLogDraftInput,
  type HousingLogValue,
} from "@workspace/housing-log";
import {
  buildSectionIndex,
  canonicalFieldsWithPrefix,
  computeWorkspaceStatus,
  housingLogTaskIds,
  shortFieldLabel,
  taskForPath,
} from "./housingLogSections";

const signature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function completeInput(): HousingLogDraftInput {
  const config = getHousingLogConfig("A/H", "1");
  const values: Record<string, HousingLogValue> = {};
  for (const item of fieldsForConfig(config)) {
    values[item.key] =
      item.inputType === "number"
        ? 1
        : item.inputType === "time"
          ? "08:30"
          : item.inputType === "choice"
            ? (item.options?.[0] ?? "Yes")
            : "Test value";
  }
  return {
    logDate: "2026-08-11",
    housingUnit: "A/H",
    shift: "1",
    templateVersion: config.templateVersion,
    values,
    events: [],
    signatures: Object.fromEntries(
      config.signatures.map((item) => [item.key, signature]),
    ),
  };
}

test("every canonical field key maps to exactly one task section", () => {
  const config = getHousingLogConfig("B", "2");
  const index = buildSectionIndex(config);
  for (const field of fieldsForConfig(config)) {
    const task = taskForPath(`values.${field.key}`, index);
    assert.ok(housingLogTaskIds.includes(task), `${field.key} → ${task}`);
  }
});

test("issue paths classify into the expected sections", () => {
  const config = getHousingLogConfig("A/H", "1");
  const index = buildSectionIndex(config);
  assert.equal(taskForPath("logDate", index), "setup");
  assert.equal(taskForPath("templateVersion", index), "setup");
  assert.equal(taskForPath("values.counts.master.countTime", index), "counts");
  assert.equal(taskForPath("values.securityChecks.3.time", index), "checks");
  assert.equal(taskForPath("events.abc.time", index), "events");
  assert.equal(taskForPath("signatures.housingOfficer", index), "review");
  const staffKey = config.sections[0]!.fields[0]!.key;
  assert.equal(taskForPath(`values.${staffKey}`, index), "staff");
  const activityKey = config.activities[0]!.detailFields[0]!.key;
  assert.equal(taskForPath(`values.${activityKey}`, index), "counts");
});

test("a complete log reports every section ready with zero remaining", () => {
  const config = getHousingLogConfig("A/H", "1");
  const status = computeWorkspaceStatus(config, completeInput());
  assert.equal(status.totalRemaining, 0);
  assert.equal(status.readySections, housingLogTaskIds.length);
  for (const id of housingLogTaskIds) {
    assert.equal(status.tasks[id].ready, true, id);
    assert.equal(status.tasks[id].remaining, 0, id);
  }
});

test("an empty log reports canonical remaining counts per section", () => {
  const config = getHousingLogConfig("A/H", "1");
  const input: HousingLogDraftInput = {
    logDate: "2026-08-11",
    housingUnit: "A/H",
    shift: "1",
    templateVersion: config.templateVersion,
    values: {},
    events: [],
    signatures: {},
  };
  const status = computeWorkspaceStatus(config, input);
  // Totals must equal the canonical validator output, not a parallel list.
  const perSectionSum = housingLogTaskIds.reduce(
    (sum, id) => sum + status.tasks[id].remaining,
    0,
  );
  assert.equal(perSectionSum, status.totalRemaining);
  assert.equal(status.totalRemaining, status.issues.length);
  assert.ok(status.tasks.staff.remaining > 0);
  assert.ok(status.tasks.counts.remaining > 0);
  assert.equal(status.tasks.checks.remaining, config.securityCheckCount * 3);
  assert.equal(status.tasks.review.remaining, config.signatures.length);
  assert.equal(status.tasks.events.remaining, 0); // events are optional
  assert.equal(status.tasks.events.ready, true);
  assert.equal(status.tasks.staff.started, false);
});

test("partially filled sections report started without ready", () => {
  const config = getHousingLogConfig("A/H", "1");
  const input: HousingLogDraftInput = {
    logDate: "2026-08-11",
    housingUnit: "A/H",
    shift: "1",
    templateVersion: config.templateVersion,
    values: { "securityChecks.1.time": "08:00" },
    events: [{ id: "e1", time: "09:00", activity: "", initials: "" }],
    signatures: {},
  };
  const status = computeWorkspaceStatus(config, input);
  assert.equal(status.tasks.checks.started, true);
  assert.equal(status.tasks.checks.ready, false);
  // an unfinished event row creates canonical event issues
  assert.equal(status.tasks.events.started, true);
  assert.ok(status.tasks.events.remaining > 0);
});

test("security-check row counts derive from the active configuration", () => {
  const bConfig = getHousingLogConfig("B", "1");
  const infConfig = getHousingLogConfig("Infirmary", "1");
  assert.notEqual(bConfig.securityCheckCount, infConfig.securityCheckCount);
  const empty = (config: typeof bConfig): HousingLogDraftInput => ({
    logDate: "2026-08-11",
    housingUnit: config.housingUnit,
    shift: config.shift,
    templateVersion: config.templateVersion,
    values: {},
    events: [],
    signatures: {},
  });
  assert.equal(
    computeWorkspaceStatus(bConfig, empty(bConfig)).tasks.checks.remaining,
    bConfig.securityCheckCount * 3,
  );
  assert.equal(
    computeWorkspaceStatus(infConfig, empty(infConfig)).tasks.checks.remaining,
    infConfig.securityCheckCount * 3,
  );
});

test("canonicalFieldsWithPrefix mirrors fieldsForConfig for counts and checks", () => {
  const config = getHousingLogConfig("A/H", "1");
  const all = fieldsForConfig(config);
  const midnight = canonicalFieldsWithPrefix(config, "counts.midnight.");
  assert.ok(midnight.length > 0);
  assert.deepEqual(
    midnight,
    all.filter((f) => f.key.startsWith("counts.midnight.")),
  );
  const check1 = canonicalFieldsWithPrefix(config, "securityChecks.1.");
  assert.deepEqual(
    check1.map((f) => f.key),
    ["securityChecks.1.time", "securityChecks.1.performedBy", "securityChecks.1.initials"],
  );
  // Trailing dot must not match securityChecks.10.* etc. — only three fields per row.
  assert.ok(check1.every((f) => f.required));
  const check10Leak = canonicalFieldsWithPrefix(config, "securityChecks.1.").some(
    (f) => f.key.startsWith("securityChecks.10."),
  );
  assert.equal(check10Leak, false);
});

test("shortFieldLabel strips the group prefix and capitalizes", () => {
  const config = getHousingLogConfig("A/H", "1");
  const check1 = canonicalFieldsWithPrefix(config, "securityChecks.1.");
  assert.deepEqual(check1.map(shortFieldLabel), ["Time", "Completed by", "Initials"]);
  const midnight = canonicalFieldsWithPrefix(config, "counts.midnight.");
  const timeField = midnight.find((f) => f.key.endsWith(".countTime"));
  assert.ok(timeField);
  assert.equal(shortFieldLabel(timeField), "Count time");
});
