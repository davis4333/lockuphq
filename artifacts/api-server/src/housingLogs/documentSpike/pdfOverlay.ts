import { readFile } from "node:fs/promises";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { getHousingLogConfig } from "@workspace/housing-log";
import { fitSingleLine, paginateEvents, EVENT_FONT_SIZE } from "./textLayout.ts";
import type {
  EventLine,
  HousingLogDocumentDiagnostics,
  HousingLogDocumentRecord,
  ResolvedHousingLogTemplate,
  SignaturePlacementDiagnostic,
} from "./types.ts";

type Placement = {
  key: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  value: (record: HousingLogDocumentRecord) => string;
};

const value = (key: string) => (record: HousingLogDocumentRecord): string =>
  String(record.values[key] ?? "").trim();

const fixed = (
  key: string,
  pageIndex: number,
  x: number,
  y: number,
  width: number,
): Placement => ({ key, pageIndex, x, y, width, value: value(key) });

const countPlacements = (
  countKey: string,
  pageIndex: number,
  timeY: number,
  countY: number,
  timeXs: [number, number, number],
): Placement[] => [
  fixed(`counts.${countKey}.recallTime`, pageIndex, timeXs[0], timeY, 23),
  fixed(`counts.${countKey}.countTime`, pageIndex, timeXs[1], timeY, 23),
  fixed(`counts.${countKey}.clearTime`, pageIndex, timeXs[2], timeY, 23),
  fixed(`counts.${countKey}.components.Wing One`, pageIndex, 116, countY, 23),
  fixed(`counts.${countKey}.components.Wing Two`, pageIndex, 183, countY, 23),
  fixed(`counts.${countKey}.components.Wing Three`, pageIndex, 254, countY, 23),
  fixed(`counts.${countKey}.total`, pageIndex, 300, countY, 23),
];

const bUnitFirstShiftPlacements: Placement[] = [
  { key: "logDate", pageIndex: 0, x: 456, y: 893, width: 96, value: (r) => r.logDate },
  ...[1, 2, 3].flatMap((staff, index) => {
    const staffY = 842.2 - index * 32.9;
    const issuedY = 825.8 - index * 32.9;
    return [
      fixed(`staff.${staff}.name`, 0, staff === 1 ? 111 : 105, staffY, 73),
      fixed(`staff.${staff}.keyRing`, 0, staff === 1 ? 359 : 354, staffY, 25),
      fixed(`staff.${staff}.radio`, 0, staff === 1 ? 411 : 406, staffY, 25),
      fixed(`staff.${staff}.chemicalAgent`, 0, 160, issuedY, 23),
      fixed(`staff.${staff}.chemicalAgentSeal`, 0, 202, issuedY, 36),
      fixed(`staff.${staff}.bodyAlarm`, 0, 285, issuedY, 23),
      fixed(`staff.${staff}.cuffsCase`, 0, 361, issuedY, 23),
    ];
  }),
  fixed("counts.beginning.components.Wing One", 0, 206, 694.3, 23),
  fixed("counts.beginning.components.Wing Two", 0, 273, 694.3, 23),
  fixed("counts.beginning.components.Wing Three", 0, 344, 694.3, 23),
  fixed("counts.beginning.total", 0, 390, 694.3, 23),
  ...Array.from({ length: 8 }, (_, index) =>
    fixed(`equipment.acceptedKeyRings.${index + 1}`, 0, 235 + index * 25.1, 677.8, 23),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    fixed(`equipment.radios.${index + 1}`, 0, 305 + index * 25.1, 661.3, 23),
  ),
  fixed("equipment.cellExtraction", 0, 361, 628.5, 118),
  fixed("equipment.radioChargingStation", 0, 161, 612, 23),
  fixed("equipment.extraBatteries", 0, 205, 612, 14),
  fixed("equipment.inspectionMirror", 0, 342, 612, 25),
  fixed("equipment.cellUnlockingBars", 0, 369, 612, 23),
  fixed("equipment.ligatureCutterSeal", 0, 213, 595.6, 38),
  ...Array.from({ length: 3 }, (_, index) =>
    fixed(`equipment.bodyAlarms.${index + 1}`, 0, 302 + index * 25.1, 595.6, 23),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    fixed(`equipment.cuffs.${index + 1}`, 0, 402 + index * 25.1, 595.6, 23),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    fixed(`equipment.cuffCases.${index + 1}`, 0, 117 + index * 25.1, 579.1, 23),
  ),
  fixed("equipment.legRestraints", 0, 247, 579.1, 23),
  fixed("equipment.backboards", 0, 288, 579.1, 14),
  fixed("equipment.firstAidSeal", 0, 258, 529.8, 38),
  fixed("medication.inventoriedBy", 0, 305, 464, 73),
  fixed("medication.acetaminophen", 0, 136, 447.6, 23),
  fixed("medication.alamag", 0, 193, 447.6, 23),
  fixed("medication.ibuprofen", 0, 256, 447.6, 23),
  ...countPlacements("midnight", 0, 299.6, 283.2, [212, 280, 350]),
  ...countPlacements("early-morning", 0, 201, 184.5, [231, 299, 368]),
  { key: "logDate.page2", pageIndex: 1, x: 456, y: 893, width: 96, value: (r) => r.logDate },
  ...countPlacements("pre-turnout", 1, 841.2, 824.5, [212, 280, 350]),
  ...countPlacements("morning", 1, 741.1, 724.5, [212, 280, 350]),
  { key: "logDate.page3", pageIndex: 2, x: 456, y: 893, width: 96, value: (r) => r.logDate },
];

