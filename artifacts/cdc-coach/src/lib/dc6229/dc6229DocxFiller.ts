import PizZip from "pizzip";

/**
 * DC6-229 "Daily Record of Special Housing" autofill.
 *
 * The original government Word form is NEVER recreated — we open the real
 * `dc6-229-template.docx`, clone its single 2-page form section once per inmate
 * (each clone starts a new page), fill ONLY the five page-1 data points by their
 * absolute FORMTEXT index, inject the 7 week dates into the daily grid's
 * Day/Date column, strip duplicate-id bookmarks, and re-zip. Page 2 of every form
 * is preserved byte-for-byte. Any structural drift fails loudly rather than
 * writing into the wrong boxes.
 *
 * Field layout (verified against the template, FORMTEXT document order):
 *   F1  = Inmate Name        F10 = FDC#
 *   F18 = printed "B" dorm letter (NEVER filled — used as an anchor check)
 *   F19 = cell # (portion after the "B")
 *   F21 = Status
 * Remarks fields F25–F38 and all other fields are left untouched.
 */
export class Dc6229DocxError extends Error {}

export interface Dc6229FormData {
  inmateName: string;
  fdc: string;
  cellNumber: string;
  status: string;
  /** 7 already-formatted day strings, Sunday..Saturday. */
  dates: string[];
}

export interface Dc6229FillInput {
  forms: Dc6229FormData[];
}

const EXPECTED_FIELD_COUNT = 39;
const FIELD_INMATE_NAME = 1;
const FIELD_FDC = 10;
const FIELD_PRINTED_B = 18; // anchor — must read "B"; never written
const FIELD_CELL = 19;
const FIELD_STATUS = 21;

// The daily-grid Day/Date column (cell 0) has 14 vMerge=restart "date boxes"
// after the "Date" header cell. Dates go in the TOP box of each pair, so the box
// directly beneath each date stays blank.
const DATE_BOX_COUNT = 14;
const DATE_BOX_TARGETS = [0, 2, 4, 6, 8, 10, 12];
const GRID_TABLE_INDEX = 1; // 2nd top-level table

const HEADER_RUN_PR =
  '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/></w:rPr>';
const DATE_RUN_PR =
  '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="14"/></w:rPr>';

