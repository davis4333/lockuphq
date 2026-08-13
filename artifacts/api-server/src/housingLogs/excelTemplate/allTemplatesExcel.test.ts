import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  fieldsForConfig,
  getHousingLogConfig,
  housingLogConfigs,
  validateHousingLog,
  type HousingLogConfig,
} from "@workspace/housing-log";
import JSZip from "jszip";
import { createHousingLogStressRecord } from "../documentSpike/stressFixture.ts";
import {
  generateExcelHousingLog,
  HousingLogExcelOverflowError,
  readInlineCell,
} from "./generateExcelHousingLog.ts";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "./workbookRegistry.ts";

const SOURCE_SHA256 =
  "1a550216dfd8320b01e0fdbe6cc0e42e87d58268f8029909c733ad1d75470c3d";
const registry = registerOfficialHousingLogWorkbook(
  new HousingLogWorkbookRegistry(),
);

const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

async function text(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  assert.ok(file, `missing ${path}`);
  return file.async("string");
}

async function bytes(zip: JSZip, path: string): Promise<Buffer> {
  const file = zip.file(path);
  assert.ok(file, `missing ${path}`);
  return file.async("nodebuffer");
}

function tag(xml: string, name: string): string {
  const match = xml.match(
    new RegExp(`<${name}\\b[\\s\\S]*?</${name}>|<${name}\\b[^>]*/>`),
  );
  assert.ok(match, `missing ${name}`);
  return match[0];
}

function worksheetTargets(
  workbookXml: string,
  relationshipsXml: string,
): Map<string, string> {
  const relationships = new Map(
    [
      ...relationshipsXml.matchAll(
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g,
      ),
    ].map((match) => [match[1]!, match[2]!] as const),
  );
  return new Map(
    [
      ...workbookXml.matchAll(
        /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g,
      ),
    ].map(
      (match) => [match[1]!, `xl/${relationships.get(match[2]!)}`] as const,
    ),
  );
}

function reconstructedEvents(
  sheets: readonly { xml: string; rows: readonly number[] }[],
): { time: string; activity: string; initials: string }[] {
  const events: { time: string; activity: string; initials: string }[] = [];
  for (const sheet of sheets)
    for (const row of sheet.rows) {
      const time = readInlineCell(sheet.xml, `A${row}`) ?? "";
      const activity = readInlineCell(sheet.xml, `B${row}`) ?? "";
      const initials = readInlineCell(sheet.xml, `D${row}`) ?? "";
      if (!activity) continue;
      if (time) events.push({ time, activity, initials });
      else {
        const current = events.at(-1);
        assert.ok(current, "wrapped event line has no preceding event");
        current.activity += activity;
      }
    }
  return events;
}

function coverageAssertions(
  config: HousingLogConfig,
  written: readonly string[],
): void {
  const expected = fieldsForConfig(config).map((field) => field.key);
  assert.deepEqual([...written].sort(), [...expected].sort());
  assert.equal(
    written.filter((key) => key.startsWith("securityChecks.")).length,
    config.securityCheckCount * 3,
  );
  assert.deepEqual(
    written.filter((key) => key.startsWith("activities.")).sort(),
    config.activities
      .flatMap((activity) => activity.detailFields.map((field) => field.key))
      .sort(),
  );
  assert.deepEqual(
    written.filter((key) => key.startsWith("counts.")).sort(),
    expected.filter((key) => key.startsWith("counts.")).sort(),
  );
  assert.deepEqual(
    written.filter((key) => key.startsWith("equipment.")).sort(),
    expected.filter((key) => key.startsWith("equipment.")).sort(),
  );
}

test("the versioned official workbook source has the approved strict SHA-256", async () => {
  const record = createHousingLogStressRecord("B", "1", 1);
  assert.equal(
    hash(await readFile(registry.resolveRecord(record).workbookPath)),
    SOURCE_SHA256,
  );
});

