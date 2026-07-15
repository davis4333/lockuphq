// LOCKUPHQ DR Writer — Charge 6-1 Manual Claude Output Validator
//
// Reads saved Claude JSON responses from manual-validation/6-1/ and validates
// them against expected GREEN and YELLOW output shapes. No API call is made.
//
// Usage:
//   node --experimental-strip-types src/dr-writer/charges/6-1/validateManualClaudeOutputs6_1.ts

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseResponse6_1, ParseError } from './parseResponse6_1.ts';
import type { OutputSchema6_1 } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../../');
const GREEN_FILE = join(ROOT, 'manual-validation/6-1/green-response.json');
const YELLOW_FILE = join(ROOT, 'manual-validation/6-1/yellow-response.json');

type CheckResult = { label: string; pass: boolean; note?: string };

function check(label: string, pass: boolean, note?: string): CheckResult {
  return { label, pass, note };
}

function countParagraphs(narrative: string): number {
  return narrative.split(/\n\n+/).filter(p => p.trim().length > 0).length;
}

function printChecks(checks: CheckResult[]): void {
  for (const c of checks) {
    const icon = c.pass ? 'PASS' : 'FAIL';
    const note = c.note ? ` — ${c.note}` : '';
    console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
  }
}

function allPass(checks: CheckResult[]): boolean {
  return checks.every(c => c.pass);
}

function readResponseFile(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, 'utf-8');
}

function isPlaceholder(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && '_placeholder' in parsed;
  } catch {
    return false;
  }
}

function validateGreen(raw: string): CheckResult[] {
  let parsed: OutputSchema6_1;
  try {
    parsed = parseResponse6_1(raw);
  } catch (e) {
    const msg = e instanceof ParseError ? e.message : String(e);
    return [check('parseResponse6_1 succeeded', false, msg)];
  }

  const narrative = parsed.narrative ?? '';
  const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;

  return [
    check('schema_version === "1.1"', parsed.schema_version === '1.1'),
    check('charge === "6-1"', parsed.charge === '6-1'),
    check('status === "GREEN"', parsed.status === 'GREEN'),
    check('red_blockers is []', parsed.red_blockers.length === 0,
      parsed.red_blockers.length > 0 ? `${parsed.red_blockers.length} blocker(s) present` : undefined),
    check('yellow_warnings is []', parsed.yellow_warnings.length === 0,
      parsed.yellow_warnings.length > 0 ? `${parsed.yellow_warnings.length} warning(s) present` : undefined),
    check('flagged_sections is []', parsed.flagged_sections.length === 0),
    check('narrative exists', parsed.narrative !== null && parsed.narrative !== undefined && parsed.narrative.trim().length > 0),
    check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
    check('narrative does NOT include "[REVIEW"', !narrative.includes('[REVIEW')),
    check('narrative includes "assigned as the housing officer"', narrative.includes('assigned as the housing officer')),
    check('narrative includes "two additional times"', narrative.includes('two additional times')),
    check('narrative includes "three verbal orders"', narrative.includes('three verbal orders')),
  ];
}

