import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldsForConfig,
  getHousingLogConfig,
  housingLogConfigs,
  prepareHousingLog,
  validateHousingLog,
  type HousingLogDraftInput,
} from "./index";
import {
  generateCompleteDemoValues,
  generateIncompleteDemoValues,
  groupForFieldKey,
  seededRng,
  shiftRelativeMinutes,
} from "./demoSeed";

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

test("complete demo seeds vary across runs and always satisfy real validation, for every configuration", () => {
  for (const config of housingLogConfigs) {
    const datasets = [1, 2, 3].map((seed) =>
      generateCompleteDemoValues(config, seededRng(seed)),
    );
    const serialized = datasets.map((item) => JSON.stringify(item.values));
    assert.equal(new Set(serialized).size, serialized.length, config.key);
    for (const dataset of datasets) {
      const prepared = prepareHousingLog(toInput(config, dataset));
      assert.deepEqual(validateHousingLog(prepared), [], config.key);
    }
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
  for (const config of housingLogConfigs) {
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

test("count totals reconcile from seeded component values, for every configuration", () => {
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(11));
    const prepared = prepareHousingLog(toInput(config, seed));
    for (const count of config.counts) {
      const total = prepared.values[`counts.${count.key}.total`];
      const sum = count.components.reduce(
        (accumulator, component) =>
          accumulator +
          Number(
            prepared.values[`counts.${count.key}.components.${component}`],
          ),
        0,
      );
      assert.equal(total, sum, `${config.key} ${count.key}`);
    }
  }
});

test("events are generated in strictly increasing entered order, across a midnight rollover, for every configuration", () => {
  // Shift 1 is the overnight shift (23:00 -> 07:00): a naive string
  // comparison of HH:MM values breaks the moment the timeline crosses
  // midnight, which is exactly why validateHousingLog's
  // sortEventsChronologically refuses to sort by time string.
  // shiftRelativeMinutes unwraps the rollover the same way the generator
  // itself schedules the timeline.
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(99));
    assert.ok(seed.events.length >= 6, config.key);
    for (let index = 1; index < seed.events.length; index += 1) {
      const previous = shiftRelativeMinutes(
        config.shift,
        seed.events[index - 1]!.time,
      );
      const current = shiftRelativeMinutes(
        config.shift,
        seed.events[index]!.time,
      );
      assert.ok(
        current > previous,
        `${config.key}: ${seed.events[index - 1]!.time} should precede ${seed.events[index]!.time}`,
      );
    }
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

test("groupForFieldKey classifies every canonical prefix", () => {
  assert.equal(groupForFieldKey("staff.1.name"), "staff");
  assert.equal(groupForFieldKey("equipment.radios.1"), "equipment");
  assert.equal(groupForFieldKey("medication.acetaminophen"), "equipment");
  assert.equal(groupForFieldKey("counts.beginning.initials"), "counts");
  assert.equal(groupForFieldKey("activities.mail.time"), "activities");
  assert.equal(groupForFieldKey("securityChecks.3.initials"), "securityChecks");
});

test("key-ring codes are derived from the selected physical housing unit and never collide within one log", () => {
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(9));
    const prefix = config.housingUnit === "Infirmary" ? "INF" : config.housingUnit;
    const keyRingEntries = Object.entries(seed.values).filter(([key]) =>
      /keyRing|acceptedKeyRings/i.test(key),
    );
    assert.ok(keyRingEntries.length > 0, config.key);
    const values = keyRingEntries.map(([, value]) => String(value));
    for (const value of values)
      assert.match(value, new RegExp(`^${prefix}\\d*$`), `${config.key}: "${value}"`);
    assert.equal(new Set(values).size, values.length, config.key);
  }
});

test("the shift supervisor identity never doubles as housing-unit staff, for every configuration", () => {
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(5));
    const staffNames = new Set(
      Object.entries(seed.values)
        .filter(([key]) => /^staff\.\d+\.name$/.test(key))
        .map(([, value]) => String(value)),
    );
    for (const [key, value] of Object.entries(seed.values)) {
      if (!key.endsWith(".supervisor")) continue;
      assert.ok(
        !staffNames.has(String(value)),
        `${config.key} ${key}="${value}" collides with a housing-unit staff name`,
      );
    }
  }
});

test("every actor's recorded initials match that same actor's recorded name, for every configuration", () => {
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(13));
    const byPrefix = new Map<string, Record<string, string>>();
    for (const [key, value] of Object.entries(seed.values)) {
      const segments = key.split(".");
      const leaf = segments.at(-1)!;
      const prefix = segments.slice(0, -1).join(".");
      const bucket = byPrefix.get(prefix) ?? {};
      bucket[leaf] = String(value);
      byPrefix.set(prefix, bucket);
    }
    for (const [prefix, bucket] of byPrefix) {
      const initials = bucket.initials;
      if (!initials) continue;
      for (const [leaf, value] of Object.entries(bucket)) {
        if (leaf === "initials") continue;
        const match = /^(\p{L})\.\s(\p{L})/u.exec(value);
        if (!match) continue;
        assert.equal(
          `${match[1]}${match[2]}`,
          initials,
          `${config.key}: ${prefix}.${leaf}="${value}" vs initials="${initials}"`,
        );
      }
    }
  }
});

test("recall, count, and clear times are chronologically valid and counts progress through the shift, for every configuration", () => {
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(17));
    let previousEnd = -1;
    for (const count of config.counts) {
      const prefix = `counts.${count.key}`;
      const countTime = shiftRelativeMinutes(
        config.shift,
        String(seed.values[`${prefix}.countTime`]),
      );
      assert.ok(countTime > previousEnd, `${config.key}: ${prefix}.countTime out of order`);
      if (count.isBeginning) {
        previousEnd = countTime;
        continue;
      }
      const recall = shiftRelativeMinutes(
        config.shift,
        String(seed.values[`${prefix}.recallTime`]),
      );
      const clear = shiftRelativeMinutes(
        config.shift,
        String(seed.values[`${prefix}.clearTime`]),
      );
      assert.ok(recall < countTime, `${config.key}: ${prefix} recall not before count`);
      assert.ok(countTime < clear, `${config.key}: ${prefix} count not before clear`);
      previousEnd = clear;
    }
  }
});

test("security checks and activities progress chronologically through the shift, for every configuration", () => {
  for (const config of housingLogConfigs) {
    const seed = generateCompleteDemoValues(config, seededRng(19));
    let previous = -1;
    for (let index = 1; index <= config.securityCheckCount; index += 1) {
      const time = shiftRelativeMinutes(
        config.shift,
        String(seed.values[`securityChecks.${index}.time`]),
      );
      assert.ok(time > previous, `${config.key}: securityChecks.${index} out of order`);
      previous = time;
    }
    previous = -1;
    for (const activityDef of config.activities) {
      const timeField = activityDef.detailFields.find(
        (field) => field.inputType === "time",
      )!;
      const time = shiftRelativeMinutes(
        config.shift,
        String(seed.values[timeField.key]),
      );
      assert.ok(time > previous, `${config.key}: ${activityDef.key} out of order`);
      previous = time;
    }
  }
});
