import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCountTotal,
  fieldsForConfig,
  getEasternCalendarDate,
  getHousingLogConfig,
  hasMeaningfulHousingLogContent,
  housingLogCanonicalFingerprint,
  housingLogConfigs,
  housingLogDraftInputSchema,
  prepareHousingLog,
  validateHousingLog,
  type HousingLogDraftInput,
  type HousingLogValue,
  type HousingShift,
  type HousingUnit,
} from "./index";

const signature = "data:image/png;base64,dGVzdA==";

function completeInput(
  unit: HousingUnit = "A",
  shift: HousingShift = "1",
): HousingLogDraftInput {
  const config = getHousingLogConfig(unit, shift);
  const values: Record<string, HousingLogValue> = {};
  for (const item of fieldsForConfig(config)) {
    if (item.inputType === "number") values[item.key] = 1;
    else if (item.inputType === "time") values[item.key] = "08:30";
    else if (item.inputType === "choice")
      values[item.key] = item.options?.[0] ?? "Yes";
    else values[item.key] = "Test value";
  }
  return {
    logDate: "2026-08-11",
    housingUnit: unit,
    shift,
    templateVersion: config.templateVersion,
    values,
    events: [],
    signatures: Object.fromEntries(
      config.signatures.map((item) => [item.key, signature]),
    ),
  };
}

test("all 27 unit/shift combinations map to the 12 official worksheets", () => {
  assert.equal(housingLogConfigs.length, 27);
  assert.equal(new Set(housingLogConfigs.map((config) => config.key)).size, 27);
  assert.deepEqual(
    [...new Set(housingLogConfigs.map((config) => config.sourceSheet))].sort(),
    [
      "1_AH",
      "1_B",
      "1_CDEFG",
      "1_INF",
      "2_AH",
      "2_B",
      "2_CDEFG",
      "2_INF",
      "3_AH",
      "3_B",
      "3_CDEFG",
      "3_INF",
    ],
  );
  for (const unit of ["C", "D", "E", "F", "G"] as const) {
    for (const shift of ["1", "2", "3"] as const) {
      assert.equal(
        getHousingLogConfig(unit, shift).sourceSheet,
        `${shift}_CDEFG`,
      );
    }
  }
  // A Dorm and H Dorm are separate physical housing units that share the
  // official AH template family — same architecture already proven by C/D/E/F/G.
  for (const shift of ["1", "2", "3"] as const) {
    const a = getHousingLogConfig("A", shift);
    const h = getHousingLogConfig("H", shift);
    assert.equal(a.sourceSheet, `${shift}_AH`);
    assert.equal(h.sourceSheet, `${shift}_AH`);
    assert.notEqual(a.key, h.key);
    assert.equal(a.housingUnit, "A");
    assert.equal(h.housingUnit, "H");
    // Both resolve to the identical template family shape (counts, security
    // checks, activities) — only the record's own housingUnit differs.
    assert.deepEqual(a.counts, h.counts);
    assert.equal(a.securityCheckCount, h.securityCheckCount);
    assert.deepEqual(
      a.activities.map((item) => item.key),
      h.activities.map((item) => item.key),
    );
  }
  for (const config of housingLogConfigs) {
    assert.deepEqual(
      validateHousingLog(completeInput(config.housingUnit, config.shift)),
      [],
      config.key,
    );
  }
});

test("official staff, count, check, and signature cardinalities are configured", () => {
  const expectedCounts = { "1": 5, "2": 3, "3": 5 } as const;
  for (const config of housingLogConfigs) {
    assert.equal(config.counts.length, expectedCounts[config.shift]);
    const staffNames =
      config.sections[0]?.fields.filter((item) => item.key.endsWith(".name")) ??
      [];
    const expectedStaff =
      config.housingUnit === "Infirmary"
        ? 1
        : config.housingUnit === "B" && config.shift === "3"
          ? 5
          : 3;
    assert.equal(staffNames.length, expectedStaff, config.key);
    const expectedChecks =
      config.housingUnit === "B"
        ? 17
        : config.housingUnit === "A" ||
            config.housingUnit === "H" ||
            config.housingUnit === "Infirmary"
          ? config.shift === "1"
            ? 9
            : 8
          : 9;
    assert.equal(config.securityCheckCount, expectedChecks, config.key);
  }

  assert.deepEqual(
    getHousingLogConfig("Infirmary", "1").signatures.map((item) => item.key),
    ["housingSupervisor"],
  );
  assert.deepEqual(
    getHousingLogConfig("Infirmary", "2").signatures.map((item) => item.key),
    ["housingSupervisor", "housingOfficer"],
  );
  assert.deepEqual(
    getHousingLogConfig("Infirmary", "3").signatures.map((item) => item.key),
    ["housingSupervisor", "housingOfficer"],
  );
});

