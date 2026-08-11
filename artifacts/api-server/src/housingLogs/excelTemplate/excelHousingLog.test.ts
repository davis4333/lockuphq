import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { fieldsForConfig, getHousingLogConfig } from "@workspace/housing-log";
import { createBUnitStressRecord } from "../documentSpike/stressFixture.ts";
import {
  HousingLogExcelOverflowError,
  generateExcelHousingLog,
  readInlineCell,
} from "./generateExcelHousingLog.ts";
import { bUnitFirstShiftExcelCoverageKeys } from "./bUnitFirstShiftExcelMap.ts";
import {
  HousingLogWorkbookRegistry,
  assertWorkbookTemplateAsset,
  registerOfficialHousingLogWorkbook,
} from "./workbookRegistry.ts";

function registered(): HousingLogWorkbookRegistry {
  return registerOfficialHousingLogWorkbook(new HousingLogWorkbookRegistry());
}

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

const hash = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

function tag(xml: string, name: string): string {
  const match = xml.match(
    new RegExp(`<${name}\\b[\\s\\S]*?</${name}>|<${name}\\b[^>]*/>`),
  );
  assert.ok(match, `missing ${name}`);
  return match[0];
}

function rowStyleFingerprint(xml: string): string[] {
  return [...xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)].flatMap(
    (rowMatch) => {
      const row = rowMatch[1]!.match(/\br="(\d+)"/)?.[1];
      const height = rowMatch[1]!.match(/\bht="([^"]+)"/)?.[1] ?? "default";
      return [
        `row:${row}:height:${height}`,
        ...[...rowMatch[2]!.matchAll(/<c\b([^>]*)/g)].map((cellMatch) => {
          const address = cellMatch[1]!.match(/\br="([^"]+)"/)?.[1];
          const style = cellMatch[1]!.match(/\bs="([^"]+)"/)?.[1] ?? "none";
          return `cell:${address}:style:${style}`;
        }),
      ];
    },
  );
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

function reconstructEvents(
  sheets: readonly { xml: string; rows: readonly number[] }[],
): { time: string; activity: string; initials: string }[] {
  const reconstructed: { time: string; activity: string; initials: string }[] =
    [];
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      const time = readInlineCell(sheet.xml, `A${row}`) ?? "";
      const activity = readInlineCell(sheet.xml, `B${row}`) ?? "";
      const initials = readInlineCell(sheet.xml, `D${row}`) ?? "";
      if (!activity) continue;
      if (time) reconstructed.push({ time, activity, initials });
      else {
        const current = reconstructed.at(-1);
        assert.ok(current, "continuation line has no preceding event");
        current.activity += activity;
      }
    }
  }
  return reconstructed;
}

test("official workbook registry resolves templateVersion plus sourceSheet", async () => {
  const record = createBUnitStressRecord(1);
  const registry = registered();
  const template = registry.resolveRecord(record);
  await assertWorkbookTemplateAsset(template);
  assert.equal(template.templateVersion, "2026-04-27");
  assert.equal(template.sourceSheet, "1_B");
  assert.equal(
    template.workbookPath.endsWith("Housing Unit Logs (REVISED 4.27.26).xlsx"),
    true,
  );

  registry.register("2099-synthetic", "synthetic-second-version.xlsx");
  const syntheticRecord = { ...record, templateVersion: "2099-synthetic" };
  assert.equal(
    registry.resolveRecord(syntheticRecord).workbookPath,
    "synthetic-second-version.xlsx",
  );
  assert.equal(
    registry.resolveRecord(record).workbookPath,
    template.workbookPath,
  );
});

test("B-unit Excel map covers every required Phase 1 field and all security checks", () => {
  const required = fieldsForConfig(getHousingLogConfig("B", "1")).map(
    (field) => field.key,
  );
  const covered = bUnitFirstShiftExcelCoverageKeys();
  assert.deepEqual(
    required.filter((key) => !covered.has(key)),
    [],
  );
  assert.equal(covered.size, required.length);
  for (let number = 1; number <= 17; number += 1)
    for (const part of ["time", "performedBy", "initials"])
      assert.equal(covered.has(`securityChecks.${number}.${part}`), true);
});

