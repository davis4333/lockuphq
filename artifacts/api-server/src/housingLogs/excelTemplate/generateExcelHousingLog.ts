import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import {
  fieldsForConfig,
  formatHousingLogDateForDisplay,
  getHousingLogConfig,
} from "@workspace/housing-log";
import {
  buildOfficialWorksheetLayout,
  resolveAmPmPlaceholders,
} from "./officialWorksheetMap.ts";
import type { HousingLogWorkbookTemplate } from "./workbookRegistry.ts";
import type { HousingLogDocumentRecord } from "../documentSpike/types.ts";

const WORKSHEET_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const DRAWING_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const PRINTER_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings";
const IMAGE_RELATIONSHIP =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const WORKSHEET_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const DRAWING_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.drawing+xml";

const DETERMINISTIC_ZIP_DATE = new Date("2026-04-27T00:00:00.000Z");

type EventWorkbookLine = {
  eventId: string;
  time: string;
  activity: string;
  initials: string;
};

export type ExcelHousingLogDiagnostics = {
  templateVersion: string;
  sourceSheet: string;
  officialWorksheetName: string;
  continuationWorksheetNames: string[];
  requiredFieldKeysWritten: string[];
  eventLineCount: number;
  eventIdsInRenderedOrder: string[];
  embeddedSignatureImageCount: number;
  officialEventCapacity: number;
  continuationEventCapacity: number;
  officialEventRows: number[];
  continuationEventRows: number[];
  semanticFingerprint: string;
  generationMilliseconds: number;
};