function validateYellow(raw: string): CheckResult[] {
  let parsed: OutputSchema6_1;
  try {
    parsed = parseResponse6_1(raw);
  } catch (e) {
    const msg = e instanceof ParseError ? e.message : String(e);
    return [check('parseResponse6_1 succeeded', false, msg)];
  }

  const narrative = parsed.narrative ?? '';
  const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;

  return [
    check('schema_version === "1.1"', parsed.schema_version === '1.1'),
    check('charge === "6-1"', parsed.charge === '6-1'),
    check('status === "YELLOW"', parsed.status === 'YELLOW'),
    check('red_blockers is []', parsed.red_blockers.length === 0,
      parsed.red_blockers.length > 0 ? `${parsed.red_blockers.length} blocker(s) present` : undefined),
    check('yellow_warnings length >= 1', parsed.yellow_warnings.length >= 1,
      `got ${parsed.yellow_warnings.length}`),
    check('flagged_sections is non-empty', parsed.flagged_sections.length > 0),
    check('narrative exists', parsed.narrative !== null && parsed.narrative !== undefined && parsed.narrative.trim().length > 0),
    check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
    check('narrative includes "[REVIEW — quote is a summary]"', narrative.includes('[REVIEW — quote is a summary]')),
    check('narrative includes "verbally responded in substance"', narrative.includes('verbally responded in substance')),
    check('narrative does NOT quote the summary verbatim', !narrative.includes('"He said he wasn\'t going back to his cell."')),
    check('narrative does NOT use stated, "<summary>"', !narrative.includes('stated, "He said he wasn\'t going back to his cell."')),
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

console.log('');
console.log(DIVIDER);
console.log('  LOCKUPHQ DR Writer — Charge 6-1 Manual Claude Output Validator');
console.log('  Reads: manual-validation/6-1/{green,yellow}-response.json');
console.log('  No API call made.');
console.log(DIVIDER);

let greenPass = false;
let yellowPass = false;
let greenRan   = false;
let yellowRan  = false;

// ── GREEN ────────────────────────────────────────────────────────────────────
console.log('');
console.log(SECTION);
console.log('  GREEN — manual-validation/6-1/green-response.json');
console.log(SECTION);
console.log('');

const greenRaw = readResponseFile(GREEN_FILE);

if (greenRaw === null) {
  console.log('  WAITING  File not found.');
  console.log('           Paste Claude\'s raw GREEN JSON response into:');
  console.log(`           ${GREEN_FILE}`);
} else if (isPlaceholder(greenRaw)) {
  console.log('  WAITING  Placeholder file detected — no real response yet.');
  console.log('           Replace the contents of this file with Claude\'s complete');
  console.log('           raw GREEN JSON response (the entire JSON object Claude returned).');
  console.log(`           File: ${GREEN_FILE}`);
} else {
  greenRan = true;
  const checks = validateGreen(greenRaw);
  printChecks(checks);
  greenPass = allPass(checks);
  console.log('');
  console.log(`  GREEN manual response: ${greenPass ? 'PASS' : 'FAIL'}`);
}

// ── YELLOW ───────────────────────────────────────────────────────────────────
console.log('');
console.log(SECTION);
console.log('  YELLOW — manual-validation/6-1/yellow-response.json');
console.log(SECTION);
console.log('');

const yellowRaw = readResponseFile(YELLOW_FILE);

if (yellowRaw === null) {
  console.log('  WAITING  File not found.');
  console.log('           Paste Claude\'s raw YELLOW JSON response into:');
  console.log(`           ${YELLOW_FILE}`);
} else if (isPlaceholder(yellowRaw)) {
  console.log('  WAITING  Placeholder file detected — no real response yet.');
  console.log('           Replace the contents of this file with Claude\'s complete');
  console.log('           raw YELLOW JSON response (the entire JSON object Claude returned).');
  console.log(`           File: ${YELLOW_FILE}`);
} else {
  yellowRan = true;
  const checks = validateYellow(yellowRaw);
  printChecks(checks);
  yellowPass = allPass(checks);
  console.log('');
  console.log(`  YELLOW manual response: ${yellowPass ? 'PASS' : 'FAIL'}`);
}

// ── SUMMARY ──────────────────────────────────────────────────────────────────
const greenLabel  = greenRan  ? (greenPass  ? 'PASS' : 'FAIL') : 'WAITING — paste real JSON into green-response.json';
const yellowLabel = yellowRan ? (yellowPass ? 'PASS' : 'FAIL') : 'WAITING — paste real JSON into yellow-response.json';
const overallRan  = greenRan && yellowRan;
const overallPass = overallRan && greenPass && yellowPass;
const overallLabel = !overallRan ? 'WAITING' : (overallPass ? 'PASS' : 'FAIL');

console.log('');
console.log(DIVIDER);
console.log('  SUMMARY');
console.log('');
console.log(`  GREEN manual response:   ${greenLabel}`);
console.log(`  YELLOW manual response:  ${yellowLabel}`);
console.log('');
console.log(`  Overall:                 ${overallLabel}`);
console.log(DIVIDER);
console.log('');
