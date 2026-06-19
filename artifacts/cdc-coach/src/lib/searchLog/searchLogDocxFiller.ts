import PizZip from "pizzip";
import { ROWS_PER_PAGE } from "./types";
import {
  collapseToLine,
  fitFontSize,
  inmateOneLine,
  ONE_LINE_CANDIDATES,
  SEARCH_LOG_COL_TWIPS,
} from "./searchLogTextFit";

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
  // No-op for the filler: every cell is now kept on one line and font-fit
  // individually, so the inmate column no longer depends on this flag. Retained
  // only so existing callers (row builder / UI) keep compiling.
  inmateFit?: boolean;
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
function buildResultRuns(value: string, runPr: string = RUN_PR): string {
  const text = value ?? "";
  if (text.length === 0) {
    return `<w:r>${runPr}<w:t xml:space="preserve"></w:t></w:r>`;
  }
  const lines = text.split("\n");
  return lines
    .map((line, idx) => {
      const t = `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
      const br = idx === 0 ? "" : "<w:br/>";
      return `<w:r>${runPr}${br}${t}</w:r>`;
    })
    .join("");
}

// The "end" run is matched with an rPr that cannot cross a run boundary
// ((?!</w:r>)), so the lazy middle group captures and discards ALL of the
// original FORMTEXT placeholder runs (e.g. a 5-space "<w:t>     </w:t>" plus
// empty runs) instead of letting them survive inside the end-run capture.
const FIELD_RESULT_RE =
  /(<w:fldChar w:fldCharType="separate"\/><\/w:r>)([\s\S]*?)(<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/w:r>)[\s\S])*?<\/w:rPr>)?<w:fldChar w:fldCharType="end"\/><\/w:r>)/;

/** Replace the first FORMTEXT field result inside the given XML fragment. */
function fillFirstField(fragment: string, value: string, runPr: string = RUN_PR): string {
  if (!FIELD_RESULT_RE.test(fragment)) return fragment;
  const runs = buildResultRuns(value, runPr);
  return fragment.replace(FIELD_RESULT_RE, (_m, pre: string, _mid: string, post: string) => {
    return `${pre}${runs}${post}`;
  });
}

const TABLE_RE = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const ROW_RE = /<w:tr\b[\s\S]*?<\/w:tr>/g;
const CELL_RE = /<w:tc>[\s\S]*?<\/w:tc>/g;

// Every filled data cell is kept on a single physical line by shrinking ONLY
// that cell's own font (10pt down to a 6pt floor) — never by changing column
// widths, row heights, or any other table geometry. Each cell's real <w:tcW> is
// read so the chosen size matches the actual column; the review UI uses the same
// width math (SEARCH_LOG_COL_TWIPS) so its overflow warnings stay in lockstep.

// Attribute order isn't guaranteed in OOXML, so match the whole <w:tcW> tag and
// pull w:w out of it regardless of where it sits.
const TCW_RE = /<w:tcW\b[^>]*?\bw:w="(\d+)"/;

/** Cell width in twips, read from the cell's <w:tcW>; falls back to `dflt`. */
function cellTwips(cell: string, dflt: number): number {
  const m = cell.match(TCW_RE);
  return m ? parseInt(m[1], 10) : dflt;
}

/** A run-properties fragment that sets only the font size (half-points). */
function szRunPr(sz: number): string {
  return `<w:rPr><w:sz w:val="${sz}"/></w:rPr>`;
}

/**
 * Fill one data row. Each cell's already-one-lined value is fit to the largest
 * font (down to the 6pt floor) at which it stays on a single line within that
 * cell's real width. Only the inserted run's font size changes — the cell, row,
 * and table geometry are left exactly as the template defines them.
 */
function fillDataRow(rowXml: string, values: string[]): string {
  let i = 0;
  return rowXml.replace(CELL_RE, (cell) => {
    const idx = i;
    const v = values[idx] ?? "";
    i++;
    const width = cellTwips(cell, SEARCH_LOG_COL_TWIPS[idx] ?? SEARCH_LOG_COL_TWIPS[1]);
    const sz = fitFontSize(v, width, ONE_LINE_CANDIDATES);
    return fillFirstField(cell, v, szRunPr(sz));
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
    // Collapse every value to ONE line up front so each cell can be font-fit to a
    // single line. The inmate column joins its segments with " / "; the others
    // collapse stray line breaks. Time and Area also get a non-breaking space /
    // hyphen so their short tokens never break mid-value at the chosen size.
    const values = [
      collapseToLine(entry.date),
      collapseToLine(entry.time).replace(/ /g, "\u00A0"),
      collapseToLine(entry.area).replace(/-/g, "\u2011"),
      collapseToLine(entry.type),
      inmateOneLine(entry.inmate),
      collapseToLine(entry.officer),
      collapseToLine(entry.discrepancies),
      collapseToLine(entry.tablet),
    ];
    return fillDataRow(row, values);
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
 * The blank form carries its "DC6-2001 (Revised 12/5/23)" form-number line in a
 * first-page-only footer: the section sets <w:titlePg/> and references the footer
 * with <w:footerReference w:type="first">. Continuation pages are non-first pages
 * of the same section, so with no default footer they render blank and lose that
 * line. Mirror the first-page footer as the default footer (same footer part) so
 * every page shows the identical original footer.
 *
 * Idempotent and conservative: a no-op when there is no first-page footer or a
 * default footer already exists. Only the section's <w:sectPr> is touched — the
 * footer part itself and all page content are left exactly as the template has them.
 */
function mirrorFirstPageFooterToAllPages(sectionXml: string): string {
  return sectionXml.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/, (sectPr) => {
    const firstRef = sectPr.match(
      /<w:footerReference\b[^>]*\bw:type="first"[^>]*\/>/,
    );
    if (!firstRef) return sectPr;
    if (/<w:footerReference\b[^>]*\bw:type="default"/.test(sectPr)) return sectPr;
    const defaultRef = firstRef[0].replace('w:type="first"', 'w:type="default"');
    // Header/footer references must stay at the start of <w:sectPr>; the first-page
    // reference already leads, so insert the default reference immediately after it.
    return sectPr.replace(firstRef[0], firstRef[0] + defaultRef);
  });
}

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
  // Ensure the original first-page footer (the "DC6-2001 (Revised …)" line) also
  // shows on every continuation page by mirroring it as the section's default footer.
  const sectionSuffix = mirrorFirstPageFooterToAllPages(suffix);
  let finalXml = prefix + body + sectionSuffix;
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
