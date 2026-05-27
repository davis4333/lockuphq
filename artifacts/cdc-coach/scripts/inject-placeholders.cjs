'use strict';
/**
 * inject-placeholders.cjs
 * Opens the original uploaded Word document and surgically replaces each
 * data-field value with a docxtemplater {{placeholder}}.
 * Every replacement uses the exact XML string from the original document —
 * no regex paragraph scanning.
 *
 * Run:  node artifacts/cdc-coach/scripts/inject-placeholders.cjs
 */

const fs     = require('fs');
const path   = require('path');
const PizZip = require(path.join(__dirname, '../node_modules/pizzip'));

const ORIGINAL = path.join(__dirname,
  '../../../attached_assets/Inmate_banks_property_restriction_1779844071253.docx');
const OUTPUT   = path.join(__dirname, '../public/property-restriction-template.docx');

// ─── helpers ────────────────────────────────────────────────────────────────

let xml;

function rep(oldStr, newStr, label) {
  const idx = xml.indexOf(oldStr);
  if (idx === -1) {
    console.warn('  ⚠  not found:', label ?? JSON.stringify(oldStr.slice(0, 60)));
    return;
  }
  xml = xml.slice(0, idx) + newStr + xml.slice(idx + oldStr.length);
  console.log('  ✓', label ?? '(unlabelled)');
}

// ─── load ───────────────────────────────────────────────────────────────────
console.log('Reading original docx…');
const buf = fs.readFileSync(ORIGINAL);
const zip = new PizZip(buf);
xml = zip.files['word/document.xml'].asText();

console.log('\nInjecting placeholders…');

// ────────────────────────────────────────────────────────────────────────────
// 1. INMATE FULL NAME  – single run, exact string
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t>BANKS, MASON</w:t>',
  '<w:t>{{inmateFullName}}</w:t>',
  'inmateFullName'
);

// ────────────────────────────────────────────────────────────────────────────
// 2. DC NUMBER  – single run + orphan trailing-space run
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:r w:rsidR="00B458E3" w:rsidRPr="00B458E3"><w:rPr><w:color w:val="000000"/></w:rPr><w:t>X89985</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:rPr><w:color w:val="000000"/></w:rPr><w:t xml:space="preserve"> </w:t></w:r>',
  '<w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>{{dcNumber}}</w:t></w:r>',
  'dcNumber'
);

// ────────────────────────────────────────────────────────────────────────────
// 3. DATE RESTRICTED  – 6 bold runs spelling "04/4/2026"
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:r><w:rPr><w:b/></w:rPr><w:t>0</w:t></w:r>' +
  '<w:r w:rsidR="007A7D59"><w:rPr><w:b/></w:rPr><w:t>4</w:t></w:r>' +
  '<w:r><w:rPr><w:b/></w:rPr><w:t>/</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:rPr><w:b/></w:rPr><w:t>4</w:t></w:r>' +
  '<w:r><w:rPr><w:b/></w:rPr><w:t>/202</w:t></w:r>' +
  '<w:r w:rsidR="00F90C48"><w:rPr><w:b/></w:rPr><w:t>6</w:t></w:r>',
  '<w:r><w:rPr><w:b/></w:rPr><w:t>{{dateRestricted}}</w:t></w:r>',
  'dateRestricted'
);

// ────────────────────────────────────────────────────────────────────────────
// 4. SHIFT  – single bold run
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t>2nd</w:t>',
  '<w:t>{{shift}}</w:t>',
  'shift'
);

// ────────────────────────────────────────────────────────────────────────────
// 5. DORM / ASSIGNMENT  – 4 bold runs spelling "B1-202L"
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:r><w:rPr><w:b/></w:rPr><w:t>B</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:rPr><w:b/></w:rPr><w:t>1</w:t></w:r>' +
  '<w:r><w:rPr><w:b/></w:rPr><w:t>-</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:rPr><w:b/></w:rPr><w:t>202L</w:t></w:r>',
  '<w:r><w:rPr><w:b/></w:rPr><w:t>{{dormAssignment}}</w:t></w:r>',
  'dormAssignment'
);

