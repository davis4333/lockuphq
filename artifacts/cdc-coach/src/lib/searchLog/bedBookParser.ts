import * as XLSX from "xlsx";
import type { ParsedBedBook, RawBedRow } from "./types";

export class BedBookParseError extends Error {}

const HEADER_ALIASES = {
  bedId: ["bed-id", "bedid", "bed id", "bed"],
  docnum: ["docnum", "doc-num", "doc num", "doc number", "docnumber", "dc"],
  inmateName: ["inmate-name", "inmatename", "inmate name", "inmate", "name"],
};

function normalizeHeader(value: string): string {
  return (value ?? "").toString().trim().toLowerCase();
}

function matchColumn(header: string, aliases: string[]): boolean {
  const h = normalizeHeader(header);
  return aliases.some((a) => h === a);
}

/**
 * Occupancy placeholders that are NOT real inmate names (so the bed/cell should
 * be skipped). Robust to surrounding whitespace and decorative asterisks, e.g.
 * "** VACANT **", "  UNDER MAINT  ", "UNDER MAINTENANCE".
 */
function isPlaceholderName(name: string): boolean {
  const normalized = (name ?? "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (normalized.length === 0) return true;
  return (
    normalized === "VACANT" ||
    normalized.startsWith("UNDER MAINT") ||
    normalized === "MAINT" ||
    normalized === "MAINTENANCE"
  );
}

/** Split a single CSV line honoring quotes and a custom delimiter. */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Split raw lines into a grid for a fixed delimiter (blank lines kept as []). */
function buildGrid(rawLines: string[], startIdx: number, delimiter: string): string[][] {
  const grid: string[][] = [];
  for (let i = startIdx; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim().length === 0) {
      grid.push([]);
      continue;
    }
    grid.push(splitLine(line, delimiter));
  }
  return grid;
}

/**
 * Score a grid by how many of the three required headers (BED-ID, DOCNUM,
 * INMATE-NAME) appear together in a single row. Used to pick the delimiter that
 * best reveals the Bed Book header row.
 */
function bestHeaderScore(grid: string[][]): number {
  let best = 0;
  for (const row of grid) {
    if (!row || row.length === 0) continue;
    let bedId = false;
    let docnum = false;
    let inmate = false;
    for (const cell of row) {
      if (!bedId && matchColumn(cell, HEADER_ALIASES.bedId)) bedId = true;
      else if (!docnum && matchColumn(cell, HEADER_ALIASES.docnum)) docnum = true;
      else if (!inmate && matchColumn(cell, HEADER_ALIASES.inmateName)) inmate = true;
    }
    const score = (bedId ? 1 : 0) + (docnum ? 1 : 0) + (inmate ? 1 : 0);
    if (score > best) best = score;
    if (best === 3) return 3;
  }
  return best;
}

/**
 * Turn a CSV/TSV string into a 2D grid of cells.
 *
 * Delimiter detection is internal (no UI control): a leading `SEP=` line always
 * wins; otherwise we try comma, pipe, tab, and semicolon and keep whichever one
 * best reveals the required Bed Book headers, breaking ties by column count.
 */
function csvToGrid(text: string): { grid: string[][]; delimiter: string } {
  // Strip a UTF-8 BOM if present.
  const body = text.replace(/^\uFEFF/, "");
  const rawLines = body.split(/\r\n|\r|\n/);

  const first = (rawLines[0] ?? "").trim();
  const sepMatch = first.match(/^sep\s*=\s*(.)/i);
  if (sepMatch) {
    let delimiter = sepMatch[1];
    if (delimiter === "\\" && first.toLowerCase().includes("\\t")) delimiter = "\t";
    return { grid: buildGrid(rawLines, 1, delimiter), delimiter };
  }

  const candidates = [",", "|", "\t", ";"];
  let best: { grid: string[][]; delimiter: string; score: number; cols: number } | null = null;
  for (const c of candidates) {
    const grid = buildGrid(rawLines, 0, c);
    const score = bestHeaderScore(grid);
    const cols = grid.reduce((max, row) => Math.max(max, row.length), 0);
    if (!best || score > best.score || (score === best.score && cols > best.cols)) {
      best = { grid, delimiter: c, score, cols };
    }
  }
  // `best` is always set (candidates is non-empty); fall back to comma defensively.
  return best ? { grid: best.grid, delimiter: best.delimiter } : { grid: buildGrid(rawLines, 0, ","), delimiter: "," };
}

