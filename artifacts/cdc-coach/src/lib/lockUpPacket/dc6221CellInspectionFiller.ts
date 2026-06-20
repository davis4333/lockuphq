/**
 * DC6-221 "Cell Inspection" filler.
 *
 * SACROSANCT, like the other DOCX fillers: it fills ONLY the original government
 * `dc6-221-template.docx`. It targets the FIRST top-level table (the first-page
 * inspection) and writes into the TOP-LEFT box's ENTERED side only:
 *   - row 0 cell 1  -> Inmate Name (empty bordered line)
 *   - row 0 cell 4  -> Number / FDC (empty bordered line)
 *   - row 2 cell 0  -> cell number, appended after the form's printed "B"
 *   - row 2 cell 1  -> date entered, appended after "Entered:"
 *   - rows 4..15 cell 1 -> mark "SAT" in the Condition column
 *   - rows 4..15 cell 2 -> mark "N/A" in the Noted Discrepancies column
 * The exited side (cells 3/4), the top-right box (cells 6..10), table 1, every
 * signature line, and all cell geometry are left untouched. It validates the
 * table shape and item order and throws loudly on any drift.
 */
import PizZip from "pizzip";
import {
  firstTable,
  getRows,
  getCells,
  cellText,
  rebuildRow,
  injectFittedRunIntoEmptyParagraph,
  appendFittedRunAfterAnchor,
  markWordInCell,
} from "./docxCellUtils";

export class Dc6221DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Dc6221DocxError";
  }
}

export interface Dc6221FormData {
  /** "Last, First" */
  inmateName: string;
  /** FDC / DC number */
  number: string;
  /** Cell number AFTER the form's printed "B" (e.g. "1-106L"); may be empty. */
  cellNumber: string;
  /** Date the inmate entered the cell, formatted for print (e.g. "06/20/26"). */
  dateEntered: string;
}

const ITEM_ORDER = [
  "Walls",
  "Window",
  "Pillow",
  "Mattress",
  "Bunk",
  "Sink",
  "Ceiling",
  "Floor",
  "Toilet",
  "Door",
  "Locking Device",
  "Light",
];

/** First item row (Walls) index within table 0. Items run rows 4..15. */
const FIRST_ITEM_ROW = 4;

export async function fillDc6221Docx(
  templateUrl: string,
  data: Dc6221FormData,
): Promise<Blob> {
  let buf: ArrayBuffer;
  try {
    const res = await fetch(templateUrl);
    if (!res.ok) {
      throw new Dc6221DocxError(
        `Could not load the DC6-221 template (HTTP ${res.status}).`,
      );
    }
    buf = await res.arrayBuffer();
  } catch (err) {
    if (err instanceof Dc6221DocxError) throw err;
    throw new Dc6221DocxError(`Could not load the DC6-221 template: ${String(err)}`);
  }

  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch (err) {
    throw new Dc6221DocxError(`The DC6-221 template is not a valid .docx: ${String(err)}`);
  }

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Dc6221DocxError("The DC6-221 template is missing word/document.xml.");
  }
  const xml = docFile.asText();

  const table0 = firstTable(xml);
  if (!table0) {
    throw new Dc6221DocxError("The DC6-221 template has no inspection table.");
  }

  const rows = getRows(table0);
  if (rows.length < FIRST_ITEM_ROW + ITEM_ORDER.length) {
    throw new Dc6221DocxError(
      `The DC6-221 first table has ${rows.length} rows; expected at least ${
        FIRST_ITEM_ROW + ITEM_ORDER.length
      }. Template may have changed.`,
    );
  }

  // --- Validate the header rows so we never write into the wrong cells. ---
  const row0Cells = getCells(rows[0]);
  if (
    row0Cells.length < 5 ||
    !cellText(row0Cells[0]).includes("Inmate Name") ||
    !cellText(row0Cells[3]).includes("Number")
  ) {
    throw new Dc6221DocxError(
      "The DC6-221 header row (Inmate Name / Number) does not match the expected layout.",
    );
  }
  const row2Cells = getCells(rows[2]);
  if (
    row2Cells.length < 2 ||
    !cellText(row2Cells[0]).includes("Cell") ||
    !cellText(row2Cells[0]).includes("B") ||
    !cellText(row2Cells[1]).includes("Entered")
  ) {
    throw new Dc6221DocxError(
      "The DC6-221 cell-number / date row does not match the expected layout.",
    );
  }

  let newTable = table0;

  // --- Header: Inmate Name (cell 1) + Number (cell 4) ---
  {
    const cells = [...row0Cells];
    cells[1] = injectFittedRunIntoEmptyParagraph(cells[1], data.inmateName);
    cells[4] = injectFittedRunIntoEmptyParagraph(cells[4], data.number);
    newTable = newTable.replace(rows[0], rebuildRow(rows[0], cells));
  }

  // --- Cell number (after printed "B") + date entered ---
  // Each value is appended as its OWN run, font-shrunk so the printed label plus
  // the value stay on one physical line in these narrow boxes.
  {
    const cells = [...row2Cells];
    if (data.cellNumber.trim()) {
      // The top-left box prints "    B"; append the rest of the cell directly.
      if (!cells[0].includes("    B</w:t>")) {
        throw new Dc6221DocxError(
          'Could not locate the printed "B" anchor in the DC6-221 cell-number box.',
        );
      }
      cells[0] = appendFittedRunAfterAnchor(
        cells[0],
        "    B</w:t>",
        data.cellNumber.trim(),
      );
    }
    if (data.dateEntered.trim()) {
      if (!cells[1].includes("Entered:</w:t>")) {
        throw new Dc6221DocxError(
          'Could not locate the "Entered:" anchor in the DC6-221 date box.',
        );
      }
      cells[1] = appendFittedRunAfterAnchor(
        cells[1],
        "Entered:</w:t>",
        ` ${data.dateEntered.trim()}`,
      );
    }
    newTable = newTable.replace(rows[2], rebuildRow(rows[2], cells));
  }

  // --- Item rows: mark SAT (Condition) + N/A (Noted Discrepancies), entered side ---
  for (let i = 0; i < ITEM_ORDER.length; i++) {
    const rowXml = rows[FIRST_ITEM_ROW + i];
    const cells = getCells(rowXml);
    if (cells.length < 3) {
      throw new Dc6221DocxError(
        `DC6-221 item row ${i + 1} has only ${cells.length} cells.`,
      );
    }
    const itemName = cellText(cells[0]).trim();
    if (itemName !== ITEM_ORDER[i]) {
      throw new Dc6221DocxError(
        `DC6-221 item row ${i + 1} is "${itemName}", expected "${ITEM_ORDER[i]}". Template may have changed.`,
      );
    }
    cells[1] = markWordInCell(cells[1], "SAT");
    cells[2] = markWordInCell(cells[2], "N/A");
    newTable = newTable.replace(rowXml, rebuildRow(rowXml, cells));
  }

  const newXml = xml.replace(table0, newTable);
  if (newXml === xml) {
    throw new Dc6221DocxError("DC6-221 fill produced no changes (table not spliced).");
  }
  zip.file("word/document.xml", newXml);

  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