function drawFittedPlacement(
  page: PDFPage,
  font: PDFFont,
  placement: Placement,
  record: HousingLogDocumentRecord,
): void {
  const text = placement.value(record);
  if (!text) return;
  const size = fitSingleLine(font, placement.key, text, placement.width);
  page.drawRectangle({
    x: placement.x - 1,
    y: placement.y - 1,
    width: placement.width + 2,
    height: size + 2,
    color: rgb(1, 1, 1),
  });
  page.drawText(text, {
    x: placement.x,
    y: placement.y,
    size,
    font,
    color: rgb(0.02, 0.02, 0.02),
  });
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const marker = "data:image/png;base64,";
  if (!dataUrl.startsWith(marker))
    throw new Error("Housing Log signatures must be PNG data URLs.");
  return Buffer.from(dataUrl.slice(marker.length), "base64");
}

function fitImage(image: PDFImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

async function drawSignatures(
  pdf: PDFDocument,
  record: HousingLogDocumentRecord,
  pageIndexes: number[],
): Promise<SignaturePlacementDiagnostic[]> {
  const diagnostics: SignaturePlacementDiagnostic[] = [];
  const definitions = [
    { key: "housingSupervisor" as const, y: 108 },
    { key: "housingOfficer" as const, y: 92 },
  ];
  for (const definition of definitions) {
    const raw = record.signatures[definition.key];
    if (!raw) continue;
    const image = await pdf.embedPng(dataUrlBytes(raw));
    for (const pageIndex of pageIndexes) {
      const page = pdf.getPage(pageIndex);
      const box = fitImage(image, 155, 13);
      page.drawImage(image, {
        x: 150,
        y: definition.y,
        width: box.width,
        height: box.height,
      });
      diagnostics.push({
        pageIndex,
        signatureKey: definition.key,
        sourceAspectRatio: image.width / image.height,
        renderedAspectRatio: box.width / box.height,
      });
    }
  }
  return diagnostics;
}

const officialEventPosition = (pageIndex: number, row: number) =>
  pageIndex === 1
    ? { y: 228 - row * 16.68 }
    : { y: 861 - row * 16.68 };

function drawEventLine(
  page: PDFPage,
  font: PDFFont,
  line: EventLine,
  y: number,
): void {
  page.drawText(line.time, { x: 24, y, size: EVENT_FONT_SIZE, font });
  page.drawText(line.activity, { x: 76, y, size: EVENT_FONT_SIZE, font });
  page.drawText(line.initials, { x: 522, y, size: EVENT_FONT_SIZE, font });
}

function drawContinuationPage(
  pdf: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  record: HousingLogDocumentRecord,
): PDFPage {
  const page = pdf.addPage([612, 1008]);
  page.drawText("FLORIDA DEPARTMENT OF CORRECTIONS", {
    x: 169,
    y: 968,
    size: 11,
    font: bold,
  });
  page.drawText("HOUSING UNIT LOG - CONTINUATION", {
    x: 190,
    y: 951,
    size: 10,
    font: bold,
  });
  page.drawText(`HOUSING UNIT  ${record.housingUnit}`, { x: 20, y: 923, size: 8, font: bold });
  page.drawText(`Shift ${record.shift}`, { x: 160, y: 923, size: 8, font });
  page.drawText(`DATE  ${record.logDate}`, { x: 452, y: 923, size: 8, font: bold });
  const left = 18;
  const timeRight = 73;
  const activityRight = 515;
  const right = 574;
  const top = 912;
  const headerBottom = 894;
  const bottom = 110;
  for (const x of [left, timeRight, activityRight, right])
    page.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: 0.7 });
  page.drawLine({ start: { x: left, y: top }, end: { x: right, y: top }, thickness: 0.7 });
  page.drawLine({ start: { x: left, y: headerBottom }, end: { x: right, y: headerBottom }, thickness: 0.7 });
  for (let row = 1; row <= 42; row += 1) {
    const y = headerBottom - row * (784 / 42);
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.45 });
  }
  page.drawText("TIME", { x: 36, y: 899, size: 8, font: bold });
  page.drawText("LOG OF EVENTS / ACTIVITY", { x: 239, y: 899, size: 8, font: bold });
  page.drawText("INITIALS", { x: 524, y: 899, size: 8, font: bold });
  page.drawText(`Continued finalized Housing Log ${record.id}`, { x: 20, y: 22, size: 6, font });
  return page;
}