test("official equipment slots are represented individually", () => {
  const regular = fieldsForConfig(getHousingLogConfig("A", "1"));
  assert.equal(
    regular.filter((item) =>
      /^equipment\.acceptedKeyRings\.\d+$/.test(item.key),
    ).length,
    8,
  );
  assert.equal(
    regular.filter((item) => /^equipment\.radios\.\d+$/.test(item.key)).length,
    3,
  );
  assert.equal(
    regular.filter((item) => /^equipment\.bodyAlarms\.\d+$/.test(item.key))
      .length,
    3,
  );
  assert.equal(
    regular.filter((item) => /^equipment\.cuffs\.\d+$/.test(item.key)).length,
    3,
  );
  assert.equal(
    regular.filter((item) => /^equipment\.cuffCases\.\d+$/.test(item.key))
      .length,
    3,
  );

  const infirmaryKeys = new Set(
    fieldsForConfig(getHousingLogConfig("Infirmary", "2")).map(
      (item) => item.key,
    ),
  );
  for (const key of [
    "equipment.infirmaryKeyRing",
    "equipment.infirmaryBodyAlarm",
    "equipment.infirmaryCuff",
    "equipment.infirmaryCuffCase",
    "equipment.infirmaryRadio",
  ])
    assert.ok(infirmaryKeys.has(key), key);
});

test("formal counts carry official attestations and beginning counts do not invent a conductor", () => {
  for (const config of housingLogConfigs) {
    assert.equal(config.counts[0]?.requiresConductedBy, false);
    assert.equal(config.counts[0]?.officialAttestation, undefined);
    for (const count of config.counts.slice(1)) {
      assert.equal(count.requiresConductedBy, true);
      assert.ok(count.officialAttestation?.toLowerCase().includes("security"));
    }
    assert.ok(
      !fieldsForConfig(config).some(
        (item) => item.key === "counts.beginning.conductedBy",
      ),
    );
  }
  assert.match(
    getHousingLogConfig("B", "1").counts[1]?.officialAttestation ?? "",
    /sliding cell doors/,
  );
  assert.match(
    getHousingLogConfig("A", "1").counts[1]?.officialAttestation ?? "",
    /open bay areas that house inmates/,
  );
  assert.match(
    getHousingLogConfig("Infirmary", "2").counts[1]?.officialAttestation ?? "",
    /^Security, safety, sanitation/,
  );
  assert.deepEqual(
    getHousingLogConfig("Infirmary", "1")
      .counts.slice(1)
      .map((count) => count.conductedByLabel),
    [
      "Conducted by Officer",
      "Conducted by Sergeant",
      "Conducted by Sergeant",
      "Conducted by Sergeant / Officer",
    ],
  );
  assert.match(
    getHousingLogConfig("B", "1").counts[1]?.officialAttestation ?? "",
    /physically checked \(by pulling on them when they are in the secured position\)/,
  );
});

test("3_B preserves and flags the official shower wording discrepancy", () => {
  const activity = getHousingLogConfig("B", "3").activities.find(
    (item) => item.key === "showersDcFollowup",
  );
  assert.equal(
    activity?.label,
    "Showers, shaves, and haircuts completed in AC wing",
  );
  assert.match(
    activity?.sourceNote ?? "",
    /pending administrative confirmation/,
  );
});

