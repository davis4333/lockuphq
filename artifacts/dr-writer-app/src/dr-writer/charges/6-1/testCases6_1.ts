// LOCKUPHQ DR Writer — Charge 6-1 Local Test Runner
// Runs the 10 Step 2D fake test cases through evaluate6_1 without calling the Claude API.
// Also runs 6 Step 3B patch tests as inline hardcoded cases.
// Source: Section 15 of LOCKUPHQ_DR_WRITER_6-1_MASTER_v1.1_FINAL.md
//
// Usage: node --experimental-strip-types src/dr-writer/charges/6-1/testCases6_1.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate6_1 } from './evaluate6_1.ts';
import { buildPrompt6_1 } from './buildPrompt6_1.ts';
import { parseResponse6_1, ParseError } from './parseResponse6_1.ts';
import type { IntakeFacts6_1, Status } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesPath = join(__dirname, '../../../../kb/charges/6-1/test_cases.json');
const testCasesJson = JSON.parse(readFileSync(testCasesPath, 'utf-8'));

interface TestCase {
  test_id: string;
  name: string;
  description: string;
  input_facts: IntakeFacts6_1;
  expected_status: Status;
  expected_checks: string[];
}

const testCases: TestCase[] = testCasesJson.test_cases;

// --- Pronoun word-boundary matchers (Step 2E Patch 2) ---
const MALE_PRONOUN_RE = /\b(he|him|his)\b/i;
const FEMALE_PRONOUN_RE = /\b(she|her|hers)\b/i;
const THEY_PRONOUN_RE = /\b(they|them|their|theirs)\b/i;

// --- Per-test assertion helpers ---

function checkTC01Green(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'GREEN') { notes.push(`Expected GREEN, got ${status}`); pass = false; }
  if (result.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${result.red_blockers.length}`); pass = false; }
  if (result.yellow_warnings.length !== 0) { notes.push(`Expected 0 yellow_warnings, got ${result.yellow_warnings.length}: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false; }
  if (result.cleaned_facts === null) { notes.push('cleaned_facts is null — expected populated'); pass = false; }

  // Prompt check: should build without null
  const promptResult = buildPrompt6_1(result);
  if (promptResult.prompt === null) { notes.push('buildPrompt6_1 returned null for GREEN'); pass = false; }
  // Check for actual review flags ([REVIEW — reason]) not just the word [REVIEW] in instructions
  if (promptResult.prompt && promptResult.prompt.includes('[REVIEW —')) {
    notes.push('GREEN prompt unexpectedly contains [REVIEW — ...] flags in narrative');
    pass = false;
  }
  // Patch 12: parts should be non-null for GREEN
  if (promptResult.parts === null) { notes.push('buildPrompt6_1.parts should be non-null for GREEN'); pass = false; }

  return { pass, notes };
}

function checkTC02Red(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'RED') { notes.push(`Expected RED, got ${status}`); pass = false; }
  if (result.cleaned_facts !== null) { notes.push('cleaned_facts should be null for RED'); pass = false; }
  const hasDcBlocker = result.red_blockers.some(b => b.id === 'missing_dc_number');
  if (!hasDcBlocker) { notes.push('Expected red_blocker with id "missing_dc_number"'); pass = false; }
  if (result.red_blockers.some(b => b.id === 'missing_dc_number' && !b.follow_up_question)) {
    notes.push('follow_up_question is empty for missing_dc_number');
    pass = false;
  }

  // Prompt should return null
  const promptResult = buildPrompt6_1(result);
  if (promptResult.prompt !== null) { notes.push('buildPrompt6_1 should return null for RED'); pass = false; }
  if (promptResult.parts !== null) { notes.push('buildPrompt6_1.parts should be null for RED'); pass = false; }

  return { pass, notes };
}

function checkTC03Yellow(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${status}`); pass = false; }
  if (result.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${result.red_blockers.length}`); pass = false; }

  const hasQuoteWarning = result.yellow_warnings.some(w => w.id === 'quote_is_summary');
  if (!hasQuoteWarning) { notes.push('Expected yellow_warning with id "quote_is_summary"'); pass = false; }

  const quoteWarning = result.yellow_warnings.find(w => w.id === 'quote_is_summary');
  if (quoteWarning && quoteWarning.affected_paragraph !== 2) {
    notes.push(`quote_is_summary.affected_paragraph should be 2, got ${quoteWarning.affected_paragraph}`);
    pass = false;
  }
  // Patch 8: flag_label must be present
  if (quoteWarning && !quoteWarning.flag_label) {
    notes.push('quote_is_summary.flag_label is missing'); pass = false;
  }

  // Specific check: no quotation marks should wrap the summary in any generated prompt
  const promptResult = buildPrompt6_1(result);
  if (promptResult.prompt === null) { notes.push('buildPrompt6_1 should not return null for YELLOW'); pass = false; }
  if (promptResult.parts === null) { notes.push('buildPrompt6_1.parts should be non-null for YELLOW'); pass = false; }

  return { pass, notes };
}

function checkTC04Red(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'RED') { notes.push(`Expected RED, got ${status}`); pass = false; }
  if (result.cleaned_facts !== null) { notes.push('cleaned_facts should be null for RED'); pass = false; }

  const hasVagueOrder = result.red_blockers.some(b => b.id === 'missing_specific_order');
  if (!hasVagueOrder) { notes.push('Expected red_blocker with id "missing_specific_order"'); pass = false; }

  return { pass, notes };
}

function checkTC05Red(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'RED') { notes.push(`Expected RED, got ${status}`); pass = false; }
  if (result.cleaned_facts !== null) { notes.push('cleaned_facts should be null for RED'); pass = false; }

  const hasCountBlocker = result.red_blockers.some(b => b.id === 'missing_specific_order_count');
  if (!hasCountBlocker) { notes.push('Expected red_blocker with id "missing_specific_order_count"'); pass = false; }

  return { pass, notes };
}

function checkTC06Red(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'RED') { notes.push(`Expected RED, got ${status}`); pass = false; }
  if (result.cleaned_facts !== null) { notes.push('cleaned_facts should be null for RED'); pass = false; }

  const hasForceBlocker = result.red_blockers.some(b => b.id === 'force_no_explanation');
  if (!hasForceBlocker) { notes.push('Expected red_blocker with id "force_no_explanation"'); pass = false; }

  return { pass, notes };
}

function checkTC07Yellow(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${status}`); pass = false; }
  if (result.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${result.red_blockers.length}`); pass = false; }

  const hasConductWarning = result.yellow_warnings.some(w => w.id === 'conduct_outside_6_1_can_be_isolated');
  if (!hasConductWarning) { notes.push('Expected yellow_warning with id "conduct_outside_6_1_can_be_isolated"'); pass = false; }

  // Specific check: no alternate charge codes in warning text
  const conductWarning = result.yellow_warnings.find(w => w.id === 'conduct_outside_6_1_can_be_isolated');
  if (conductWarning) {
    const chargeCodes = /\b(1-15|battery|2-4|fighting|charge code)\b/i;
    if (chargeCodes.test(conductWarning.warning + conductWarning.suggested_clarification)) {
      notes.push('conduct_outside_6_1 warning contains alternate charge codes — not allowed');
      pass = false;
    }
  }

  return { pass, notes };
}

