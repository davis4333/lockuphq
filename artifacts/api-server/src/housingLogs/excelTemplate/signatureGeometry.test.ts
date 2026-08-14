import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import JSZip from "jszip";
import { housingLogConfigs } from "@workspace/housing-log";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "./workbookRegistry.ts";

/**
 * Proves the signature anchor's root-cause fix with real geometry, not just
 * "which column index" — see the long comment on pictureAnchor() in
 * generateExcelHousingLog.ts. The bug this guards against: the printed
 * "Housing Supervisor/Officer Signature:" label (bold 12pt Times New Roman)
 * is wider than column A, so Excel visually spills it into column B's empty
 * cell — anchoring the ink at column B's own left edge (an earlier fix)
 * still buried that spillover text. This test independently recomputes the
 * spillover estimate from the source workbook's own column-width XML and
 * confirms the anchor point (column C) sits safely past it, on every
 * template.
 */

const registry = registerOfficialHousingLogWorkbook(
  new HousingLogWorkbookRegistry(),
);

/** Standard OOXML column-width-in-characters to pixel conversion (Calibri 11 default digit width of ~7px). */
function columnCharsToPixels(chars: number): number {
  return Math.trunc(chars * 7 + 5);
}

/** Conservative average glyph width for bold 12pt Times New Roman body text. */
const BOLD_TNR_12PT_AVG_CHAR_PX = 8;

function estimateTextWidthPx(text: string): number {
  return text.length * BOLD_TNR_12PT_AVG_CHAR_PX;
}

async function sheetXmlByName(
  zip: JSZip,
  sheetName: string,
): Promise<string> {
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const relsXml = await zip
    .file("xl/_rels/workbook.xml.rels")!
    .async("string");
  const relationships = new Map(
    [
      ...relsXml.matchAll(
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g,
      ),
    ].map((m) => [m[1]!, m[2]!] as const),
  );
  const sheetMatch = new RegExp(
    `<sheet\\b[^>]*\\bname="${sheetName}"[^>]*\\br:id="([^"]+)"[^>]*/>`,
  ).exec(workbookXml);
  assert.ok(sheetMatch, `workbook.xml has no sheet named ${sheetName}`);
  const target = relationships.get(sheetMatch[1]!);
  assert.ok(target, `no relationship target for ${sheetName}`);
  return zip.file(`xl/${target}`)!.async("string");
}

function columnWidthsPx(sheetXml: string): Map<number, number> {
  const colsMatch = /<cols>(.*?)<\/cols>/s.exec(sheetXml);
  assert.ok(colsMatch, "worksheet has no <cols> definition");
  const widths = new Map<number, number>();
  for (const m of colsMatch[1]!.matchAll(
    /<col min="(\d+)" max="(\d+)" width="([\d.]+)"/g,
  )) {
    const min = Number(m[1]);
    const max = Number(m[2]);
    const px = columnCharsToPixels(Number(m[3]));
    for (let col = min; col <= max && col <= 4; col += 1) widths.set(col, px);
  }
  return widths;
}

// The longer of the two printed signature labels — worst case for overflow.
const LONGEST_SIGNATURE_LABEL = "Housing Supervisor Signature:";

const representativeConfigs = housingLogConfigs.filter(
  (config, index, configs) =>
    configs.findIndex(
      (candidate) => candidate.sourceSheet === config.sourceSheet,
    ) === index,
);

for (const config of representativeConfigs) {
  test(`${config.sourceSheet} signature anchor clears the printed label's text overflow with margin`, async () => {
    const workbookPath = registry.resolveRecord({
      id: "geometry-check",
      status: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      finalizedAt: null,
      logDate: "2026-01-01",
      housingUnit: config.housingUnit,
      shift: config.shift,
      templateVersion: config.templateVersion,
      values: {},
      events: [],
      signatures: {},
    }).workbookPath;
    const zip = await JSZip.loadAsync(await readFile(workbookPath), {
      checkCRC32: true,
    });
    const sheetXml = await sheetXmlByName(zip, config.sourceSheet);
    const widths = columnWidthsPx(sheetXml);
    const colA = widths.get(1)!;
    const colB = widths.get(2)!;
    const colC = widths.get(3)!;
    const colD = widths.get(4)!;
    assert.ok(colA > 0 && colB > 0 && colC > 0 && colD > 0);

    // The anchor point (start of column C, i.e. colA + colB pixels from the
    // sheet's left edge) must sit at or past the estimated worst-case label
    // overflow, with a real safety margin — not just barely clearing it.
    const anchorPointPx = colA + colB;
    const estimatedLabelOverflowPx =
      estimateTextWidthPx(LONGEST_SIGNATURE_LABEL) - colA;
    assert.ok(
      anchorPointPx > estimatedLabelOverflowPx + 40,
      `${config.sourceSheet}: anchor point ${anchorPointPx}px does not clear the estimated label overflow ${estimatedLabelOverflowPx}px with margin`,
    );

    // The signature's available width (column C + D, since the anchor's
    // own 6px inset is negligible) must still be wide enough for a
    // legible signature — not squeezed into a sliver.
    const availableWidthPx = colC + colD;
    assert.ok(
      availableWidthPx > 150,
      `${config.sourceSheet}: only ${availableWidthPx}px remains for the signature after clearing the label`,
    );
  });
}