test("required fields, missing initials, and duplicate event IDs are rejected", () => {
  const input = completeInput();
  delete input.values["staff.1.name"];
  input.events = [
    { id: "event-1", time: "09:10", activity: "Security round", initials: "" },
    { id: "event-1", time: "09:20", activity: "Second round", initials: "AB" },
  ];
  const issues = validateHousingLog(input);
  assert.ok(issues.some((issue) => issue.path === "values.staff.1.name"));
  assert.ok(issues.some((issue) => issue.path === "events.event-1.initials"));
  assert.ok(issues.some((issue) => issue.message.includes("unique IDs")));
  assert.equal(housingLogDraftInputSchema.safeParse(input).success, false);
});

test("real calendar dates and whole non-negative counts are enforced", () => {
  for (const logDate of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "not-a-date",
  ]) {
    const input = completeInput();
    input.logDate = logDate;
    assert.ok(
      validateHousingLog(input).some((issue) => issue.path === "logDate"),
      logDate,
    );
    assert.equal(
      housingLogDraftInputSchema.safeParse(input).success,
      false,
      logDate,
    );
  }
  const validLeapDay = completeInput();
  validLeapDay.logDate = "2028-02-29";
  assert.ok(
    !validateHousingLog(validLeapDay).some((issue) => issue.path === "logDate"),
  );

  const negative = completeInput();
  negative.values["counts.beginning.components.Wing One"] = -1;
  assert.ok(
    validateHousingLog(negative).some((issue) =>
      issue.path.includes("Wing One"),
    ),
  );
  const decimal = completeInput();
  decimal.values["counts.beginning.components.Wing One"] = 1.5;
  assert.ok(
    validateHousingLog(decimal).some((issue) =>
      issue.path.includes("Wing One"),
    ),
  );
});

test("default calendar dates use America/New_York rather than UTC", () => {
  assert.equal(
    getEasternCalendarDate(new Date("2026-08-12T02:00:00.000Z")),
    "2026-08-11",
  );
});

test("missing required signatures follow all three Infirmary source sheets", () => {
  const first = completeInput("Infirmary", "1");
  delete first.signatures.housingSupervisor;
  const firstIssues = validateHousingLog(first);
  assert.ok(
    firstIssues.some((issue) => issue.path === "signatures.housingSupervisor"),
  );
  assert.ok(
    !firstIssues.some((issue) => issue.path === "signatures.housingOfficer"),
  );

  for (const shift of ["2", "3"] as const) {
    const input = completeInput("Infirmary", shift);
    delete input.signatures.housingOfficer;
    assert.ok(
      validateHousingLog(input).some(
        (issue) => issue.path === "signatures.housingOfficer",
      ),
    );
  }
});

test("count totals are calculated and stale totals are removed when a component is cleared", () => {
  const input = completeInput("B", "2");
  input.values["counts.beginning.components.Wing One"] = 30;
  input.values["counts.beginning.components.Wing Two"] = 31;
  input.values["counts.beginning.components.Wing Three"] = 29;
  const config = getHousingLogConfig("B", "2");
  assert.equal(calculateCountTotal(config, "beginning", input.values), 90);
  const prepared = prepareHousingLog(input);
  assert.equal(prepared.values["counts.beginning.total"], 90);
  prepared.values["counts.beginning.components.Wing One"] = "";
  assert.equal(
    prepareHousingLog(prepared).values["counts.beginning.total"],
    undefined,
  );
});

test("cross-midnight event order is preserved exactly as entered", () => {
  const input = completeInput("B", "3");
  input.events = [
    {
      id: "before-midnight",
      time: "23:55",
      activity: "Before midnight",
      initials: "AB",
    },
    {
      id: "after-midnight",
      time: "00:10",
      activity: "After midnight",
      initials: "AB",
    },
  ];
  assert.deepEqual(
    prepareHousingLog(input).events.map((event) => event.id),
    ["before-midnight", "after-midnight"],
  );
});

