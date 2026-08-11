import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { generateDocxFirstSpike } from "./docxFirst.ts";
import { generatePdfOverlaySpike } from "./pdfOverlay.ts";
import { createBUnitStressRecord } from "./stressFixture.ts";
import {
  HousingLogTemplateRegistry,
  assertTemplateAssets,
  registerBUnitSpikeTemplate,
} from "./templateRegistry.ts";

const assetRoot = path.resolve("assets", "housing-logs");
const evidenceRoot = path.resolve("phase2a-evidence");
const registry = registerBUnitSpikeTemplate(
  new HousingLogTemplateRegistry(),
  assetRoot,
);
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
        conversion: "Measured separately because canonical PDF requires an external Office/LibreOffice process.",
      },
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
