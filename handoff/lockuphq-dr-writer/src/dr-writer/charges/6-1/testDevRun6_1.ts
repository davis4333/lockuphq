// LOCKUPHQ DR Writer — Charge 6-1 Dev Runner Tests
// Step 4G: Tests parseDevArgs, isAllowedLiveInput, makeMockDevClient, and executeDevRun.
// No real API calls are made. All paths use fake/sample data.
//
// Usage: node --experimental-strip-types src/dr-writer/charges/6-1/testDevRun6_1.ts

import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseDevArgs,
  isAllowedLiveInput,
  makeMockDevClient,
  executeDevRun,
} from './devRun6_1.ts';
import { evaluate6_1 } from './evaluate6_1.ts';
import { generate6_1 } from './generate6_1.ts';
import type { IntakeFacts6_1 } from './types.ts';

// ---------------------------------------------------------------------------
// Load fake intake files
// ---------------------------------------------------------------------------

const GREEN_INPUT_PATH = 'dev-inputs/6-1/fake-green-direct-refusal.json';
const YELLOW_INPUT_PATH = 'dev-inputs/6-1/fake-yellow-quote-summary.json';
const RED_INPUT_PATH = 'dev-inputs/6-1/fake-red-missing-dc.json';
const TEST_OUT_PATH = 'dev-output/6-1/test-dev-runner-output.json';

function loadFakeIntake(relativePath: string): IntakeFacts6_1 {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf-8')) as IntakeFacts6_1;
}

const GREEN_INTAKE = loadFakeIntake(GREEN_INPUT_PATH);
const YELLOW_INTAKE = loadFakeIntake(YELLOW_INPUT_PATH);
const RED_INTAKE = loadFakeIntake(RED_INPUT_PATH);

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

interface DevTest {
  test_id: string;
  name: string;
  check: () => Promise<{ pass: boolean; notes: string[] }>;
}