export async function generatePdfOverlaySpike(
  record: HousingLogDocumentRecord,
  template: ResolvedHousingLogTemplate,
): Promise<{ bytes: Uint8Array; diagnostics: HousingLogDocumentDiagnostics }> {
  const started = performance.now();
  if (record.status !== "finalized")
    throw new Error("Only finalized Housing Logs can be rendered.");
  const config = getHousingLogConfig(record.housingUnit, record.shift);
  if (config.sourceSheet !== template.sourceSheet)
    throw new Error("The Housing Log record does not match the resolved source sheet.");
  if (record.templateVersion !== template.templateVersion)
    throw new Error("The Housing Log record does not match the resolved template version.");

  const pdf = await PDFDocument.load(await readFile(template.pdfPath));
  if (pdf.getPageCount() !== 3)
    throw new Error("The B-unit spike template must contain exactly three official pages.");
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  for (const placement of bUnitFirstShiftPlacements)
    drawFittedPlacement(pdf.getPage(placement.pageIndex), font, placement, record);

  const eventPages = paginateEvents(record, font);
  for (const eventPage of eventPages) {
    const page =
      eventPage.kind === "official"
        ? pdf.getPage(eventPage.pageIndex)
        : drawContinuationPage(pdf, font, bold, record);
    eventPage.lines.forEach((line, row) => {
      const y =
        eventPage.kind === "official"
          ? officialEventPosition(eventPage.pageIndex, row).y
          : 880 - row * (784 / 42);
      drawEventLine(page, font, line, y);
    });
  }

  const signaturePlacements = await drawSignatures(pdf, record, [0, 1, 2]);
  const bytes = await pdf.save({ useObjectStreams: false });
  const eventIdsInRenderedOrder = eventPages.flatMap((page) =>
    page.lines.filter((line) => !line.continuation).map((line) => line.eventId),
  );
  return {
    bytes,
    diagnostics: {
      strategy: "pdf-overlay",
      template: {
        templateVersion: template.templateVersion,
        sourceSheet: template.sourceSheet,
      },
      officialPageCount: 3,
      continuationPageCount: pdf.getPageCount() - 3,
      totalPageCount: pdf.getPageCount(),
      eventIdsInRenderedOrder,
      signaturePlacements,
      generationMilliseconds: performance.now() - started,
    },
  };
}
