import assert from "node:assert/strict";
import test from "node:test";
import {
  fieldsForConfig,
  generateCompleteDemoValues,
  housingLogConfigs,
  prepareHousingLog,
  seededRng,
  shiftRelativeMinutes,
  validateHousingLog,
  type HousingLogConfig,
} from "@workspace/housing-log";
import JSZip from "jszip";
import { signatureDataUrl } from "../signatureTestUtils.ts";
import { generateExcelHousingLog } from "./generateExcelHousingLog.ts";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "./workbookRegistry.ts";

/**
 * Verifies the thing canonical validation alone cannot: that a Complete
 * Demo Housing Log is not just field-complete by the app's own rules, but
 * that the ACTUAL exported official worksheet — the file a supervisor
 * would open — reads as a coherent, finished record. Canonical validation
 * passing was never sufficient on its own (see the 3_CDEFG bug report this
 * suite regression-tests): a record can satisfy every validation rule and
 * still render "Recall 17:55 / Count 21:01 / Clear 11:03" or "Yes / No
 * [Yes]" in the workbook a demo is supposed to showcase.
 */

const registry = registerOfficialHousingLogWorkbook(
  new HousingLogWorkbookRegistry(),
);

function buildFinalizedRecord(config: HousingLogConfig, seed: number) {
  const { values, events } = generateCompleteDemoValues(
    config,
    seededRng(seed),
  );
  const input = prepareHousingLog({
    logDate: "2026-08-13",
    housingUnit: config.housingUnit,
    shift: config.shift,
    templateVersion: config.templateVersion,
    values,
    events,
    signatures: Object.fromEntries(
      config.signatures.map((signature) => [
        signature.key,
        signatureDataUrl("valid"),
      ]),
    ),
  });
  const issues = validateHousingLog(input);
  assert.deepEqual(
    issues,
    [],
    `${config.key}: Complete Demo failed canonical validation`,
  );
  return {
    record: {
      id: `complete-demo-test-${config.key}-${seed}`,
      status: "finalized" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finalizedAt: new Date().toISOString(),
      ...input,
    },
    values,
    events,
  };
}

function unescapeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Every non-empty cell of one worksheet — inline-string values AND
 * shared-string template wording alike — as plain reader-visible text. */
async function worksheetTextParts(
  bytes: Uint8Array,
  sourceSheet: string,
): Promise<string[]> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const relsXml = await zip
    .file("xl/_rels/workbook.xml.rels")!
    .async("string");
  const rels = new Map(
    [
      ...relsXml.matchAll(
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g,
      ),
    ].map((match) => [match[1]!, match[2]!] as const),
  );
  const sheetMatch = new RegExp(
    `<sheet\\b[^>]*\\bname="${sourceSheet}"[^>]*\\br:id="([^"]+)"[^>]*/>`,
  ).exec(workbookXml);
  assert.ok(sheetMatch, `sheet ${sourceSheet} not found in workbook.xml`);
  const target = rels.get(sheetMatch[1]!);
  assert.ok(target, `no relationship target for ${sourceSheet}`);
  const sheetXml = await zip.file(`xl/${target}`)!.async("string");
  const sstFile = zip.file("xl/sharedStrings.xml");
  const sstXml = sstFile ? await sstFile.async("string") : "";
  const sharedStrings = [...sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (match) =>
      [...match[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((t) => t[1])
        .join(""),
  );

  const parts: string[] = [];
  for (const fragment of sheetXml.split("<c ").slice(1)) {
    if (/^[^>]*\/>/.test(fragment)) continue; // self-closing empty cell
    const typeMatch = /\st="(\w+)"/.exec(fragment.split(">")[0]!);
    const type = typeMatch?.[1];
    const closeIndex = fragment.indexOf("</c>");
    if (closeIndex === -1) continue;
    const inner = fragment.slice(fragment.indexOf(">") + 1, closeIndex);
    let text = "";
    if (type === "s") {
      const v = /<v>(.*?)<\/v>/.exec(inner);
      text = v ? (sharedStrings[Number(v[1])] ?? "") : "";
    } else if (type === "inlineStr") {
      const t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      text = t ? t[1]! : "";
    }
    text = unescapeXmlEntities(text);
    if (text.trim() !== "") parts.push(text);
  }
  return parts;
}

// Patterns that mean the worksheet still reads as an unfinished form even
// though canonical validation is satisfied.
const UNRESOLVED_PLACEHOLDER_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "unresolved AM / PM choice", pattern: /\bAM\s*\/\s*PM\b/i },
  { name: "unresolved Yes / No choice", pattern: /\bYes\s*\/\s*No\b/i },
  { name: "leftover blank-line placeholder", pattern: /_{4,}/ },
  {
    name: "developer-looking bracketed choice",
    pattern: /\[(Yes|No|N\/A)\]/,
  },
];

