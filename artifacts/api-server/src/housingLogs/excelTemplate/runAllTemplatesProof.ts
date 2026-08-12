import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fieldsForConfig, housingLogConfigs } from "@workspace/housing-log";
import JSZip from "jszip";
import { createHousingLogStressRecord } from "../documentSpike/stressFixture.ts";
import { generateExcelHousingLog } from "./generateExcelHousingLog.ts";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "./workbookRegistry.ts";

const evidenceRoot = fileURLToPath(
  new URL("../../../phase2b-excel-verification/", import.meta.url),
);
const registry = registerOfficialHousingLogWorkbook(
  new HousingLogWorkbookRegistry(),
);
const configs = housingLogConfigs.filter(
  (config, index, all) =>
    all.findIndex(
      (candidate) => candidate.sourceSheet === config.sourceSheet,
    ) === index,
);
const sha256 = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

await mkdir(evidenceRoot, { recursive: true });
const manifestEntries = [];
for (const config of configs) {
  const record = createHousingLogStressRecord(
    config.housingUnit,
    config.shift,
    72,
  );
  const template = registry.resolveRecord(record);
  const first = await generateExcelHousingLog(record, template);
  const second = await generateExcelHousingLog(record, template);
  if (!first.bytes.equals(second.bytes))
    throw new Error(`${config.sourceSheet} output is not byte deterministic.`);
  await JSZip.loadAsync(first.bytes, { checkCRC32: true });
  const fileName = `${config.sourceSheet}-editable-fake.xlsx`;
  await writeFile(`${evidenceRoot}${fileName}`, first.bytes);
  manifestEntries.push({
    sourceSheet: config.sourceSheet,
    representativeHousingUnit: config.housingUnit,
    shift: config.shift,
    templateVersion: config.templateVersion,
    fileName,
    outputSha256: sha256(first.bytes),
    semanticFingerprint: first.diagnostics.semanticFingerprint,
    byteDeterministicAcrossRepeatedGeneration: true,
    requiredFieldCount: fieldsForConfig(config).length,
    mappedFieldCount: first.diagnostics.requiredFieldKeysWritten.length,
    securityCheckCount: config.securityCheckCount,
    officialEventCapacity: first.diagnostics.officialEventCapacity,
    continuationEventCapacity: first.diagnostics.continuationEventCapacity,
    eventCount: record.events.length,
    eventLineCount: first.diagnostics.eventLineCount,
    continuationWorksheetCount:
      first.diagnostics.continuationWorksheetNames.length,
    signatureRequirementCount: config.signatures.length,
    embeddedSignatureCount: first.diagnostics.embeddedSignatureImageCount,
  });
}

const sourcePath = registry.resolveRecord(
  createHousingLogStressRecord("B", "1", 1),
).workbookPath;
const manifest = {
  fakeDataOnly: true,
  strategy: "JSZip narrow OOXML mutation",
  sourceWorkbookSha256: sha256(await readFile(sourcePath)),
  outputCount: manifestEntries.length,
  allOutputsByteDeterministic: manifestEntries.every(
    (entry) => entry.byteDeterministicAcrossRepeatedGeneration,
  ),
  entries: manifestEntries,
};
await writeFile(
  `${evidenceRoot}verification-manifest.json`,
  JSON.stringify(manifest, null, 2),
);
process.stdout.write(JSON.stringify(manifest, null, 2));
