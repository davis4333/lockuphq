/**
 * Confinement Rules acknowledgment filler.
 *
 * SACROSANCT: fills ONLY the original `confinement-rules-template.docx`. It writes
 * into the acknowledgment block (the table's only fill rows), placing values on
 * the lines ABOVE their printed labels:
 *   - row 27 cell 0 -> Inmate's Printed Name
 *   - row 27 cell 4 -> FDC Number
 *   - row 27 cell 6 -> Date
 *   - row 29 cell 0 -> Officer's Printed Name
 *   - row 29 cell 4 -> Rank
 *   - row 29 cell 6 -> Date
 * The two signature cells (cell 2 of each fill row) are left untouched, as is all
 * rule text and geometry. Label rows 28 / 30 are validated; it throws on drift.
 */
import PizZip from "pizzip";
import {
  firstTable,
  getRows,
  getCells,
  cellText,
  rebuildRow,
  injectFittedRunIntoEmptyParagraph,
} from "./docxCellUtils";

export class ConfinementRulesDocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfinementRulesDocxError";
  }
}

export interface ConfinementRulesFormData {
  /** "Last, First" */
  inmateName: string;
  /** FDC / DC number */
  fdc: string;
  /** Date, formatted for print (e.g. "06/20/26"). */
  date: string;
  /** Officer's printed name. */
  officerName: string;
  /** Officer's rank (e.g. "Sgt."). */
  officerRank: string;
}

const INMATE_ROW = 27;
const INMATE_LABEL_ROW = 28;
const OFFICER_ROW = 29;
const OFFICER_LABEL_ROW = 30;

export async function fillConfinementRulesDocx(
  templateUrl: string,
  data: ConfinementRulesFormData,
): Promise<Blob> {
  let buf: ArrayBuffer;
  try {
    const res = await fetch(templateUrl);
    if (!res.ok) {
      throw new ConfinementRulesDocxError(
        `Could not load the Confinement Rules template (HTTP ${res.status}).`,
      );
    }
    buf = await res.arrayBuffer();
  } catch (err) {
    if (err instanceof ConfinementRulesDocxError) throw err;
    throw new ConfinementRulesDocxError(
      `Could not load the Confinement Rules template: ${String(err)}`,
    );
  }

  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch (err) {
    throw new ConfinementRulesDocxError(
      `The Confinement Rules template is not a valid .docx: ${String(err)}`,
    );
  }

  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new ConfinementRulesDocxError(
      "The Confinement Rules template is missing word/document.xml.",
    );
  }
  const xml = docFile.asText();

  const table0 = firstTable(xml);
  if (!table0) {
    throw new ConfinementRulesDocxError(
      "The Confinement Rules template has no table.",
    );
  }

  const rows = getRows(table0);
  if (rows.length <= OFFICER_LABEL_ROW) {
    throw new ConfinementRulesDocxError(
      `The Confinement Rules table has ${rows.length} rows; expected more than ${OFFICER_LABEL_ROW}. Template may have changed.`,
    );
  }

  // Validate the label rows so values land on the correct lines.
  const inmateLabels = getCells(rows[INMATE_LABEL_ROW]).map((c) => cellText(c));
  if (
    !inmateLabels[0]?.includes("Printed Name") ||
    !inmateLabels[4]?.includes("FDC") ||
    !inmateLabels[6]?.includes("Date")
  ) {
    throw new ConfinementRulesDocxError(
      "The inmate acknowledgment labels do not match the expected layout.",
    );
  }
  const officerLabels = getCells(rows[OFFICER_LABEL_ROW]).map((c) => cellText(c));
  if (
    !officerLabels[0]?.includes("Printed Name") ||
    !officerLabels[4]?.includes("Rank") ||
    !officerLabels[6]?.includes("Date")
  ) {
    throw new ConfinementRulesDocxError(
      "The officer acknowledgment labels do not match the expected layout.",
    );
  }

  let newTable = table0;

  // Inmate row: name (0), FDC (4), date (6). Signature cell (2) left blank.
  {
    const cells = getCells(rows[INMATE_ROW]);
    if (cells.length < 7) {
      throw new ConfinementRulesDocxError(
        `The inmate acknowledgment row has ${cells.length} cells; expected 7.`,
      );
    }
    cells[0] = injectFittedRunIntoEmptyParagraph(cells[0], data.inmateName);
    cells[4] = injectFittedRunIntoEmptyParagraph(cells[4], data.fdc);
    cells[6] = injectFittedRunIntoEmptyParagraph(cells[6], data.date);
    newTable = newTable.replace(rows[INMATE_ROW], rebuildRow(rows[INMATE_ROW], cells));
  }

  // Officer row: name (0), rank (4), date (6). Signature cell (2) left blank.
  {
    const cells = getCells(rows[OFFICER_ROW]);
    if (cells.length < 7) {
      throw new ConfinementRulesDocxError(
        `The officer acknowledgment row has ${cells.length} cells; expected 7.`,
      );
    }
    cells[0] = injectFittedRunIntoEmptyParagraph(cells[0], data.officerName);
    cells[4] = injectFittedRunIntoEmptyParagraph(cells[4], data.officerRank);
    cells[6] = injectFittedRunIntoEmptyParagraph(cells[6], data.date);
    newTable = newTable.replace(rows[OFFICER_ROW], rebuildRow(rows[OFFICER_ROW], cells));
  }

  const newXml = xml.replace(table0, newTable);
  if (newXml === xml) {
    throw new ConfinementRulesDocxError(
      "Confinement Rules fill produced no changes (table not spliced).",
    );
  }
  zip.file("word/document.xml", newXml);

  return zip.generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
