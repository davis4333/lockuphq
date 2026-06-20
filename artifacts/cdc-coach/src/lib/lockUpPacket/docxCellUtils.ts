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
