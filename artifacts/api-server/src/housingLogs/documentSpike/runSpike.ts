import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { fieldsForConfig, getHousingLogConfig } from "@workspace/housing-log";
import { bUnitFirstShiftCoverageKeys } from "./bUnitFirstShiftLayout.ts";
import { generateDocxFirstSpike } from "./docxFirst.ts";
import { generatePdfOverlaySpike } from "./pdfOverlay.ts";
import { createBUnitStressRecord } from "./stressFixture.ts";
import {
  HousingLogTemplateRegistry,
  assertTemplateAssets,
  registerBUnitSpikeTemplate,
} from "./templateRegistry.ts";

const evidenceRoot = fileURLToPath(
  new URL("../../../phase2a-evidence/", import.meta.url),
);
const registry = registerBUnitSpikeTemplate(new HousingLogTemplateRegistry());
const record = createBUnitStressRecord(72);
const template = registry.resolveRecord(record);
await assertTemplateAssets(template);
await mkdir(evidenceRoot, { recursive: true });

const pdfTimes: number[] = [];
const docxTimes: number[] = [];
let pdfResult = await generatePdfOverlaySpike(record, template);
let docxResult = await generateDocxFirstSpike(record, template);
for (let index = 0; index < 5; index += 1) {
  pdfResult = await generatePdfOverlaySpike(record, template);
  docxResult = await generateDocxFirstSpike(record, template);
  pdfTimes.push(pdfResult.diagnostics.generationMilliseconds);
  docxTimes.push(docxResult.diagnostics.generationMilliseconds);
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
await writeFile(
  path.join(evidenceRoot, "housing-log-pdf-overlay.pdf"),
  pdfResult.bytes,
);
await writeFile(
  path.join(evidenceRoot, "housing-log-docx-first.docx"),
  docxResult.bytes,
);
await writeFile(
  path.join(evidenceRoot, "spike-measurements.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      fixture: {
        fakeDataOnly: true,
        sourceSheet: template.sourceSheet,
        templateVersion: template.templateVersion,
        eventCount: record.events.length,
      },
      pdfOverlay: {
        samplesMilliseconds: pdfTimes,
        medianMilliseconds: median(pdfTimes),
        diagnostics: pdfResult.diagnostics,
      },
      docxFirst: {
        samplesMilliseconds: docxTimes,
        medianMilliseconds: median(docxTimes),
        diagnostics: docxResult.diagnostics,
        conversion:
          "Measured separately because canonical PDF requires an external Office/LibreOffice process.",
      },
    },
    null,
    2,
  ),
);
const requiredKeys = fieldsForConfig(getHousingLogConfig("B", "1")).map(
  (field) => field.key,
);
const coverageKeys = bUnitFirstShiftCoverageKeys();
await writeFile(
  path.join(evidenceRoot, "b-unit-layout-qa.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceSheet: template.sourceSheet,
      templateVersion: template.templateVersion,
      requiredPhase1FieldCount: requiredKeys.length,
      mappedRequiredFieldCount: requiredKeys.filter((key) =>
        coverageKeys.has(key),
      ).length,
      missingRequiredFields: requiredKeys.filter(
        (key) => !coverageKeys.has(key),
      ),
      securityCheckRowsMapped: Array.from(
        { length: 17 },
        (_, index) => index + 1,
      ).filter((number) =>
        ["time", "performedBy", "initials"].every((part) =>
          coverageKeys.has(`securityChecks.${number}.${part}`),
        ),
      ).length,
      layoutViolations: pdfResult.diagnostics.layoutViolations ?? [],
      signaturePlacements: pdfResult.diagnostics.signaturePlacements,
    },
    null,
    2,
  ),
);
process.stdout.write(
  JSON.stringify(
    {
      evidenceRoot,
      pdfMedianMs: median(pdfTimes),
      docxMedianMs: median(docxTimes),
      pages: pdfResult.diagnostics.totalPageCount,
    },
    null,
    2,
  ),
);