// ────────────────────────────────────────────────────────────────────────────
// 6. REASON FOR RESTRICTION  – entire content of the reason text box
//    (identified by its txbxContent containing "I Sergeant S. Wildman")
// ────────────────────────────────────────────────────────────────────────────
{
  const ANCHOR   = 'I Sergeant S. Wildman';
  const OPEN_TAG = '<w:txbxContent>';
  const CLOSE_TAG = '</w:txbxContent>';
  const anchorIdx = xml.indexOf(ANCHOR);
  if (anchorIdx === -1) {
    console.warn('  ⚠  reason anchor not found');
  } else {
    const openIdx  = xml.lastIndexOf(OPEN_TAG, anchorIdx);
    const closeIdx = xml.indexOf(CLOSE_TAG, anchorIdx) + CLOSE_TAG.length;
    // Preserve first rPr (11pt Calibri theme font)
    const origRPr = '<w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" ' +
      'w:cstheme="minorHAnsi"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
    const replacement =
      OPEN_TAG +
      '<w:p><w:r>' + origRPr +
      '<w:t xml:space="preserve">{{reasonForRestriction}}</w:t></w:r></w:p>' +
      CLOSE_TAG;
    xml = xml.slice(0, openIdx) + replacement + xml.slice(closeIdx);
    console.log('  ✓ reasonForRestriction');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 7. RESTRICTIONS  – 3 bold runs spelling "Restrictions: All state property, State clothing."
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t xml:space="preserve">Restrictions: All </w:t></w:r>' +
  '<w:r w:rsidR="00174273"><w:rPr><w:b/></w:rPr><w:t>state</w:t></w:r>' +
  '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> property, State clothing.</w:t></w:r>',
  '<w:t xml:space="preserve">Restrictions: {{restrictions}}</w:t></w:r>',
  'restrictions'
);

// ────────────────────────────────────────────────────────────────────────────
// 8. RESTRICTIONS DETAIL  – single run in the text box below Restrictions
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t>All state issued clothing and all his personal property. Inmate will be allowed to retain the following items</w:t>',
  '<w:t>{{restrictionsDetail}}</w:t>',
  'restrictionsDetail'
);

// ────────────────────────────────────────────────────────────────────────────
// 9. MATTRESS line  – keep "Mattress:" label, replace tab + Yes/No/X portion
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t>Mattress:</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:tab/></w:r>' +
  '<w:proofErr w:type="gramStart"/>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>Yes</w:t></w:r>' +
  '<w:proofErr w:type="gramEnd"/>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">_________   </w:t></w:r>' +
  '<w:proofErr w:type="spellStart"/>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>No____</w:t></w:r>' +
  '<w:r w:rsidR="00E669FA"><w:rPr><w:sz w:val="20"/><w:u w:val="single"/></w:rPr><w:t>X</w:t></w:r>' +
  '<w:proofErr w:type="spellEnd"/>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>_______</w:t></w:r>',
  '<w:t>Mattress:</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">\t{{mattressLine}}</w:t></w:r>',
  'mattressLine'
);

// ────────────────────────────────────────────────────────────────────────────
// 10. BEDDING line  – keep "Bedding/Linens" label, replace tab + Yes/No/X
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t>Bedding/Linens</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:tab/><w:t xml:space="preserve">Yes________   </w:t></w:r>' +
  '<w:proofErr w:type="spellStart"/>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>No_____</w:t></w:r>' +
  '<w:r w:rsidR="00E669FA"><w:rPr><w:sz w:val="20"/></w:rPr><w:t>X</w:t></w:r>',
  '<w:t>Bedding/Linens</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">\t{{beddingLine}}</w:t></w:r>',
  'beddingLine (first)'
);
// May appear a 2nd time in AlternateContent; replace that too
rep(
  '<w:t>Bedding/Linens</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:tab/><w:t xml:space="preserve">Yes________   </w:t></w:r>' +
  '<w:proofErr w:type="spellStart"/>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>No_____</w:t></w:r>' +
  '<w:r w:rsidR="00E669FA"><w:rPr><w:sz w:val="20"/></w:rPr><w:t>X</w:t></w:r>',
  '<w:t>Bedding/Linens</w:t></w:r>' +
  '<w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">\t{{beddingLine}}</w:t></w:r>',
  'beddingLine (second, AlternateContent)'
);