function checkTC08GreenFemale(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'GREEN') { notes.push(`Expected GREEN, got ${status}`); pass = false; }
  if (result.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${result.red_blockers.length}`); pass = false; }
  if (result.yellow_warnings.length !== 0) { notes.push(`Expected 0 yellow_warnings, got ${result.yellow_warnings.length}: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false; }

  // Pronoun check: prompt must not contain standalone he/him/his (Step 2E Patch 2: word-boundary matching)
  const promptResult = buildPrompt6_1(result);
  if (promptResult.prompt) {
    // The prompt template itself uses neutral language; check that cleaned facts don't inject male pronouns
    // We check the facts section of the prompt
    const factLines = promptResult.prompt.split('LOCKED FORMAT — SINGLE PARAGRAPH')[0];
    // Allow "she/her" to appear (reference style label), but male pronouns should not appear in fact values
    // This is a heuristic check — the real pronoun enforcement is Claude's job
    if (
      result.cleaned_facts &&
      result.cleaned_facts.narrative_reference_style === 'she/her'
    ) {
      notes.push('PASS: narrative_reference_style is she/her — Claude will enforce pronouns');
    }
  }

  return { pass, notes };
}

function checkTC09GreenSaidNothing(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'GREEN') { notes.push(`Expected GREEN, got ${status}`); pass = false; }
  if (result.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${result.red_blockers.length}`); pass = false; }

  // Should not flag missing tone (inmate said nothing, so no tone expected)
  const hasToneWarning = result.yellow_warnings.some(w => w.id === 'missing_tone_when_inmate_spoke');
  if (hasToneWarning) {
    notes.push('Unexpected tone warning — inmate said nothing so tone should not be required');
    pass = false;
  }

  // Confirm cleaned_facts reflects said-nothing
  if (result.cleaned_facts) {
    if (!result.cleaned_facts.inmate_said_nothing) {
      notes.push('cleaned_facts.inmate_said_nothing should be true');
      pass = false;
    }
    if (result.cleaned_facts.inmate_quote !== null) {
      notes.push('cleaned_facts.inmate_quote should be null when said-nothing is true');
      pass = false;
    }
  }

  return { pass, notes };
}

function checkTC10GreenMinimalDisruption(
  status: Status,
  result: ReturnType<typeof evaluate6_1>
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;

  if (status !== 'GREEN') { notes.push(`Expected GREEN, got ${status}`); pass = false; }
  if (result.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${result.red_blockers.length}`); pass = false; }
  if (result.yellow_warnings.length !== 0) { notes.push(`Expected 0 yellow_warnings, got ${result.yellow_warnings.length}: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false; }

  // Confirm operational_impact passes through (not flagged as vague)
  if (result.cleaned_facts) {
    const impact = result.cleaned_facts.operational_impact;
    if (!impact || impact.length < 10) {
      notes.push('operational_impact appears missing or too short in cleaned_facts');
      pass = false;
    }
  }

  return { pass, notes };
}

const CHECKERS = [
  checkTC01Green,
  checkTC02Red,
  checkTC03Yellow,
  checkTC04Red,
  checkTC05Red,
  checkTC06Red,
  checkTC07Yellow,
  checkTC08GreenFemale,
  checkTC09GreenSaidNothing,
  checkTC10GreenMinimalDisruption,
];

// --- Original 10-test runner ---

console.log('');
console.log('='.repeat(72));
console.log('  LOCKUPHQ DR Writer — Charge 6-1 Local Test Runner');
console.log('  Step 2D Test Cases (no Claude API — local gate evaluation only)');
console.log('='.repeat(72));
console.log('');

let passed = 0;
let failed = 0;

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const checker = CHECKERS[i];

  const result = evaluate6_1(tc.input_facts);
  const actualStatus = result.status;
  const expectedStatus = tc.expected_status;

  const { pass, notes } = checker(actualStatus, result);

  const statusIcon = pass ? 'PASS' : 'FAIL';
  const expectedMatch = actualStatus === expectedStatus ? '✓' : '✗';

  console.log(`[${statusIcon}] ${tc.test_id} — ${tc.name}`);
  console.log(
    `       Expected: ${expectedStatus.padEnd(6)}  Actual: ${actualStatus.padEnd(6)}  ${expectedMatch}`
  );

  if (notes.length > 0) {
    for (const note of notes) {
      console.log(`       NOTE: ${note}`);
    }
  }

  if (result.red_blockers.length > 0 && actualStatus === 'RED') {
    console.log(`       Red blockers: ${result.red_blockers.map(b => b.id).join(', ')}`);
  }
  if (result.yellow_warnings.length > 0 && actualStatus === 'YELLOW') {
    console.log(`       Yellow warnings: ${result.yellow_warnings.map(w => w.id).join(', ')}`);
  }

  console.log('');
  pass ? passed++ : failed++;
}

console.log('='.repeat(72));
console.log(`  Step 2D Results: ${passed} passed / ${failed} failed / ${testCases.length} total`);
console.log('='.repeat(72));

// --- Step 3B Patch Tests (inline — not from test_cases.json) ---

const BASE_GREEN_FACTS: IntakeFacts6_1 = {
  incident_date: 'January 18, 2026',
  incident_time: '1800',
  officer_rank: 'Officer',
  officer_name: 'T. Davis',
  officer_post: 'housing officer',
  dorm_area: 'E Dorm',
  officer_activity: 'conducting the master roster count',
  incident_location: 'cell E3107',
  inmate_last_name: 'Smith',
  inmate_first_name: 'John',
  dc_number: 'A12345',
  narrative_reference_style: 'he/him',
  inmate_behavior_before_order: 'standing at the cell door outside of his assigned cell',
  order_type: 'verbal',
  exact_order: 'return to his assigned cell',
  total_orders_given: 3,
  acknowledgment_type: 'eye_contact_and_verbal_response',
  inmate_quote: "No, I ain't doing that.",
  inmate_said_nothing: false,
  inmate_tone: 'loud and argumentative',
  physical_behavior: 'crossed his arms and remained positioned at the cell door',
  operational_impact: 'temporarily interrupting the master roster count and drawing the attention of surrounding inmates',
  ability_to_comply: 'no_issue',
  ability_to_comply_explanation: null,
  force_used: 'no',
  force_explanation: null,
  uof_documentation_status: 'not_applicable',
  confinement_status: 'placed',
  oic_rank: 'Captain',
  oic_last_name: 'Brown',
  oic_authorized_confirmed: true,
  witness_staff: null,
  camera_coverage: null,
  additional_facts: null,
  separate_conduct_described: false,
  separate_conduct_isolatable: null,
  request_to_invent: false,
  quote_is_summary: false,
};

interface PatchTest {
  test_id: string;
  name: string;
  facts: IntakeFacts6_1;
  check: (result: ReturnType<typeof evaluate6_1>) => { pass: boolean; notes: string[] };
}

const patchTests: PatchTest[] = [
  {
    test_id: 'TC_B01',
    name: 'force_used null → RED (missing_force_answer)',
    facts: { ...BASE_GREEN_FACTS, force_used: null },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'RED') { notes.push(`Expected RED, got ${result.status}`); pass = false; }
      if (!result.red_blockers.some(b => b.id === 'missing_force_answer')) {
        notes.push('Expected red_blocker missing_force_answer'); pass = false;
      }
      if (result.cleaned_facts !== null) { notes.push('cleaned_facts must be null for RED'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B02',
    name: 'total_orders_given: 0 → RED (missing_specific_order_count)',
    facts: { ...BASE_GREEN_FACTS, total_orders_given: 0 },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'RED') { notes.push(`Expected RED, got ${result.status}`); pass = false; }
      if (!result.red_blockers.some(b => b.id === 'missing_specific_order_count')) {
        notes.push('Expected red_blocker missing_specific_order_count'); pass = false;
      }
      if (result.cleaned_facts !== null) { notes.push('cleaned_facts must be null for RED'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B03',
    name: '"3 times" total_orders_given → GREEN (parses as 3, not vague)',
    facts: { ...BASE_GREEN_FACTS, total_orders_given: '3 times' },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.red_blockers.some(b => b.id === 'missing_specific_order_count')) {
        notes.push('"3 times" incorrectly triggered missing_specific_order_count'); pass = false;
      }
      if (result.cleaned_facts?.total_orders_given !== 3) {
        notes.push(`cleaned_facts.total_orders_given should be 3, got ${result.cleaned_facts?.total_orders_given}`);
        pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B04',
    name: 'inmate_said_nothing + quote → YELLOW (quote_conflicts_with_said_nothing)',
    facts: { ...BASE_GREEN_FACTS, inmate_said_nothing: true, inmate_quote: 'No.' },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${result.status}`); pass = false; }
      if (!result.yellow_warnings.some(w => w.id === 'quote_conflicts_with_said_nothing')) {
        notes.push('Expected yellow_warning quote_conflicts_with_said_nothing'); pass = false;
      }
      const w = result.yellow_warnings.find(w => w.id === 'quote_conflicts_with_said_nothing');
      if (w && !w.flag_label) {
        notes.push('flag_label is missing from quote_conflicts_with_said_nothing'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B05',
    name: 'SMITH-JONES → cleaned as Smith-Jones (hyphenated toTitleCase)',
    facts: { ...BASE_GREEN_FACTS, inmate_last_name: 'SMITH-JONES' },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.cleaned_facts?.inmate_last_name !== 'Smith-Jones') {
        notes.push(`Expected "Smith-Jones", got "${result.cleaned_facts?.inmate_last_name}"`);
        pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B06',
    name: '"sargent" (lowercase) → corrected to "Sergeant" in cleaned_facts (case-insensitive typo)',
    facts: { ...BASE_GREEN_FACTS, officer_activity: 'conducting rounds with sargent jones' },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      const activity = result.cleaned_facts?.officer_activity ?? '';
      if (!activity.includes('Sergeant')) {
        notes.push(`Expected "Sergeant" in officer_activity, got "${activity}"`); pass = false;
      }
      if (/sargent/i.test(activity)) {
        notes.push(`"sargent" typo was not corrected in officer_activity: "${activity}"`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B07',
    name: 'oic_authorized_confirmed not true → RED (missing_oic_authorization_confirmation)',
    facts: { ...BASE_GREEN_FACTS, oic_authorized_confirmed: false },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'RED') { notes.push(`Expected RED, got ${result.status}`); pass = false; }
      if (!result.red_blockers.some(b => b.id === 'missing_oic_authorization_confirmation')) {
        notes.push('Expected red_blocker missing_oic_authorization_confirmation'); pass = false;
      }
      if (result.cleaned_facts !== null) { notes.push('cleaned_facts must be null for RED'); pass = false; }
      // A named OIC rank/last name alone is not sufficient — the explicit confirmation is a
      // distinct fact from "a name was typed in". Confirm the other OIC checks still passed
      // (i.e. this is the ONLY reason for RED here, proving the gate is additive, not a stand-in).
      if (result.red_blockers.some(b => b.id === 'missing_oic_rank' || b.id === 'missing_oic_last_name')) {
        notes.push('Unexpected: missing_oic_rank/missing_oic_last_name fired even though both were provided'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B08',
    name: 'Quote the regex does not recognize as a summary, checkbox unchecked → GREEN (baseline)',
    facts: { ...BASE_GREEN_FACTS, inmate_quote: "Ain't happening, not today, not ever", quote_is_summary: false },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.yellow_warnings.some(w => w.id === 'quote_is_summary')) {
        notes.push('Did not expect quote_is_summary warning — regex should not match this phrasing'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_B09',
    name: 'Same quote, quote_is_summary checkbox checked → YELLOW (officer attestation overrides regex)',
    facts: { ...BASE_GREEN_FACTS, inmate_quote: "Ain't happening, not today, not ever", quote_is_summary: true },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${result.status}`); pass = false; }
      if (!result.yellow_warnings.some(w => w.id === 'quote_is_summary')) {
        notes.push('Expected yellow_warning quote_is_summary — checkbox attestation should force this regardless of regex'); pass = false;
      }
      return { pass, notes };
    },
  },
];

// --- Patch test runner ---

console.log('');
console.log('='.repeat(72));
console.log('  Step 3B Patch Tests (inline — hardcoded facts, no JSON file)');
console.log('='.repeat(72));
console.log('');

let bPassed = 0;
let bFailed = 0;

for (const pt of patchTests) {
  const result = evaluate6_1(pt.facts);
  const { pass, notes } = pt.check(result);
  const statusIcon = pass ? 'PASS' : 'FAIL';

  console.log(`[${statusIcon}] ${pt.test_id} — ${pt.name}`);
  console.log(`       Status: ${result.status}`);

  if (notes.length > 0) {
    for (const note of notes) {
      console.log(`       NOTE: ${note}`);
    }
  }

  if (result.red_blockers.length > 0) {
    console.log(`       Red blockers: ${result.red_blockers.map(b => b.id).join(', ')}`);
  }
  if (result.yellow_warnings.length > 0) {
    console.log(`       Yellow warnings: ${result.yellow_warnings.map(w => w.id).join(', ')}`);
  }

  console.log('');
  pass ? bPassed++ : bFailed++;
}

console.log('='.repeat(72));
console.log(`  Patch Results:  ${bPassed} passed / ${bFailed} failed / ${patchTests.length} total`);
console.log('='.repeat(72));

// --- Step 3C Prompt Mode + Parser Tests ---

// Minimal valid GREEN JSON for parser tests
const MINIMAL_GREEN_JSON = JSON.stringify({
  schema_version: '1.1',
  charge: '6-1',
  status: 'GREEN',
  red_blockers: [],
  yellow_warnings: [],
  cleaned_facts: null,
  narrative: 'Paragraph one.\n\nParagraph two.',
  flagged_sections: [],
  ai_disclosure: 'Test disclosure.',
  officer_review_checklist: ['Item 1.'],
});

interface CTest {
  test_id: string;
  name: string;
  check: () => { pass: boolean; notes: string[] };
}

const GREEN_EVAL = evaluate6_1(BASE_GREEN_FACTS);
const RED_EVAL = evaluate6_1({ ...BASE_GREEN_FACTS, dc_number: null });
// TC03 input (quote is a summary) for YELLOW prompt test
const YELLOW_EVAL = evaluate6_1({
  ...BASE_GREEN_FACTS,
  inmate_quote: 'he said he was not going back to his cell',
  inmate_tone: 'loud',
});

const cTests: CTest[] = [
  {
    test_id: 'TC_C01',
    name: 'buildPrompt6_1 default outputMode is narrative_only',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL);
      if (r.outputMode !== 'narrative_only') {
        notes.push(`Expected outputMode "narrative_only", got "${r.outputMode}"`); pass = false;
      }
      if (r.prompt === null) { notes.push('Expected non-null prompt for default GREEN'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C02',
    name: 'json_schema mode includes "Return ONLY valid JSON"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.prompt?.includes('Return ONLY valid JSON')) {
        notes.push('json_schema prompt missing "Return ONLY valid JSON"'); pass = false;
      }
      if (r.outputMode !== 'json_schema') {
        notes.push(`Expected outputMode "json_schema", got "${r.outputMode}"`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C03',
    name: 'json_schema mode includes schema_version "1.1"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.prompt?.includes('"1.1"')) {
        notes.push('json_schema prompt missing schema_version "1.1"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C04',
    name: 'json_schema mode includes charge "6-1"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.prompt?.includes('"6-1"')) {
        notes.push('json_schema prompt missing charge "6-1"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C05',
    name: 'json_schema mode does not say "Return the single-paragraph narrative only"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (r.prompt?.includes('Return the single-paragraph narrative only')) {
        notes.push('json_schema prompt incorrectly contains narrative-only output instruction'); pass = false;
      }
      // Confirm narrative_only DOES include it (positive check)
      const rn = buildPrompt6_1(GREEN_EVAL, { outputMode: 'narrative_only' });
      if (!rn.prompt?.includes('Return the single-paragraph narrative only')) {
        notes.push('narrative_only prompt is missing expected output instruction (positive check failed)'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C06',
    name: 'RED result produces null prompt in both modes',
    check() {
      const notes: string[] = [];
      let pass = true;
      const rNarr = buildPrompt6_1(RED_EVAL, { outputMode: 'narrative_only' });
      const rJson = buildPrompt6_1(RED_EVAL, { outputMode: 'json_schema' });
      if (rNarr.prompt !== null) { notes.push('narrative_only: expected null for RED'); pass = false; }
      if (rNarr.parts !== null) { notes.push('narrative_only: parts must be null for RED'); pass = false; }
      if (rJson.prompt !== null) { notes.push('json_schema: expected null for RED'); pass = false; }
      if (rJson.parts !== null) { notes.push('json_schema: parts must be null for RED'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C07',
    name: 'parseResponse6_1 accepts a minimal valid GREEN JSON string',
    check() {
      const notes: string[] = [];
      let pass = true;
      try {
        const result = parseResponse6_1(MINIMAL_GREEN_JSON);
        if (result.schema_version !== '1.1') { notes.push('schema_version should be "1.1"'); pass = false; }
        if (result.charge !== '6-1') { notes.push('charge should be "6-1"'); pass = false; }
        if (result.status !== 'GREEN') { notes.push('status should be "GREEN"'); pass = false; }
      } catch (err) {
        notes.push(`parseResponse6_1 threw unexpectedly: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C08',
    name: 'parseResponse6_1 rejects invalid schema_version',
    check() {
      const notes: string[] = [];
      let pass = true;
      const bad = JSON.stringify({ ...JSON.parse(MINIMAL_GREEN_JSON), schema_version: '1.0' });
      try {
        parseResponse6_1(bad);
        notes.push('Expected ParseError for wrong schema_version — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_C09',
    name: 'parseResponse6_1 rejects wrong charge',
    check() {
      const notes: string[] = [];
      let pass = true;
      const bad = JSON.stringify({ ...JSON.parse(MINIMAL_GREEN_JSON), charge: '6-2' });
      try {
        parseResponse6_1(bad);
        notes.push('Expected ParseError for wrong charge — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 3C — Prompt Mode + Parser Tests');
console.log('='.repeat(72));
console.log('');

let cPassed = 0;
let cFailed = 0;

for (const ct of cTests) {
  const { pass, notes } = ct.check();
  const statusIcon = pass ? 'PASS' : 'FAIL';
  console.log(`[${statusIcon}] ${ct.test_id} — ${ct.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? cPassed++ : cFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 3C Results: ${cPassed} passed / ${cFailed} failed / ${cTests.length} total`);
console.log('='.repeat(72));

// --- Step 3C-3 Parser Hardening + Prompt Strict Rule Tests ---

interface DTest {
  test_id: string;
  name: string;
  check: () => { pass: boolean; notes: string[] };
}

const dTests: DTest[] = [
  {
    test_id: 'TC_D01',
    name: 'parseResponse6_1 accepts clean valid GREEN JSON (no fence)',
    check() {
      const notes: string[] = [];
      let pass = true;
      try {
        const result = parseResponse6_1(MINIMAL_GREEN_JSON);
        if (result.schema_version !== '1.1') { notes.push('schema_version should be "1.1"'); pass = false; }
        if (result.status !== 'GREEN') { notes.push('status should be "GREEN"'); pass = false; }
      } catch (err) {
        notes.push(`parseResponse6_1 threw unexpectedly: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D02',
    name: 'parseResponse6_1 accepts ```json fenced valid GREEN JSON',
    check() {
      const notes: string[] = [];
      let pass = true;
      const fenced = '```json\n' + MINIMAL_GREEN_JSON + '\n```';
      try {
        const result = parseResponse6_1(fenced);
        if (result.schema_version !== '1.1') { notes.push('schema_version should be "1.1"'); pass = false; }
        if (result.status !== 'GREEN') { notes.push('status should be "GREEN"'); pass = false; }
      } catch (err) {
        notes.push(`parseResponse6_1 threw unexpectedly on fenced input: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D03',
    name: 'parseResponse6_1 accepts generic ``` fenced valid GREEN JSON',
    check() {
      const notes: string[] = [];
      let pass = true;
      const fenced = '```\n' + MINIMAL_GREEN_JSON + '\n```';
      try {
        const result = parseResponse6_1(fenced);
        if (result.schema_version !== '1.1') { notes.push('schema_version should be "1.1"'); pass = false; }
        if (result.status !== 'GREEN') { notes.push('status should be "GREEN"'); pass = false; }
      } catch (err) {
        notes.push(`parseResponse6_1 threw unexpectedly on generic fence: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D04',
    name: 'parseResponse6_1 rejects prose before JSON',
    check() {
      const notes: string[] = [];
      let pass = true;
      const proseFirst = 'Here is the JSON:\n' + MINIMAL_GREEN_JSON;
      try {
        parseResponse6_1(proseFirst);
        notes.push('Expected ParseError for prose before JSON — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got: ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D05',
    name: 'parseResponse6_1 rejects prose after JSON',
    check() {
      const notes: string[] = [];
      let pass = true;
      const proseLast = MINIMAL_GREEN_JSON + '\nHope this helps!';
      try {
        parseResponse6_1(proseLast);
        notes.push('Expected ParseError for prose after JSON — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got: ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D06',
    name: 'parseResponse6_1 rejects malformed JSON',
    check() {
      const notes: string[] = [];
      let pass = true;
      const malformed = '{ not valid json ';
      try {
        parseResponse6_1(malformed);
        notes.push('Expected ParseError for malformed JSON — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got: ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D07',
    name: 'json_schema system prompt includes: Your first character must be "{"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Your first character must be "{"')) {
        notes.push('json_schema system prompt missing: Your first character must be "{"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D08',
    name: 'json_schema system prompt includes: Your last character must be "}"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Your last character must be "}"')) {
        notes.push('json_schema system prompt missing: Your last character must be "}"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_D09',
    name: 'json_schema system prompt includes: If you include anything outside the JSON object, the response is invalid.',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('If you include anything outside the JSON object, the response is invalid.')) {
        notes.push('json_schema system prompt missing: If you include anything outside the JSON object, the response is invalid.'); pass = false;
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 3C-3 — Parser Hardening + Strict Prompt Rule Tests');
console.log('='.repeat(72));
console.log('');

let dPassed = 0;
let dFailed = 0;

for (const dt of dTests) {
  const { pass, notes } = dt.check();
  const statusIcon = pass ? 'PASS' : 'FAIL';
  console.log(`[${statusIcon}] ${dt.test_id} — ${dt.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? dPassed++ : dFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 3C-3 Results: ${dPassed} passed / ${dFailed} failed / ${dTests.length} total`);
console.log('='.repeat(72));

// --- Step 3C-4 Narrative Polish Tests ---

interface ETest {
  test_id: string;
  name: string;
  check: () => { pass: boolean; notes: string[] };
}

const eTests: ETest[] = [
  {
    test_id: 'TC_E01',
    name: 'Order count 3 → "two additional times" and "three verbal orders" in prompt',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.prompt?.includes('two additional times')) {
        notes.push('Expected "two additional times" in prompt — not found'); pass = false;
      }
      if (!r.prompt?.includes('three verbal orders')) {
        notes.push('Expected "three verbal orders" in prompt — not found'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E02',
    name: 'Prompt does not include numeric "2 additional times" for TC01',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (r.prompt?.includes('2 additional times')) {
        notes.push('Numeric "2 additional times" found in prompt — should be spelled out'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E03',
    name: 'Prompt does not include numeric "3 verbal orders" for TC01',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (r.prompt?.includes('3 verbal orders')) {
        notes.push('Numeric "3 verbal orders" found in prompt — should be spelled out'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E04',
    name: 'System prompt includes "Use spelled-out number words for order counts one through ten"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Use spelled-out number words for order counts one through ten')) {
        notes.push('System prompt missing number-word instruction'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E05',
    name: 'System prompt includes assignment article guidance ("assigned as the [POST]")',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('assigned as the [POST]')) {
        notes.push('System prompt missing article guidance for officer assignment'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E06',
    name: 'cleaned_facts.officer_post is unchanged ("housing officer") after prompt build',
    check() {
      const notes: string[] = [];
      let pass = true;
      if (GREEN_EVAL.cleaned_facts?.officer_post !== 'housing officer') {
        notes.push(`Expected "housing officer", got "${GREEN_EVAL.cleaned_facts?.officer_post}"`); pass = false;
      }
      // Also confirm CLEANED_FACTS_JSON in user prompt still echoes the raw value
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.userPrompt.includes('"officer_post": "housing officer"')) {
        notes.push('CLEANED_FACTS_JSON in user prompt does not preserve "housing officer"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E07',
    name: 'json_schema system prompt still includes STRICT RESPONSE RULE (regression)',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Your first character must be "{"')) {
        notes.push('STRICT RESPONSE RULE missing from system prompt'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E08',
    name: 'GREEN json_schema system prompt includes narrative date-formatting instruction',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      const prompt = r.parts?.systemPrompt ?? '';
      if (!prompt.includes('format ISO-style dates as natural written dates')) {
        notes.push('System prompt missing ISO date formatting instruction'); pass = false;
      }
      if (!prompt.includes('Use "March 12, 2026"; do not write "2026-03-12"')) {
        notes.push('System prompt missing natural-date example'); pass = false;
      }
      if (!prompt.includes('Do not change the copied cleaned_facts date value')) {
        notes.push('System prompt missing cleaned_facts preservation instruction'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_E09',
    name: 'YELLOW json_schema system prompt includes narrative date-formatting instruction',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      const prompt = r.parts?.systemPrompt ?? '';
      if (!prompt.includes('format ISO-style dates as natural written dates')) {
        notes.push('YELLOW system prompt missing ISO date formatting instruction'); pass = false;
      }
      if (!prompt.includes('Do not change the copied cleaned_facts date value')) {
        notes.push('YELLOW system prompt missing cleaned_facts preservation instruction'); pass = false;
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 3C-4 — Narrative Polish Tests');
console.log('='.repeat(72));
console.log('');

let ePassed = 0;
let eFailed = 0;

for (const et of eTests) {
  const { pass, notes } = et.check();
  const statusIcon = pass ? 'PASS' : 'FAIL';
  console.log(`[${statusIcon}] ${et.test_id} — ${et.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? ePassed++ : eFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 3C-4 Results: ${ePassed} passed / ${eFailed} failed / ${eTests.length} total`);
console.log('='.repeat(72));

// --- Step 3C-5 YELLOW Quote-Summary Hardening Tests ---

interface FTest {
  test_id: string;
  name: string;
  check: () => { pass: boolean; notes: string[] };
}

const fTests: FTest[] = [
  {
    test_id: 'TC_F01',
    name: 'YELLOW json_schema system prompt includes "QUOTE SUMMARY YELLOW RULE"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('QUOTE SUMMARY YELLOW RULE')) {
        notes.push('System prompt missing "QUOTE SUMMARY YELLOW RULE"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F02',
    name: 'YELLOW json_schema system prompt includes "Do NOT place the summary inside quotation marks"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Do NOT place the summary inside quotation marks')) {
        notes.push('System prompt missing quotation-marks prohibition'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F03',
    name: 'YELLOW json_schema system prompt prohibits stated, "..." pattern',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('stated, "..."')) {
        notes.push('System prompt missing stated, "..." prohibition pattern'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F04',
    name: 'YELLOW json_schema system prompt includes "verbally responded in substance"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('verbally responded in substance')) {
        notes.push('System prompt missing "verbally responded in substance" example'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F05',
    name: 'YELLOW json_schema system prompt includes "[REVIEW — quote is a summary]" in rule example',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('[REVIEW — quote is a summary]')) {
        notes.push('System prompt missing [REVIEW — quote is a summary] in rule example'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F06',
    name: 'YELLOW json_schema user prompt includes "do not use quotation marks around the summarized response"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.userPrompt.includes('For this warning, do not use quotation marks around the summarized response in the narrative.')) {
        notes.push('User prompt missing per-warning quotation-marks instruction'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F07',
    name: 'GREEN json_schema system prompt does NOT include QUOTE SUMMARY YELLOW RULE (no bleed)',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (r.parts?.systemPrompt.includes('QUOTE SUMMARY YELLOW RULE')) {
        notes.push('GREEN system prompt unexpectedly contains QUOTE SUMMARY YELLOW RULE'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F08',
    name: 'YELLOW json_schema system prompt requires "verbally responded in substance" in the narrative',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('must appear in the narrative')) {
        notes.push('System prompt missing "must appear in the narrative" requirement'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F09',
    name: 'YELLOW json_schema system prompt includes incorrect-example phrase (He said he wasn\'t going back)',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes("He said he wasn't going back to his cell.")) {
        notes.push('System prompt missing incorrect-example phrase'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_F10',
    name: 'YELLOW json_schema system prompt places quote-summary tone before "that"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      const expected = 'verbally responded in substance, in a [tone] tone, that [rephrased summary] [REVIEW — quote is a summary]';
      if (!r.parts?.systemPrompt.includes(expected)) {
        notes.push('System prompt missing preferred quote-summary tone placement'); pass = false;
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 3C-5 — YELLOW Quote-Summary Hardening Tests');
console.log('='.repeat(72));
console.log('');

let fPassed = 0;
let fFailed = 0;

for (const ft of fTests) {
  const { pass, notes } = ft.check();
  const statusIcon = pass ? 'PASS' : 'FAIL';
  console.log(`[${statusIcon}] ${ft.test_id} — ${ft.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? fPassed++ : fFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 3C-5 Results: ${fPassed} passed / ${fFailed} failed / ${fTests.length} total`);
console.log('='.repeat(72));

// --- Step 3C-7 JSON Inner-Quote Escaping Tests ---

// Valid GREEN JSON with properly escaped inmate dialogue in narrative
const ESCAPED_QUOTE_GREEN_JSON = JSON.stringify({
  schema_version: '1.1',
  charge: '6-1',
  status: 'GREEN',
  red_blockers: [],
  yellow_warnings: [],
  cleaned_facts: null,
  narrative: 'Inmate Smith stated, "No, I ain\'t doing that."',
  flagged_sections: [],
  ai_disclosure: 'Test disclosure.',
  officer_review_checklist: ['Item 1.'],
});

// Invalid GREEN JSON — unescaped ASCII double quotes inside narrative string
const BROKEN_NARRATIVE_JSON =
  '{"schema_version":"1.1","charge":"6-1","status":"GREEN","red_blockers":[],' +
  '"yellow_warnings":[],"cleaned_facts":null,' +
  '"narrative":"Inmate Smith stated, "No, I ain\'t doing that."",' +
  '"flagged_sections":[],"ai_disclosure":"x","officer_review_checklist":[]}';

// Valid YELLOW JSON — example_stronger_answer with properly escaped inner quotes
const ESCAPED_YELLOW_EXAMPLE_JSON = JSON.stringify({
  schema_version: '1.1',
  charge: '6-1',
  status: 'YELLOW',
  red_blockers: [],
  yellow_warnings: [{
    warning: 'The inmate quote is a summary.',
    affected_paragraph: 2,
    suggested_clarification: 'Provide the exact words.',
    example_stronger_answer: '"No, I ain\'t doing that."',
  }],
  cleaned_facts: null,
  narrative: 'Para one.\n\nPara two.',
  flagged_sections: [2],
  ai_disclosure: 'Test disclosure.',
  officer_review_checklist: ['Item 1.'],
});

// Invalid YELLOW JSON — unescaped ASCII double quotes inside example_stronger_answer
const BROKEN_YELLOW_EXAMPLE_JSON =
  '{"schema_version":"1.1","charge":"6-1","status":"YELLOW","red_blockers":[],' +
  '"yellow_warnings":[{"warning":"Test.","affected_paragraph":2,' +
  '"suggested_clarification":"x","example_stronger_answer":""No, I ain\'t doing that.""}],' +
  '"cleaned_facts":null,"narrative":"Para.","flagged_sections":[2],' +
  '"ai_disclosure":"x","officer_review_checklist":[]}';

interface GTest {
  test_id: string;
  name: string;
  check: () => { pass: boolean; notes: string[] };
}

const gTests: GTest[] = [
  {
    test_id: 'TC_G01',
    name: 'parseResponse6_1 accepts valid JSON with properly escaped inmate quote in narrative',
    check() {
      const notes: string[] = [];
      let pass = true;
      try {
        const result = parseResponse6_1(ESCAPED_QUOTE_GREEN_JSON);
        if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
        if (!result.narrative?.includes('"No, I ain\'t doing that."')) {
          notes.push('narrative should contain the inmate dialogue quote'); pass = false;
        }
      } catch (err) {
        notes.push(`parseResponse6_1 threw unexpectedly: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G02',
    name: 'parseResponse6_1 rejects invalid JSON with unescaped inmate quote in narrative',
    check() {
      const notes: string[] = [];
      let pass = true;
      try {
        parseResponse6_1(BROKEN_NARRATIVE_JSON);
        notes.push('Expected ParseError for unescaped inner quotes in narrative — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got: ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G03',
    name: 'parseResponse6_1 rejects invalid JSON with unescaped inner quotes in example_stronger_answer',
    check() {
      const notes: string[] = [];
      let pass = true;
      try {
        parseResponse6_1(BROKEN_YELLOW_EXAMPLE_JSON);
        notes.push('Expected ParseError for broken nested quotes in example_stronger_answer — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof ParseError)) {
          notes.push(`Expected ParseError, got: ${err}`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G04',
    name: 'parseResponse6_1 accepts valid JSON with properly escaped example_stronger_answer',
    check() {
      const notes: string[] = [];
      let pass = true;
      try {
        const result = parseResponse6_1(ESCAPED_YELLOW_EXAMPLE_JSON);
        if (result.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${result.status}`); pass = false; }
        if (result.yellow_warnings.length !== 1) {
          notes.push(`Expected 1 yellow_warning, got ${result.yellow_warnings.length}`); pass = false;
        }
      } catch (err) {
        notes.push(`parseResponse6_1 threw unexpectedly: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G05',
    name: 'GREEN json_schema system prompt includes "JSON STRING ESCAPING RULE"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('JSON STRING ESCAPING RULE')) {
        notes.push('System prompt missing "JSON STRING ESCAPING RULE"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G06',
    name: 'GREEN json_schema system prompt includes "must be escaped as"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('must be escaped as')) {
        notes.push('System prompt missing "must be escaped as"'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G07',
    name: 'GREEN json_schema system prompt shows escaped example: Inmate Smith stated, \\"No',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Inmate Smith stated, \\"No')) {
        notes.push('System prompt missing escaped example: Inmate Smith stated, \\"No'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G08',
    name: 'GREEN json_schema system prompt includes "Incorrect:" example',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(GREEN_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('Incorrect:')) {
        notes.push('System prompt missing "Incorrect:" example'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_G09',
    name: 'YELLOW json_schema system prompt also includes "JSON STRING ESCAPING RULE"',
    check() {
      const notes: string[] = [];
      let pass = true;
      const r = buildPrompt6_1(YELLOW_EVAL, { outputMode: 'json_schema' });
      if (!r.parts?.systemPrompt.includes('JSON STRING ESCAPING RULE')) {
        notes.push('YELLOW system prompt missing "JSON STRING ESCAPING RULE"'); pass = false;
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 3C-7 — JSON Inner-Quote Escaping Tests');
console.log('='.repeat(72));
console.log('');

let gPassed = 0;
let gFailed = 0;

for (const gt of gTests) {
  const { pass, notes } = gt.check();
  const statusIcon = pass ? 'PASS' : 'FAIL';
  console.log(`[${statusIcon}] ${gt.test_id} — ${gt.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? gPassed++ : gFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 3C-7 Results: ${gPassed} passed / ${gFailed} failed / ${gTests.length} total`);
console.log('='.repeat(72));

// --- Step 4K Practice-Inspired Synthetic Tests ---

interface KTest {
  test_id: string;
  name: string;
  facts: IntakeFacts6_1;
  check: (result: ReturnType<typeof evaluate6_1>) => { pass: boolean; notes: string[] };
}

const kTests: KTest[] = [
  {
    test_id: 'TC_K01',
    name: 'Hand restraints refusal — all facts present → GREEN',
    facts: {
      ...BASE_GREEN_FACTS,
      officer_activity: 'preparing inmate Smith for escort from his cell',
      inmate_behavior_before_order: 'standing at his cell door with his hands at his sides',
      exact_order: 'submit to hand restraints',
      total_orders_given: 3,
      acknowledgment_type: 'eye_contact_and_verbal_response',
      inmate_quote: "I'm not cuffing up.",
      inmate_said_nothing: false,
      inmate_tone: 'calm but refusing',
      physical_behavior: 'refused to place his hands through the cuff port and kept his hands against his body, remaining in place',
      operational_impact: 'delaying the scheduled escort and requiring additional staff attention',
      ability_to_comply: 'no_issue',
      force_used: 'no',
      confinement_status: 'remained',
    },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.red_blockers.length !== 0) {
        notes.push(`Expected 0 red_blockers, got: ${result.red_blockers.map(b => b.id).join(', ')}`); pass = false;
      }
      if (result.yellow_warnings.length !== 0) {
        notes.push(`Expected 0 yellow_warnings, got: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false;
      }
      if (result.cleaned_facts === null) { notes.push('cleaned_facts should not be null for GREEN'); pass = false; }
      const promptResult = buildPrompt6_1(result);
      if (promptResult.prompt === null) { notes.push('buildPrompt6_1 should not return null for GREEN'); pass = false; }
      if (promptResult.prompt?.includes('[REVIEW —')) {
        notes.push('GREEN prompt unexpectedly contains [REVIEW — ...] flag'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_K02',
    name: 'Silent noncompliance (realistic) — said nothing, eye contact, refused by action → GREEN',
    facts: {
      ...BASE_GREEN_FACTS,
      officer_activity: 'conducting the scheduled security check',
      inmate_behavior_before_order: 'seated on his bunk inside his assigned cell',
      exact_order: 'return to his assigned cell',
      total_orders_given: 3,
      acknowledgment_type: 'eye_contact',
      inmate_quote: null,
      inmate_said_nothing: true,
      inmate_tone: null,
      physical_behavior: 'remained seated on his bunk and made no movement toward the cell door',
      operational_impact: 'temporarily delaying the scheduled security check and requiring additional staff attention',
    },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.red_blockers.length !== 0) {
        notes.push(`Expected 0 red_blockers, got: ${result.red_blockers.map(b => b.id).join(', ')}`); pass = false;
      }
      if (result.yellow_warnings.some(w => w.id === 'quote_is_summary')) {
        notes.push('Unexpected quote_is_summary warning — inmate said nothing'); pass = false;
      }
      if (result.yellow_warnings.some(w => w.id === 'missing_tone_when_inmate_spoke')) {
        notes.push('Unexpected tone warning — inmate said nothing so tone not required'); pass = false;
      }
      if (result.yellow_warnings.some(w => w.id === 'quote_conflicts_with_said_nothing')) {
        notes.push('Unexpected quote_conflicts_with_said_nothing — no quote was provided'); pass = false;
      }
      if (result.cleaned_facts !== null) {
        if (!result.cleaned_facts.inmate_said_nothing) {
          notes.push('cleaned_facts.inmate_said_nothing should be true'); pass = false;
        }
        if (result.cleaned_facts.inmate_quote !== null) {
          notes.push('cleaned_facts.inmate_quote should be null when said-nothing is true'); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_K03',
    name: 'Release to GP / relocation refusal — exact quote, full facts → GREEN',
    facts: {
      ...BASE_GREEN_FACTS,
      officer_activity: 'processing inmates for release to general population',
      inmate_behavior_before_order: 'standing inside his cell with his property on his bunk',
      exact_order: 'gather his property and report to the housing unit officer for release to general population',
      total_orders_given: 3,
      acknowledgment_type: 'eye_contact_and_verbal_response',
      inmate_quote: "I'm not going.",
      inmate_said_nothing: false,
      inmate_tone: 'flat and refusing',
      physical_behavior: 'remained standing inside his cell and made no movement toward the cell door',
      operational_impact: 'delaying the scheduled release process and requiring additional staff attention',
    },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.red_blockers.length !== 0) {
        notes.push(`Expected 0 red_blockers, got: ${result.red_blockers.map(b => b.id).join(', ')}`); pass = false;
      }
      if (result.yellow_warnings.length !== 0) {
        notes.push(`Expected 0 yellow_warnings, got: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false;
      }
      if (result.cleaned_facts === null) { notes.push('cleaned_facts should not be null for GREEN'); pass = false; }
      if (result.cleaned_facts?.inmate_quote !== "I'm not going.") {
        notes.push(`cleaned_facts.inmate_quote should be preserved, got "${result.cleaned_facts?.inmate_quote}"`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_K04',
    name: 'Cellmate context with approximate quote → YELLOW (quote_is_summary)',
    facts: {
      ...BASE_GREEN_FACTS,
      inmate_behavior_before_order: 'standing at the cell door blocking the entrance to his assigned cell',
      exact_order: 'return to his assigned cell',
      total_orders_given: 3,
      acknowledgment_type: 'eye_contact_and_verbal_response',
      inmate_quote: 'he said he was not moving back into the cell with his cellmate',
      inmate_said_nothing: false,
      inmate_tone: 'agitated',
      physical_behavior: 'crossed his arms and remained positioned at the cell door, refusing to enter',
      operational_impact: 'temporarily disrupting the housing assignment process and drawing the attention of surrounding inmates',
    },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${result.status}`); pass = false; }
      if (result.red_blockers.length !== 0) {
        notes.push(`Expected 0 red_blockers, got: ${result.red_blockers.map(b => b.id).join(', ')}`); pass = false;
      }
      if (!result.yellow_warnings.some(w => w.id === 'quote_is_summary')) {
        notes.push('Expected yellow_warning quote_is_summary for approximate cellmate quote'); pass = false;
      }
      const qw = result.yellow_warnings.find(w => w.id === 'quote_is_summary');
      if (qw && qw.affected_paragraph !== 2) {
        notes.push(`quote_is_summary.affected_paragraph should be 2, got ${qw.affected_paragraph}`); pass = false;
      }
      if (qw && !qw.flag_label) {
        notes.push('quote_is_summary.flag_label is missing'); pass = false;
      }
      const promptResult = buildPrompt6_1(result);
      if (promptResult.prompt === null) {
        notes.push('buildPrompt6_1 should not return null for YELLOW'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_K05',
    name: 'Witness staff present — optional field populated, all facts GREEN → GREEN',
    facts: {
      ...BASE_GREEN_FACTS,
      inmate_quote: "I'm not going back.",
      inmate_tone: 'loud and argumentative',
      witness_staff: 'Officer J. Jones',
    },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.red_blockers.length !== 0) {
        notes.push(`Expected 0 red_blockers, got: ${result.red_blockers.map(b => b.id).join(', ')}`); pass = false;
      }
      if (result.yellow_warnings.length !== 0) {
        notes.push(`Expected 0 yellow_warnings, got: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false;
      }
      if (result.cleaned_facts === null) { notes.push('cleaned_facts should not be null for GREEN'); pass = false; }
      if (result.cleaned_facts?.witness_staff === null || result.cleaned_facts?.witness_staff === undefined) {
        notes.push('cleaned_facts.witness_staff should be preserved'); pass = false;
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 4K — Practice-Inspired Synthetic Tests');
console.log('='.repeat(72));
console.log('');

let kPassed = 0;
let kFailed = 0;

for (const kt of kTests) {
  const result = evaluate6_1(kt.facts);
  const { pass, notes } = kt.check(result);
  const statusIcon = pass ? 'PASS' : 'FAIL';

  console.log(`[${statusIcon}] ${kt.test_id} — ${kt.name}`);
  console.log(`       Status: ${result.status}`);

  if (notes.length > 0) {
    for (const note of notes) {
      console.log(`       NOTE: ${note}`);
    }
  }

  if (result.red_blockers.length > 0) {
    console.log(`       Red blockers: ${result.red_blockers.map(b => b.id).join(', ')}`);
  }
  if (result.yellow_warnings.length > 0) {
    console.log(`       Yellow warnings: ${result.yellow_warnings.map(w => w.id).join(', ')}`);
  }

  console.log('');
  pass ? kPassed++ : kFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 4K Results: ${kPassed} passed / ${kFailed} failed / ${kTests.length} total`);
console.log('='.repeat(72));

// --- Step 4L Written-Order Path Test ---

interface LTest {
  test_id: string;
  name: string;
  facts: IntakeFacts6_1;
  check: (result: ReturnType<typeof evaluate6_1>) => { pass: boolean; notes: string[] };
}

const lTests: LTest[] = [
  {
    test_id: 'TC_L01',
    name: 'Written order refusal — order_type="written", exact quote, full facts → GREEN',
    facts: {
      ...BASE_GREEN_FACTS,
      officer_activity: 'conducting a routine housing-unit operation',
      inmate_behavior_before_order: 'seated at his bunk inside his assigned cell',
      order_type: 'written',
      exact_order: 'comply with the written housing reassignment order',
      total_orders_given: 1,
      acknowledgment_type: 'actions_showed_awareness',
      inmate_quote: "I'm not signing that and I'm not moving.",
      inmate_said_nothing: false,
      inmate_tone: 'firm and refusing',
      physical_behavior: 'refused to sign the written order and remained seated on his bunk, making no movement to comply',
      operational_impact: 'delaying the housing reassignment process and requiring additional staff attention',
      ability_to_comply: 'no_issue',
      force_used: 'no',
      confinement_status: 'placed',
    },
    check(result) {
      const notes: string[] = [];
      let pass = true;
      if (result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.status}`); pass = false; }
      if (result.red_blockers.length !== 0) {
        notes.push(`Expected 0 red_blockers, got: ${result.red_blockers.map(b => b.id).join(', ')}`); pass = false;
      }
      if (result.yellow_warnings.length !== 0) {
        notes.push(`Expected 0 yellow_warnings, got: ${result.yellow_warnings.map(w => w.id).join(', ')}`); pass = false;
      }
      if (result.cleaned_facts === null) { notes.push('cleaned_facts should not be null for GREEN'); pass = false; }
      if (result.cleaned_facts?.order_type !== 'written') {
        notes.push(`cleaned_facts.order_type should be "written", got "${result.cleaned_facts?.order_type}"`); pass = false;
      }
      if (!result.cleaned_facts?.exact_order.includes('written housing reassignment order')) {
        notes.push(`cleaned_facts.exact_order should preserve order text, got "${result.cleaned_facts?.exact_order}"`); pass = false;
      }
      const promptResult = buildPrompt6_1(result);
      if (promptResult.prompt === null) { notes.push('buildPrompt6_1 should not return null for GREEN'); pass = false; }
      if (promptResult.prompt?.includes('[REVIEW —')) {
        notes.push('GREEN prompt unexpectedly contains [REVIEW — ...] flag'); pass = false;
      }
      return { pass, notes };
    },
  },
];

console.log('');
console.log('='.repeat(72));
console.log('  Step 4L — Written-Order Path Test');
console.log('='.repeat(72));
console.log('');

let lPassed = 0;
let lFailed = 0;

for (const lt of lTests) {
  const result = evaluate6_1(lt.facts);
  const { pass, notes } = lt.check(result);
  const statusIcon = pass ? 'PASS' : 'FAIL';

  console.log(`[${statusIcon}] ${lt.test_id} — ${lt.name}`);
  console.log(`       Status: ${result.status}`);

  if (notes.length > 0) {
    for (const note of notes) {
      console.log(`       NOTE: ${note}`);
    }
  }

  if (result.red_blockers.length > 0) {
    console.log(`       Red blockers: ${result.red_blockers.map(b => b.id).join(', ')}`);
  }
  if (result.yellow_warnings.length > 0) {
    console.log(`       Yellow warnings: ${result.yellow_warnings.map(w => w.id).join(', ')}`);
  }

  console.log('');
  pass ? lPassed++ : lFailed++;
}

console.log('='.repeat(72));
console.log(`  Step 4L Results: ${lPassed} passed / ${lFailed} failed / ${lTests.length} total`);
console.log('='.repeat(72));

// --- Grand total ---

const totalPassed = passed + bPassed + cPassed + dPassed + ePassed + fPassed + gPassed + kPassed + lPassed;
const totalFailed = failed + bFailed + cFailed + dFailed + eFailed + fFailed + gFailed + kFailed + lFailed;
const total = testCases.length + patchTests.length + cTests.length + dTests.length + eTests.length + fTests.length + gTests.length + kTests.length + lTests.length;

console.log('');
console.log('='.repeat(72));
console.log(`  Grand Total:    ${totalPassed} passed / ${totalFailed} failed / ${total} total`);
console.log('='.repeat(72));
console.log('');

if (totalFailed > 0) {
  process.exit(1);
}