for (const config of housingLogConfigs) {
  test(`${config.key} (${config.sourceSheet}): Complete Demo export has no unresolved placeholders`, async () => {
    const { record } = buildFinalizedRecord(config, 101);
    const generated = await generateExcelHousingLog(
      record,
      registry.resolveRecord(record),
    );
    const parts = await worksheetTextParts(generated.bytes, config.sourceSheet);
    for (const text of parts) {
      for (const { name, pattern } of UNRESOLVED_PLACEHOLDER_PATTERNS) {
        assert.doesNotMatch(
          text,
          pattern,
          `${config.key}: ${name} found in exported cell text: "${text}"`,
        );
      }
    }
  });

  test(`${config.key} (${config.sourceSheet}): every required field's value actually appears in the exported worksheet`, async () => {
    const { record, values } = buildFinalizedRecord(config, 102);
    const generated = await generateExcelHousingLog(
      record,
      registry.resolveRecord(record),
    );
    const parts = await worksheetTextParts(generated.bytes, config.sourceSheet);
    const joined = parts.join(" ␟ ");
    for (const field of fieldsForConfig(config)) {
      if (!field.required) continue;
      const value = values[field.key];
      const text = String(value ?? "").trim();
      if (text === "" || text.length < 2) continue; // single-char/numeric values are not a reliable substring signal
      assert.ok(
        joined.includes(text),
        `${config.key}: required field ${field.key}="${text}" is missing from the exported worksheet`,
      );
    }
  });

  test(`${config.key} (${config.sourceSheet}): key-ring codes are derived from the selected physical housing unit`, () => {
    const { values } = buildFinalizedRecord(config, 103);
    const unitPrefix = config.housingUnit === "Infirmary" ? "INF" : config.housingUnit;
    const keyRingEntries = Object.entries(values).filter(([key]) =>
      /keyRing|acceptedKeyRings/i.test(key),
    );
    assert.ok(keyRingEntries.length > 0, `${config.key}: no key-ring fields found`);
    for (const [key, value] of keyRingEntries) {
      assert.match(
        String(value),
        new RegExp(`^${unitPrefix}\\d*$`),
        `${config.key} ${key}="${value}" is not a ${unitPrefix}-prefixed key-ring code`,
      );
    }
  });

  test(`${config.key} (${config.sourceSheet}): counts progress chronologically and recall/count/clear are internally ordered`, () => {
    const { values } = buildFinalizedRecord(config, 104);
    let previousEnd = -1;
    for (const count of config.counts) {
      const prefix = `counts.${count.key}`;
      const countTime = shiftRelativeMinutes(
        config.shift,
        String(values[`${prefix}.countTime`]),
      );
      assert.ok(
        countTime > previousEnd,
        `${config.key}: ${prefix}.countTime is not after the previous count`,
      );
      if (count.isBeginning) {
        previousEnd = countTime;
        continue;
      }
      const recall = shiftRelativeMinutes(
        config.shift,
        String(values[`${prefix}.recallTime`]),
      );
      const clear = shiftRelativeMinutes(
        config.shift,
        String(values[`${prefix}.clearTime`]),
      );
      assert.ok(recall < countTime, `${config.key}: ${prefix} recall is not before count`);
      assert.ok(countTime < clear, `${config.key}: ${prefix} count is not before clear`);
      previousEnd = clear;
    }
  });

  test(`${config.key} (${config.sourceSheet}): every actor's recorded initials match that same actor's recorded name`, () => {
    const { values } = buildFinalizedRecord(config, 105);
    const byPrefix = new Map<string, Record<string, string>>();
    for (const [key, value] of Object.entries(values)) {
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
        if (!match) continue; // not a generated demo person name
        assert.equal(
          `${match[1]}${match[2]}`,
          initials,
          `${config.key}: ${prefix}.${leaf}="${value}" does not match ${prefix}.initials="${initials}"`,
        );
      }
    }
  });

  test(`${config.key} (${config.sourceSheet}): non-supervisor actors are drawn from the housing unit's own assigned roster`, () => {
    const { values } = buildFinalizedRecord(config, 106);
    const staffNames = new Set(
      Object.entries(values)
        .filter(([key]) => /^staff\.\d+\.name$/.test(key))
        .map(([, value]) => String(value)),
    );
    const personKeys = Object.keys(values).filter(
      (key) =>
        /(performedBy|conductedBy|escort|reportedBy|inventoriedBy|distributedBy|issuedBy)$/i.test(
          key,
        ) || key === "equipment.cellExtraction",
    );
    for (const key of personKeys) {
      const value = String(values[key]);
      assert.ok(
        staffNames.has(value),
        `${config.key}: ${key}="${value}" is not one of this housing unit's assigned officers`,
      );
    }
    const supervisorNames = new Set(
      Object.entries(values)
        .filter(([key]) => key.endsWith(".supervisor"))
        .map(([, value]) => String(value)),
    );
    for (const name of supervisorNames)
      assert.ok(
        !staffNames.has(name),
        `${config.key}: shift supervisor "${name}" also appears as a housing-unit staff member`,
      );
  });
}

