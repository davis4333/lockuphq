// LOCKUPHQ DR Writer — Charge 6-1 Generate Pipeline Mock Tests
// Step 4B: verifies the full pipeline with a mock Claude client.
// No real API calls are made. No network access required.
//
// Usage: node --experimental-strip-types src/dr-writer/charges/6-1/testGenerate6_1.ts

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generate6_1, Generate6_1Error } from './generate6_1.ts';
import { evaluate6_1 } from './evaluate6_1.ts';
import type { IntakeFacts6_1, OutputSchema6_1 } from './types.ts';
import { AI_DISCLOSURE, OFFICER_REVIEW_CHECKLIST } from './types.ts';
import type { ClaudeJsonClient, ClaudePromptParts } from '../../llm/claudeTypes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesPath = join(__dirname, '../../../../kb/charges/6-1/test_cases.json');
const testCasesJson = JSON.parse(readFileSync(testCasesPath, 'utf-8'));

// TC01 = GREEN, TC02 = RED (missing DC), TC03 = YELLOW (quote is summary)
const TC01_FACTS: IntakeFacts6_1 = testCasesJson.test_cases[0].input_facts;
const TC02_FACTS: IntakeFacts6_1 = testCasesJson.test_cases[1].input_facts;
const TC03_FACTS: IntakeFacts6_1 = testCasesJson.test_cases[2].input_facts;

// ---------------------------------------------------------------------------
// Mock client factory
// ---------------------------------------------------------------------------

function makeMockClient(
  responseOrFn: string | (() => string),
  tracker: { calls: number } = { calls: 0 }
): ClaudeJsonClient {
  return {
    async completeJson(_parts: ClaudePromptParts): Promise<string> {
      tracker.calls++;
      return typeof responseOrFn === 'function' ? responseOrFn() : responseOrFn;
    },
  };
}

function makeThrowingClient(message: string): ClaudeJsonClient {
  return {
    async completeJson(_parts: ClaudePromptParts): Promise<string> {
      throw new Error(message);
    },
  };
}

// ---------------------------------------------------------------------------
// Valid mock response builders (derived from real evaluate6_1 output)
// ---------------------------------------------------------------------------

function buildValidGreenJson(facts: IntakeFacts6_1): string {
  const evaluation = evaluate6_1(facts);
  const response: OutputSchema6_1 = {
    schema_version: '1.1',
    charge: '6-1',
    status: 'GREEN',
    red_blockers: [],
    yellow_warnings: [],
    cleaned_facts: evaluation.cleaned_facts,
    narrative:
      'On the reported date, I, the reporting officer, was assigned to the reported area as the reported post. ' +
      'At approximately the reported time, while conducting duties, I approached the location and observed Inmate Smith, John, DC# A12345, standing at the cell door. ' +
      'I issued one direct verbal order to Inmate Smith to return to his assigned cell. Inmate Smith made direct eye contact with me. ' +
      'Inmate Smith then crossed his arms and remained positioned at the cell door. ' +
      'I then advised Inmate Smith, who will be receiving a disciplinary report for the charge of 6-1: Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person. ' +
      'The shift Sergeant, Jones, was notified and authorized the initiation of this report.',
    flagged_sections: [],
    ai_disclosure: AI_DISCLOSURE,
    officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
  };
  return JSON.stringify(response);
}

