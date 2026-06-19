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

// The four narrow left columns (Date, Time, Area/Bunk Searched, Type of Search)
// must each stay on a single readable line. Rather than shrink them all to a
// fixed small size, we keep them at the SAME 10pt (sz20) as the wide columns
// whenever the value fits on one line, and only step the font down (per value)
// for the rare value that would otherwise wrap. Time and Area also get a
// non-breaking space/hyphen so the chosen size renders as one unbroken token.
const NARROW_COLS = new Set([0, 1, 2, 3]); // date, time, area/bunk, type of search

// Times New Roman advance widths in font design units (1 em = 2048 units).
// Used to estimate a value's single-line width so we can pick the largest font
// size that still fits the column. Bias toward the real metrics; unknown chars
// fall back to a wide default so we under- rather than over-fill.
const TNR_EM_UNITS = 2048;
const TNR_DEFAULT_UNITS = 1024;
const TNR_WIDTHS: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  for (const d of "0123456789") m[d] = 1024;
  const upper: Record<string, number> = {
    A: 1479, B: 1366, C: 1366, D: 1479, E: 1251, F: 1139, G: 1479, H: 1479,
    I: 682, J: 797, K: 1479, L: 1251, M: 1821, N: 1479, O: 1479, P: 1139,
    Q: 1479, R: 1366, S: 1139, T: 1251, U: 1479, V: 1479, W: 1933, X: 1479,
    Y: 1479, Z: 1251,
  };
  const lower: Record<string, number> = {
    a: 909, b: 1024, c: 909, d: 1024, e: 909, f: 682, g: 1024, h: 1024,
    i: 569, j: 569, k: 1024, l: 569, m: 1593, n: 1024, o: 1024, p: 1024,
    q: 1024, r: 682, s: 797, t: 569, u: 1024, v: 1024, w: 1479, x: 1024,
    y: 1024, z: 909,
  };
  Object.assign(m, upper, lower);
  m[" "] = 512;
  m["\u00A0"] = 512; // non-breaking space
  m["-"] = 682;
  m["\u2011"] = 682; // non-breaking hyphen
  m["/"] = 569;
  m[":"] = 569;
  m["."] = 512;
  m[","] = 512;
  return m;
})();

const CELL_SIDE_MARGIN_TWIPS = 115; // Word default cell padding (~0.08in) per side
const FIT_BUFFER_TWIPS = 10; // small cushion so a borderline value never overflows
const FONT_SIZE_CANDIDATES = [20, 19, 18, 17, 16, 15, 14]; // half-points: 10pt down to 7pt
// Attribute order isn't guaranteed in OOXML, so match the whole <w:tcW> tag and
// pull w:w out of it regardless of where it sits.
const TCW_RE = /<w:tcW\b[^>]*?\bw:w="(\d+)"/;

/** Estimate the rendered width (twips) of one line of text at the given size. */
function estimateTextTwips(text: string, szHalfPoints: number): number {
  let units = 0;
  for (const ch of text) units += TNR_WIDTHS[ch] ?? TNR_DEFAULT_UNITS;
  // em width in twips = points * 20 = (sz/2) * 20 = sz * 10
  return (units * szHalfPoints * 10) / TNR_EM_UNITS;
}

/**
 * Largest size (capped at 10pt to match the wide columns) at which `text` is
 * estimated to fit on one line of the cell; if even the smallest candidate
 * doesn't fit (pathologically long value), returns that floor size.
 */
function fitNarrowRunPr(text: string, colTwips: number): string {
  const usable = colTwips - 2 * CELL_SIDE_MARGIN_TWIPS - FIT_BUFFER_TWIPS;
  for (const sz of FONT_SIZE_CANDIDATES) {
    if (estimateTextTwips(text, sz) <= usable) {
      return `<w:rPr><w:sz w:val="${sz}"/></w:rPr>`;
    }
  }
  const floor = FONT_SIZE_CANDIDATES[FONT_SIZE_CANDIDATES.length - 1];
  return `<w:rPr><w:sz w:val="${floor}"/></w:rPr>`;
}

function fillDataRow(rowXml: string, values: string[], adaptiveCols: Set<number>): string {
  let i = 0;
  return rowXml.replace(CELL_RE, (cell) => {
    const idx = i;
    const v = values[idx] ?? "";
    i++;
    let runPr = RUN_PR;
    if (adaptiveCols.has(idx)) {
      const m = cell.match(TCW_RE);
      const colTwips = m ? parseInt(m[1], 10) : 900;
      runPr = fitNarrowRunPr(v, colTwips);
    }
    return fillFirstField(cell, v, runPr);
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
    const values = [
      entry.date,
      entry.time.replace(/ /g, "\u00A0"), // keep the time (e.g. "2:30 A") on one line
      entry.area.replace(/-/g, "\u2011"), // keep the bunk code on one line
      entry.type,
      entry.inmate,
      entry.officer,
      entry.discrepancies,
      entry.tablet,
    ];
    return fillDataRow(row, values, NARROW_COLS);
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
