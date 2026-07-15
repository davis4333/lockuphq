// LOCKUPHQ DR Writer — Section 14 test runner (blueprint §18 Phase 3).
// Runs all 25 state-machine acceptance tests from blueprint §14.
// Usage: node --experimental-strip-types src/dr-writer/engine/tests/runSection14.ts

import { runTests } from './harness.ts';
import { part1 } from './section14.part1.ts';
import { part2 } from './section14.part2.ts';
import { part3 } from './section14.part3.ts';

const ALL_TESTS = [...part1, ...part2, ...part3];

// Guard: exactly the 25 blueprint tests, ids 1..25, none skipped.
const ids = ALL_TESTS.map((t) => t.id).sort((a, b) => a - b);
const expected = Array.from({ length: 25 }, (_, i) => i + 1);
if (ids.length !== 25 || ids.some((id, i) => id !== expected[i])) {
  console.error(`FATAL: test registry does not cover exactly tests 1-25 (found: ${ids.join(', ')})`);
  process.exit(1);
}

console.log('LOCKUPHQ DR Writer — Blueprint v2.5 Section 14 acceptance tests');
console.log('================================================================\n');

const outcomes = runTests(ALL_TESTS);
let passed = 0;
let totalChecks = 0;

for (const o of outcomes) {
  totalChecks += o.checks;
  const label = `${String(o.id).padStart(2, ' ')}. ${o.name}`;
  if (o.passed) {
    passed += 1;
    console.log(`  PASS  ${label}  (${o.checks} assertions)`);
  } else {
    console.log(`  FAIL  ${label}  (${o.checks} assertions)`);
    for (const failure of o.failures) {
      console.log(`          - ${failure}`);
    }
  }
}

console.log('\n================================================================');
console.log(`  Result: ${passed} / ${outcomes.length} tests passed  (${totalChecks} assertions total)`);
console.log('================================================================');

process.exit(passed === outcomes.length ? 0 : 1);
