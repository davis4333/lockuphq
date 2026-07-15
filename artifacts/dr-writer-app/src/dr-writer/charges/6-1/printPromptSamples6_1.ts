// LOCKUPHQ DR Writer — Charge 6-1 Prompt Sample Printer
//
// Prints Claude-ready prompts for manual review and copy/paste testing.
// Does NOT call the Claude API. Does NOT produce a narrative.
//
// Cases printed:
//   TC01 — Clean GREEN
//   TC03 — Quote is a summary (YELLOW)
//   TC02 — Missing DC number (RED — no prompt in either mode)
//
// Usage:
//   node --experimental-strip-types src/dr-writer/charges/6-1/printPromptSamples6_1.ts
//     → prints both narrative_only and json_schema modes
//
//   node --experimental-strip-types src/dr-writer/charges/6-1/printPromptSamples6_1.ts --json
//     → prints json_schema mode only

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate6_1 } from './evaluate6_1.ts';
import { buildPrompt6_1 } from './buildPrompt6_1.ts';
import type { IntakeFacts6_1 } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testCasesPath = join(__dirname, '../../../../kb/charges/6-1/test_cases.json');
const testCasesJson = JSON.parse(readFileSync(testCasesPath, 'utf-8'));

interface TestCase {
  test_id: string;
  name: string;
  input_facts: IntakeFacts6_1;
}

const allCases: TestCase[] = testCasesJson.test_cases;

// TC01 = index 0 (GREEN), TC02 = index 1 (RED), TC03 = index 2 (YELLOW)
const selected = [
  { label: 'Sample 1 — GREEN', tc: allCases[0] },
  { label: 'Sample 2 — YELLOW', tc: allCases[2] },
  { label: 'Sample 3 — RED', tc: allCases[1] },
];

const args = process.argv.slice(2);
const jsonOnly = args.includes('--json');

const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

console.log('');
console.log(DIVIDER);
console.log('  LOCKUPHQ DR Writer — Charge 6-1 Prompt Samples');
if (jsonOnly) {
  console.log('  Mode: json_schema only (--json)');
} else {
  console.log('  Mode: narrative_only + json_schema');
}
console.log('  Manual review only. No API call is made by this script.');
console.log(DIVIDER);

for (const { label, tc } of selected) {
  const evaluation = evaluate6_1(tc.input_facts);

  console.log('');
  console.log(DIVIDER);
  console.log(`  ${label}`);
  console.log(`  Test ID : ${tc.test_id}`);
  console.log(`  Name    : ${tc.name}`);
  console.log(`  Status  : ${evaluation.status}`);
  console.log(DIVIDER);

  if (evaluation.status === 'RED') {
    const narrResult = buildPrompt6_1(evaluation, { outputMode: 'narrative_only' });
    const jsonResult = buildPrompt6_1(evaluation, { outputMode: 'json_schema' });

    console.log('');
    console.log('  RED BLOCKERS:');
    for (const blocker of evaluation.red_blockers) {
      console.log('');
      console.log(`  [${blocker.id}]`);
      console.log(`  Missing : ${blocker.missing_fact}`);
      console.log(`  Ask     : ${blocker.follow_up_question}`);
    }
    console.log('');
    console.log(SECTION);
    console.log('');

    const narrativeNull = narrResult.prompt === null && narrResult.parts === null;
    const jsonNull      = jsonResult.prompt === null && jsonResult.parts === null;

    if (narrativeNull && jsonNull) {
      console.log('  CONFIRMATION: No generation prompt produced under RED status in either mode. ✓');
      console.log('  Do not send any prompt to Claude until all RED blockers are resolved.');
    } else {
      if (!narrativeNull) console.log('  WARNING: narrative_only unexpectedly returned a non-null prompt for RED.');
      if (!jsonNull)      console.log('  WARNING: json_schema unexpectedly returned a non-null prompt for RED.');
    }
    console.log('');
    continue;
  }

  // GREEN or YELLOW — print mode(s)
  const modes: Array<'narrative_only' | 'json_schema'> = jsonOnly
    ? ['json_schema']
    : ['narrative_only', 'json_schema'];

  for (const outputMode of modes) {
    const promptResult = buildPrompt6_1(evaluation, { outputMode });
    const parts = promptResult.parts!;
    const modeLabel = outputMode === 'narrative_only' ? 'NARRATIVE ONLY' : 'JSON SCHEMA';

    console.log('');
    console.log(SECTION);
    console.log(`  Output Mode: ${modeLabel}`);
    console.log(SECTION);

    console.log('');
    console.log('  ── SYSTEM PROMPT ──────────────────────────────────────────────────');
    console.log('  (Send as the "system" role in the Claude API messages array.)');
    console.log('');
    console.log(parts.systemPrompt);

    console.log('');
    console.log('  ── USER PROMPT ────────────────────────────────────────────────────');
    console.log('  (Send as the "user" role in the Claude API messages array.)');
    console.log('');
    console.log(parts.userPrompt);
    console.log('');
  }
}

console.log(DIVIDER);
if (jsonOnly) {
  console.log('  End of json_schema prompt samples. Copy/paste into Claude to test JSON output.');
} else {
  console.log('  End of prompt samples. Copy/paste into Claude to review output quality.');
}
console.log(DIVIDER);
console.log('');