test("editable B-unit workbook preserves official structure, embeds signatures, and loses no events", async () => {
  const record = createBUnitStressRecord(72);
  const template = registered().resolveRecord(record);
  const sourceBytes = await readFile(template.workbookPath);
  const sourceZip = await JSZip.loadAsync(sourceBytes, { checkCRC32: true });
  const result = await generateExcelHousingLog(record, template);
  const outputZip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });

  assert.deepEqual(
    result.diagnostics.requiredFieldKeysWritten.sort(),
    fieldsForConfig(getHousingLogConfig("B", "1"))
      .map((field) => field.key)
      .sort(),
  );
  assert.ok(result.diagnostics.continuationWorksheetNames.length >= 2);
  assert.deepEqual(
    result.diagnostics.eventIdsInRenderedOrder,
    record.events.map((event) => event.id),
  );

  const sourceWorkbookXml = await text(sourceZip, "xl/workbook.xml");
  const outputWorkbookXml = await text(outputZip, "xl/workbook.xml");
  const sourceRelationshipsXml = await text(
    sourceZip,
    "xl/_rels/workbook.xml.rels",
  );
  const outputRelationshipsXml = await text(
    outputZip,
    "xl/_rels/workbook.xml.rels",
  );
  const sourceTargets = worksheetTargets(
    sourceWorkbookXml,
    sourceRelationshipsXml,
  );
  const outputTargets = worksheetTargets(
    outputWorkbookXml,
    outputRelationshipsXml,
  );
  assert.equal(sourceTargets.size, 12);
  assert.equal(
    outputTargets.size,
    12 + result.diagnostics.continuationWorksheetNames.length,
  );
  for (const continuationName of result.diagnostics.continuationWorksheetNames)
    assert.ok(outputTargets.has(continuationName));

  const sourceSheetXml = await text(sourceZip, sourceTargets.get("1_B")!);
  const outputSheetXml = await text(outputZip, outputTargets.get("1_B")!);
  const applicationMetadata = await text(outputZip, "docProps/app.xml");
  assert.match(
    applicationMetadata,
    /<vt:lpstr>Worksheets<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>15<\/vt:i4>/,
  );
  assert.match(
    applicationMetadata,
    /<vt:lpstr>Named Ranges<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>15<\/vt:i4>/,
  );
  assert.match(
    applicationMetadata,
    /<TitlesOfParts><vt:vector size="30" baseType="lpstr">/,
  );
  const continuationPrinterTargets = new Set<string>();
  for (const continuationName of result.diagnostics
    .continuationWorksheetNames) {
    const worksheetPath = outputTargets.get(continuationName)!;
    const worksheetIndex = worksheetPath.match(/sheet(\d+)\.xml$/)?.[1];
    assert.ok(worksheetIndex);
    const relationships = await text(
      outputZip,
      `xl/worksheets/_rels/sheet${worksheetIndex}.xml.rels`,
    );
    const printerTarget = relationships.match(
      /Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/printerSettings" Target="([^\"]+)"/,
    )?.[1];
    assert.ok(printerTarget, `${continuationName} has no printer settings`);
    continuationPrinterTargets.add(printerTarget);
    assert.ok(
      outputZip.file(`xl/${printerTarget.replace("../", "")}`),
      `${continuationName} printer settings target is missing`,
    );
  }
  assert.equal(
    continuationPrinterTargets.size,
    result.diagnostics.continuationWorksheetNames.length,
  );
  for (const structuralTag of [
    "cols",
    "mergeCells",
    "pageMargins",
    "pageSetup",
    "headerFooter",
    "rowBreaks",
  ])
    assert.equal(
      tag(outputSheetXml, structuralTag),
      tag(sourceSheetXml, structuralTag),
    );
  assert.deepEqual(
    rowStyleFingerprint(outputSheetXml),
    rowStyleFingerprint(sourceSheetXml),
  );
  assert.match(
    outputWorkbookXml,
    /<definedName name="_xlnm.Print_Area" localSheetId="1">'1_B'!\$A\$1:\$D\$149<\/definedName>/,
  );
  for (const continuationName of result.diagnostics.continuationWorksheetNames)
    assert.match(
      outputWorkbookXml,
      new RegExp(
        `${continuationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:'|&apos;)!\\$A\\$1:\\$D\\$50`,
      ),
    );

  assert.equal(readInlineCell(outputSheetXml, "A4"), "19:00 / 19:05");
  assert.match(
    readInlineCell(outputSheetXml, "B4") ?? "",
    /Alexandra Montgomery/,
  );
  assert.match(readInlineCell(outputSheetXml, "B14") ?? "", /K101.*K108/);
  assert.match(
    readInlineCell(outputSheetXml, "B37") ?? "",
    /Recall time .*Count time .*Count clear/,
  );
  assert.match(readInlineCell(outputSheetXml, "B54") ?? "", /Pre-turmout/);
  assert.match(readInlineCell(outputSheetXml, "B70") ?? "", /J\. Rutherford/);
  assert.equal(readInlineCell(outputSheetXml, "D86"), "JR");

  const eventSheets = [
    { xml: outputSheetXml, rows: OFFICIAL_ROWS_FOR_TEST },
    ...(await Promise.all(
      result.diagnostics.continuationWorksheetNames.map(async (name) => ({
        xml: await text(outputZip, outputTargets.get(name)!),
        rows: CONTINUATION_ROWS_FOR_TEST,
      })),
    )),
  ];
  assert.deepEqual(
    reconstructEvents(eventSheets),
    record.events.map((event) => ({
      time: event.time,
      activity: event.activity,
      initials: event.initials,
    })),
  );

  assert.equal(
    hash(await bytes(outputZip, "xl/media/housing-log-supervisor.png")),
    hash(
      Buffer.from(
        record.signatures.housingSupervisor!.split(",")[1]!,
        "base64",
      ),
    ),
  );
  assert.equal(
    hash(await bytes(outputZip, "xl/media/housing-log-officer.png")),
    hash(
      Buffer.from(record.signatures.housingOfficer!.split(",")[1]!, "base64"),
    ),
  );
  const drawings = Object.keys(outputZip.files).filter((name) =>
    /^xl\/drawings\/drawing\d+\.xml$/.test(name),
  );
  let signatureAnchorCount = 0;
  for (const drawing of drawings)
    signatureAnchorCount +=
      (await text(outputZip, drawing)).match(/<xdr:pic>/g)?.length ?? 0;
  assert.equal(
    signatureAnchorCount,
    result.diagnostics.embeddedSignatureImageCount,
  );

  for (const immutablePart of [
    "xl/styles.xml",
    "xl/sharedStrings.xml",
    "xl/theme/theme1.xml",
    ...Array.from(
      { length: 12 },
      (_, index) => `xl/printerSettings/printerSettings${index + 1}.bin`,
    ),
    ...[...sourceTargets.values()].filter(
      (path) => path !== sourceTargets.get("1_B"),
    ),
  ])
    assert.equal(
      hash(await bytes(outputZip, immutablePart)),
      hash(await bytes(sourceZip, immutablePart)),
      `${immutablePart} changed`,
    );

  assert.equal(hash(await readFile(template.workbookPath)), hash(sourceBytes));
});

test("unprintably long official-cell values fail explicitly instead of truncating", async () => {
  const record = createBUnitStressRecord(1);
  record.values["staff.1.name"] = "EXTREMELY-LONG-FAKE-OFFICER-NAME-".repeat(
    20,
  );
  await assert.rejects(
    () => generateExcelHousingLog(record, registered().resolveRecord(record)),
    HousingLogExcelOverflowError,
  );
});

const OFFICIAL_ROWS_FOR_TEST = [
  ...Array.from({ length: 6 }, (_, index) => 91 + index),
  ...Array.from({ length: 45 }, (_, index) => 102 + index),
];
const CONTINUATION_ROWS_FOR_TEST = Array.from(
  { length: 45 },
  (_, index) => 3 + index,
);