for (const config of housingLogConfigs) {
  test(`${config.housingUnit} shift ${config.shift} resolves and covers ${config.sourceSheet}`, async () => {
    const record = createHousingLogStressRecord(
      config.housingUnit,
      config.shift,
      1,
    );
    const result = await generateExcelHousingLog(
      record,
      registry.resolveRecord(record),
    );
    await JSZip.loadAsync(result.bytes, { checkCRC32: true });
    assert.equal(result.diagnostics.sourceSheet, config.sourceSheet);
    coverageAssertions(config, result.diagnostics.requiredFieldKeysWritten);
    assert.ok(result.diagnostics.officialEventCapacity > 0);
    assert.ok(result.diagnostics.continuationEventCapacity > 0);
  });
}

const representativeConfigs = housingLogConfigs.filter(
  (config, index, configs) =>
    configs.findIndex(
      (candidate) => candidate.sourceSheet === config.sourceSheet,
    ) === index,
);

for (const config of representativeConfigs) {
  test(`${config.sourceSheet} preserves structure, signatures, and a large cross-midnight event set`, async () => {
    const record = createHousingLogStressRecord(
      config.housingUnit,
      config.shift,
      120,
    );
    const template = registry.resolveRecord(record);
    const sourceBytes = await readFile(template.workbookPath);
    const sourceZip = await JSZip.loadAsync(sourceBytes, { checkCRC32: true });
    const first = await generateExcelHousingLog(record, template);
    const second = await generateExcelHousingLog(record, template);
    assert.deepEqual(
      first.bytes,
      second.bytes,
      "generation must be byte deterministic",
    );
    assert.equal(
      first.diagnostics.semanticFingerprint,
      second.diagnostics.semanticFingerprint,
    );
    assert.ok(first.diagnostics.continuationWorksheetNames.length >= 2);
    coverageAssertions(config, first.diagnostics.requiredFieldKeysWritten);

    const outputZip = await JSZip.loadAsync(first.bytes, { checkCRC32: true });
    const sourceWorkbookXml = await text(sourceZip, "xl/workbook.xml");
    const outputWorkbookXml = await text(outputZip, "xl/workbook.xml");
    const sourceTargets = worksheetTargets(
      sourceWorkbookXml,
      await text(sourceZip, "xl/_rels/workbook.xml.rels"),
    );
    const outputTargets = worksheetTargets(
      outputWorkbookXml,
      await text(outputZip, "xl/_rels/workbook.xml.rels"),
    );
    const sourceSheetXml = await text(
      sourceZip,
      sourceTargets.get(config.sourceSheet)!,
    );
    const outputSheetXml = await text(
      outputZip,
      outputTargets.get(config.sourceSheet)!,
    );
    for (const structuralTag of [
      "cols",
      "mergeCells",
      "pageMargins",
      "pageSetup",
      "headerFooter",
    ])
      assert.equal(
        tag(outputSheetXml, structuralTag),
        tag(sourceSheetXml, structuralTag),
      );
    const sourceBreaks =
      sourceSheetXml.match(/<rowBreaks\b[\s\S]*?<\/rowBreaks>/)?.[0] ?? "";
    const outputBreaks =
      outputSheetXml.match(/<rowBreaks\b[\s\S]*?<\/rowBreaks>/)?.[0] ?? "";
    assert.equal(outputBreaks, sourceBreaks);

    const eventSheets = [
      { xml: outputSheetXml, rows: first.diagnostics.officialEventRows },
      ...(await Promise.all(
        first.diagnostics.continuationWorksheetNames.map(async (name) => ({
          xml: await text(outputZip, outputTargets.get(name)!),
          rows: first.diagnostics.continuationEventRows,
        })),
      )),
    ];
    assert.deepEqual(
      reconstructedEvents(eventSheets),
      record.events.map((event) => ({
        time: event.time,
        activity: event.activity,
        initials: event.initials,
      })),
    );

    const drawingPaths = Object.keys(outputZip.files).filter((path) =>
      /^xl\/drawings\/drawing\d+\.xml$/.test(path),
    );
    let embeddedPictures = 0;
    for (const path of drawingPaths)
      embeddedPictures +=
        (await text(outputZip, path)).match(/<xdr:pic>/g)?.length ?? 0;
    assert.equal(
      embeddedPictures,
      first.diagnostics.embeddedSignatureImageCount,
    );
    const signatureMultiplier = config.signatures.length;
    assert.equal(
      first.diagnostics.embeddedSignatureImageCount,
      (3 + first.diagnostics.continuationWorksheetNames.length) *
        signatureMultiplier,
    );
    if (config.sourceSheet === "1_INF") {
      assert.equal(outputZip.file("xl/media/housing-log-officer.png"), null);
      assert.equal(
        (outputSheetXml.match(/Housing Officer Signature:[^<]*N\/A/g) ?? [])
          .length,
        3,
      );
    } else assert.ok(outputZip.file("xl/media/housing-log-officer.png"));

    const immutableParts = [
      "xl/styles.xml",
      "xl/sharedStrings.xml",
      "xl/theme/theme1.xml",
      ...Object.keys(sourceZip.files).filter((path) =>
        /^(xl\/printerSettings\/|xl\/ctrlProps\/|xl\/drawings\/vmlDrawing)/.test(
          path,
        ),
      ),
      ...[...sourceTargets.entries()]
        .filter(([name]) => name !== config.sourceSheet)
        .map(([, path]) => path),
    ];
    for (const path of new Set(immutableParts))
      assert.equal(
        hash(await bytes(outputZip, path)),
        hash(await bytes(sourceZip, path)),
        `${config.sourceSheet} mutated ${path}`,
      );
    assert.equal(hash(await readFile(template.workbookPath)), SOURCE_SHA256);
  });

  test(`${config.sourceSheet} reports explicit contextual overflow errors`, async () => {
    const record = createHousingLogStressRecord(
      config.housingUnit,
      config.shift,
      1,
    );
    record.values["staff.1.name"] = "EXTREMELY-LONG-FAKE-OFFICER-NAME-".repeat(
      30,
    );
    await assert.rejects(
      () => generateExcelHousingLog(record, registry.resolveRecord(record)),
      (error: unknown) =>
        error instanceof HousingLogExcelOverflowError &&
        error.sourceSheet === config.sourceSheet &&
        error.templateVersion === config.templateVersion &&
        error.message.includes(config.sourceSheet),
    );
  });
}

