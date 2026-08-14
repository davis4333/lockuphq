import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseOfficialTemplateWorkbook } from "./officialTemplateGrid";

/**
 * Builds a small synthetic workbook mirroring the essential shape of a real
 * generated Housing Log worksheet (merged header, a signature label row, a
 * data row, an "official" sheet plus one continuation sheet) so this test
 * can verify parsing logic in isolation without depending on api-server's
 * generation pipeline or a checked-in fixture that could go stale.
 */
function buildSyntheticWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const official = XLSX.utils.aoa_to_sheet([
    ["HOUSING UNIT  C        Second shift", "", "DATE 08-13-2026", ""],
    ["TIME", "LOG OF EVENTS", "", "INITIALS"],
    ["07:00", "First event.", "", "AB"],
    ["07:05", "Second event.", "", "CD"],
    ["Housing Supervisor Signature:", "", "", ""],
    ["Housing Officer Signature:", "", "", ""],
    [
      "Each Correctional Officer and Correctional Officer Sergeant will make entry...",
      "",
      "",
      "",
    ],
  ]);
  official["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 1 }, e: { r: 1, c: 2 } },
  ];
  official["!cols"] = [{ wch: 11 }, { wch: 60 }, { wch: 25 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(wb, official, "2_TEST");

  const continuation = XLSX.utils.aoa_to_sheet([
    ["TIME", "LOG OF EVENTS", "", "INITIALS"],
    ["07:10", "Overflow event.", "", "EF"],
  ]);
  XLSX.utils.book_append_sheet(wb, continuation, "2_TEST Continuation 1");

  // A sheet from an unrelated template family must never be included.
  const unrelated = XLSX.utils.aoa_to_sheet([["should never appear"]]);
  XLSX.utils.book_append_sheet(wb, unrelated, "1_OTHER");

  return XLSX.write(wb, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
  }) as ArrayBuffer;
}

test("parseOfficialTemplateWorkbook only includes the official sheet and its own continuation sheets, in order", () => {
  const bytes = buildSyntheticWorkbook();
  const sheets = parseOfficialTemplateWorkbook(bytes, "2_TEST");
  assert.deepEqual(
    sheets.map((s) => s.name),
    ["2_TEST", "2_TEST Continuation 1"],
  );
});

test("parseOfficialTemplateWorkbook preserves cell text exactly as generated, in row order", () => {
  const bytes = buildSyntheticWorkbook();
  const [official] = parseOfficialTemplateWorkbook(bytes, "2_TEST");
  assert.equal(official!.rows[2]?.[0]?.text, "07:00");
  assert.equal(official!.rows[2]?.[1]?.text, "First event.");
  assert.equal(official!.rows[3]?.[0]?.text, "07:05");
  assert.equal(official!.rows[3]?.[1]?.text, "Second event.");
});

test("parseOfficialTemplateWorkbook resolves merged cells: anchor carries the span, covered cells are null", () => {
  const bytes = buildSyntheticWorkbook();
  const [official] = parseOfficialTemplateWorkbook(bytes, "2_TEST");
  const headerAnchor = official!.rows[0]?.[0];
  assert.equal(headerAnchor?.text, "HOUSING UNIT  C        Second shift");
  assert.equal(headerAnchor?.colSpan, 2);
  assert.equal(official!.rows[0]?.[1], null);
});

test("parseOfficialTemplateWorkbook locates the printed signature label rows by their actual text", () => {
  const bytes = buildSyntheticWorkbook();
  const [official] = parseOfficialTemplateWorkbook(bytes, "2_TEST");
  assert.equal(official!.supervisorSignatureRowIndex, 4);
  assert.equal(official!.officerSignatureRowIndex, 5);
});

test("parseOfficialTemplateWorkbook derives column pixel widths from the workbook's own column widths", () => {
  const bytes = buildSyntheticWorkbook();
  const [official] = parseOfficialTemplateWorkbook(bytes, "2_TEST");
  // Column A (11 chars) must render narrower than column B (60 chars).
  assert.ok(official!.columnWidthsPx[0]! < official!.columnWidthsPx[1]!);
});

test("parseOfficialTemplateWorkbook returns an empty sheet list for a source sheet the workbook doesn't contain", () => {
  const bytes = buildSyntheticWorkbook();
  const sheets = parseOfficialTemplateWorkbook(bytes, "9_NOPE");
  assert.deepEqual(sheets, []);
});
