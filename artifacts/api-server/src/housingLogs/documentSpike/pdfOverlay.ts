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
import { paginateEvents, EVENT_FONT_SIZE } from "./textLayout.ts";
import {
  B_UNIT_FIRST_SHIFT_PLACEMENTS,
  findBUnitLayoutViolations,
  measureBUnitFirstShiftPlacements,
  type MeasuredPlacement,
} from "./bUnitFirstShiftLayout.ts";
import type {
  EventLine,
  HousingLogDocumentDiagnostics,
  HousingLogDocumentRecord,
  ResolvedHousingLogTemplate,
  SignaturePlacementDiagnostic,
} from "./types.ts";

function drawFittedPlacement(
  page: PDFPage,
  font: PDFFont,
  placement: MeasuredPlacement,
): void {
  if (placement.erase) {
    page.drawRectangle({
      x: placement.safeBox.x0 + 0.25,
      y: placement.safeBox.y0 + 0.25,
      width: placement.safeBox.x1 - placement.safeBox.x0 - 0.5,
      height: placement.safeBox.y1 - placement.safeBox.y0 - 0.5,
      color: rgb(1, 1, 1),
    });
  }
  page.drawText(placement.text, {
    x: placement.x,
    y: placement.y,
    size: placement.fontSize,
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
  // Independently measured from each physical page of the official 1_B PDF.
  // The three pages do not share the same signature-row coordinates.
  const definitions = {
    0: { housingSupervisor: 118.5, housingOfficer: 102 },
    1: { housingSupervisor: 123.5, housingOfficer: 107 },
    2: { housingSupervisor: 115.5, housingOfficer: 101 },
  } as const;
  for (const signatureKey of ["housingSupervisor", "housingOfficer"] as const) {
    const raw = record.signatures[signatureKey];
    if (!raw) continue;
    const image = await pdf.embedPng(dataUrlBytes(raw));
    for (const pageIndex of pageIndexes) {
      const y =
        definitions[pageIndex as keyof typeof definitions]?.[signatureKey];
      if (y === undefined)
        throw new Error(
          `No measured signature position exists for page ${pageIndex + 1}.`,
        );
      const page = pdf.getPage(pageIndex);
      const box = fitImage(image, 155, 12);
      const x = 172;
      page.drawImage(image, {
        x,
        y,
        width: box.width,
        height: box.height,
      });
      diagnostics.push({
        pageIndex,
        signatureKey,
        sourceAspectRatio: image.width / image.height,
        renderedAspectRatio: box.width / box.height,
        x,
        y,
        width: box.width,
        height: box.height,
      });
    }
  }
  return diagnostics;
}

const officialEventPosition = (pageIndex: number, row: number) =>
  pageIndex === 1 ? { y: 228 - row * 16.68 } : { y: 861 - row * 16.68 };

function drawEventLine(
  page: PDFPage,
  font: PDFFont,
  line: EventLine,
  y: number,
  continuation: boolean,
): void {
  page.drawText(line.time, { x: 24, y, size: EVENT_FONT_SIZE, font });
  page.drawText(line.activity, { x: 76, y, size: EVENT_FONT_SIZE, font });
  page.drawText(line.initials, {
    x: continuation ? 522 : 540,
    y,
    size: EVENT_FONT_SIZE,
    font,
  });
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
  page.drawText(`HOUSING UNIT  ${record.housingUnit}`, {
    x: 20,
    y: 923,
    size: 8,
    font: bold,
  });
  page.drawText(`Shift ${record.shift}`, { x: 160, y: 923, size: 8, font });
  page.drawText(`DATE  ${record.logDate}`, {
    x: 452,
    y: 923,
    size: 8,
    font: bold,
  });
  const left = 18;
  const timeRight = 73;
  const activityRight = 515;
  const right = 574;
  const top = 912;
  const headerBottom = 894;
  const bottom = 110;
  for (const x of [left, timeRight, activityRight, right])
    page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      thickness: 0.7,
    });
  page.drawLine({
    start: { x: left, y: top },
    end: { x: right, y: top },
    thickness: 0.7,
  });
  page.drawLine({
    start: { x: left, y: headerBottom },
    end: { x: right, y: headerBottom },
    thickness: 0.7,
  });
  for (let row = 1; row <= 42; row += 1) {
    const y = headerBottom - row * (784 / 42);
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.45,
    });
  }
  page.drawText("TIME", { x: 36, y: 899, size: 8, font: bold });
  page.drawText("LOG OF EVENTS / ACTIVITY", {
    x: 239,
    y: 899,
    size: 8,
    font: bold,
  });
  page.drawText("INITIALS", { x: 524, y: 899, size: 8, font: bold });
  page.drawText(`Continued finalized Housing Log ${record.id}`, {
    x: 20,
    y: 22,
    size: 6,
    font,
  });
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
    throw new Error(
      "The Housing Log record does not match the resolved source sheet.",
    );
  if (record.templateVersion !== template.templateVersion)
    throw new Error(
      "The Housing Log record does not match the resolved template version.",
    );

  const pdf = await PDFDocument.load(await readFile(template.pdfPath));
  if (pdf.getPageCount() !== 3)
    throw new Error(
      "The B-unit spike template must contain exactly three official pages.",
    );
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  const measuredPlacements = measureBUnitFirstShiftPlacements(
    record,
    font,
    B_UNIT_FIRST_SHIFT_PLACEMENTS,
  );
  const layoutViolations = findBUnitLayoutViolations(measuredPlacements);
  if (layoutViolations.length > 0) {
    throw new Error(
      `B-unit overlay layout collision: ${layoutViolations
        .map(
          (violation) =>
            `${violation.placementId}:${violation.reason}${violation.protectedId ? `:${violation.protectedId}` : ""}`,
        )
        .join(", ")}`,
    );
  }
  for (const placement of measuredPlacements)
    drawFittedPlacement(pdf.getPage(placement.pageIndex), font, placement);

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
      drawEventLine(page, font, line, y, eventPage.kind === "continuation");
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
      renderedFieldKeys: measuredPlacements.flatMap(
        (placement) => placement.coverageKeys,
      ),
      layoutViolations: [],
      generationMilliseconds: performance.now() - started,
    },
  };
}