function buildValidYellowJson(facts: IntakeFacts6_1): string {
  const evaluation = evaluate6_1(facts);
  const outputWarnings = evaluation.yellow_warnings.map(w => ({
    warning: w.warning,
    affected_paragraph: w.affected_paragraph,
    suggested_clarification: w.suggested_clarification,
    example_stronger_answer: w.example_stronger_answer,
  }));
  // flagged_sections is a boolean-style marker in the single-paragraph format,
  // not a paragraph index — [] if nothing is flagged, [1] otherwise.
  const flaggedSections = evaluation.yellow_warnings.length > 0 ? [1] : [];
  const response: OutputSchema6_1 = {
    schema_version: '1.1',
    charge: '6-1',
    status: 'YELLOW',
    red_blockers: [],
    yellow_warnings: outputWarnings,
    cleaned_facts: evaluation.cleaned_facts,
    narrative:
      'On the reported date, I, the reporting officer, was assigned to the reported area as the reported post. ' +
      'At approximately the reported time, while conducting duties, I approached the location and observed Inmate Smith, John, DC# A12345, standing at the cell door. ' +
      'I issued one direct verbal order to Inmate Smith to return to his assigned cell. Inmate Smith made direct eye contact with me. ' +
      'Inmate Smith verbally responded in substance that he was not going back to his cell [REVIEW — quote is a summary]. ' +
      'Inmate Smith then crossed his arms and remained positioned at the cell door. ' +
      'I then advised Inmate Smith, who will be receiving a disciplinary report for the charge of 6-1: Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person. ' +
      'The shift Sergeant, Jones, was notified and authorized the initiation of this report.',
    flagged_sections: flaggedSections,
    ai_disclosure: AI_DISCLOSURE,
    officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
  };
  return JSON.stringify(response);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

interface HTest {
  test_id: string;
  name: string;
  check: () => Promise<{ pass: boolean; notes: string[] }>;
}

const hTests: HTest[] = [
  {
    test_id: 'TC_H01',
    name: 'mock GREEN success — returns OutputSchema6_1 with status GREEN, client called once',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const tracker = { calls: 0 };
      const client = makeMockClient(buildValidGreenJson(TC01_FACTS), tracker);
      try {
        const result = await generate6_1(TC01_FACTS, client);
        if (result.status !== 'GREEN') {
          notes.push(`Expected status GREEN, got ${result.status}`); pass = false;
        }
        if (result.narrative === null) {
          notes.push('narrative should not be null for GREEN'); pass = false;
        }
        if (result.red_blockers.length !== 0) {
          notes.push(`Expected empty red_blockers, got ${result.red_blockers.length}`); pass = false;
        }
        if (tracker.calls !== 1) {
          notes.push(`Expected client called once, got ${tracker.calls}`); pass = false;
        }
      } catch (err) {
        notes.push(`Unexpected error: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H02',
    name: 'mock YELLOW success — returns OutputSchema6_1 with status YELLOW, client called once',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const tracker = { calls: 0 };
      const client = makeMockClient(buildValidYellowJson(TC03_FACTS), tracker);
      try {
        const result = await generate6_1(TC03_FACTS, client);
        if (result.status !== 'YELLOW') {
          notes.push(`Expected status YELLOW, got ${result.status}`); pass = false;
        }
        if (result.narrative === null) {
          notes.push('narrative should not be null for YELLOW'); pass = false;
        }
        if (!result.narrative?.includes('[REVIEW')) {
          notes.push('YELLOW narrative should include [REVIEW] flag'); pass = false;
        }
        if (result.yellow_warnings.length === 0) {
          notes.push('Expected at least one yellow_warning'); pass = false;
        }
        if (tracker.calls !== 1) {
          notes.push(`Expected client called once, got ${tracker.calls}`); pass = false;
        }
      } catch (err) {
        notes.push(`Unexpected error: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H03',
    name: 'mock returns invalid JSON — generate6_1 throws Generate6_1Error (parse failed)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const client = makeMockClient('{ this is not valid json');
      try {
        await generate6_1(TC01_FACTS, client);
        notes.push('Expected Generate6_1Error — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof Generate6_1Error)) {
          notes.push(`Expected Generate6_1Error, got: ${err}`); pass = false;
        } else if (!err.message.includes('parse failed')) {
          notes.push(`Expected "parse failed" in message, got: "${err.message}"`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H04',
    name: 'mock returns wrong charge ("6-2") — generate6_1 throws Generate6_1Error (wrong charge)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(TC01_FACTS);
      const badResponse = JSON.stringify({
        schema_version: '1.1',
        charge: '6-2',
        status: 'GREEN',
        red_blockers: [],
        yellow_warnings: [],
        cleaned_facts: evaluation.cleaned_facts,
        narrative: 'Single-paragraph narrative text for testing purposes only.',
        flagged_sections: [],
        ai_disclosure: AI_DISCLOSURE,
        officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
      });
      const client = makeMockClient(badResponse);
      try {
        await generate6_1(TC01_FACTS, client);
        notes.push('Expected Generate6_1Error — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof Generate6_1Error)) {
          notes.push(`Expected Generate6_1Error, got: ${err}`); pass = false;
        } else if (!err.message.includes('6-2') && !err.message.includes('charge')) {
          // parseResponse6_1 catches wrong charge first ("Invalid charge: ... got '6-2'")
          // post-parse validate catches it second ("wrong charge") — either path is correct
          notes.push(`Expected charge info in error message, got: "${err.message}"`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H05',
    name: 'mock changes cleaned_facts (dc_number tampered) — generate6_1 throws Generate6_1Error (cleaned_facts mismatch)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(TC01_FACTS);
      const tamperedFacts = { ...evaluation.cleaned_facts, dc_number: 'TAMPERED999' };
      const badResponse = JSON.stringify({
        schema_version: '1.1',
        charge: '6-1',
        status: 'GREEN',
        red_blockers: [],
        yellow_warnings: [],
        cleaned_facts: tamperedFacts,
        narrative: 'Single-paragraph narrative text for testing purposes only.',
        flagged_sections: [],
        ai_disclosure: AI_DISCLOSURE,
        officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
      });
      const client = makeMockClient(badResponse);
      try {
        await generate6_1(TC01_FACTS, client);
        notes.push('Expected Generate6_1Error — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof Generate6_1Error)) {
          notes.push(`Expected Generate6_1Error, got: ${err}`); pass = false;
        } else if (!err.message.includes('cleaned_facts mismatch')) {
          notes.push(`Expected "cleaned_facts mismatch" in message, got: "${err.message}"`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H06',
    name: 'mock returns "GREEN" when local status is YELLOW — generate6_1 throws Generate6_1Error (status mismatch)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(TC03_FACTS);
      const badResponse = JSON.stringify({
        schema_version: '1.1',
        charge: '6-1',
        status: 'GREEN',
        red_blockers: [],
        yellow_warnings: [],
        cleaned_facts: evaluation.cleaned_facts,
        narrative: 'Single-paragraph narrative text for testing purposes only.',
        flagged_sections: [],
        ai_disclosure: AI_DISCLOSURE,
        officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
      });
      const client = makeMockClient(badResponse);
      try {
        await generate6_1(TC03_FACTS, client);
        notes.push('Expected Generate6_1Error — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof Generate6_1Error)) {
          notes.push(`Expected Generate6_1Error, got: ${err}`); pass = false;
        } else if (!err.message.includes('status mismatch')) {
          notes.push(`Expected "status mismatch" in message, got: "${err.message}"`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H07',
    name: 'RED case (missing DC number) — client never called, narrative is null, status is RED',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const tracker = { calls: 0 };
      const client = makeMockClient('should never be called', tracker);
      try {
        const result = await generate6_1(TC02_FACTS, client);
        if (result.status !== 'RED') {
          notes.push(`Expected status RED, got ${result.status}`); pass = false;
        }
        if (result.narrative !== null) {
          notes.push('narrative must be null for RED'); pass = false;
        }
        if (result.red_blockers.length === 0) {
          notes.push('Expected at least one red_blocker for RED status'); pass = false;
        }
        if (tracker.calls !== 0) {
          notes.push(`client.completeJson must not be called for RED — got ${tracker.calls} call(s)`); pass = false;
        }
      } catch (err) {
        notes.push(`Unexpected error: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H08',
    name: 'mock returns valid GREEN JSON wrapped in ```json fence — generate6_1 succeeds (fence stripped)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const fencedResponse = '```json\n' + buildValidGreenJson(TC01_FACTS) + '\n```';
      const client = makeMockClient(fencedResponse);
      try {
        const result = await generate6_1(TC01_FACTS, client);
        if (result.status !== 'GREEN') {
          notes.push(`Expected GREEN after fence stripping, got ${result.status}`); pass = false;
        }
      } catch (err) {
        notes.push(`Unexpected error — fence stripping should have succeeded: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H09',
    name: 'mock returns prose before JSON — generate6_1 throws Generate6_1Error (parse failed)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const proseResponse = 'Here is the JSON you requested:\n' + buildValidGreenJson(TC01_FACTS);
      const client = makeMockClient(proseResponse);
      try {
        await generate6_1(TC01_FACTS, client);
        notes.push('Expected Generate6_1Error — no error was thrown'); pass = false;
      } catch (err) {
        if (!(err instanceof Generate6_1Error)) {
          notes.push(`Expected Generate6_1Error, got: ${err}`); pass = false;
        } else if (!err.message.includes('parse failed')) {
          notes.push(`Expected "parse failed" in message, got: "${err.message}"`); pass = false;
        }
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TC_H10',
    name: 'mock GREEN narrative has a stray blank-line break — generate6_1 repairs it instead of rejecting',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(TC01_FACTS);
      const noisyResponse = JSON.stringify({
        schema_version: '1.1',
        charge: '6-1',
        status: 'GREEN',
        red_blockers: [],
        yellow_warnings: [],
        cleaned_facts: evaluation.cleaned_facts,
        // Otherwise-valid single-paragraph content with formatting noise: a stray blank line
        // and a trailing CRLF, simulating what a live model can introduce without the content
        // actually reverting to a multi-paragraph structure.
        narrative:
          'On the reported date, I, the reporting officer, was assigned to the reported area.\n\n' +
          'Inmate Smith then crossed his arms and remained positioned at the cell door.\r\n',
        flagged_sections: [],
        ai_disclosure: AI_DISCLOSURE,
        officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
      });
      const client = makeMockClient(noisyResponse);
      try {
        const result = await generate6_1(TC01_FACTS, client);
        if (result.status !== 'GREEN') {
          notes.push(`Expected GREEN, got ${result.status}`); pass = false;
        }
        if (!result.narrative || /\n\n/.test(result.narrative)) {
          notes.push(`Expected repaired narrative with no blank-line break, got: "${result.narrative}"`); pass = false;
        }
        if (!result.narrative?.includes('was assigned to the reported area. Inmate Smith')) {
          notes.push('Expected the blank-line break to be collapsed into a single space, not dropped'); pass = false;
        }
      } catch (err) {
        notes.push(`Unexpected error — formatting noise should have been repaired, not rejected: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

console.log('');
console.log('='.repeat(72));
console.log('  LOCKUPHQ DR Writer — Charge 6-1 Generate Pipeline Mock Tests');
console.log('  Step 4B — Mock Claude client only. No real API calls.');
console.log('='.repeat(72));
console.log('');

let passed = 0;
let failed = 0;

for (const ht of hTests) {
  const { pass, notes } = await ht.check();
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${ht.test_id} — ${ht.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? passed++ : failed++;
}

console.log('='.repeat(72));
console.log(`  Step 4B Results: ${passed} passed / ${failed} failed / ${hTests.length} total`);
console.log('='.repeat(72));
console.log('');

if (failed > 0) {
  process.exit(1);
}
