import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldsForConfig,
  getHousingLogConfig,
  prepareHousingLog,
  validateHousingLog,
  type HousingLogDraftInput,
} from "@workspace/housing-log";
import {
  emptySignatureInkMetrics,
  isPlausibleSignatureInk,
} from "../components/signatureInk";
import {
  generateCompleteDemoValues,
  generateIncompleteDemoValues,
  generateSignatureStrokePoints,
  groupForFieldKey,
  seededRng,
} from "./housingLogDemoSeed";

const FAKE_SIGNATURE = "data:image/png;base64,dGVzdA==";

function toInput(
  config: ReturnType<typeof getHousingLogConfig>,
  seed: ReturnType<typeof generateCompleteDemoValues>,
): HousingLogDraftInput {
  return {
    logDate: "2026-08-12",
    housingUnit: config.housingUnit,
    shift: config.shift,
    templateVersion: config.templateVersion,
    values: seed.values,
    events: seed.events,
    signatures: Object.fromEntries(
      config.signatures.map((signature) => [signature.key, FAKE_SIGNATURE]),
    ),
  };
}

test("complete demo seeds vary across runs and always satisfy real validation", () => {
  const config = getHousingLogConfig("B", "1");
  const datasets = [1, 2, 3, 4, 5].map((seed) =>
    generateCompleteDemoValues(config, seededRng(seed)),
  );

  // Every seed produces a genuinely different dataset.
  const serialized = datasets.map((item) => JSON.stringify(item.values));
  assert.equal(new Set(serialized).size, serialized.length);
  const eventSerialized = datasets.map((item) => JSON.stringify(item.events));
  assert.equal(new Set(eventSerialized).size, eventSerialized.length);

  for (const dataset of datasets) {
    const prepared = prepareHousingLog(toInput(config, dataset));
    const issues = validateHousingLog(prepared);
    assert.deepEqual(issues, []);
  }
});

test("a fixed seed is fully reproducible", () => {
  const config = getHousingLogConfig("A", "2");
  const first = generateCompleteDemoValues(config, seededRng(42));
  const second = generateCompleteDemoValues(config, seededRng(42));
  assert.deepEqual(first.values, second.values);
  assert.deepEqual(
    first.events.map(({ id: _id, ...rest }) => rest),
    second.events.map(({ id: _id, ...rest }) => rest),
  );
});

test("complete demo seed fills every required field for every configuration", () => {
  for (const [unit, shift] of [
    ["A", "1"],
    ["H", "2"],
    ["B", "3"],
    ["Infirmary", "1"],
    ["C", "2"],
  ] as const) {
    const config = getHousingLogConfig(unit, shift);
    const seed = generateCompleteDemoValues(config, seededRng(7));
    const requiredKeys = fieldsForConfig(config)
      .filter((field) => field.required)
      .map((field) => field.key);
    for (const key of requiredKeys)
      assert.ok(
        seed.values[key] !== undefined && seed.values[key] !== "",
        `${config.key}: ${key}`,
      );
  }
});

test("count totals reconcile from seeded component values", () => {
  const config = getHousingLogConfig("B", "1");
  const seed = generateCompleteDemoValues(config, seededRng(11));
  const prepared = prepareHousingLog(toInput(config, seed));
  for (const count of config.counts) {
    const total = prepared.values[`counts.${count.key}.total`];
    const sum = count.components.reduce(
      (accumulator, component) =>
        accumulator +
        Number(prepared.values[`counts.${count.key}.components.${component}`]),
      0,
    );
    assert.equal(total, sum, count.key);
  }
});

test("events are generated in strictly increasing entered order", () => {
  const config = getHousingLogConfig("B", "1");
  const seed = generateCompleteDemoValues(config, seededRng(99));
  assert.ok(seed.events.length >= 6);
  for (let index = 1; index < seed.events.length; index += 1) {
    const previous = seed.events[index - 1]!.time;
    const current = seed.events[index]!.time;
    assert.ok(current >= previous, `${previous} should precede ${current}`);
  }
});

test("incomplete demo seeds omit a different combination every run and always trip real validation", () => {
  const config = getHousingLogConfig("B", "1");
  const seeds = [1, 2, 3, 4, 5].map((seed) =>
    generateIncompleteDemoValues(config, seededRng(seed)),
  );
  const omissionSets = seeds.map((item) =>
    [...item.omittedValueKeys].sort().join(","),
  );
  assert.equal(new Set(omissionSets).size, omissionSets.length);

  for (const seed of seeds) {
    assert.ok(seed.omittedValueKeys.length >= 4);
    const groups = new Set(seed.omittedValueKeys.map(groupForFieldKey));
    assert.ok(groups.size >= 3, "omissions should span multiple sections");

    const input = toInput(config, seed);
    for (const key of seed.omitSignatureKeys) delete input.signatures[key];
    const prepared = prepareHousingLog(input);
    const issues = validateHousingLog(prepared);
    assert.ok(issues.length > 0, "an incomplete seed must fail real validation");
    // Every reported issue must correspond to something genuinely omitted —
    // no fabricated error is injected.
    for (const issue of issues) {
      if (!issue.path.startsWith("values.")) continue;
      const key = issue.path.slice("values.".length);
      assert.ok(
        seed.omittedValueKeys.includes(key),
        `unexpected issue for ${key}, which was not omitted`,
      );
    }
  }
});

test("generated signature strokes clear the real ink-plausibility thresholds", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const points = generateSignatureStrokePoints(seededRng(seed));
    const metrics = emptySignatureInkMetrics();
    let previous: { x: number; y: number } | undefined;
    for (const point of points) {
      if (previous)
        metrics.distance += Math.hypot(
          point.x - previous.x,
          point.y - previous.y,
        );
      metrics.points += 1;
      metrics.minX = Math.min(metrics.minX, point.x);
      metrics.maxX = Math.max(metrics.maxX, point.x);
      metrics.minY = Math.min(metrics.minY, point.y);
      metrics.maxY = Math.max(metrics.maxY, point.y);
      previous = point;
    }
    assert.ok(
      isPlausibleSignatureInk(metrics),
      `seed ${seed} produced implausible ink: ${JSON.stringify(metrics)}`,
    );
  }
});

test("groupForFieldKey classifies every canonical prefix", () => {
  assert.equal(groupForFieldKey("staff.1.name"), "staff");
  assert.equal(groupForFieldKey("equipment.radios.1"), "equipment");
  assert.equal(groupForFieldKey("medication.acetaminophen"), "equipment");
  assert.equal(groupForFieldKey("counts.beginning.initials"), "counts");
  assert.equal(groupForFieldKey("activities.mail.time"), "activities");
  assert.equal(groupForFieldKey("securityChecks.3.initials"), "securityChecks");
});
