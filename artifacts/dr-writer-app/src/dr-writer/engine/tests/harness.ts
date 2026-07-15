// LOCKUPHQ DR Writer — Section 14 test harness (blueprint §18 Phase 3).
// Plain deterministic runner: every test uses real assertions; a test with
// zero recorded checks fails (nothing may be skipped or stubbed).

import { EngineError, type EngineErrorCode } from '../errors.ts';

export class T {
  readonly failures: string[] = [];
  checksRun = 0;

  check(condition: boolean, message: string): void {
    this.checksRun += 1;
    if (!condition) this.failures.push(message);
  }

  equal<V>(actual: V, expected: V, label: string): void {
    this.checksRun += 1;
    if (actual !== expected) {
      this.failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  // Assert fn throws an EngineError with the given code. Returns the error.
  throws(fn: () => unknown, code: EngineErrorCode, label: string): EngineError | null {
    this.checksRun += 1;
    try {
      fn();
    } catch (err) {
      if (err instanceof EngineError && err.code === code) return err;
      this.failures.push(`${label}: threw ${err instanceof Error ? err.message : String(err)} instead of [${code}]`);
      return err instanceof EngineError ? err : null;
    }
    this.failures.push(`${label}: expected throw [${code}], but no error was thrown`);
    return null;
  }

  throwsAny(fn: () => unknown, label: string): unknown {
    this.checksRun += 1;
    try {
      fn();
    } catch (err) {
      return err;
    }
    this.failures.push(`${label}: expected a throw, but no error was thrown`);
    return null;
  }
}

export interface Section14Test {
  id: number;
  name: string;
  run: (t: T) => void;
}

export interface TestOutcome {
  id: number;
  name: string;
  passed: boolean;
  checks: number;
  failures: string[];
}

export function runTests(tests: Section14Test[]): TestOutcome[] {
  const outcomes: TestOutcome[] = [];
  for (const test of [...tests].sort((a, b) => a.id - b.id)) {
    const t = new T();
    try {
      test.run(t);
    } catch (err) {
      t.failures.push(`unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
    if (t.checksRun === 0) {
      t.failures.push('test ran zero assertions — treated as failure (no test may be stubbed)');
    }
    outcomes.push({ id: test.id, name: test.name, passed: t.failures.length === 0, checks: t.checksRun, failures: t.failures });
  }
  return outcomes;
}
