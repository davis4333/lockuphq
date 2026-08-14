import * as XLSX from "xlsx";

/**
 * Parses the ACTUAL generated official Housing Log workbook (the same bytes
 * `previewHousingLogXlsx` / "Download Current Log" produce) into a plain
 * grid the officer-preview and admin "View Official Log" screens both
 * render as an HTML table styled like the paper form. This is the single
 * source of truth for what the officer sees: there is no independent
 * field-by-field summary — every cell's text comes straight from the
 * generated worksheet, so the preview can never show something the
 * downloaded .xlsx doesn't also contain.
 *
 * Event order, page breaks, and continuation sheets all fall out "for
 * free": the generator already writes events in entered order into
 * sequential rows and creates one worksheet per official page and one per
 * continuation sheet, so reading those worksheets in order reproduces the
 * whole log without any extra pagination logic here.
 */

export type TemplateGridCell = {
  text: string;
  rowSpan: number;
  colSpan: number;
};

export type TemplateGridSheet = {
  name: string;
  /** Per-column pixel width, 0-indexed, sized to match the source workbook. */
  columnWidthsPx: number[];
  /** rows[r][c] is null when that cell is covered by an earlier merge. */
  rows: (TemplateGridCell | null)[][];
  /** 0-based row index of the "Housing Supervisor Signature:" row, if present on this sheet. */
  supervisorSignatureRowIndex: number | null;
  /** 0-based row index of the "Housing Officer Signature:" row, if present on this sheet. */
  officerSignatureRowIndex: number | null;
};

const SUPERVISOR_SIGNATURE_PATTERN = /Housing Supervisor Signature/i;
const OFFICER_SIGNATURE_PATTERN = /Housing Officer Signature/i;

/** Same character-to-pixel conversion Excel itself uses for column widths. */
function columnCharsToPixels(chars: number): number {
  return Math.max(24, Math.trunc(chars * 7 + 5));
}

const DEFAULT_COLUMN_WIDTH_PX = columnCharsToPixels(9.14);

function relevantSheetNames(
  workbook: XLSX.WorkBook,
  sourceSheet: string,
): string[] {
  const names = workbook.SheetNames.filter(
    (name) => name === sourceSheet || name.startsWith(`${sourceSheet} Continuation`),
  );
  // The official sheet always comes first; continuation sheets follow in
  // the numeric order their names carry ("Continuation 1", "Continuation 2", ...).
  return names.sort((a, b) => {
    if (a === sourceSheet) return -1;
    if (b === sourceSheet) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

function parseSheet(worksheet: XLSX.WorkSheet, name: string): TemplateGridSheet {
  const ref = worksheet["!ref"];
  if (!ref) return { name, columnWidthsPx: [], rows: [], supervisorSignatureRowIndex: null, officerSignatureRowIndex: null };
  const range = XLSX.utils.decode_range(ref);
  const rowCount = range.e.r - range.s.r + 1;
  const colCount = range.e.c - range.s.c + 1;

  const grid: (TemplateGridCell | null)[][] = Array.from(
    { length: rowCount },
    () => Array.from({ length: colCount }, () => ({ text: "", rowSpan: 1, colSpan: 1 })),
  );

  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      const address = XLSX.utils.encode_cell({ r: r + range.s.r, c: c + range.s.c });
      const cell = worksheet[address] as XLSX.CellObject | undefined;
      const text = cell ? String(cell.w ?? cell.v ?? "") : "";
      grid[r]![c] = { text, rowSpan: 1, colSpan: 1 };
    }
  }

  for (const merge of worksheet["!merges"] ?? []) {
    const startRow = merge.s.r - range.s.r;
    const startCol = merge.s.c - range.s.c;
    const endRow = merge.e.r - range.s.r;
    const endCol = merge.e.c - range.s.c;
    if (startRow < 0 || startCol < 0 || endRow >= rowCount || endCol >= colCount) continue;
    const anchor = grid[startRow]![startCol];
    if (!anchor) continue;
    anchor.rowSpan = endRow - startRow + 1;
    anchor.colSpan = endCol - startCol + 1;
    for (let r = startRow; r <= endRow; r += 1) {
      for (let c = startCol; c <= endCol; c += 1) {
        if (r === startRow && c === startCol) continue;
        grid[r]![c] = null;
      }
    }
  }

  const columnWidthsPx: number[] = [];
  for (let c = 0; c < colCount; c += 1) {
    const colInfo = worksheet["!cols"]?.[c + range.s.c];
    if (colInfo?.wpx) columnWidthsPx.push(colInfo.wpx);
    else if (colInfo?.wch ?? colInfo?.width)
      columnWidthsPx.push(columnCharsToPixels((colInfo.wch ?? colInfo.width)!));
    else columnWidthsPx.push(DEFAULT_COLUMN_WIDTH_PX);
  }

  let supervisorSignatureRowIndex: number | null = null;
  let officerSignatureRowIndex: number | null = null;
  for (let r = 0; r < rowCount; r += 1) {
    const firstCellText = grid[r]?.[0]?.text ?? "";
    if (supervisorSignatureRowIndex === null && SUPERVISOR_SIGNATURE_PATTERN.test(firstCellText))
      supervisorSignatureRowIndex = r;
    if (officerSignatureRowIndex === null && OFFICER_SIGNATURE_PATTERN.test(firstCellText))
      officerSignatureRowIndex = r;
  }

  return { name, columnWidthsPx, rows: grid, supervisorSignatureRowIndex, officerSignatureRowIndex };
}

/**
 * Parse the generated workbook's official worksheet and any continuation
 * sheets belonging to it, in the order the officer should review them.
 */
export function parseOfficialTemplateWorkbook(
  bytes: ArrayBuffer,
  sourceSheet: string,
): TemplateGridSheet[] {
  // cellStyles is required for SheetJS to populate `!cols` (column widths) —
  // without it every column silently falls back to the default width and
  // the rendered grid no longer matches the source workbook's proportions.
  const workbook = XLSX.read(bytes, { type: "array", cellStyles: true });
  return relevantSheetNames(workbook, sourceSheet).map((name) =>
    parseSheet(workbook.Sheets[name]!, name),
  );
}