// ────────────────────────────────────────────────────────────────────────────
// 11. SUPERVISOR NAME  – "Captain" + space + "A. Zavelghorba" in 3 runs
//     We replace all 3 with a single run so the user-entered name (with rank)
//     takes the place of the entire "Captain A. Zavelghorba" line.
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t>Captain</w:t></w:r>' +
  '<w:r w:rsidR="001B4F4F"><w:t xml:space="preserve"> </w:t></w:r>' +
  '<w:r w:rsidR="00BB6A90"><w:t>A. Zavelghorba</w:t></w:r>',
  '<w:t>{{supervisorName}}</w:t></w:r>',
  'supervisorName'
);

// ────────────────────────────────────────────────────────────────────────────
// 12. SUPERVISOR DATE  – 6 runs spelling "04/4/2026" (no bold, first occurrence)
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:r><w:t>0</w:t></w:r>' +
  '<w:r w:rsidR="007A7D59"><w:t>4</w:t></w:r>' +
  '<w:r w:rsidR="00D75FDD"><w:t>/</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:t>4</w:t></w:r>' +
  '<w:r><w:t>/202</w:t></w:r>' +
  '<w:r w:rsidR="00F90C48"><w:t>6</w:t></w:r>',
  '<w:r><w:t>{{supervisorDate}}</w:t></w:r>',
  'supervisorDate'
);

// ────────────────────────────────────────────────────────────────────────────
// 13. CHIEF / COLONEL NAME  – "Colonel " + "T. Hawkins" in 2 runs
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t xml:space="preserve">Colonel </w:t></w:r>' +
  '<w:r w:rsidR="00F90C48"><w:t>T. Hawkins</w:t></w:r>',
  '<w:t>{{chiefName}}</w:t></w:r>',
  'chiefName'
);

// ────────────────────────────────────────────────────────────────────────────
// 14. CHIEF DATE  – 5 runs spelling "04/4/2026" (slightly different rsid set)
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:r><w:t>0</w:t></w:r>' +
  '<w:r w:rsidR="007A7D59"><w:t>4</w:t></w:r>' +
  '<w:r><w:t>/</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:t>4</w:t></w:r>' +
  '<w:r><w:t>/2026</w:t></w:r>',
  '<w:r><w:t>{{chiefDate}}</w:t></w:r>',
  'chiefDate'
);

// ────────────────────────────────────────────────────────────────────────────
// 15. APPROVAL X  – "  " run + "X" run in the Approved/Denied cell
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:t xml:space="preserve">  </w:t></w:r>' +
  '<w:r w:rsidR="00520C87"><w:t>X</w:t></w:r>',
  '<w:t xml:space="preserve">{{approvalX}}</w:t></w:r>',
  'approvalX'
);