function escapeXml(value: string): string {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildResultRuns(value: string, runPr: string): string {
  const text = value ?? "";
  if (text.length === 0) {
    return `<w:r>${runPr}<w:t xml:space="preserve"></w:t></w:r>`;
  }
  return text
    .split("\n")
    .map((line, i) => {
      const br = i === 0 ? "" : "<w:br/>";
      return `<w:r>${runPr}${br}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`;
    })
    .join("");
}

// Matches a FORMTEXT field's result region (from the `separate` fldChar to the
// `end` fldChar). Mirrors the proven Search Log filler so behavior is identical.
const FIELD_RESULT_RE =
  /(<w:fldChar w:fldCharType="separate"\/><\/w:r>)([\s\S]*?)(<w:r\b[^>]*>(?:<w:rPr>(?:(?!<\/w:r>)[\s\S])*?<\/w:rPr>)?<w:fldChar w:fldCharType="end"\/><\/w:r>)/;
const FIELD_RESULT_RE_G = new RegExp(FIELD_RESULT_RE.source, "g");

const TABLE_RE = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
const ROW_RE = /<w:tr\b[\s\S]*?<\/w:tr>/g;
const FIRST_CELL_RE = /<w:tc>[\s\S]*?<\/w:tc>/;
// The single (empty) paragraph inside a Day/Date box. Each date box holds
// exactly one paragraph, so a non-global match safely targets just that cell's.
const CELL_PARAGRAPH_RE = /<w:p\b[\s\S]*?<\/w:p>/;

/** Fail loudly if the form's field layout does not match the known template. */
function validateFieldLayout(fragment: string): void {
  const sepCount = (fragment.match(/<w:fldChar w:fldCharType="separate"\/>/g) || []).length;
  if (sepCount !== EXPECTED_FIELD_COUNT) {
    throw new Dc6229DocxError(
      `DC6-229 template has ${sepCount} form fields; expected ${EXPECTED_FIELD_COUNT}. The template may be the wrong file or has changed — refusing to fill.`,
    );
  }
  let idx = -1;
  let matchCount = 0;
  let bAnchorOk = false;
  fragment.replace(FIELD_RESULT_RE_G, (m, _pre, mid) => {
    idx += 1;
    matchCount += 1;
    if (idx === FIELD_PRINTED_B && stripTags(mid as string) === "B") bAnchorOk = true;
    return m as string;
  });
  if (matchCount !== EXPECTED_FIELD_COUNT) {
    throw new Dc6229DocxError(
      `DC6-229 field structure not recognized (${matchCount}/${EXPECTED_FIELD_COUNT} fillable fields). Refusing to fill.`,
    );
  }
  if (!bAnchorOk) {
    throw new Dc6229DocxError(
      'DC6-229 layout check failed: the printed "B" dorm marker was not at its expected position. Refusing to fill to avoid writing into the wrong boxes.',
    );
  }
}

/** Replace the result text of the FORMTEXT fields whose index is in `values`. */
function fillFieldsByIndex(fragment: string, values: Map<number, string>): string {
  let idx = -1;
  return fragment.replace(FIELD_RESULT_RE_G, (m, pre, _mid, post) => {
    idx += 1;
    if (values.has(idx)) {
      return `${pre as string}${buildResultRuns(values.get(idx) ?? "", HEADER_RUN_PR)}${post as string}`;
    }
    return m as string;
  });
}

/**
 * Inject the 7 dates into the daily grid's Day/Date column (cell 0). The first
 * vMerge=restart cell is the "Date" header (skipped); the next 14 are date boxes,
 * and dates land in the top box of each pair. Fails loudly on a box-count mismatch.
 */
// Builds the replacement paragraph for a filled Day/Date box. Every target box
// gets the SAME centered, single-spaced paragraph so all 7 look identical
// regardless of the template cell's original style (one box is Heading3/left,
// the rest are plain/centered). A "dayPrefixed" value arrives as
// "Sun\n06/14/26" and becomes the day stacked directly over the date via a hard
// line break; a date-only value is a single centered line.
function buildDateParagraph(value: string): string {
  const runs = buildResultRuns(value, DATE_RUN_PR);
  return (
    "<w:p><w:pPr><w:jc w:val=\"center\"/>" +
    "<w:spacing w:before=\"0\" w:after=\"0\" w:line=\"240\" w:lineRule=\"auto\"/>" +
    `</w:pPr>${runs}</w:p>`
  );
}

function injectDates(gridXml: string, dates: string[]): string {
  let restartSeen = 0;
  let boxIdx = -1;
  let injected = 0;
  const out = gridXml.replace(ROW_RE, (row) => {
    const cm = row.match(FIRST_CELL_RE);
    if (!cm) return row;
    const c0 = cm[0];
    if (!/<w:vMerge\b[^>]*w:val="restart"/.test(c0)) return row;
    restartSeen += 1;
    if (restartSeen === 1) return row; // the "Date" header cell
    boxIdx += 1;
    const di = DATE_BOX_TARGETS.indexOf(boxIdx);
    if (di === -1) return row; // the lower (blank) box of each pair
    // Replace the cell's single (empty) paragraph entirely so every date box
    // shares one consistent layout. Cell geometry (tcPr: width, borders,
    // vMerge, vAlign) is preserved — only the paragraph content changes.
    if (!CELL_PARAGRAPH_RE.test(c0)) {
      throw new Dc6229DocxError(
        `DC6-229 daily grid: date box ${boxIdx} has no paragraph to fill. Refusing to fill.`,
      );
    }
    const para = buildDateParagraph(dates[di] ?? "");
    const newC0 = c0.replace(CELL_PARAGRAPH_RE, () => para);
    injected += 1;
    return row.replace(c0, () => newC0);
  });

  const boxes = restartSeen - 1;
  if (boxes !== DATE_BOX_COUNT) {
    throw new Dc6229DocxError(
      `DC6-229 daily grid: expected ${DATE_BOX_COUNT} date boxes, found ${boxes}. Refusing to fill.`,
    );
  }
  if (injected !== DATE_BOX_TARGETS.length) {
    throw new Dc6229DocxError(
      `DC6-229 daily grid: filled ${injected}/${DATE_BOX_TARGETS.length} date boxes. Refusing to fill.`,
    );
  }
  return out;
}

function fillOneForm(formTemplate: string, form: Dc6229FormData): string {
  if (form.dates.length !== 7) {
    throw new Dc6229DocxError(
      `DC6-229 expects exactly 7 week dates per form; received ${form.dates.length}. Refusing to fill.`,
    );
  }
  const values = new Map<number, string>([
    [FIELD_INMATE_NAME, form.inmateName],
    [FIELD_FDC, form.fdc],
    [FIELD_CELL, form.cellNumber],
    [FIELD_STATUS, form.status],
  ]);
  let xml = fillFieldsByIndex(formTemplate, values);

  const tables = xml.match(TABLE_RE) || [];
  if (tables.length <= GRID_TABLE_INDEX) {
    throw new Dc6229DocxError("DC6-229 daily grid table not found in the template.");
  }
  const grid = tables[GRID_TABLE_INDEX];
  const filledGrid = injectDates(grid, form.dates);
  xml = xml.replace(grid, () => filledGrid);
  return xml;
}

/** Pure XML transform: documentXml -> filled documentXml (one form per inmate). */
export function buildFilledDocumentXml(documentXml: string, input: Dc6229FillInput): string {
  // cloneUnit = body content up to & incl. the paragraph holding the first
  // (paragraph-level) sectPr. trailer = trailing paragraph + final body sectPr.
  const m = documentXml.match(
    /^([\s\S]*?<w:body>)([\s\S]*?<w:sectPr\b[\s\S]*?<\/w:sectPr>[\s\S]*?<\/w:p>)([\s\S]*<\/w:body>[\s\S]*)$/,
  );
  if (!m) {
    throw new Dc6229DocxError(
      "DC6-229 template structure not recognized (missing body/section). Refusing to fill.",
    );
  }
  const [, prefix, formTemplate, trailer] = m;
  validateFieldLayout(formTemplate);

  const forms = input.forms;
  if (forms.length === 0) {
    throw new Dc6229DocxError("No inmates selected — nothing to generate.");
  }

  const filled = forms.map((f) => fillOneForm(formTemplate, f)).join("");
  let finalXml = prefix + filled + trailer;
  // Bookmarks are the only duplicate-id hazard once the section is cloned.
  finalXml = finalXml
    .replace(/<w:bookmarkStart\b[^>]*\/>/g, "")
    .replace(/<w:bookmarkEnd\b[^>]*\/>/g, "");
  return finalXml;
}

/** Fetch the template, fill it, and return the packet as a .docx Blob. */
export async function fillDc6229Docx(
  templateUrl: string,
  input: Dc6229FillInput,
): Promise<Blob> {
  let resp: Response;
  try {
    resp = await fetch(templateUrl);
  } catch (err) {
    throw new Dc6229DocxError(`Could not load the DC6-229 template: ${String(err)}`);
  }
  if (!resp.ok) {
    throw new Dc6229DocxError(`DC6-229 template could not be loaded (HTTP ${resp.status}).`);
  }

  const buf = await resp.arrayBuffer();
  let zip: PizZip;
  try {
    zip = new PizZip(buf);
  } catch (err) {
    throw new Dc6229DocxError(`DC6-229 template is not a valid .docx file: ${String(err)}`);
  }

  const docFile = zip.files["word/document.xml"];
  if (!docFile) {
    throw new Dc6229DocxError("DC6-229 template is invalid: word/document.xml was not found.");
  }

  const filled = buildFilledDocumentXml(docFile.asText(), input);
  zip.file("word/document.xml", filled);

  return zip.generate({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
