// LOCKUPHQ DR Writer — Charge 6-1 YELLOW JSON Prompt Printer
//
// Prints and saves the YELLOW json_schema system prompt and user prompt
// for TC03 (quote-summary YELLOW test case). No API call is made.
//
// Output files:
//   prompt-output/6-1-yellow-json-system-prompt.txt
//   prompt-output/6-1-yellow-json-user-prompt.txt
//
// Usage:
//   node --experimental-strip-types src/dr-writer/charges/6-1/printYellowJsonPrompt6_1.ts

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate6_1 } from './evaluate6_1.ts';
import { buildPrompt6_1 } from './buildPrompt6_1.ts';
import type { IntakeFacts6_1 } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesPath = join(__dirname, '../../../../kb/charges/6-1/test_cases.json');
const testCasesJson = JSON.parse(readFileSync(testCasesPath, 'utf-8'));

// TC03 is index 2 (TC01=0, TC02=1, TC03=2)
const tc03: IntakeFacts6_1 = testCasesJson.test_cases[2].input_facts;

const evaluation = evaluate6_1(tc03);

if (evaluation.status !== 'YELLOW') {
  console.error(`ERROR: TC03 evaluated to ${evaluation.status} — expected YELLOW.`);
  if (evaluation.red_blockers.length > 0) {
    console.error('Red blockers:', evaluation.red_blockers.map(b => b.id).join(', '));
  }
  process.exit(1);
}

const promptResult = buildPrompt6_1(evaluation, { outputMode: 'json_schema' });

if (!promptResult.parts) {
  console.error('ERROR: buildPrompt6_1 returned null parts for YELLOW status.');
  process.exit(1);
}

const { systemPrompt, userPrompt } = promptResult.parts;

// Write to prompt-output/
const outputDir = join(__dirname, '../../../../prompt-output');
mkdirSync(outputDir, { recursive: true });

const systemFile = join(outputDir, '6-1-yellow-json-system-prompt.txt');
const userFile   = join(outputDir, '6-1-yellow-json-user-prompt.txt');

writeFileSync(systemFile, systemPrompt, 'utf-8');
writeFileSync(userFile, userPrompt, 'utf-8');

// Print to terminal
const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

console.log('');
console.log(DIVIDER);
console.log('  LOCKUPHQ DR Writer — Charge 6-1 YELLOW JSON Prompt');
console.log('  TC03 — Quote is a summary (YELLOW) | Mode: json_schema');
console.log(`  Yellow warnings: ${evaluation.yellow_warnings.map(w => w.id).join(', ')}`);
console.log('  No API call made by this script.');
console.log(DIVIDER);

console.log('');
console.log(SECTION);
console.log('  YELLOW JSON SYSTEM PROMPT');
console.log(SECTION);
console.log('');
console.log(systemPrompt);

console.log('');
console.log(SECTION);
console.log('  YELLOW JSON USER PROMPT');
console.log(SECTION);
console.log('');
console.log(userPrompt);

console.log('');
console.log(DIVIDER);
console.log('  Files written:');
console.log(`  ${systemFile}`);
console.log(`  ${userFile}`);
console.log(DIVIDER);
console.log('');
