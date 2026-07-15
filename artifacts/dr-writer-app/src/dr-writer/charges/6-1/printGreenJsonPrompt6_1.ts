// LOCKUPHQ DR Writer — Charge 6-1 GREEN JSON Prompt Printer
//
// Prints and saves the GREEN json_schema system prompt and user prompt
// for TC01 (clean GREEN test case). No API call is made.
//
// Output files:
//   prompt-output/6-1-green-json-system-prompt.txt
//   prompt-output/6-1-green-json-user-prompt.txt
//
// Usage:
//   node --experimental-strip-types src/dr-writer/charges/6-1/printGreenJsonPrompt6_1.ts

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate6_1 } from './evaluate6_1.ts';
import { buildPrompt6_1 } from './buildPrompt6_1.ts';
import type { IntakeFacts6_1 } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesPath = join(__dirname, '../../../../kb/charges/6-1/test_cases.json');
const testCasesJson = JSON.parse(readFileSync(testCasesPath, 'utf-8'));

const tc01: IntakeFacts6_1 = testCasesJson.test_cases[0].input_facts;

const evaluation = evaluate6_1(tc01);

if (evaluation.status !== 'GREEN') {
  console.error(`ERROR: TC01 evaluated to ${evaluation.status} — expected GREEN.`);
  console.error('Red blockers:', evaluation.red_blockers.map(b => b.id).join(', '));
  process.exit(1);
}

const promptResult = buildPrompt6_1(evaluation, { outputMode: 'json_schema' });

if (!promptResult.parts) {
  console.error('ERROR: buildPrompt6_1 returned null parts for GREEN status.');
  process.exit(1);
}

const { systemPrompt, userPrompt } = promptResult.parts;

// Write to prompt-output/
const outputDir = join(__dirname, '../../../../prompt-output');
mkdirSync(outputDir, { recursive: true });

const systemFile = join(outputDir, '6-1-green-json-system-prompt.txt');
const userFile   = join(outputDir, '6-1-green-json-user-prompt.txt');

writeFileSync(systemFile, systemPrompt, 'utf-8');
writeFileSync(userFile, userPrompt, 'utf-8');

// Print to terminal
const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

console.log('');
console.log(DIVIDER);
console.log('  LOCKUPHQ DR Writer — Charge 6-1 GREEN JSON Prompt');
console.log('  TC01 — Clean GREEN | Mode: json_schema');
console.log('  No API call made by this script.');
console.log(DIVIDER);

console.log('');
console.log(SECTION);
console.log('  GREEN JSON SYSTEM PROMPT');
console.log(SECTION);
console.log('');
console.log(systemPrompt);

console.log('');
console.log(SECTION);
console.log('  GREEN JSON USER PROMPT');
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
