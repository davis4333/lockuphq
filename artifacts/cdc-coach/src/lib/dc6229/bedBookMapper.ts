import {
  BedBookParseError,
  csvToGrid,
  xlsxToGrid,
  findHeaderRow,
  isPlaceholderName,
} from "../searchLog/bedBookParser";
import { extractDcNumber } from "../searchLog/dcNumberExtractor";
import { stripDormLetter } from "./cellNumber";
import type { Dc6229Record } from "./types";

export class Dc6229ParseError extends Error {}

// Status lives in column H on the standard Bed Book export. We prefer a labeled
// header if one exists, otherwise fall back to the fixed column position (H = 7).
const STATUS_ALIASES = ["status", "stat", "housing status", "sh status", "status code"];
const STATUS_FALLBACK_COL = 7;

function norm(value: string): string {
  return (value ?? "").toString().trim().toLowerCase();
}

let counter = 0;
function rid(): string {
  counter += 1;
  return `dc6229-${Date.now().toString(36)}-${counter}`;
}

function findStatusCol(headerRow: string[]): number {
  for (let c = 0; c < headerRow.length; c++) {
    if (STATUS_ALIASES.includes(norm(headerRow[c]))) return c;
  }
  return STATUS_FALLBACK_COL;
}

function gridToRecords(grid: string[][], scanLabel: string): Dc6229Record[] {
  if (grid.length === 0) throw new Dc6229ParseError("The Bed Book file is empty.");

  const header = findHeaderRow(grid);
  if (!header) {
    throw new Dc6229ParseError(
      "Could not find a header row containing BED-ID, DOCNUM, and INMATE-NAME.",
    );
  }

  const statusCol = findStatusCol(grid[header.rowIndex] ?? []);
  const records: Dc6229Record[] = [];
  for (let r = header.rowIndex + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length === 0) continue;
    const rawCell = (row[header.bedIdCol] ?? "").toString().trim();
    const rawDocnum = (row[header.docnumCol] ?? "").toString().trim();
    const inmateName = (row[header.inmateCol] ?? "").toString().trim();
    const status = (row[statusCol] ?? "").toString().trim();
    // Skip rows with no cell, and skip occupancy placeholders (VACANT / UNDER MAINT).
    if (!rawCell) continue;
    if (isPlaceholderName(inmateName)) continue;
    const dc = extractDcNumber(rawDocnum);
    records.push({
      id: rid(),
      include: true,
      source: "bedbook",
      rawCell,
      cellNumber: stripDormLetter(rawCell),
      inmateName,
      rawDocnum,
      fdc: dc.dc,
      fdcValid: dc.valid,
      status,
    });
  }

  if (records.length === 0) {
    throw new Dc6229ParseError(`No valid roster rows found ${scanLabel}.`);
  }
  return records;
}

/** Parse an uploaded Bed Book file (CSV/XLSX/XLS) into one record per inmate. */
export async function parseBedBookForDc6229(file: File): Promise<Dc6229Record[]> {
  const name = file.name.toLowerCase();
  const isExcel =
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsm") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel");

  try {
    if (isExcel) {
      const buf = await file.arrayBuffer();
      return gridToRecords(xlsxToGrid(buf), "in the workbook");
    }
    if (
      name.endsWith(".csv") ||
      name.endsWith(".txt") ||
      file.type.includes("csv") ||
      file.type === "text/plain"
    ) {
      const text = await file.text();
      if (!text || text.trim().length === 0) {
        throw new Dc6229ParseError("The Bed Book file is empty.");
      }
      const { grid } = csvToGrid(text);
      return gridToRecords(grid, "after the header row");
    }
  } catch (err) {
    if (err instanceof Dc6229ParseError) throw err;
    if (err instanceof BedBookParseError) throw new Dc6229ParseError(err.message);
    throw new Dc6229ParseError(`Could not read the Bed Book file: ${String(err)}`);
  }

  throw new Dc6229ParseError(
    "Unsupported file type. Upload a .csv, .xlsx, or .xls Bed Book file.",
  );
}

/** A blank manual record the user fills in by hand. */
export function makeManualRecord(): Dc6229Record {
  return {
    id: rid(),
    include: true,
    source: "manual",
    rawCell: "",
    cellNumber: "",
    inmateName: "",
    rawDocnum: "",
    fdc: "",
    fdcValid: false,
    status: "",
  };
}
