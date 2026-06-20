/**
 * Shared low-level WordprocessingML helpers for the Lock-Up Packet fillers.
 *
 * These operate on the raw `word/document.xml` string of an ORIGINAL government
 * form (never a recreated one). They only ever:
 *   - inject a single run into an otherwise-empty cell paragraph, or
 *   - underline+bold an existing word already printed in a cell ("SAT", "N/A"),
 *   - append user text immediately after an existing printed run.
 * They never alter cell widths, borders, row heights, page size, or signatures.
 *
 * All cell/row splitting assumes NON-nested tables (true for the DC6-221 and
 * Confinement Rules templates), so non-greedy `<w:tc>…</w:tc>` / `<w:tr>…</w:tr>`
 * matching is safe.
 */

import {
  estimateTextTwips,
  usableCellTwips,
  ONE_LINE_CANDIDATES,
} from "@/lib/searchLog/searchLogTextFit";

/** Escape a raw user string for insertion into XML text. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** First complete (non-nested) `<w:tbl>…</w:tbl>` block, or null. */
export function firstTable(documentXml: string): string | null {
  const m = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(documentXml);
  return m ? m[0] : null;
}

/** All `<w:tr…>…</w:tr>` rows of a table, in document order. */
export function getRows(tableXml: string): string[] {
  return [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
}

/** All `<w:tc>…</w:tc>` cells of a row, in document order. */
export function getCells(rowXml: string): string[] {
  return [...rowXml.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((m) => m[0]);
}

/** Concatenated visible text of a cell (raw, still XML-escaped). */
export function cellText(cellXml: string): string {
  return [...cellXml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join("");
}

/**
 * Rebuild a row from a (same-length) array of replacement cells, preserving the
 * row's prefix (`<w:tr…><w:trPr>…`) and suffix (`</w:tr>`) exactly.
 */
export function rebuildRow(rowXml: string, newCells: string[]): string {
  const firstTc = rowXml.indexOf("<w:tc>");
  const lastClose = rowXml.lastIndexOf("</w:tc>");
  if (firstTc === -1 || lastClose === -1) {
    throw new Error("rebuildRow: row has no <w:tc> cells");
  }
  const prefix = rowXml.slice(0, firstTc);
  const suffix = rowXml.slice(lastClose + "</w:tc>".length);
  return prefix + newCells.join("") + suffix;
}

/**
 * Inject a single run carrying `text` into a cell whose (first) paragraph is
 * empty. The run is placed just before that paragraph's closing `</w:p>`, so it
 * inherits the paragraph's existing alignment/properties (e.g. centered, on the
 * underline line). `rPrInner` is the inner XML of an optional `<w:rPr>`.
 */
export function injectRunIntoEmptyParagraph(
  cellXml: string,
  text: string,
  rPrInner = "",
): string {
  const rpr = rPrInner ? `<w:rPr>${rPrInner}</w:rPr>` : "";
  const run = `<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  const pClose = cellXml.indexOf("</w:p>");
  if (pClose === -1) throw new Error("injectRun: cell has no paragraph");
  return cellXml.slice(0, pClose) + run + cellXml.slice(pClose);
}

/** Parsed cell width (`w:tcW`, twips) of a cell, or null if absent. */
export function cellTcwTwips(cellXml: string): number | null {
  const m = /<w:tcW\b[^>]*\bw:w="(\d+)"/.exec(cellXml);
  return m ? parseInt(m[1], 10) : null;
}

/** First explicit run font size (`w:sz`, half-points) in a cell; 20 (10pt) if none. */
export function firstRunSz(cellXml: string): number {
  const m = /<w:sz\b[^>]*\bw:val="(\d+)"/.exec(cellXml);
  return m ? parseInt(m[1], 10) : 20;
}

/**
 * Largest candidate font size (half-points) at which `text` is estimated to fit
 * within `usableTwips` on one line; falls back to the smallest candidate (never
 * truncates the text).
 */
export function fitSizeForUsable(
  text: string,
  usableTwips: number,
  candidates: number[] = ONE_LINE_CANDIDATES,
): number {
  for (const sz of candidates) {
    if (estimateTextTwips(text, sz) <= usableTwips) return sz;
  }
  return candidates[candidates.length - 1];
}

// Inserted-run properties always pin Times New Roman (so the rendered width
// matches the metrics) plus the fitted size; existing template runs are never
// touched. Note: WordprocessingML requires rFonts BEFORE sz inside rPr.
function fittedRPrInner(sz: number): string {
  return `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`;
}

/**
 * Inject `text` into a cell's empty paragraph, shrinking ONLY the inserted run's
 * font (10pt → 6pt floor) so the value stays on one physical line within the
 * cell's real `w:tcW`. If the cell has no width, it inserts at the 10pt top size.
 */
export function injectFittedRunIntoEmptyParagraph(
  cellXml: string,
  text: string,
): string {
  const tcw = cellTcwTwips(cellXml);
  const usable = tcw != null ? usableCellTwips(tcw) : Infinity;
  const sz = fitSizeForUsable(text, usable);
  return injectRunIntoEmptyParagraph(cellXml, text, fittedRPrInner(sz));
}

/**
 * Append `value` as its OWN run immediately after the run whose text ends with
 * `anchorWithClose` (which must include the closing `</w:t>`), sizing that run's
 * font so the already-printed label text plus the value stay on one line within
 * the cell's real `w:tcW`. The label runs are never modified. Throws if the
 * anchor (or its run close) cannot be located.
 */
export function appendFittedRunAfterAnchor(
  cellXml: string,
  anchorWithClose: string,
  value: string,
): string {
  const ai = cellXml.indexOf(anchorWithClose);
  if (ai === -1) {
    throw new Error(`appendAfterAnchor: anchor not found: ${anchorWithClose}`);
  }
  const runClose = cellXml.indexOf("</w:r>", ai + anchorWithClose.length);
  if (runClose === -1) {
    throw new Error("appendAfterAnchor: no run close after anchor");
  }
  const insertAt = runClose + "</w:r>".length;

  const tcw = cellTcwTwips(cellXml);
  const labelWidth = estimateTextTwips(cellText(cellXml), firstRunSz(cellXml));
  const usable = tcw != null ? usableCellTwips(tcw) : Infinity;
  const remaining = Math.max(usable - labelWidth, 0);
  const sz = fitSizeForUsable(value, remaining);

  const run = `<w:r><w:rPr>${fittedRPrInner(sz)}</w:rPr><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
  return cellXml.slice(0, insertAt) + run + cellXml.slice(insertAt);
}

/**
 * Underline+bold the first occurrence of `word` inside a cell's first paragraph,
 * splitting whatever runs currently hold the surrounding text into
 * before / marked / after runs while preserving the paragraph properties and the
 * run properties (font/size) of the original text. Circling/ovals are not
 * feasible in WordprocessingML without floating shapes, so underline+bold is the
 * spec-allowed marking fallback. Throws if `word` is not present.
 */
export function markWordInCell(cellXml: string, word: string): string {
  const pMatch = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/.exec(cellXml);
  if (!pMatch) throw new Error("markWord: cell has no paragraph");
  const pXml = pMatch[0];

  const openMatch = /^<w:p\b[^>]*>/.exec(pXml);
  if (!openMatch) throw new Error("markWord: malformed paragraph");
  const open = openMatch[0];

  let rest = pXml.slice(open.length, pXml.length - "</w:p>".length);
  let pPr = "";
  const pprMatch = /^<w:pPr>[\s\S]*?<\/w:pPr>/.exec(rest);
  if (pprMatch) {
    pPr = pprMatch[0];
    rest = rest.slice(pPr.length);
  }

  const full = [...rest.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join("");
  const idx = full.indexOf(word);
  if (idx === -1) {
    throw new Error(`markWord: "${word}" not found in cell text "${full}"`);
  }
  const before = full.slice(0, idx);
  const after = full.slice(idx + word.length);

  const rprMatch = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(rest);
  const rprInner = rprMatch ? rprMatch[1] : "";

  // `before`/`word`/`after` are slices of already-escaped <w:t> content, so they
  // are re-emitted as-is (NOT re-escaped, which would double-escape entities).
  const makeRun = (txt: string, mark: boolean): string => {
    if (txt === "") return "";
    const inner = mark ? `<w:b/>${rprInner}<w:u w:val="single"/>` : rprInner;
    const rpr = inner ? `<w:rPr>${inner}</w:rPr>` : "";
    return `<w:r>${rpr}<w:t xml:space="preserve">${txt}</w:t></w:r>`;
  };

  const newRuns = makeRun(before, false) + makeRun(word, true) + makeRun(after, false);
  const newP = open + pPr + newRuns + "</w:p>";
  return cellXml.replace(pXml, newP);
}
