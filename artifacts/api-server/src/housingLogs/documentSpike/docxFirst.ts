import { readFile } from "node:fs/promises";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  TextWrappingType,
  VerticalPositionRelativeFrom,
  WidthType,
  type ISectionOptions,
} from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getHousingLogConfig } from "@workspace/housing-log";
import { paginateEvents } from "./textLayout.ts";
import type {
  EventLine,
  EventPage,
  HousingLogDocumentDiagnostics,
  HousingLogDocumentRecord,
  ResolvedHousingLogTemplate,
  SignaturePlacementDiagnostic,
} from "./types.ts";

const PAGE_WIDTH_TWIPS = 12_240;
const PAGE_HEIGHT_TWIPS = 20_160;
const GRID_WIDTH_TWIPS = 11_520;
const GRID_COLUMNS = [1_140, 9_240, 1_140] as const;
const OFFICIAL_ROW_HEIGHT = 335;
const SIGNATURE_HEIGHT_PX = 29;
const SIGNATURE_WIDTH_PX = (900 / 220) * SIGNATURE_HEIGHT_PX;
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;

function pngData(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

function textParagraph(
  text: string,
  options: { size?: number; bold?: boolean; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: number } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.alignment,
    indent: options.indent ? { left: options.indent } : undefined,
    spacing: { before: 0, after: 0, line: 120 },
    children: [
      new TextRun({
        text,
        font: "Times New Roman",
        size: options.size ?? 14,
        bold: options.bold,
      }),
    ],
  });
}

function cell(
  children: Paragraph[],
  width: number,
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 45, right: 45 },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE },
    children,
  });
}

function overlayRow(
  time = "",
  activity = "",
  initials = "",
  options: { activityIndent?: number; activitySize?: number; signature?: Buffer } = {},
): TableRow {
  const activityChildren = options.signature
    ? [
        new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [
            new ImageRun({
              type: "png",
              data: options.signature,
              transformation: {
                width: SIGNATURE_WIDTH_PX,
                height: SIGNATURE_HEIGHT_PX,
              },
              altText: {
                title: "Fake Housing Log signature",
                description: "Synthetic signature used only for the Phase 2A spike",
                name: "Fake Housing Log signature",
              },
            }),
          ],
        }),
      ]
    : [
        textParagraph(activity, {
          size: options.activitySize ?? 12,
          indent: options.activityIndent,
        }),
      ];
  return new TableRow({
    cantSplit: true,
    height: { value: OFFICIAL_ROW_HEIGHT, rule: HeightRule.EXACT },
    children: [
      cell([textParagraph(time, { size: 12 })], GRID_COLUMNS[0]),
      cell(activityChildren, GRID_COLUMNS[1]),
      cell([textParagraph(initials, { size: 12 })], GRID_COLUMNS[2]),
    ],
  });
}

function backgroundHeader(png: Buffer): Header {
  return new Header({
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            type: "png",
            data: png,
            transformation: { width: 816, height: 1344 },
            floating: {
              horizontalPosition: {
                relative: HorizontalPositionRelativeFrom.PAGE,
                offset: 0,
              },
              verticalPosition: {
                relative: VerticalPositionRelativeFrom.PAGE,
                offset: 0,
              },
              wrap: { type: TextWrappingType.NONE },
              behindDocument: true,
              allowOverlap: true,
              lockAnchor: true,
            },
            altText: {
              title: "Official Housing Log page",
              description: "Rasterized official workbook page used for DOCX-first comparison",
              name: "Official Housing Log page",
            },
          }),
        ],
      }),
    ],
  });
}

function officialRows(
  record: HousingLogDocumentRecord,
  pageIndex: number,
  eventPage: EventPage | undefined,
): TableRow[] {
  const rows = Array.from({ length: 48 }, () => overlayRow());
  rows[0] = overlayRow("", record.logDate, "", { activityIndent: 7_300, activitySize: 12 });
  if (pageIndex === 0) {
    const line = (keys: string[]) => keys.map((key) => String(record.values[key] ?? "")).join(" / ");
    rows[3] = overlayRow("", line(["staff.1.name", "staff.1.keyRing", "staff.1.radio"]), "", { activityIndent: 690, activitySize: 11 });
    rows[5] = overlayRow("", line(["staff.2.name", "staff.2.keyRing", "staff.2.radio"]), "", { activityIndent: 690, activitySize: 11 });
    rows[7] = overlayRow("", line(["staff.3.name", "staff.3.keyRing", "staff.3.radio"]), "", { activityIndent: 690, activitySize: 11 });
    rows[13] = overlayRow("", line(Array.from({ length: 8 }, (_, i) => `equipment.acceptedKeyRings.${i + 1}`)), "", { activityIndent: 2_000, activitySize: 10 });
    rows[16] = overlayRow("", line(["equipment.cellExtraction", "equipment.radioChargingStation", "equipment.extraBatteries", "equipment.inspectionMirror", "equipment.cellUnlockingBars"]), "", { activityIndent: 2_000, activitySize: 10 });
    rows[18] = overlayRow("", line(["equipment.ligatureCutterSeal", "equipment.bodyAlarms.1", "equipment.bodyAlarms.2", "equipment.bodyAlarms.3", "equipment.cuffs.1", "equipment.cuffs.2", "equipment.cuffs.3"]), "", { activityIndent: 1_200, activitySize: 10 });
  }
  if (eventPage) {
    const start = pageIndex === 1 ? 41 : 2;
    eventPage.lines.forEach((line, index) => {
      const row = start + index;
      if (row < rows.length - 2)
        rows[row] = overlayRow(line.time, line.activity, line.initials, {
          activitySize: 11,
        });
    });
  }
  const supervisor = record.signatures.housingSupervisor;
  const officer = record.signatures.housingOfficer;
  if (supervisor)
    rows[46] = overlayRow("", "", "", { signature: pngData(supervisor) });
  if (officer)
    rows[47] = overlayRow("", "", "", { signature: pngData(officer) });
  return rows;
}

