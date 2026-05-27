/**
 * One-time script: converts the filled Banks DOCX into a docxtemplater template.
 * Run: node scripts/make-template.cjs  (from artifacts/cdc-coach/)
 *
 * For each key data field, finds the <w:p> paragraph whose concatenated <w:t>
 * text matches, strips all <w:r> runs, and replaces with a single run holding
 * a {{placeholder}} tag.  Dates that Word split across many character runs are
 * also handled this way because we match on the full concatenated text.
 */

"use strict";

const PizZip = require("../node_modules/pizzip");
const fs    = require("fs");
const path  = require("path");

// ── paths ────────────────────────────────────────────────────────────────────
const SRC  = path.resolve(__dirname, "../../../attached_assets/Inmate_banks_property_restriction_1779842041600.docx");
const DEST = path.resolve(__dirname, "../public/property-restriction-template.docx");

// ── load ─────────────────────────────────────────────────────────────────────
const buf = fs.readFileSync(SRC);
const zip = new PizZip(buf);
let xml   = zip.files["word/document.xml"].asText();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Concatenate all <w:t> text in an XML fragment. */
function extractText(fragment) {
  return (fragment.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map(t => t.replace(/<[^>]+>/g, ""))
    .join("");
}

/** Find the enclosing <w:p>…</w:p> block that contains `needle` at position `pos`. */
function findEnclosingPara(xmlStr, pos) {
  const start = xmlStr.lastIndexOf("<w:p ", pos);
  if (start === -1) return null;
  const end = xmlStr.indexOf("</w:p>", start);
  if (end === -1) return null;
  return { start, end: end + "</w:p>".length, text: xmlStr.slice(start, end + "</w:p>".length) };
}

/** Extract <w:pPr>…</w:pPr> from a paragraph fragment, or "". */
function getPPr(para) {
  const m = para.match(/(<w:pPr[\s\S]*?<\/w:pPr>)/);
  return m ? m[1] : "";
}

/** Extract the first <w:rPr>…</w:rPr> from a paragraph fragment, or "". */
function getFirstRPr(para) {
  const m = para.match(/(<w:rPr[\s\S]*?<\/w:rPr>)/);
  return m ? m[1] : "";
}

/** Opening tag of a <w:p> element. */
function getPOpen(para) {
  const m = para.match(/^(<w:p(?:\s[^>]*)?>)/);
  return m ? m[1] : "<w:p>";
}

/** Build a replacement paragraph: one run with the placeholder. */
function buildPara(original, placeholder, keepRPr = false) {
  const pOpen = getPOpen(original);
  const pPr   = getPPr(original);
  const rPr   = keepRPr ? getFirstRPr(original) : "";
  return `${pOpen}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
}

/**
 * In `xmlStr`, find the first paragraph whose full text equals `target`
 * (starting search from `fromIdx`) and replace it with a paragraph containing
 * `placeholder`.  Returns { xml, nextIdx } or { xml: xmlStr, nextIdx: fromIdx }
 * if not found.
 */
function replaceFirstMatch(xmlStr, target, placeholder, fromIdx = 0, keepRPr = false) {
  let searchFrom = fromIdx;
  while (searchFrom < xmlStr.length) {
    // Find next <w:p occurrence
    const pStart = xmlStr.indexOf("<w:p ", searchFrom);
    if (pStart === -1) break;
    const pEnd = xmlStr.indexOf("</w:p>", pStart);
    if (pEnd === -1) break;
    const paraEnd = pEnd + "</w:p>".length;
    const para = xmlStr.slice(pStart, paraEnd);
    const text = extractText(para).trim();
    if (text === target) {
      const replacement = buildPara(para, placeholder, keepRPr);
      return {
        xml: xmlStr.slice(0, pStart) + replacement + xmlStr.slice(paraEnd),
        nextIdx: pStart + replacement.length,
      };
    }
    searchFrom = paraEnd;
  }
  return { xml: xmlStr, nextIdx: fromIdx };
}

/**
 * Replace every paragraph whose text CONTAINS `snippet` with a single-run para.
 */
function replaceContaining(xmlStr, snippet, placeholder) {
  let searchFrom = 0;
  let result = xmlStr;
  while (searchFrom < result.length) {
    const pStart = result.indexOf("<w:p ", searchFrom);
    if (pStart === -1) break;
    const pEnd = result.indexOf("</w:p>", pStart);
    if (pEnd === -1) break;
    const paraEnd = pEnd + "</w:p>".length;
    const para = result.slice(pStart, paraEnd);
    if (extractText(para).includes(snippet)) {
      const replacement = buildPara(para, placeholder);
      result = result.slice(0, pStart) + replacement + result.slice(paraEnd);
      searchFrom = pStart + replacement.length;
    } else {
      searchFrom = paraEnd;
    }
  }
  return result;
}

// ── replacements ─────────────────────────────────────────────────────────────

// 1. Inmate full name  (single run, bold)
({ xml } = replaceFirstMatch(xml, "BANKS, MASON", "{{inmateFullName}}", 0, true));

// 2. DC# — first occurrence is the value cell (second is in the reason text, skip)
({ xml } = replaceFirstMatch(xml, "X89985", "{{dcNumber}}", 0, true));
// Also handle trailing space variant
({ xml } = replaceFirstMatch(xml, "X89985 ", "{{dcNumber}}", 0, true));

// 3. Date restricted — first "04/4/2026" paragraph
let dateIdx = 0;
({ xml, nextIdx: dateIdx } = replaceFirstMatch(xml, "04/4/2026", "{{dateRestricted}}", dateIdx, true));

// 4. Shift
({ xml } = replaceFirstMatch(xml, "2nd", "{{shift}}", 0, true));

// 5. Dorm — split runs; full text is "B1-202L"  (also may have trailing space)
({ xml } = replaceFirstMatch(xml, "B1-202L", "{{dormAssignment}}", 0, true));
({ xml } = replaceFirstMatch(xml, "B1-202L ", "{{dormAssignment}}", 0, true));

// 6. Reason for restriction — appears twice (content control + cell); replace both
xml = replaceContaining(xml, "random cell search of B1-202", "{{reasonForRestriction}}");

// 7. Restrictions
xml = replaceContaining(xml, "All state property, State clothing", "{{restrictions}}");

// 8. Mattress and Bedding lines — replace entire paragraphs; keep label
xml = replaceContaining(xml, "Mattress:", "Mattress:\t{{mattressLine}}");
xml = replaceContaining(xml, "Bedding/Linens", "Bedding/Linens\t{{beddingLine}}");

// 9. Supervisor name — text: "Captain A. Zavelghorba"
({ xml } = replaceFirstMatch(xml, "Captain A. Zavelghorba", "{{supervisorName}}", 0));

// 10. Supervisor date — second "04/4/2026"
({ xml, nextIdx: dateIdx } = replaceFirstMatch(xml, "04/4/2026", "{{supervisorDate}}", dateIdx, true));

// 11. Chief name
({ xml } = replaceFirstMatch(xml, "Colonel T. Hawkins", "{{chiefName}}", 0));

// 12. Chief date — third "04/4/2026"
({ xml, nextIdx: dateIdx } = replaceFirstMatch(xml, "04/4/2026", "{{chiefDate}}", dateIdx, true));

// 13. Approved X — standalone "X" paragraph near the approval section
//     Find "Approved" label first then look for the X paragraph nearby
{
  const approvedLabelIdx = xml.lastIndexOf(">Approved<");
  if (approvedLabelIdx > 0) {
    // Search backwards from Approved for a paragraph with just "X"
    let searchFrom2 = Math.max(0, approvedLabelIdx - 5000);
    let found2 = false;
    while (searchFrom2 < approvedLabelIdx) {
      const pStart = xml.indexOf("<w:p ", searchFrom2);
      if (pStart === -1 || pStart > approvedLabelIdx) break;
      const pEnd = xml.indexOf("</w:p>", pStart);
      if (pEnd === -1) break;
      const paraEnd = pEnd + "</w:p>".length;
      const para = xml.slice(pStart, paraEnd);
      if (extractText(para).trim() === "X") {
        const replacement = buildPara(para, "{{approvalX}}");
        xml = xml.slice(0, pStart) + replacement + xml.slice(paraEnd);
        found2 = true;
        break;
      }
      searchFrom2 = paraEnd;
    }
    if (!found2) console.warn("WARNING: could not find standalone X for approval");
  }
}

// 14. Comments — find empty paragraph in the Comments value cell
//     The Comments label is in a cell; the next cell's first empty paragraph gets the placeholder
{
  const commentsIdx = xml.indexOf(">Comments:<");
  if (commentsIdx > 0) {
    const tcEnd = xml.indexOf("</w:tc>", commentsIdx);
    const nextTc = xml.indexOf("<w:tc>", tcEnd);
    const pStart = xml.indexOf("<w:p ", nextTc);
    const pEnd   = xml.indexOf("</w:p>", pStart);
    const paraEnd = pEnd + "</w:p>".length;
    const para = xml.slice(pStart, paraEnd);
    const replacement = buildPara(para, "{{comments}}");
    xml = xml.slice(0, pStart) + replacement + xml.slice(paraEnd);
  } else {
    console.warn("WARNING: could not find Comments label");
  }
}

// 15. Restriction until — paragraph: "__04/7/2026_"
({ xml } = replaceFirstMatch(xml, "__04/7/2026_", "{{restrictionUntil}}", 0));

// 16. Items Returned line — replace with structured placeholders
xml = replaceContaining(xml, "Items Returned:", "Items Returned:\t\tDate {{retDate}}\t\tShift {{retShift}}\t\tOIC {{retOIC}}");

// ── write back to zip and save ────────────────────────────────────────────────
zip.file("word/document.xml", xml);          // <-- critical: write modified XML back

const outBuf = zip.generate({
  type: "nodebuffer",
  compression: "DEFLATE",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

fs.writeFileSync(DEST, outBuf);
console.log("Template written to:", DEST);

// ── verify ───────────────────────────────────────────────────────────────────
const verifyZip = new PizZip(fs.readFileSync(DEST));
const verifyXml = verifyZip.files["word/document.xml"].asText();
const found = [...new Set(verifyXml.match(/\{\{[^}]+\}\}/g) || [])].sort();
console.log("\nPlaceholders found in template:");
found.forEach(p => console.log("  ", p));
if (found.length === 0) {
  console.error("\nERROR: No placeholders found — check the replacement logic.");
  process.exit(1);
} else {
  console.log(`\nOK: ${found.length} unique placeholders`);
}