// ────────────────────────────────────────────────────────────────────────────
// 16. COMMENTS TEXT BOX  – empty text box right after "Comments:" label
//     Replace its entire txbxContent with a single {{comments}} paragraph.
// ────────────────────────────────────────────────────────────────────────────
{
  const ANCHOR    = 'Comments:';
  const OPEN_TAG  = '<w:txbxContent>';
  const CLOSE_TAG = '</w:txbxContent>';
  const anchorIdx = xml.indexOf(ANCHOR);
  if (anchorIdx === -1) {
    console.warn('  ⚠  Comments: anchor not found');
  } else {
    const openIdx  = xml.indexOf(OPEN_TAG, anchorIdx);
    const closeIdx = xml.indexOf(CLOSE_TAG, openIdx) + CLOSE_TAG.length;
    xml = xml.slice(0, openIdx) +
      OPEN_TAG +
      '<w:p><w:r><w:t xml:space="preserve">{{comments}}</w:t></w:r></w:p>' +
      CLOSE_TAG +
      xml.slice(closeIdx);
    console.log('  ✓ comments');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 17. MINIMUM RESTRICTION UNTIL DATE  – label + "  __04/7/2026_" in many runs
// ────────────────────────────────────────────────────────────────────────────
rep(
  '<w:r><w:t>Items will be restricted at a minimum until:</w:t></w:r>' +
  '<w:r w:rsidR="00520C87"><w:t xml:space="preserve"> </w:t></w:r>' +
  '<w:r w:rsidR="001522F6"><w:t>__</w:t></w:r>' +
  '<w:r w:rsidR="00F90C48"><w:t>0</w:t></w:r>' +
  '<w:r w:rsidR="007A7D59"><w:t>4</w:t></w:r>' +
  '<w:r w:rsidR="00F90C48"><w:t>/</w:t></w:r>' +
  '<w:r w:rsidR="00B458E3"><w:t>7</w:t></w:r>' +
  '<w:r w:rsidR="00F90C48"><w:t>/2026</w:t></w:r>' +
  '<w:r w:rsidR="00AA7C71"><w:t>_</w:t></w:r>',
  '<w:r><w:t xml:space="preserve">Items will be restricted at a minimum until: {{restrictionUntil}}</w:t></w:r>',
  'restrictionUntil'
);

// ────────────────────────────────────────────────────────────────────────────
// 18. ITEMS RETURNED TABLE  – inject placeholders into the first data row
//     The table after "Items Returned:" has 3 cols: [text area, date, shift/OIC]
// ────────────────────────────────────────────────────────────────────────────
{
  const ANCHOR = 'Items Returned:';
  const aIdx   = xml.indexOf(ANCHOR);
  const tblIdx = xml.indexOf('<w:tbl>', aIdx);
  if (tblIdx === -1) {
    console.warn('  ⚠  Items Returned table not found');
  } else {
    // The first <w:tr> is the data row
    const trOpen  = xml.indexOf('<w:tr ', tblIdx);
    const trClose = xml.indexOf('</w:tr>', trOpen) + '</w:tr>'.length;
    let tr = xml.slice(trOpen, trClose);

    // Find the 3 <w:tc> blocks in this row
    const tcBlocks = [];
    const tcRe = /(<w:tc>[\s\S]*?<\/w:tc>)/g;
    let m;
    while ((m = tcRe.exec(tr)) !== null) tcBlocks.push({ text: m[1], index: m.index });

    function injectIntoTC(tc, placeholder) {
      // Find the first <w:p> and put a single run with the placeholder in it
      const pMatch = tc.match(/<w:p[ >][\s\S]*?<\/w:p>/);
      if (!pMatch) return tc;
      const pTag = pMatch[0].match(/^<w:p[^>]*>/)?.[0] ?? '<w:p>';
      const pPr  = pMatch[0].match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '';
      const newP = `${pTag}${pPr}<w:r><w:t xml:space="preserve">${placeholder}</w:t></w:r></w:p>`;
      return tc.replace(pMatch[0], newP);
    }

    if (tcBlocks.length >= 3) {
      const newTCs = [
        injectIntoTC(tcBlocks[0].text, '{{retSignature}}'),
        injectIntoTC(tcBlocks[1].text, '{{retDate}}'),
        injectIntoTC(tcBlocks[2].text, '{{retShiftOIC}}'),
      ];
      // Rebuild the tr with new tc content
      let newTr = tr;
      // Replace in reverse order to preserve offsets
      for (let i = tcBlocks.length - 1; i >= 0; i--) {
        if (i >= newTCs.length) continue;
        const { index, text } = tcBlocks[i];
        newTr = newTr.slice(0, index) + newTCs[i] + newTr.slice(index + text.length);
      }
      xml = xml.slice(0, trOpen) + newTr + xml.slice(trClose);
      console.log('  ✓ items returned (retSignature / retDate / retShiftOIC)');
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Write output
// ────────────────────────────────────────────────────────────────────────────
console.log('\nWriting template…');
zip.file('word/document.xml', xml);
const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(OUTPUT, out);
console.log('✅  Template written to', OUTPUT);
