// LOCKUPHQ DR Writer — Charge 6-1 Live Claude GREEN Integration Test
//
// Runs TC01 (clean GREEN) through the full generate6_1 pipeline using the
// real Claude API. This is NOT part of the normal test suite.
//
// Requires: ANTHROPIC_API_KEY set in environment.
// Uses ONLY TC01 fake/sample data — no real inmate or officer information.
//
// Run:
//   $env:ANTHROPIC_API_KEY = "your-key-here"   (PowerShell)
//   npm run test:6-1:live-green
//
// To see raw Claude response:
//   $env:DEBUG_CLAUDE_RAW = "true"

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generate6_1, Generate6_1Error } from './generate6_1.ts';
import { createClaudeClient, ClaudeClientError, DEFAULT_CLAUDE_MODEL } from '../../llm/claudeClient.ts';
import type { IntakeFacts6_1 } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesPath = join(__dirname, '../../../../kb/charges/6-1/test_cases.json');
const testCasesJson = JSON.parse(readFileSync(testCasesPath, 'utf-8'));

const TC01_FACTS: IntakeFacts6_1 = testCasesJson.test_cases[0].input_facts;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckResult = { label: string; pass: boolean; note?: string };

function check(label: string, pass: boolean, note?: string): CheckResult {
  return { label, pass, note };
}

function countParagraphs(narrative: string): number {
  return narrative.split(/\n\n+/).filter(p => p.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// Main — wraps all async work so process.exitCode + return can be used cleanly
// ---------------------------------------------------------------------------

const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('');
    console.error('  ERROR: ANTHROPIC_API_KEY is not set.');
    console.error('');
    console.error('  Set it in PowerShell before running this script:');
    console.error('    $env:ANTHROPIC_API_KEY = "your-key-here"');
    console.error('');
    console.error('  Optionally set the model:');
    console.error(`    $env:CLAUDE_MODEL = "${DEFAULT_CLAUDE_MODEL}"`);
    console.error('');
    console.error('  Then run:');
    console.error('    npm run test:6-1:live-green');
    console.error('');
    process.exitCode = 1;
    return;
  }

  const model = process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;

  console.log('');
  console.log(DIVIDER);
  console.log('  LOCKUPHQ DR Writer — Charge 6-1 Live Claude GREEN Test');
  console.log('  TC01 — Clean GREEN | Real API call | Sample data only');
  console.log(`  Model: ${model}`);
  console.log(DIVIDER);
  console.log('');

  const client = createClaudeClient();

  let output;
  const startMs = Date.now();
  try {
    output = await generate6_1(TC01_FACTS, client);
  } catch (err) {
    console.log(SECTION);
    console.log('  FATAL ERROR');
    console.log(SECTION);
    if (err instanceof Generate6_1Error || err instanceof ClaudeClientError) {
      console.log(`  ${err.name}: ${err.message}`);
    } else {
      console.log(`  Unexpected error: ${err}`);
    }
    console.log('');
    console.log('  Overall: FAIL');
    console.log(DIVIDER);
    console.log('');
    process.exitCode = 1;
    return;
  }
  const elapsedMs = Date.now() - startMs;

  // Raw response debug (opt-in only)
  if (process.env.DEBUG_CLAUDE_RAW === 'true') {
    console.log(SECTION);
    console.log('  DEBUG: RAW NARRATIVE (DEBUG_CLAUDE_RAW=true)');
    console.log(SECTION);
    console.log('');
    console.log(output.narrative);
    console.log('');
  }

  // ---------------------------------------------------------------------------
  // Validate output
  // ---------------------------------------------------------------------------

  const narrative = output.narrative ?? '';
  const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;

  const checks: CheckResult[] = [
    check('status === "GREEN"', output.status === 'GREEN', output.status !== 'GREEN' ? `got "${output.status}"` : undefined),
    check('charge === "6-1"', output.charge === '6-1', output.charge !== '6-1' ? `got "${output.charge}"` : undefined),
    check('schema_version === "1.1"', output.schema_version === '1.1'),
    check('red_blockers is []', output.red_blockers.length === 0, output.red_blockers.length > 0 ? `${output.red_blockers.length} blocker(s)` : undefined),
    check('yellow_warnings is []', output.yellow_warnings.length === 0, output.yellow_warnings.length > 0 ? `${output.yellow_warnings.length} warning(s)` : undefined),
    check('flagged_sections is []', output.flagged_sections.length === 0),
    check('narrative exists', narrative.trim().length > 0),
    check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
    check('narrative does NOT include "[REVIEW"', !narrative.includes('[REVIEW')),
    check('narrative includes "as the housing officer"', narrative.includes('as the housing officer')),
    check('narrative includes "two additional times"', narrative.includes('two additional times')),
    check('narrative includes "three verbal orders"', narrative.includes('three verbal orders')),
    check('narrative includes inmate quote (No, I ain\'t doing that.)', narrative.includes("No, I ain") && narrative.includes("doing that.")),
  ];

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log(SECTION);
  console.log('  CHECKS');
  console.log(SECTION);
  console.log('');

  for (const c of checks) {
    const icon = c.pass ? 'PASS' : 'FAIL';
    const note = c.note ? ` — ${c.note}` : '';
    console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
  }

  const allPassed = checks.every(c => c.pass);

  console.log('');
  console.log(SECTION);
  console.log('  SUMMARY');
  console.log(SECTION);
  console.log('');
  console.log(`  Model:    ${model}`);
  console.log(`  Elapsed:  ${elapsedMs}ms`);

  if (output.ai_disclosure) {
    console.log('  AI disclosure present: yes');
  }
  console.log(`  Checks:   ${checks.filter(c => c.pass).length}/${checks.length} passed`);
  console.log('');
  console.log(`  Overall:  ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log(DIVIDER);
  console.log('');

  if (!allPassed) {
    process.exitCode = 1;
  }
}

await main();