export class HousingLogExcelOverflowError extends Error {
  constructor(
    public readonly address: string,
    public readonly valueLength: number,
    public readonly sourceSheet: string,
    public readonly templateVersion: string,
  ) {
    super(
      `Housing Log ${templateVersion} / ${sourceSheet} value for ${address} is too long for the official printable row (${valueLength} characters).`,
    );
    this.name = "HousingLogExcelOverflowError";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

async function zipText(zip: JSZip, fileName: string): Promise<string> {
  const file = zip.file(fileName);
  if (!file) throw new Error(`Official workbook is missing ${fileName}.`);
  return file.async("string");
}

function setZipFile(zip: JSZip, path: string, data: string | Uint8Array): void {
  zip.file(path, data, {
    date: DETERMINISTIC_ZIP_DATE,
    createFolders: false,
  });
}

async function semanticFingerprint(zip: JSZip): Promise<string> {
  const digest = createHash("sha256");
  for (const path of Object.keys(zip.files)
    .filter((name) => !zip.files[name]!.dir)
    .sort()) {
    digest.update(path);
    digest.update("\0");
    digest.update(await zip.files[path]!.async("nodebuffer"));
    digest.update("\0");
  }
  return digest.digest("hex");
}

/**
 * Style index 90 in the official workbook's shared styles.xml — left
 * aligned, vertically centered, wrapped, non-bold Times New Roman — is the
 * one existing style already used for some Event Log narrative cells. The
 * source template applies it inconsistently: some blank "LOG OF EVENTS"
 * rows carry it, others carry a bold and/or centered style instead (see
 * the Event Log formatting audit). Forcing every Event/Activity cell we
 * write to this one existing index gives the column consistent
 * left-aligned, non-bold text without adding or editing anything in
 * styles.xml — which the "preserves structure" test suite locks to the
 * source file's exact bytes.
 */
const EVENT_ACTIVITY_STYLE = "90";

function setInlineCell(
  xml: string,
  address: string,
  value: string,
  styleOverride?: string,
): string {
  const pattern = new RegExp(
    `<c\\b([^>]*\\br="${escapeRegExp(address)}"[^>]*?)(?:\\s*/>|>[\\s\\S]*?</c>)`,
  );
  if (!pattern.test(xml)) {
    const rowNumber = address.match(/\d+/)?.[0];
    const column = address.match(/[A-Z]+/)?.[0];
    if (!rowNumber || !column)
      throw new Error(`Invalid worksheet cell address ${address}.`);
    const rowPattern = new RegExp(
      `<row\\b([^>]*\\br="${rowNumber}"[^>]*)>([\\s\\S]*?)<\\/row>`,
    );
    if (!rowPattern.test(xml))
      throw new Error(`Official worksheet is missing row ${rowNumber}.`);
    const nearbyStyle = xml.match(
      new RegExp(`<c\\b[^>]*\\br="${column}\\d+"[^>]*\\bs="([^"]+)"`),
    )?.[1];
    const resolvedStyle = styleOverride ?? nearbyStyle;
    const style = resolvedStyle ? ` s="${resolvedStyle}"` : "";
    return xml.replace(
      rowPattern,
      (_match, attributes: string, cells: string) =>
        `<row ${attributes}>${cells}<c r="${address}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c></row>`,
    );
  }
  return xml.replace(pattern, (_match, rawAttributes: string) => {
    const attributes = (
      styleOverride
        ? rawAttributes
            .replace(/\s+t="[^"]*"/g, "")
            .replace(/\s+s="[^"]*"/g, "")
            .trim() + ` s="${styleOverride}"`
        : rawAttributes.replace(/\s+t="[^"]*"/g, "").trim()
    );
    return `<c ${attributes} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  });
}

export function readInlineCell(
  xml: string,
  address: string,
): string | undefined {
  const cell = xml.match(
    new RegExp(`<c\\b[^>]*\\br="${escapeRegExp(address)}"[^>]*>[\\s\\S]*?</c>`),
  )?.[0];
  const text = cell?.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1];
  return text === undefined ? undefined : unescapeXml(text);
}

function wrapExactText(value: string, maximumCharacters = 108): string[] {
  if (value.length <= maximumCharacters) return [value];
  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > maximumCharacters) {
    let splitAt = -1;
    for (let index = maximumCharacters; index > 0; index -= 1) {
      if (/\s/.test(remaining[index - 1]!)) {
        splitAt = index;
        break;
      }
    }
    if (splitAt < 1) splitAt = maximumCharacters;
    lines.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  lines.push(remaining);
  return lines;
}

function eventLines(record: HousingLogDocumentRecord): EventWorkbookLine[] {
  return record.events.flatMap((event) =>
    wrapExactText(event.activity).map((activity, index) => ({
      eventId: event.id,
      time: index === 0 ? event.time : "",
      activity,
      initials: index === 0 ? event.initials : "",
    })),
  );
}

function fillEventRows(
  xml: string,
  rows: readonly number[],
  lines: readonly EventWorkbookLine[],
): string {
  let output = xml;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const line = lines[index];
    output = setInlineCell(output, `A${row}`, line?.time ?? "");
    output = setInlineCell(
      output,
      `B${row}`,
      line?.activity ?? "",
      EVENT_ACTIVITY_STYLE,
    );
    output = setInlineCell(output, `D${row}`, line?.initials ?? "");
  }
  return output;
}

function rowNumberFromReference(reference: string): number {
  const match = reference.match(/\d+/);
  if (!match) throw new Error(`Invalid worksheet reference ${reference}.`);
  return Number(match[0]);
}

function shiftReference(reference: string, offset: number): string {
  return reference.replace(
    /([A-Z]+)(\d+)/g,
    (_match, column, row) => `${column}${Number(row) + offset}`,
  );
}

function continuationSheetFromOfficial(
  officialXml: string,
  continuationNumber: number,
  sourceStart: number,
  sourceEnd: number,
): string {
  const sheetDataMatch = officialXml.match(
    /<sheetData>([\s\S]*?)<\/sheetData>/,
  );
  if (!sheetDataMatch)
    throw new Error("The official worksheet has no sheetData block.");
  const selectedRows = [...sheetDataMatch[1].matchAll(/<row\b[\s\S]*?<\/row>/g)]
    .map((match) => match[0])
    .filter((row) => {
      const reference = row.match(/<row\b[^>]*\br="(\d+)"/)?.[1];
      return (
        reference !== undefined &&
        Number(reference) >= sourceStart &&
        Number(reference) <= sourceEnd
      );
    })
    .map((row) =>
      row
        .replace(
          /(<row\b[^>]*\br=")(\d+)(")/,
          (_m, start, number, end) =>
            `${start}${Number(number) - sourceStart + 1}${end}`,
        )
        .replace(
          /(<c\b[^>]*\br=")([A-Z]+)(\d+)(")/g,
          (_m, start, column, number, end) =>
            `${start}${column}${Number(number) - sourceStart + 1}${end}`,
        ),
    );
  const pageLength = sourceEnd - sourceStart + 1;
  if (selectedRows.length !== pageLength)
    throw new Error(
      `The official continuation source must contain rows ${sourceStart} through ${sourceEnd}.`,
    );

  const sourceMerges = officialXml.match(
    /<mergeCells\b[\s\S]*?<\/mergeCells>/,
  )?.[0];
  if (!sourceMerges)
    throw new Error("The official worksheet has no mergeCells block.");
  const continuationMerges = [
    ...sourceMerges.matchAll(/<mergeCell ref="([^"]+)"\/>/g),
  ]
    .map((match) => match[1]!)
    .filter((reference) =>
      reference.split(":").every((cellReference) => {
        const row = rowNumberFromReference(cellReference);
        return row >= sourceStart && row <= sourceEnd;
      }),
    )
    .map((reference) => shiftReference(reference, 1 - sourceStart));
  const mergeXml = `<mergeCells count="${continuationMerges.length}">${continuationMerges
    .map((reference) => `<mergeCell ref="${reference}"/>`)
    .join("")}</mergeCells>`;

  return officialXml
    .replace(/<sheetPr\b[^>]*codeName="[^"]*"/, (value) =>
      value.replace(
        /codeName="[^"]*"/,
        `codeName="HousingLogContinuation${continuationNumber}"`,
      ),
    )
    .replace(
      /<dimension ref="[^"]+"\/>/,
      `<dimension ref="A1:D${pageLength}"/>`,
    )
    .replace(/activeCell="[^"]+"/, 'activeCell="B3"')
    .replace(/sqref="[^"]+"/, 'sqref="B3:C3"')
    .replace(
      /<sheetData>[\s\S]*?<\/sheetData>/,
      `<sheetData>${selectedRows.join("")}</sheetData>`,
    )
    .replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, mergeXml)
    .replace(/<rowBreaks\b[\s\S]*?<\/rowBreaks>/, "");
}

function pngBytes(dataUrl: string | undefined, key: string): Buffer {
  const marker = "data:image/png;base64,";
  if (!dataUrl?.startsWith(marker))
    throw new Error(`Housing Log ${key} signature is not a PNG data URL.`);
  return Buffer.from(dataUrl.slice(marker.length), "base64");
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  if (
    bytes.length < 24 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error("Housing Log signature PNG has an invalid header.");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function pictureAnchor(options: {
  id: number;
  name: string;
  relationshipId: string;
  rowIndex: number;
  imageWidth: number;
  imageHeight: number;
}): string {
  const heightPx = 18;
  const widthPx = (heightPx * options.imageWidth) / options.imageHeight;
  const emu = 9525;
  // Column A (index 0) holds the printed "Housing Supervisor/Officer
  // Signature:" label and is only ~80px wide on every official worksheet;
  // the blank signature line itself is column B, which is intentionally
  // cleared of any text (see clearSignatureCellValues) and is roomy
  // (~430px). Anchoring here — instead of the old col 0 + 230px offset,
  // which placed the image at an offset larger than column A's own width —
  // keeps the ink on the signature line and off the printed label, on
  // every worksheet size the ink can appear on.
  return `<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>${6 * emu}</xdr:colOff><xdr:row>${options.rowIndex}</xdr:row><xdr:rowOff>${2 * emu}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(widthPx * emu)}" cy="${heightPx * emu}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${options.id}" name="${escapeXml(options.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${options.relationshipId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
}

function drawingXml(
  signatureRows: readonly { supervisor: number; officer?: number }[],
  supervisorDimensions: { width: number; height: number },
  officerDimensions?: { width: number; height: number },
): string {
  let id = 1;
  const anchors = signatureRows.flatMap((rows, pageIndex) => {
    const pageAnchors = [
      pictureAnchor({
        id: id++,
        name: `Housing Supervisor Signature Page ${pageIndex + 1}`,
        relationshipId: "rId1",
        rowIndex: rows.supervisor - 1,
        imageWidth: supervisorDimensions.width,
        imageHeight: supervisorDimensions.height,
      }),
    ];
    if (rows.officer !== undefined && officerDimensions)
      pageAnchors.push(
        pictureAnchor({
          id: id++,
          name: `Housing Officer Signature Page ${pageIndex + 1}`,
          relationshipId: "rId2",
          rowIndex: rows.officer - 1,
          imageWidth: officerDimensions.width,
          imageHeight: officerDimensions.height,
        }),
      );
    return pageAnchors;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join("")}</xdr:wsDr>`;
}

function drawingRelationshipsXml(includeOfficer: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${IMAGE_RELATIONSHIP}" Target="../media/housing-log-supervisor.png"/>${includeOfficer ? `<Relationship Id="rId2" Type="${IMAGE_RELATIONSHIP}" Target="../media/housing-log-officer.png"/>` : ""}</Relationships>`;
}

function worksheetRelationshipsXml(
  printerSettingsTarget: string,
  drawingIndex: number,
): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${PRINTER_RELATIONSHIP}" Target="${escapeXml(printerSettingsTarget)}"/><Relationship Id="rId2" Type="${DRAWING_RELATIONSHIP}" Target="../drawings/drawing${drawingIndex}.xml"/></Relationships>`;
}

function addDrawingReference(xml: string): string {
  if (/<drawing\b/.test(xml))
    throw new Error(
      "The official worksheet unexpectedly already contains a drawing relationship.",
    );
  return xml.replace("</worksheet>", '<drawing r:id="rId2"/></worksheet>');
}

function nextNumber(values: Iterable<number>): number {
  return Math.max(...values, 0) + 1;
}

function addWorksheetMetadata(options: {
  workbookXml: string;
  workbookRelationshipsXml: string;
  contentTypesXml: string;
  appXml: string;
  names: readonly string[];
  worksheetIndexes: readonly number[];
  printAreas: readonly string[];
}): {
  workbookXml: string;
  workbookRelationshipsXml: string;
  contentTypesXml: string;
  appXml: string;
} {
  let { workbookXml, workbookRelationshipsXml, contentTypesXml, appXml } =
    options;
  const startingSheetId = nextNumber(
    [...workbookXml.matchAll(/<sheet\b[^>]*sheetId="(\d+)"/g)].map((match) =>
      Number(match[1]),
    ),
  );
  const startingRelationshipId = nextNumber(
    [...workbookRelationshipsXml.matchAll(/Id="rId(\d+)"/g)].map((match) =>
      Number(match[1]),
    ),
  );
  const existingSheetCount = [...workbookXml.matchAll(/<sheet\b/g)].length;

  const sheetTags = options.names.map(
    (name, index) =>
      `<sheet name="${escapeXml(name)}" sheetId="${startingSheetId + index}" r:id="rId${startingRelationshipId + index}"/>`,
  );
  workbookXml = workbookXml.replace(
    "</sheets>",
    `${sheetTags.join("")}</sheets>`,
  );
  const definedNames = options.names.flatMap((name, index) => {
    const localSheetId = existingSheetCount + index;
    const formula = `'${name.replace(/'/g, "''")}'!${options.printAreas[index]}`;
    return [
      `<definedName name="_xlnm.Print_Area" localSheetId="${localSheetId}">${escapeXml(formula)}</definedName>`,
      `<definedName name="Z_0FC2772C_9857_4107_BB08_847B66758678_.wvu.PrintArea" localSheetId="${localSheetId}" hidden="1">${escapeXml(formula)}</definedName>`,
    ];
  });
  workbookXml = workbookXml.replace(
    "</definedNames>",
    `${definedNames.join("")}</definedNames>`,
  );

  const worksheetRelationships = options.worksheetIndexes.map(
    (worksheetIndex, index) =>
      `<Relationship Id="rId${startingRelationshipId + index}" Type="${WORKSHEET_RELATIONSHIP}" Target="worksheets/sheet${worksheetIndex}.xml"/>`,
  );
  workbookRelationshipsXml = workbookRelationshipsXml.replace(
    "</Relationships>",
    `${worksheetRelationships.join("")}</Relationships>`,
  );
  const overrides = options.worksheetIndexes.map(
    (worksheetIndex) =>
      `<Override PartName="/xl/worksheets/sheet${worksheetIndex}.xml" ContentType="${WORKSHEET_CONTENT_TYPE}"/>`,
  );
  contentTypesXml = contentTypesXml.replace(
    "</Types>",
    `${overrides.join("")}</Types>`,
  );

  const worksheetCountMatch = appXml.match(
    /(<vt:lpstr>Worksheets<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)(\d+)(<\/vt:i4>)/,
  );
  if (!worksheetCountMatch)
    throw new Error(
      "Official workbook application metadata has no worksheet count.",
    );
  appXml = appXml.replace(
    worksheetCountMatch[0],
    `${worksheetCountMatch[1]}${Number(worksheetCountMatch[2]) + options.names.length}${worksheetCountMatch[3]}`,
  );
  const namedRangeCountMatch = appXml.match(
    /(<vt:lpstr>Named Ranges<\/vt:lpstr><\/vt:variant><vt:variant><vt:i4>)(\d+)(<\/vt:i4>)/,
  );
  if (!namedRangeCountMatch)
    throw new Error(
      "Official workbook application metadata has no named-range count.",
    );
  appXml = appXml.replace(
    namedRangeCountMatch[0],
    `${namedRangeCountMatch[1]}${Number(namedRangeCountMatch[2]) + options.names.length}${namedRangeCountMatch[3]}`,
  );
  const titles = appXml.match(
    /<TitlesOfParts><vt:vector size="(\d+)" baseType="lpstr">([\s\S]*?)<\/vt:vector><\/TitlesOfParts>/,
  );
  if (!titles)
    throw new Error(
      "Official workbook application metadata has no TitlesOfParts.",
    );
  const firstNamedRange = "<vt:lpstr>'1_AH'!Print_Area</vt:lpstr>";
  const worksheetTitles = options.names
    .map((name) => `<vt:lpstr>${escapeXml(name)}</vt:lpstr>`)
    .join("");
  const printAreaTitles = options.names
    .map((name) => `<vt:lpstr>'${escapeXml(name)}'!Print_Area</vt:lpstr>`)
    .join("");
  const newTitleBody = titles[2]!
    .replace(firstNamedRange, `${worksheetTitles}${firstNamedRange}`)
    .concat(printAreaTitles);
  appXml = appXml.replace(
    titles[0],
    `<TitlesOfParts><vt:vector size="${Number(titles[1]) + options.names.length * 2}" baseType="lpstr">${newTitleBody}</vt:vector></TitlesOfParts>`,
  );
  return { workbookXml, workbookRelationshipsXml, contentTypesXml, appXml };
}

function addContentTypesForImagesAndDrawings(
  contentTypesXml: string,
  drawingIndexes: readonly number[],
): string {
  let output = contentTypesXml;
  if (!/<Default Extension="png"/.test(output))
    output = output.replace(
      "</Types>",
      '<Default Extension="png" ContentType="image/png"/></Types>',
    );
  const overrides = drawingIndexes.map(
    (index) =>
      `<Override PartName="/xl/drawings/drawing${index}.xml" ContentType="${DRAWING_CONTENT_TYPE}"/>`,
  );
  return output.replace("</Types>", `${overrides.join("")}</Types>`);
}

function findWorksheetPart(
  workbookXml: string,
  workbookRelationshipsXml: string,
  sourceSheet: string,
): { worksheetPath: string; worksheetIndex: number } {
  const sheet = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].find((match) =>
    new RegExp(`\\bname="${escapeRegExp(escapeXml(sourceSheet))}"`).test(
      match[0],
    ),
  )?.[0];
  const relationshipId = sheet?.match(/\br:id="([^"]+)"/)?.[1];
  if (!relationshipId)
    throw new Error(`Official workbook has no worksheet named ${sourceSheet}.`);
  const relationship = [
    ...workbookRelationshipsXml.matchAll(/<Relationship\b[^>]*\/>/g),
  ].find((match) =>
    new RegExp(`\\bId="${escapeRegExp(relationshipId)}"`).test(match[0]),
  )?.[0];
  const target = relationship?.match(/\bTarget="([^"]+)"/)?.[1];
  const worksheetIndex = target?.match(/sheet(\d+)\.xml$/)?.[1];
  if (!target || !worksheetIndex)
    throw new Error(
      `Official workbook relationship ${relationshipId} is invalid.`,
    );
  return {
    worksheetPath: `xl/${target}`,
    worksheetIndex: Number(worksheetIndex),
  };
}

export async function generateExcelHousingLog(
  record: HousingLogDocumentRecord,
  template: HousingLogWorkbookTemplate,
): Promise<{ bytes: Buffer; diagnostics: ExcelHousingLogDiagnostics }> {
  const started = performance.now();
  // Callable for both a finalized archive record (admin download, shift
  // packages) and a not-yet-finalized officer working copy (stateless
  // preview/current-log download — see routes/housingLogs.ts). Either way
  // the caller is responsible for validating the record before calling
  // this function; generation itself has no persistence side effects.
  const config = getHousingLogConfig(record.housingUnit, record.shift);
  if (config.sourceSheet !== template.sourceSheet)
    throw new Error(
      `Housing Log ${record.templateVersion} / ${config.sourceSheet} does not match workbook source sheet ${template.sourceSheet}.`,
    );
  if (record.templateVersion !== template.templateVersion)
    throw new Error(
      `Housing Log ${record.templateVersion} / ${config.sourceSheet} does not match workbook template version ${template.templateVersion}.`,
    );

  const zip = await JSZip.loadAsync(await readFile(template.workbookPath));
  let workbookXml = await zipText(zip, "xl/workbook.xml");
  let workbookRelationshipsXml = await zipText(
    zip,
    "xl/_rels/workbook.xml.rels",
  );
  let contentTypesXml = await zipText(zip, "[Content_Types].xml");
  let appXml = await zipText(zip, "docProps/app.xml");
  const worksheet = findWorksheetPart(
    workbookXml,
    workbookRelationshipsXml,
    template.sourceSheet,
  );
  const officialSourceXml = await zipText(zip, worksheet.worksheetPath);
  const sharedStringsXml = await zipText(zip, "xl/sharedStrings.xml");
  const layout = buildOfficialWorksheetLayout(
    officialSourceXml,
    sharedStringsXml,
    config,
  );
  let officialXml = officialSourceXml;

  const requiredFieldKeysWritten: string[] = [];
  for (const cell of layout.writes) {
    const value = resolveAmPmPlaceholders(cell.value(record));
    if (cell.address.startsWith("B") && value.length > 180)
      throw new HousingLogExcelOverflowError(
        cell.address,
        value.length,
        template.sourceSheet,
        template.templateVersion,
      );
    officialXml = setInlineCell(officialXml, cell.address, value);
    requiredFieldKeysWritten.push(...cell.coverageKeys);
  }
  const requiredKeys = fieldsForConfig(config).map((field) => field.key);
  const missingKeys = requiredKeys.filter(
    (key) => !requiredFieldKeysWritten.includes(key),
  );
  if (missingKeys.length)
    throw new Error(
      `Housing Log ${template.templateVersion} / ${template.sourceSheet} has unmapped fields: ${missingKeys.join(", ")}.`,
    );

  const lines = eventLines(record);
  officialXml = fillEventRows(
    officialXml,
    layout.officialEventRows,
    lines.slice(0, layout.officialEventRows.length),
  );
  const overflowLines = lines.slice(layout.officialEventRows.length);
  const continuationCount = Math.ceil(
    overflowLines.length / layout.continuationEventRows.length,
  );
  const continuationNames = Array.from(
    { length: continuationCount },
    (_, index) => `${template.sourceSheet} Continuation ${index + 1}`,
  );

  const includeOfficer = config.signatures.some(
    (signature) => signature.key === "housingOfficer",
  );
  const supervisorBytes = pngBytes(
    record.signatures.housingSupervisor,
    "housing supervisor",
  );
  const officerBytes = includeOfficer
    ? pngBytes(record.signatures.housingOfficer, "housing officer")
    : undefined;
  const supervisorDimensions = pngDimensions(supervisorBytes);
  const officerDimensions = officerBytes
    ? pngDimensions(officerBytes)
    : undefined;
  setZipFile(zip, "xl/media/housing-log-supervisor.png", supervisorBytes);
  if (officerBytes)
    setZipFile(zip, "xl/media/housing-log-officer.png", officerBytes);
  else
    for (const row of layout.officerSignatureRows) {
      const current = readInlineCell(officialXml, `A${row}`);
      if (!/N\/A/i.test(current ?? ""))
        officialXml = setInlineCell(
          officialXml,
          `A${row}`,
          `${current ?? "Housing Officer Signature:"} N/A`,
        );
    }

  const existingWorksheetIndexes = Object.keys(zip.files)
    .map((name) => name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const existingDrawingIndexes = Object.keys(zip.files)
    .map((name) => name.match(/^xl\/drawings\/drawing(\d+)\.xml$/)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const existingPrinterIndexes = Object.keys(zip.files)
    .map(
      (name) =>
        name.match(/^xl\/printerSettings\/printerSettings(\d+)\.bin$/)?.[1],
    )
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const firstNewWorksheetIndex = nextNumber(existingWorksheetIndexes);
  const firstNewDrawingIndex = nextNumber(existingDrawingIndexes);
  const firstNewPrinterIndex = nextNumber(existingPrinterIndexes);
  const existingDrawingRelationshipId = officialXml.match(
    /<drawing\b[^>]*r:id="([^"]+)"/,
  )?.[1];
  const officialRelationshipsPath = `xl/worksheets/_rels/sheet${worksheet.worksheetIndex}.xml.rels`;
  const officialRelationships = await zipText(zip, officialRelationshipsPath);
  const printerTarget = officialRelationships.match(
    new RegExp(
      `<Relationship\\b[^>]*Type="${escapeRegExp(PRINTER_RELATIONSHIP)}"[^>]*Target="([^"]+)"[^>]*/>`,
    ),
  )?.[1];
  if (!printerTarget)
    throw new Error(
      `Housing Log ${template.templateVersion} / ${template.sourceSheet} has no printer-settings relationship.`,
    );
  const printerSettingsFile = zip.file(
    `xl/${printerTarget.replace(/^\.\.\//, "")}`,
  );
  if (!printerSettingsFile)
    throw new Error(
      `Housing Log ${template.templateVersion} / ${template.sourceSheet} printer-settings binary is missing.`,
    );
  const printerSettingsBytes = await printerSettingsFile.async("nodebuffer");
  let officialDrawingIndex: number;
  let createdOfficialDrawing = false;
  if (existingDrawingRelationshipId) {
    const drawingTarget = officialRelationships.match(
      new RegExp(
        `<Relationship\\b[^>]*Id="${escapeRegExp(existingDrawingRelationshipId)}"[^>]*Target="([^"]+)"`,
      ),
    )?.[1];
    officialDrawingIndex = Number(
      drawingTarget?.match(/drawing(\d+)\.xml$/)?.[1],
    );
    if (!drawingTarget || !officialDrawingIndex)
      throw new Error(
        `Housing Log ${template.templateVersion} / ${template.sourceSheet} existing drawing relationship is invalid.`,
      );
    const drawingPath = `xl/${drawingTarget.replace(/^\.\.\//, "")}`;
    let existingDrawingXml = await zipText(zip, drawingPath);
    if (!/xmlns:r=/.test(existingDrawingXml))
      existingDrawingXml = existingDrawingXml.replace(
        /<xdr:wsDr\b/,
        '<xdr:wsDr xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
      );
    const anchors = drawingXml(
      layout.supervisorSignatureRows.map((supervisor, index) => ({
        supervisor,
        officer: includeOfficer
          ? layout.officerSignatureRows[index]
          : undefined,
      })),
      supervisorDimensions,
      officerDimensions,
    ).match(/<xdr:wsDr[^>]*>([\s\S]*)<\/xdr:wsDr>/)?.[1];
    if (!anchors) throw new Error("Generated signature drawing is invalid.");
    existingDrawingXml = existingDrawingXml.replace(
      "</xdr:wsDr>",
      `${anchors}</xdr:wsDr>`,
    );
    setZipFile(zip, drawingPath, existingDrawingXml);
    setZipFile(
      zip,
      `xl/drawings/_rels/drawing${officialDrawingIndex}.xml.rels`,
      drawingRelationshipsXml(includeOfficer),
    );
  } else {
    officialDrawingIndex = firstNewDrawingIndex;
    createdOfficialDrawing = true;
    officialXml = addDrawingReference(officialXml);
    setZipFile(
      zip,
      officialRelationshipsPath,
      worksheetRelationshipsXml(printerTarget, officialDrawingIndex),
    );
    setZipFile(
      zip,
      `xl/drawings/drawing${officialDrawingIndex}.xml`,
      drawingXml(
        layout.supervisorSignatureRows.map((supervisor, index) => ({
          supervisor,
          officer: includeOfficer
            ? layout.officerSignatureRows[index]
            : undefined,
        })),
        supervisorDimensions,
        officerDimensions,
      ),
    );
    setZipFile(
      zip,
      `xl/drawings/_rels/drawing${officialDrawingIndex}.xml.rels`,
      drawingRelationshipsXml(includeOfficer),
    );
  }
  setZipFile(zip, worksheet.worksheetPath, officialXml);

  const continuationWorksheetIndexes: number[] = [];
  const continuationDrawingIndexes: number[] = [];
  for (let index = 0; index < continuationCount; index += 1) {
    const worksheetIndex = firstNewWorksheetIndex + index;
    const drawingIndex =
      firstNewDrawingIndex + index + (createdOfficialDrawing ? 1 : 0);
    const printerIndex = firstNewPrinterIndex + index;
    let continuationXml = continuationSheetFromOfficial(
      officialSourceXml,
      index + 1,
      layout.continuationSourceStart,
      layout.continuationSourceEnd,
    );
    continuationXml = continuationXml
      .replace(/<controls\b[\s\S]*?<\/controls>/g, "")
      .replace(/<legacyDrawing\b[^>]*\/>/g, "")
      .replace(/<drawing\b[^>]*\/>/g, "");
    continuationXml = setInlineCell(
      continuationXml,
      "A1",
      `HOUSING UNIT  ${record.housingUnit}        ${config.shiftLabel}`,
    );
    continuationXml = setInlineCell(
      continuationXml,
      "C1",
      `DATE ${formatHousingLogDateForDisplay(record.logDate)}`,
    );
    continuationXml = fillEventRows(
      continuationXml,
      layout.continuationEventRows,
      overflowLines.slice(
        index * layout.continuationEventRows.length,
        (index + 1) * layout.continuationEventRows.length,
      ),
    );
    if (!includeOfficer) {
      const current = readInlineCell(
        continuationXml,
        `A${layout.continuationOfficerRow}`,
      );
      continuationXml = setInlineCell(
        continuationXml,
        `A${layout.continuationOfficerRow}`,
        `${current ?? "Housing Officer Signature:"} N/A`,
      );
    }
    continuationXml = addDrawingReference(continuationXml);
    setZipFile(
      zip,
      `xl/worksheets/sheet${worksheetIndex}.xml`,
      continuationXml,
    );
    setZipFile(
      zip,
      `xl/worksheets/_rels/sheet${worksheetIndex}.xml.rels`,
      worksheetRelationshipsXml(
        `../printerSettings/printerSettings${printerIndex}.bin`,
        drawingIndex,
      ),
    );
    setZipFile(
      zip,
      `xl/printerSettings/printerSettings${printerIndex}.bin`,
      printerSettingsBytes,
    );
    setZipFile(
      zip,
      `xl/drawings/drawing${drawingIndex}.xml`,
      drawingXml(
        [
          {
            supervisor: layout.continuationSupervisorRow,
            officer: includeOfficer ? layout.continuationOfficerRow : undefined,
          },
        ],
        supervisorDimensions,
        officerDimensions,
      ),
    );
    setZipFile(
      zip,
      `xl/drawings/_rels/drawing${drawingIndex}.xml.rels`,
      drawingRelationshipsXml(includeOfficer),
    );
    continuationWorksheetIndexes.push(worksheetIndex);
    continuationDrawingIndexes.push(drawingIndex);
  }

  if (continuationCount > 0) {
    const continuationPageLength =
      layout.continuationSourceEnd - layout.continuationSourceStart + 1;
    const metadata = addWorksheetMetadata({
      workbookXml,
      workbookRelationshipsXml,
      contentTypesXml,
      appXml,
      names: continuationNames,
      worksheetIndexes: continuationWorksheetIndexes,
      printAreas: continuationNames.map(
        () => `$A$1:$D$${continuationPageLength}`,
      ),
    });
    workbookXml = metadata.workbookXml;
    workbookRelationshipsXml = metadata.workbookRelationshipsXml;
    contentTypesXml = metadata.contentTypesXml;
    appXml = metadata.appXml;
  }
  contentTypesXml = addContentTypesForImagesAndDrawings(contentTypesXml, [
    ...(createdOfficialDrawing ? [officialDrawingIndex] : []),
    ...continuationDrawingIndexes,
  ]);
  setZipFile(zip, "xl/workbook.xml", workbookXml);
  setZipFile(zip, "xl/_rels/workbook.xml.rels", workbookRelationshipsXml);
  setZipFile(zip, "[Content_Types].xml", contentTypesXml);
  setZipFile(zip, "docProps/app.xml", appXml);

  const fingerprint = await semanticFingerprint(zip);

  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return {
    bytes,
    diagnostics: {
      templateVersion: template.templateVersion,
      sourceSheet: template.sourceSheet,
      officialWorksheetName: template.sourceSheet,
      continuationWorksheetNames: continuationNames,
      requiredFieldKeysWritten: [...new Set(requiredFieldKeysWritten)],
      eventLineCount: lines.length,
      eventIdsInRenderedOrder: record.events.map((event) => event.id),
      embeddedSignatureImageCount:
        (layout.pageStarts.length + continuationCount) *
        (includeOfficer ? 2 : 1),
      officialEventCapacity: layout.officialEventRows.length,
      continuationEventCapacity: layout.continuationEventRows.length,
      officialEventRows: layout.officialEventRows,
      continuationEventRows: layout.continuationEventRows,
      semanticFingerprint: fingerprint,
      generationMilliseconds: performance.now() - started,
    },
  };
}