test("meaningful-content detection distinguishes a blank draft from entered data", () => {
  assert.equal(
    hasMeaningfulHousingLogContent({ values: {}, events: [], signatures: {} }),
    false,
  );
  assert.equal(
    hasMeaningfulHousingLogContent({
      values: { note: " " },
      events: [],
      signatures: {},
    }),
    false,
  );
  assert.equal(
    hasMeaningfulHousingLogContent({
      values: { note: "entered" },
      events: [],
      signatures: {},
    }),
    true,
  );
});

test("intentionally absent staff slots validate as N/A, including time fields", () => {
  const input = completeInput("A", "1");
  const config = getHousingLogConfig("A", "1");
  for (const item of fieldsForConfig(config)) {
    if (item.key.startsWith("staff.1.")) input.values[item.key] = "N/A";
  }
  const issues = validateHousingLog(input);
  assert.deepEqual(
    issues.filter((issue) => issue.path.startsWith("values.staff.1.")),
    [],
  );
});

test("N/A is still rejected for time fields outside allowNa staff fields", () => {
  const input = completeInput("A", "1");
  input.values["securityChecks.1.time"] = "N/A";
  const issues = validateHousingLog(input);
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === "values.securityChecks.1.time" &&
        issue.message.includes("valid time"),
    ),
  );
});

test("a present staff slot with missing fields still reports required issues", () => {
  const input = completeInput("A", "1");
  delete input.values["staff.2.name"];
  input.values["staff.2.radio"] = "";
  const issues = validateHousingLog(input);
  assert.ok(issues.some((issue) => issue.path === "values.staff.2.name"));
  assert.ok(issues.some((issue) => issue.path === "values.staff.2.radio"));
});

test("N/A staff times are rejected when the rest of the slot is present", () => {
  const input = completeInput("A", "1");
  // staff.1 keeps a real name and equipment, but the times are set to N/A —
  // this is a present person with missing times, not an absent slot.
  input.values["staff.1.assumedAt"] = "N/A";
  input.values["staff.1.relievedAt"] = "N/A";
  const issues = validateHousingLog(input);
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === "values.staff.1.assumedAt" &&
        issue.message.includes("valid time"),
    ),
  );
  assert.ok(
    issues.some((issue) => issue.path === "values.staff.1.relievedAt"),
  );
});

test("housingLogCanonicalFingerprint ignores object key order", () => {
  const input = completeInput("A", "1");
  const reorderedValues = Object.fromEntries(
    Object.entries(input.values).reverse(),
  );
  assert.equal(
    housingLogCanonicalFingerprint(input),
    housingLogCanonicalFingerprint({ ...input, values: reorderedValues }),
  );
});

test("housingLogCanonicalFingerprint changes when a value changes", () => {
  const input = completeInput("A", "1");
  const changed = {
    ...input,
    values: { ...input.values, "staff.1.name": "Someone else" },
  };
  assert.notEqual(
    housingLogCanonicalFingerprint(input),
    housingLogCanonicalFingerprint(changed),
  );
});

test("housingLogCanonicalFingerprint changes when event order changes", () => {
  const input: HousingLogDraftInput = {
    ...completeInput("A", "1"),
    events: [
      { id: "e1", time: "20:00", activity: "First", initials: "AB" },
      { id: "e2", time: "20:05", activity: "Second", initials: "AB" },
    ],
  };
  const reordered = { ...input, events: [...input.events].reverse() };
  assert.notEqual(
    housingLogCanonicalFingerprint(input),
    housingLogCanonicalFingerprint(reordered),
  );
});

test("housingLogCanonicalFingerprint changes when a signature changes", () => {
  const input = completeInput("A", "1");
  const resigned = {
    ...input,
    signatures: { ...input.signatures, housingSupervisor: "different-signature" },
  };
  assert.notEqual(
    housingLogCanonicalFingerprint(input),
    housingLogCanonicalFingerprint(resigned),
  );
});

test("housingLogCanonicalFingerprint ignores persistence metadata not part of its input type", () => {
  const input = completeInput("A", "1");
  const stored = {
    ...input,
    id: "generated-id",
    status: "finalized" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    finalizedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(
    housingLogCanonicalFingerprint(input),
    housingLogCanonicalFingerprint(stored),
  );
});
