import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { generateDocxFirstSpike } from "./docxFirst.ts";
import { generatePdfOverlaySpike } from "./pdfOverlay.ts";
import { createBUnitStressRecord } from "./stressFixture.ts";
import {
  HousingLogTemplateRegistry,
  registerBUnitSpikeTemplate,
} from "./templateRegistry.ts";
import { paginateEvents } from "./textLayout.ts";
import { HousingLogDocumentOverflowError } from "./types.ts";

const assetRoot = path.resolve("assets", "housing-logs");

function registered() {
  return registerBUnitSpikeTemplate(
    new HousingLogTemplateRegistry(),
    assetRoot,
  );
}

test("template resolution is keyed by templateVersion plus sourceSheet", () => {
  const registry = registered();
  const official = registry.resolve({
    templateVersion: "2026-04-27",
    sourceSheet: "1_B",
  });
  registry.register({
    templateVersion: "2099-synthetic",
    sourceSheet: "1_B",
    pdfPath: "synthetic-second-version.pdf",
    docxBackgroundPaths: ["synthetic-1.png", "synthetic-2.png", "synthetic-3.png"],
  });
  const synthetic = registry.resolve({
    templateVersion: "2099-synthetic",
    sourceSheet: "1_B",
  });
  const oldFinalizedRecord = createBUnitStressRecord(1);
  assert.equal(registry.resolveRecord(oldFinalizedRecord), official);
  assert.equal(official.pdfPath.endsWith(path.join("2026-04-27", "1_B.pdf")), true);
  assert.equal(synthetic.pdfPath, "synthetic-second-version.pdf");
  assert.notEqual(official.pdfPath, synthetic.pdfPath);
});

test("PDF overlay preserves three official pages and adds continuation pages without reordering events", async () => {
  const record = createBUnitStressRecord(72);
  const result = await generatePdfOverlaySpike(record, registered().resolveRecord(record));
  const pdf = await PDFDocument.load(result.bytes);
  assert.equal(result.diagnostics.officialPageCount, 3);
  assert.ok(result.diagnostics.continuationPageCount >= 2);
  assert.equal(pdf.getPageCount(), result.diagnostics.totalPageCount);
  for (const page of pdf.getPages()) {
    assert.equal(page.getWidth(), 612);
    assert.equal(page.getHeight(), 1008);
  }
  assert.deepEqual(
    result.diagnostics.eventIdsInRenderedOrder,
    record.events.map((event) => event.id),
  );
  assert.equal(
    result.diagnostics.signaturePlacements.length,
    result.diagnostics.officialPageCount * 2,
  );
  for (const placement of result.diagnostics.signaturePlacements)
    assert.ok(
      Math.abs(placement.sourceAspectRatio - placement.renderedAspectRatio) < 0.0001,
    );
});

test("event pagination wraps every character and supports an event longer than one page", async () => {
  const metricPdf = await PDFDocument.create();
  const font = await metricPdf.embedFont(StandardFonts.TimesRoman);
  const record = createBUnitStressRecord(1);
  const original = `START ${"FAKE-DETAILED-OBSERVATION ".repeat(900)} END`;
  record.events[0]!.activity = original;
  const pages = paginateEvents(record, font);
  assert.ok(pages.length > 1);
  const reconstructed = pages
    .flatMap((page) => page.lines)
    .map((line) => line.activity.replace(/^\(continued\) /, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(reconstructed, original.replace(/\s+/g, " ").trim());
});

test("a value that cannot fit the printed blank fails instead of truncating", async () => {
  const record = createBUnitStressRecord(1);
  record.values["staff.1.name"] = "EXTREMELY-LONG-FAKE-OFFICER-NAME-".repeat(20);
  await assert.rejects(
    () => generatePdfOverlaySpike(record, registered().resolveRecord(record)),
    HousingLogDocumentOverflowError,
  );
});

test("DOCX-first produces a Word package with the same event order and continuation count", async () => {
  const record = createBUnitStressRecord(72);
  const result = await generateDocxFirstSpike(record, registered().resolveRecord(record));
  assert.equal(result.bytes.subarray(0, 2).toString("ascii"), "PK");
  assert.equal(result.diagnostics.officialPageCount, 3);
  assert.ok(result.diagnostics.continuationPageCount >= 2);
  assert.deepEqual(
    result.diagnostics.eventIdsInRenderedOrder,
    record.events.map((event) => event.id),
  );
  for (const placement of result.diagnostics.signaturePlacements)
    assert.ok(
      Math.abs(placement.sourceAspectRatio - placement.renderedAspectRatio) < 0.001,
    );
});