interface HeaderLocation {
  rowIndex: number;
  bedIdCol: number;
  docnumCol: number;
  inmateCol: number;
}

/** Scan the grid for the first row that contains all three required headers. */
function findHeaderRow(grid: string[][]): HeaderLocation | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;
    let bedIdCol = -1;
    let docnumCol = -1;
    let inmateCol = -1;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (bedIdCol === -1 && matchColumn(cell, HEADER_ALIASES.bedId)) bedIdCol = c;
      else if (docnumCol === -1 && matchColumn(cell, HEADER_ALIASES.docnum)) docnumCol = c;
      else if (inmateCol === -1 && matchColumn(cell, HEADER_ALIASES.inmateName)) inmateCol = c;
    }
    if (bedIdCol !== -1 && docnumCol !== -1 && inmateCol !== -1) {
      return { rowIndex: r, bedIdCol, docnumCol, inmateCol };
    }
  }
  return null;
}

function gridToBedBook(
  grid: string[][],
  delimiter: string,
  headerScanLabel: string,
): ParsedBedBook {
  if (grid.length === 0) {
    throw new BedBookParseError("The Bed Book file is empty.");
  }

  const header = findHeaderRow(grid);
  if (!header) {
    throw new BedBookParseError(
      "Could not find a header row containing BED-ID, DOCNUM, and INMATE-NAME.",
    );
  }

  const rows: RawBedRow[] = [];
  for (let r = header.rowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;
    const bedId = (row[header.bedIdCol] ?? "").toString().trim();
    const docnum = (row[header.docnumCol] ?? "").toString().trim();
    const inmateName = (row[header.inmateCol] ?? "").toString().trim();
    // Skip rows with no cell/bed number associated with them.
    if (!bedId) continue;
    // Skip cells without an actual inmate name (empty, or occupancy
    // placeholders like "VACANT" / "UNDER MAINT").
    if (isPlaceholderName(inmateName)) continue;
    rows.push({ bedId, docnum, inmateName, sourceRow: r + 1 });
  }

  if (rows.length === 0) {
    throw new BedBookParseError(`No valid roster rows found ${headerScanLabel}.`);
  }

  return {
    rows,
    delimiter,
    headerRowIndex: header.rowIndex,
    totalDataRows: rows.length,
  };
}

export function parseCsvBedBook(text: string): ParsedBedBook {
  if (!text || text.trim().length === 0) {
    throw new BedBookParseError("The Bed Book file is empty.");
  }
  const { grid, delimiter } = csvToGrid(text);
  return gridToBedBook(grid, delimiter, "after the header row");
}

export function parseXlsxBedBook(data: ArrayBuffer): ParsedBedBook {
  const wb = XLSX.read(data, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new BedBookParseError("The Bed Book workbook has no sheets.");
  const sheet = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return gridToBedBook(grid as string[][], "(workbook)", "in the workbook");
}

export async function parseBedBookFile(file: File): Promise<ParsedBedBook> {
  const name = file.name.toLowerCase();
  const isExcel =
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsm") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel");

  if (isExcel) {
    const buf = await file.arrayBuffer();
    return parseXlsxBedBook(buf);
  }

  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type.includes("csv") || file.type === "text/plain") {
    const text = await file.text();
    return parseCsvBedBook(text);
  }

  throw new BedBookParseError(
    "Unsupported file type. Upload a .csv, .xlsx, or .xls Bed Book file.",
  );
}