test("2_AH replaces residual source-workbook entries instead of carrying them into a new log", async () => {
  const record = createHousingLogStressRecord("A/H", "2", 1);
  const result = await generateExcelHousingLog(
    record,
    registry.resolveRecord(record),
  );
  const outputZip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
  const targets = worksheetTargets(
    await text(outputZip, "xl/workbook.xml"),
    await text(outputZip, "xl/_rels/workbook.xml.rels"),
  );
  const sheetXml = await text(outputZip, targets.get("2_AH")!);
  assert.equal(
    readInlineCell(sheetXml, "B51"),
    "Security check conducted in all areas of the housing unit by Sergeant / Officer J. Rutherford.",
  );
  assert.equal(readInlineCell(sheetXml, "D41"), "");
});

test("1_AH exports N/A for an intentionally absent staff slot without leaving blanks", async () => {
  const record = createHousingLogStressRecord("A/H", "1", 1);
  const config = getHousingLogConfig(record.housingUnit, record.shift);
  const staffKeys = fieldsForConfig(config)
    .map((item) => item.key)
    .filter((key) => key.startsWith("staff.1."));
  assert.ok(staffKeys.length >= 9);
  for (const key of staffKeys) record.values[key] = "N/A";

  // The canonical validator must accept the deliberately absent slot.
  assert.deepEqual(
    validateHousingLog(record).filter((issue) =>
      issue.path.startsWith("values.staff.1."),
    ),
    [],
  );

  const result = await generateExcelHousingLog(
    record,
    registry.resolveRecord(record),
  );
  // Every canonical staff key must still be written to the workbook (no
  // blanks merely because the UI card was collapsed).
  for (const key of staffKeys)
    assert.ok(
      result.diagnostics.requiredFieldKeysWritten.includes(key),
      `missing write for ${key}`,
    );
  const outputZip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
  const targets = worksheetTargets(
    await text(outputZip, "xl/workbook.xml"),
    await text(outputZip, "xl/_rels/workbook.xml.rels"),
  );
  const sheetXml = await text(outputZip, targets.get("1_AH")!);
  assert.ok(sheetXml.includes("N/A"));
});