function transparentOverlay(rows: TableRow[]): Table {
  return new Table({
    rows,
    width: { size: GRID_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [...GRID_COLUMNS],
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
  });
}

function continuationTable(lines: EventLine[]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" } as const;
  const row = (time: string, activity: string, initials: string, header = false) =>
    new TableRow({
      cantSplit: true,
      tableHeader: header,
      height: { value: 360, rule: HeightRule.EXACT },
      children: [
        new TableCell({
          width: { size: GRID_COLUMNS[0], type: WidthType.DXA },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [textParagraph(time, { size: header ? 14 : 12, bold: header })],
        }),
        new TableCell({
          width: { size: GRID_COLUMNS[1], type: WidthType.DXA },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [textParagraph(activity, { size: header ? 14 : 12, bold: header, alignment: header ? AlignmentType.CENTER : undefined })],
        }),
        new TableCell({
          width: { size: GRID_COLUMNS[2], type: WidthType.DXA },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [textParagraph(initials, { size: header ? 14 : 12, bold: header })],
        }),
      ],
    });
  return new Table({
    rows: [
      row("TIME", "LOG OF EVENTS / ACTIVITY", "INITIALS", true),
      ...lines.map((line) => row(line.time, line.activity, line.initials)),
    ],
    width: { size: GRID_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [...GRID_COLUMNS],
    layout: TableLayoutType.FIXED,
  });
}

export async function generateDocxFirstSpike(
  record: HousingLogDocumentRecord,
  template: ResolvedHousingLogTemplate,
): Promise<{ bytes: Buffer; diagnostics: HousingLogDocumentDiagnostics }> {
  const started = performance.now();
  if (record.status !== "finalized")
    throw new Error("Only finalized Housing Logs can be rendered.");
  const sourceSheet = getHousingLogConfig(record.housingUnit, record.shift).sourceSheet;
  if (
    sourceSheet !== template.sourceSheet ||
    record.templateVersion !== template.templateVersion
  )
    throw new Error("The Housing Log record does not match the resolved DOCX template.");

  const metricPdf = await PDFDocument.create();
  const metricFont = await metricPdf.embedFont(StandardFonts.TimesRoman);
  const eventPages = paginateEvents(record, metricFont);
  const backgrounds = await Promise.all(
    template.docxBackgroundPaths.map((file) => readFile(file)),
  );
  const sections: ISectionOptions[] = backgrounds.map((background, pageIndex) => ({
    headers: { default: backgroundHeader(background) },
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
        margin: { top: 1_660, right: 360, bottom: 480, left: 360, header: 0, footer: 0, gutter: 0 },
      },
    },
    children: [
      transparentOverlay(
        officialRows(
          record,
          pageIndex,
          eventPages.find((page) => page.pageIndex === pageIndex),
        ),
      ),
    ],
  }));
  for (const page of eventPages.filter((candidate) => candidate.kind === "continuation")) {
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
          margin: { top: 540, right: 360, bottom: 480, left: 360, header: 0, footer: 0, gutter: 0 },
        },
      },
      children: [
        textParagraph("FLORIDA DEPARTMENT OF CORRECTIONS", {
          size: 22,
          bold: true,
          alignment: AlignmentType.CENTER,
        }),
        textParagraph("HOUSING UNIT LOG - CONTINUATION", {
          size: 20,
          bold: true,
          alignment: AlignmentType.CENTER,
        }),
        textParagraph(
          `HOUSING UNIT ${record.housingUnit}   Shift ${record.shift}   DATE ${record.logDate}`,
          { size: 14, bold: true },
        ),
        continuationTable(page.lines),
      ],
    });
  }
  const document = new Document({
    creator: "LockUpHQ Phase 2A spike",
    description: "Synthetic Housing Log DOCX-first architecture proof",
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 14 },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    sections,
  });
  const bytes = await Packer.toBuffer(document);
  const sourceRatio = 900 / 220;
  const signaturePlacements: SignaturePlacementDiagnostic[] = [];
  for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
    if (record.signatures.housingSupervisor)
      signaturePlacements.push({ pageIndex, signatureKey: "housingSupervisor", sourceAspectRatio: sourceRatio, renderedAspectRatio: SIGNATURE_WIDTH_PX / SIGNATURE_HEIGHT_PX });
    if (record.signatures.housingOfficer)
      signaturePlacements.push({ pageIndex, signatureKey: "housingOfficer", sourceAspectRatio: sourceRatio, renderedAspectRatio: SIGNATURE_WIDTH_PX / SIGNATURE_HEIGHT_PX });
  }
  return {
    bytes,
    diagnostics: {
      strategy: "docx-first",
      template: { templateVersion: template.templateVersion, sourceSheet },
      officialPageCount: 3,
      continuationPageCount: sections.length - 3,
      totalPageCount: sections.length,
      eventIdsInRenderedOrder: eventPages.flatMap((page) =>
        page.lines.filter((line) => !line.continuation).map((line) => line.eventId),
      ),
      signaturePlacements,
      generationMilliseconds: performance.now() - started,
    },
  };
}
