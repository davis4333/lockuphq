import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { fieldsForConfig, getHousingLogConfig } from "@workspace/housing-log";
import { createBUnitStressRecord } from "../documentSpike/stressFixture.ts";
import { bUnitFirstShiftExcelCoverageKeys } from "./bUnitFirstShiftExcelMap.ts";
import {
  generateExcelHousingLog,
  readInlineCell,
} from "./generateExcelHousingLog.ts";
import {
  HousingLogWorkbookRegistry,
  assertWorkbookTemplateAsset,
  registerOfficialHousingLogWorkbook,
} from "./workbookRegistry.ts";

const evidenceRoot = fileURLToPath(
  new URL("../../../phase2a-excel-evidence/", import.meta.url),
);
const registry = registerOfficialHousingLogWorkbook(
  new HousingLogWorkbookRegistry(),
);
const record = createBUnitStressRecord(72);
const template = registry.resolveRecord(record);
await assertWorkbookTemplateAsset(template);
await mkdir(evidenceRoot, { recursive: true });

const samples: number[] = [];
let result = await generateExcelHousingLog(record, template);
for (let index = 0; index < 5; index += 1) {
  result = await generateExcelHousingLog(record, template);
  samples.push(result.diagnostics.generationMilliseconds);
}
const median = [...samples].sort((left, right) => left - right)[
  Math.floor(samples.length / 2)
]!;
const workbookPath = `${evidenceRoot}housing-log-b-unit-editable.xlsx`;
await writeFile(workbookPath, result.bytes);

const outputZip = await JSZip.loadAsync(result.bytes, { checkCRC32: true });
const workbookXml = await outputZip.file("xl/workbook.xml")!.async("string");
const worksheetRelationship = workbookXml.match(
  /<sheet\b[^>]*name="1_B"[^>]*r:id="([^"]+)"/,
)?.[1];
const workbookRelationships = await outputZip
  .file("xl/_rels/workbook.xml.rels")!
  .async("string");
const worksheetTarget = workbookRelationships.match(
  new RegExp(
    `<Relationship\\b[^>]*Id="${worksheetRelationship}"[^>]*Target="([^"]+)"`,
  ),
)?.[1];
if (!worksheetTarget) throw new Error("Generated workbook is missing 1_B.");
const worksheetXml = await outputZip
  .file(`xl/${worksheetTarget}`)!
  .async("string");
const requiredFields = fieldsForConfig(getHousingLogConfig("B", "1")).map(
  (field) => field.key,
);
const sourceBytes = await readFile(template.workbookPath);
const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

await writeFile(
  `${evidenceRoot}excel-proof-qa.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      fakeDataOnly: true,
      templateVersion: template.templateVersion,
      sourceSheet: template.sourceSheet,
      sourceWorkbookSha256: sha256(sourceBytes),
      outputWorkbookSha256: sha256(result.bytes),
      requiredPhase1FieldCount: requiredFields.length,
      mappedRequiredFieldCount: requiredFields.filter((key) =>
        bUnitFirstShiftExcelCoverageKeys().has(key),
      ).length,
      missingRequiredFields: requiredFields.filter(
        (key) => !bUnitFirstShiftExcelCoverageKeys().has(key),
      ),
      securityCheckRowsMapped: 17,
      officialWorksheetPages: 3,
      continuationWorksheetCount:
        result.diagnostics.continuationWorksheetNames.length,
      continuationWorksheetNames: result.diagnostics.continuationWorksheetNames,
      eventCount: record.events.length,
      eventLineCount: result.diagnostics.eventLineCount,
      embeddedSignatureImageCount:
        result.diagnostics.embeddedSignatureImageCount,
      generationSamplesMilliseconds: samples,
      medianGenerationMilliseconds: median,
      editableCellSamples: {
        staffDutyWindow: readInlineCell(worksheetXml, "A4"),
        staffAndEquipment: readInlineCell(worksheetXml, "B4"),
        formalCount: readInlineCell(worksheetXml, "B54"),
        securityCheck17: readInlineCell(worksheetXml, "B86"),
      },
      packageEntryCount: Object.keys(outputZip.files).length,
      crcReloadPassed: true,
      diagnostics: result.diagnostics,
    },
    null,
    2,
  ),
);

process.stdout.write(
  JSON.stringify(
    {
      workbookPath,
      sourceWorkbookSha256: sha256(sourceBytes),
      outputWorkbookSha256: sha256(result.bytes),
      medianGenerationMilliseconds: median,
      continuationWorksheets:
        result.diagnostics.continuationWorksheetNames.length,
      embeddedSignatures: result.diagnostics.embeddedSignatureImageCount,
    },
    null,
    2,
  ),
);