test("3_CDEFG (D Dorm, Third shift): the reported bad export cannot recur", async () => {
  const config = housingLogConfigs.find(
    (candidate) => candidate.key === "D-3",
  )!;
  assert.equal(config.sourceSheet, "3_CDEFG");

  for (const seed of [1, 2, 3]) {
    const { record, values } = buildFinalizedRecord(config, seed);
    const generated = await generateExcelHousingLog(
      record,
      registry.resolveRecord(record),
    );
    const parts = await worksheetTextParts(generated.bytes, "3_CDEFG");
    const joined = parts.join(" ␟ ");

    // No unresolved "AM / PM" after a completed time.
    assert.doesNotMatch(joined, /\bAM\s*\/\s*PM\b/i, `seed ${seed}`);
    // No generic malformed item-distribution narrative bleeding into the
    // structured "Items distributed" field.
    assert.doesNotMatch(
      joined,
      /Items distributed\s+(Visitor escort|Routine walk-through|Cell search|Meal service|Recreation yard|Inmate (?:requested|grievance)|Maintenance notified|Phone access|Housing unit temperature)/i,
      `seed ${seed}`,
    );
    // No actor/initials mismatch anywhere in the record.
    const byPrefix = new Map<string, Record<string, string>>();
    for (const [key, value] of Object.entries(values)) {
      const segments = key.split(".");
      const leaf = segments.at(-1)!;
      const prefix = segments.slice(0, -1).join(".");
      const bucket = byPrefix.get(prefix) ?? {};
      bucket[leaf] = String(value);
      byPrefix.set(prefix, bucket);
    }
    for (const [prefix, bucket] of byPrefix) {
      if (!bucket.initials) continue;
      for (const [leaf, value] of Object.entries(bucket)) {
        if (leaf === "initials") continue;
        const match = /^(\p{L})\.\s(\p{L})/u.exec(value);
        if (!match) continue;
        assert.equal(`${match[1]}${match[2]}`, bucket.initials, `${prefix}.${leaf} seed ${seed}`);
      }
    }
    // Recall/count/clear is chronologically valid for every count.
    let previousEnd = -1;
    for (const count of config.counts) {
      const prefix = `counts.${count.key}`;
      const countTime = shiftRelativeMinutes(
        config.shift,
        String(values[`${prefix}.countTime`]),
      );
      assert.ok(countTime > previousEnd, `${prefix}.countTime seed ${seed}`);
      if (count.isBeginning) {
        previousEnd = countTime;
        continue;
      }
      const recall = shiftRelativeMinutes(config.shift, String(values[`${prefix}.recallTime`]));
      const clear = shiftRelativeMinutes(config.shift, String(values[`${prefix}.clearTime`]));
      assert.ok(recall < countTime, `${prefix} recall/count seed ${seed}`);
      assert.ok(countTime < clear, `${prefix} count/clear seed ${seed}`);
      previousEnd = clear;
    }
    // D Dorm key-ring codes are D-prefixed, not generic K-style codes.
    const keyRingValues = Object.entries(values)
      .filter(([key]) => /keyRing|acceptedKeyRings/i.test(key))
      .map(([, value]) => String(value));
    assert.ok(keyRingValues.length > 0, `seed ${seed}`);
    for (const value of keyRingValues) {
      assert.match(value, /^D\d*$/, `seed ${seed}: "${value}"`);
      assert.doesNotMatch(value, /^K\d/, `seed ${seed}: "${value}"`);
    }
  }
});

test("Complete Demo scenarios differ meaningfully across runs but stay internally coherent (D-3)", () => {
  const config = housingLogConfigs.find((candidate) => candidate.key === "D-3")!;
  const runs = [1, 2, 3, 4, 5].map((seed) =>
    generateCompleteDemoValues(config, seededRng(seed)),
  );
  const serialized = runs.map((run) => JSON.stringify(run.values));
  assert.equal(new Set(serialized).size, serialized.length, "runs should differ");
  for (const run of runs) {
    const prepared = prepareHousingLog({
      logDate: "2026-08-13",
      housingUnit: config.housingUnit,
      shift: config.shift,
      templateVersion: config.templateVersion,
      values: run.values,
      events: run.events,
      signatures: Object.fromEntries(
        config.signatures.map((s) => [s.key, signatureDataUrl("valid")]),
      ),
    });
    assert.deepEqual(validateHousingLog(prepared), []);
  }
});