const tests: DevTest[] = [
  // ─── Arg parsing ─────────────────────────────────────────────────────────

  {
    test_id: 'TD01',
    name: 'parseDevArgs: --input only → mode defaults to mock, all flags default false',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'dev-inputs/6-1/fake-green-direct-refusal.json']);
      if (!r.ok) { notes.push(`Expected ok, got error: ${(r as { ok: false; error: string }).error}`); pass = false; return { pass, notes }; }
      if (r.args.mode !== 'mock') { notes.push(`Expected mode "mock", got "${r.args.mode}"`); pass = false; }
      if (r.args.printNarrative !== false) { notes.push('printNarrative should be false by default'); pass = false; }
      if (r.args.printJson !== false) { notes.push('printJson should be false by default'); pass = false; }
      if (r.args.confirmLive !== false) { notes.push('confirmLive should be false by default'); pass = false; }
      if (r.args.out !== null) { notes.push('out should be null by default'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD02',
    name: 'parseDevArgs: missing --input → ok: false, error message',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--mode', 'mock']);
      if (r.ok) { notes.push('Expected ok: false, got ok: true'); pass = false; return { pass, notes }; }
      if (!r.error.includes('--input')) { notes.push(`Expected "--input" in error, got: "${r.error}"`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD03',
    name: 'parseDevArgs: --mode live → mode is live',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'x.json', '--mode', 'live']);
      if (!r.ok) { notes.push(`Expected ok, got: ${(r as { ok: false; error: string }).error}`); pass = false; return { pass, notes }; }
      if (r.args.mode !== 'live') { notes.push(`Expected "live", got "${r.args.mode}"`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD04',
    name: 'parseDevArgs: --mode invalid → ok: false',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'x.json', '--mode', 'production']);
      if (r.ok) { notes.push('Expected ok: false for invalid mode'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD05',
    name: 'parseDevArgs: --print-narrative sets printNarrative: true',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'x.json', '--print-narrative']);
      if (!r.ok) { notes.push('Expected ok: true'); pass = false; return { pass, notes }; }
      if (!r.args.printNarrative) { notes.push('Expected printNarrative: true'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD06',
    name: 'parseDevArgs: --out sets out path',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'x.json', '--out', 'dev-output/out.json']);
      if (!r.ok) { notes.push('Expected ok: true'); pass = false; return { pass, notes }; }
      if (r.args.out !== 'dev-output/out.json') { notes.push(`Expected out "dev-output/out.json", got "${r.args.out}"`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD20',
    name: 'parseDevArgs: --print-json sets printJson: true',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'x.json', '--print-json']);
      if (!r.ok) { notes.push('Expected ok: true'); pass = false; return { pass, notes }; }
      if (!r.args.printJson) { notes.push('Expected printJson: true'); pass = false; }
      if (r.args.printNarrative) { notes.push('printNarrative should still be false'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD21',
    name: 'parseDevArgs: --confirm-live sets confirmLive: true',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const r = parseDevArgs(['--input', 'x.json', '--mode', 'live', '--confirm-live']);
      if (!r.ok) { notes.push('Expected ok: true'); pass = false; return { pass, notes }; }
      if (!r.args.confirmLive) { notes.push('Expected confirmLive: true'); pass = false; }
      if (r.args.mode !== 'live') { notes.push('Expected mode live'); pass = false; }
      return { pass, notes };
    },
  },

  // ─── Path security ────────────────────────────────────────────────────────

  {
    test_id: 'TD07',
    name: 'isAllowedLiveInput: dev-inputs/6-1/fake-green-direct-refusal.json → allowed',
    async check() {
      const notes: string[] = [];
      let pass = true;
      if (!isAllowedLiveInput('dev-inputs/6-1/fake-green-direct-refusal.json')) {
        notes.push('Expected allowed for dev-inputs/6-1/ path'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD08',
    name: 'isAllowedLiveInput: /etc/passwd → blocked',
    async check() {
      const notes: string[] = [];
      let pass = true;
      if (isAllowedLiveInput('/etc/passwd')) {
        notes.push('Expected blocked for /etc/passwd'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD09',
    name: 'isAllowedLiveInput: ../../../etc/passwd → blocked',
    async check() {
      const notes: string[] = [];
      let pass = true;
      if (isAllowedLiveInput('../../../etc/passwd')) {
        notes.push('Expected blocked for path traversal'); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD10',
    name: 'isAllowedLiveInput: dev-inputs/6-2/some-file.json → blocked (wrong charge dir)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      if (isAllowedLiveInput('dev-inputs/6-2/some-file.json')) {
        notes.push('Expected blocked for dev-inputs/6-2/ (different charge directory)'); pass = false;
      }
      return { pass, notes };
    },
  },

  // ─── Mock client + generate6_1 pipeline ──────────────────────────────────

  {
    test_id: 'TD11',
    name: 'mock GREEN intake → generate6_1 returns status GREEN, client called once',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(GREEN_INTAKE);
      if (evaluation.status !== 'GREEN') {
        notes.push(`Expected GREEN evaluation for fake-green intake, got ${evaluation.status}`); pass = false; return { pass, notes };
      }
      const { client, getCallCount } = makeMockDevClient(evaluation);
      const output = await generate6_1(GREEN_INTAKE, client);
      if (output.status !== 'GREEN') { notes.push(`Expected status GREEN, got ${output.status}`); pass = false; }
      if (output.narrative === null) { notes.push('narrative should not be null'); pass = false; }
      if (output.red_blockers.length !== 0) { notes.push(`Expected empty red_blockers, got ${output.red_blockers.length}`); pass = false; }
      if (getCallCount() !== 1) { notes.push(`Expected 1 client call, got ${getCallCount()}`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD12',
    name: 'mock YELLOW intake → generate6_1 returns status YELLOW, client called once',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(YELLOW_INTAKE);
      if (evaluation.status !== 'YELLOW') {
        notes.push(`Expected YELLOW evaluation for fake-yellow intake, got ${evaluation.status}`); pass = false; return { pass, notes };
      }
      const { client, getCallCount } = makeMockDevClient(evaluation);
      const output = await generate6_1(YELLOW_INTAKE, client);
      if (output.status !== 'YELLOW') { notes.push(`Expected status YELLOW, got ${output.status}`); pass = false; }
      if (output.yellow_warnings.length === 0) { notes.push('Expected at least one yellow_warning'); pass = false; }
      if (output.flagged_sections.length === 0) { notes.push(`Expected non-empty flagged_sections, got [${output.flagged_sections.join(', ')}]`); pass = false; }
      if (getCallCount() !== 1) { notes.push(`Expected 1 client call, got ${getCallCount()}`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD13',
    name: 'mock RED intake → generate6_1 returns status RED, client called zero times',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const evaluation = evaluate6_1(RED_INTAKE);
      if (evaluation.status !== 'RED') {
        notes.push(`Expected RED evaluation for fake-red intake, got ${evaluation.status}`); pass = false; return { pass, notes };
      }
      const { client, getCallCount } = makeMockDevClient(evaluation);
      const output = await generate6_1(RED_INTAKE, client);
      if (output.status !== 'RED') { notes.push(`Expected status RED, got ${output.status}`); pass = false; }
      if (output.narrative !== null) { notes.push('narrative must be null for RED'); pass = false; }
      if (output.red_blockers.length === 0) { notes.push('Expected at least one red_blocker'); pass = false; }
      if (getCallCount() !== 0) { notes.push(`Expected 0 client calls for RED, got ${getCallCount()}`); pass = false; }
      return { pass, notes };
    },
  },

  // ─── executeDevRun ────────────────────────────────────────────────────────

  {
    test_id: 'TD14',
    name: 'executeDevRun: mock GREEN → output.status GREEN, no error',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const result = await executeDevRun({
        input: GREEN_INPUT_PATH, mode: 'mock', out: null,
        printNarrative: false, printJson: false, confirmLive: false,
      });
      if (result.error) { notes.push(`Unexpected error: ${result.error}`); pass = false; }
      if (result.output?.status !== 'GREEN') { notes.push(`Expected GREEN, got ${result.output?.status}`); pass = false; }
      if (result.claudeCalls !== 1) { notes.push(`Expected 1 Claude call, got ${result.claudeCalls}`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD15',
    name: 'executeDevRun: mock YELLOW → output.status YELLOW, flagged_sections non-empty',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const result = await executeDevRun({
        input: YELLOW_INPUT_PATH, mode: 'mock', out: null,
        printNarrative: false, printJson: false, confirmLive: false,
      });
      if (result.error) { notes.push(`Unexpected error: ${result.error}`); pass = false; }
      if (result.output?.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${result.output?.status}`); pass = false; }
      if (!result.output || result.output.flagged_sections.length === 0) {
        notes.push(`Expected non-empty flagged_sections, got [${result.output?.flagged_sections.join(', ')}]`); pass = false;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD16',
    name: 'executeDevRun: mock RED → output.status RED, 0 Claude calls',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const result = await executeDevRun({
        input: RED_INPUT_PATH, mode: 'mock', out: null,
        printNarrative: false, printJson: false, confirmLive: false,
      });
      if (result.error) { notes.push(`Unexpected error: ${result.error}`); pass = false; }
      if (result.output?.status !== 'RED') { notes.push(`Expected RED, got ${result.output?.status}`); pass = false; }
      if (result.output?.narrative !== null) { notes.push('narrative must be null for RED'); pass = false; }
      if (result.claudeCalls !== 0) { notes.push(`Expected 0 Claude calls for RED, got ${result.claudeCalls}`); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD17',
    name: 'executeDevRun: live mode blocked for path outside dev-inputs/6-1/',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const prev = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key-for-path-check';
      try {
        const result = await executeDevRun({
          input: '/etc/passwd', mode: 'live', out: null,
          printNarrative: false, printJson: false, confirmLive: true,
        });
        if (!result.error) { notes.push('Expected error for path outside dev-inputs/6-1/'); pass = false; }
        else if (!result.error.includes('dev-inputs/6-1')) {
          notes.push(`Expected path error, got: "${result.error}"`); pass = false;
        }
      } finally {
        if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = prev;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD18',
    name: 'executeDevRun: --out writes valid JSON output file',
    async check() {
      const notes: string[] = [];
      let pass = true;

      const outAbsPath = resolve(process.cwd(), TEST_OUT_PATH);
      if (existsSync(outAbsPath)) {
        try { unlinkSync(outAbsPath); } catch { /* ignore */ }
      }

      const result = await executeDevRun({
        input: GREEN_INPUT_PATH,
        mode: 'mock',
        out: TEST_OUT_PATH,
        printNarrative: false,
        printJson: false,
        confirmLive: false,
      });

      if (result.error) { notes.push(`Unexpected error: ${result.error}`); pass = false; return { pass, notes }; }
      if (!result.outFileWritten) { notes.push('Expected outFileWritten: true'); pass = false; }
      if (!existsSync(outAbsPath)) { notes.push(`Output file not found at ${TEST_OUT_PATH}`); pass = false; return { pass, notes }; }

      try {
        const written = JSON.parse(readFileSync(outAbsPath, 'utf-8'));
        if (written.status !== 'GREEN') { notes.push(`Written JSON status should be GREEN, got ${written.status}`); pass = false; }
        if (written.charge !== '6-1') { notes.push('Written JSON charge should be "6-1"'); pass = false; }
        if (written.schema_version !== '1.1') { notes.push('Written JSON schema_version should be "1.1"'); pass = false; }
        if (typeof written.narrative !== 'string') { notes.push('Written JSON narrative should be a string'); pass = false; }
      } catch (err) {
        notes.push(`Written file is not valid JSON: ${err}`); pass = false;
      }

      return { pass, notes };
    },
  },
  {
    test_id: 'TD19',
    name: 'executeDevRun: missing input file → error, no crash',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const result = await executeDevRun({
        input: 'dev-inputs/6-1/does-not-exist.json',
        mode: 'mock',
        out: null,
        printNarrative: false,
        printJson: false,
        confirmLive: false,
      });
      if (!result.error) { notes.push('Expected error for missing input file'); pass = false; }
      if (result.output !== null) { notes.push('output should be null on file read error'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD22',
    name: 'executeDevRun: live mode without --confirm-live → fails cleanly, 0 Claude calls',
    async check() {
      const notes: string[] = [];
      let pass = true;
      // Do not set API key — confirmLive check must fire before key check
      const result = await executeDevRun({
        input: GREEN_INPUT_PATH, mode: 'live', out: null,
        printNarrative: false, printJson: false, confirmLive: false,
      });
      if (!result.error) { notes.push('Expected error when confirmLive is false'); pass = false; }
      if (result.error && !result.error.includes('--confirm-live')) {
        notes.push(`Expected "--confirm-live" in error, got: "${result.error}"`); pass = false;
      }
      if (result.claudeCalls !== 0) { notes.push(`Expected 0 Claude calls, got ${result.claudeCalls}`); pass = false; }
      if (result.output !== null) { notes.push('output must be null when confirmLive guard fires'); pass = false; }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD23',
    name: 'executeDevRun: live mode + RED input + confirmLive: true → 0 Claude calls, RED status',
    async check() {
      // RED short-circuits in generate6_1 before any client.completeJson() call.
      // With a fake API key and the real live client, no network call is made.
      const notes: string[] = [];
      let pass = true;
      const prev = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key-red-short-circuit';
      try {
        const result = await executeDevRun({
          input: RED_INPUT_PATH, mode: 'live', out: null,
          printNarrative: false, printJson: false, confirmLive: true,
        });
        if (result.error) { notes.push(`Unexpected error: ${result.error}`); pass = false; return { pass, notes }; }
        if (result.output?.status !== 'RED') { notes.push(`Expected RED, got ${result.output?.status}`); pass = false; }
        if (result.output?.narrative !== null) { notes.push('narrative must be null for RED'); pass = false; }
        if (result.claudeCalls !== 0) { notes.push(`Expected 0 Claude calls for RED, got ${result.claudeCalls}`); pass = false; }
      } finally {
        if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = prev;
      }
      return { pass, notes };
    },
  },
  {
    test_id: 'TD24',
    name: 'error messages do not leak ANTHROPIC_API_KEY value',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const SENTINEL = 'sentinel-key-must-not-appear-in-output-8675309';
      const prev = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = SENTINEL;
      try {
        // Trigger a live path error (confirmLive: true but bad path)
        const pathResult = await executeDevRun({
          input: '/etc/passwd', mode: 'live', out: null,
          printNarrative: false, printJson: false, confirmLive: true,
        });
        if (pathResult.error?.includes(SENTINEL)) {
          notes.push('SECURITY: API key value appeared in path error message'); pass = false;
        }

        // Trigger a confirmLive error (live without confirmLive)
        const noConfirmResult = await executeDevRun({
          input: GREEN_INPUT_PATH, mode: 'live', out: null,
          printNarrative: false, printJson: false, confirmLive: false,
        });
        if (noConfirmResult.error?.includes(SENTINEL)) {
          notes.push('SECURITY: API key value appeared in confirmLive error message'); pass = false;
        }
      } finally {
        if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = prev;
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
console.log('  LOCKUPHQ DR Writer — Charge 6-1 Dev Runner Tests');
console.log('  Step 4G — Mock mode only. No real API calls.');
console.log('='.repeat(72));
console.log('');

let passed = 0;
let failed = 0;

for (const t of tests) {
  const { pass, notes } = await t.check();
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${t.test_id} — ${t.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? passed++ : failed++;
}

console.log('='.repeat(72));
console.log(`  Step 4G Results: ${passed} passed / ${failed} failed / ${tests.length} total`);
console.log('='.repeat(72));
console.log('');

if (failed > 0) {
  process.exitCode = 1;
}
