import PizZip from "pizzip";
import { ROWS_PER_PAGE } from "./types";

export class SearchLogDocxError extends Error {}

export interface DocxFillRow {
  date: string;
  time: string;
  area: string;
  type: string;
  inmate: string; // may contain "\n" for multiple inmates in one cell
  officer: string;
  discrepancies: string;
  tablet: string;
}

export interface DocxFillInput {
  location: string;
  rows: DocxFillRow[];
}

const RUN_PR = '<w:rPr><w:sz w:val="20"/></w:rPr>';

function escapeXml(value: string): string {
  return (value ?? "")
    // Drop characters illegal in XML 1.0 (keep tab; \n/\r are handled by line splitting).
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the run(s) that replace a FORMTEXT field's result, honoring line breaks. */
function buildResultRuns(value: string): string {
  const text = value ?? "";
  if (text.length === 0) {
    return `<w:r>${RUN_PR}<w:t xml:space="preserve"></w:t></w:r>`;
  }
  const lines = text.split("\n");
  return lines
    .map((line, idx) => {
      const t = `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
      const br = idx === 0 ? "" : "<w:br/>";
      return `<w:r>${RUN_PR}${br}${t}</w:r>`;
    })
    .join("");
}

const FIELD_RESULT_RE =
  /(<w:fldChar w:fldCharType="separate"\/><\/w:r>)([\s\S]*?)(<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:fldChar w:fldCharType="end"\/><\/w:r>)/;

/** Replace the first FORMTEXT field result inside the given XML fragment. */
function fillFirstField(fragment: string, value: string): string {
  if (!FIELD_RESULT_RE.test(fragment)) return fragment;
  const runs = buildResultRuns(value);
  return fragment.replace(FIELD_RESULT_RE, (_m, pre: string, _mid: string, post: string) => {
    return `${pre}${runs}${post}`;
  });
}

const TABLE_RE = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const ROW_RE = /<w:tr\b[\s\S]*?<\/w:tr>/g;
const CELL_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;

function fillDataRow(rowXml: string, values: string[]): string {
  let i = 0;
  return rowXml.replace(CELL_RE, (cell) => {
    const v = values[i] ?? "";
    i++;
    return fillFirstField(cell, v);
  });
}

function fillDataTable(tableXml: string, rows: DocxFillRow[]): string {
  let dataIdx = 0;
  return tableXml.replace(ROW_RE, (row) => {
    // The header row carries the literal column titles; data rows are blank fields.
    if (row.includes("Area/Bunk Searched")) return row;
    const entry = rows[dataIdx];
    dataIdx++;
    if (!entry) return row; // leave remaining rows blank
    return fillDataRow(row, [
      entry.date,
      entry.time,
      entry.area,
      entry.type,
      entry.inmate,
      entry.officer,
      entry.discrepancies,
      entry.tablet,
    ]);
  });
}

function fillPage(pageTemplate: string, location: string, rows: DocxFillRow[]): string {
  const tables: string[] = pageTemplate.match(TABLE_RE) ?? [];
  const locationTable = tables.find((t) => t.includes("Location:"));
  const dataTable = tables.find((t) => t.includes("Area/Bunk Searched"));

  if (!dataTable) {
    throw new SearchLogDocxError("Search Log table not found in the DOCX template.");
  }
  // Fail loudly if the template's data-row capacity is smaller than expected,
  // otherwise entries beyond the available rows would be silently dropped.
  const allRows: string[] = dataTable.match(ROW_RE) ?? [];
  const dataRowCount = allRows.filter((r) => !r.includes("Area/Bunk Searched")).length;
  if (dataRowCount < ROWS_PER_PAGE) {
    throw new SearchLogDocxError(
      `Search Log template has only ${dataRowCount} data row(s); ${ROWS_PER_PAGE} are required per page. The template may be the wrong file.`,
    );
  }

  let out = pageTemplate;
  if (locationTable) {
    const filledLoc = fillFirstField(locationTable, location);
    out = out.replace(locationTable, () => filledLoc);
  }
  const filledData = fillDataTable(dataTable, rows);
  out = out.replace(dataTable, () => filledData);
  return out;
}

const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/**
 * Pure transform: take the original document.xml and produce a completed one.
 * - Clones the whole page (title + Location table + 19-row Search Log table +
 *   instruction text) once per 19 entries, joined by real page breaks.
 * - Keeps the single trailing <w:sectPr> so section/footer settings repeat.
 * - Strips bookmarks to avoid duplicate-ID corruption across cloned pages.
 */
export function buildFilledDocumentXml(documentXml: string, input: DocxFillInput): string {
  const bodyMatch = documentXml.match(
    /^([\s\S]*<w:body>)([\s\S]*?)(<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*<\/w:body>[\s\S]*)$/,
  );
  if (!bodyMatch) {
    throw new SearchLogDocxError("DOCX template structure not recognized (missing body/section).");
  }
  const [, prefix, pageTemplate, suffix] = bodyMatch;

  // Validate the template actually contains the Search Log table before cloning.
  const tables: string[] = pageTemplate.match(TABLE_RE) ?? [];
  if (!tables.some((t) => t.includes("Area/Bunk Searched"))) {
    throw new SearchLogDocxError("Search Log table not found in the DOCX template.");
  }

  const rows = input.rows;
  const numPages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

  const pages: string[] = [];
  for (let p = 0; p < numPages; p++) {
    const slice = rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    pages.push(fillPage(pageTemplate, input.location, slice));
  }

  let body = pages.join(PAGE_BREAK);
  let finalXml = prefix + body + suffix;
  finalXml = finalXml
    .replace(/<w:bookmarkStart\b[^>]*\/>/g, "")
    .replace(/<w:bookmarkEnd\b[^>]*\/>/g, "");
  return finalXml;
}

/** Browser entry point: fetch the original template, fill it, return a Blob. */
export async function fillSearchLogDocx(
  templateUrl: string,
  input: DocxFillInput,
): Promise<Blob> {
  let resp: Response;
  try {
    resp = await fetch(templateUrl);
  } catch (err) {
    throw new SearchLogDocxError(`Could not load the Search Log template: ${String(err)}`);
  }
  if (!resp.ok) {
    throw new SearchLogDocxError(`DOCX template missing (HTTP ${resp.status}).`);
  }
  const buf = await resp.arrayBuffer();

  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch (err) {
    throw new SearchLogDocxError(`Search Log template is not a valid DOCX: ${String(err)}`);
  }
  const docFile = zip.files["word/document.xml"];
  if (!docFile) {
    throw new SearchLogDocxError("DOCX template is invalid: word/document.xml not found.");
  }

  const xml = docFile.asText();
  const filled = buildFilledDocumentXml(xml, input);
  zip.file("word/document.xml", filled);

  return zip.generate({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
