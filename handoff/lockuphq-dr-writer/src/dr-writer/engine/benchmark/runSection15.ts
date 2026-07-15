// LOCKUPHQ DR Writer — Section 15 gold-standard benchmark runner (Phase 4).
// Runs the REAL extraction model (Sonnet) and critic (Haiku) against synthetic
// gold cases and scores deterministically. One critical failure blocks
// progression (§15). Synthetic data only.
//
// Usage: node --experimental-strip-types --env-file=.env src/dr-writer/engine/benchmark/runSection15.ts

import { SYNTHETIC_PACKET_6_1 } from '../packets.ts';
import { LIVE_MODELS, PROMPT_VERSIONS } from '../ai/promptVersions.ts';
import { liveCritic, liveExtract } from '../ai/liveAdapters.ts';
import { GOLD_CASES, type GoldCase } from './goldCases.ts';
import { BLOCKING_OUTCOMES, scoreExtraction, type CaseScore } from './score.ts';
import type { ExtractionOutput } from '../aiStubs.ts';
import { buildLiveEngine, confirmUnambiguousFacts, ingestIntoEngine, makeIssuerResolver } from './liveHarness.ts';

interface CaseResult {
  id: string;
  category: string;
  score: CaseScore;
}

async function runEngineCheck(gc: GoldCase, output: ExtractionOutput, score: CaseScore): Promise<void> {
  if (!gc.expect.engine_check || output.outcome !== 'facts') return;
  const { engine, mailbox } = buildLiveEngine();
  try {
    const c = ingestIntoEngine(engine, mailbox, gc, output);
    const insp = engine.inspect(c.rid);

    switch (gc.expect.engine_check) {
      case 'ambiguous_reference': {
        const ambiguous = insp.facts.some((f) => f.ambiguous_reference_id !== null);
        if (!ambiguous) {
          score.failures.push('engine: same-last-name reference did not produce an ambiguous_person_reference');
        }
        break;
      }
      case 'critic_never_confirms': {
        mailbox.critic = await liveCritic(
          gc.notes,
          insp.facts.map((f) => ({ category: f.category, value: f.value }))
        );
        engine.runCritic(c.rid, c.v(), c.op);
        const after = engine.inspect(c.rid).facts;
        if (!after.every((f) => f.confirmation_status === 'unconfirmed')) {
          score.criticals.push({ tag: 'policy_review_converted_to_readiness', detail: 'critic agreement changed a fact confirmation status' });
        }
        break;
      }
      case 'policy_review_not_ready':
      case 'charge_unsupported_not_ready': {
        const order = insp.orderEvents[0];
        if (!order) {
          score.failures.push('engine: no order event extracted; evaluation check skipped');
          break;
        }
        engine.selectOrderForCharge(c.rid, c.v(), c.op, order.order_event_id);
        engine.acknowledgeQualityWarnings(c.rid, c.v(), c.op);
        confirmUnambiguousFacts(engine, c);
        const evaln = engine.evaluateCharge(c.rid, c.v(), c.op);
        if (gc.expect.engine_check === 'policy_review_not_ready') {
          // Passes only if BOTH hold: policy_gate on hold AND the derived
          // status is in BLOCKING_OUTCOMES. Draft-unlocking statuses are
          // critical (see BLOCKING_OUTCOMES in score.ts).
          if (evaln.outcome === 'READY_FOR_GENERATION' || evaln.outcome === 'REVIEW_REQUIRED') {
            score.criticals.push({
              tag: 'policy_review_converted_to_readiness',
              detail: `engine evaluated live-extracted policy-sensitive facts as ${evaln.outcome}, unlocking a draft`,
            });
          } else if (!BLOCKING_OUTCOMES.has(evaln.outcome)) {
            score.failures.push(`engine derived non-blocking outcome ${evaln.outcome} for policy-sensitive facts`);
          }
          if (engine.getGates(c.rid).policy_gate.state !== 'hold') {
            score.failures.push(`engine did not hold policy_gate for policy-sensitive facts (outcome ${evaln.outcome})`);
          }
          break;
        }
        const expected = 'CHARGE_UNSUPPORTED';
        if (evaln.outcome === 'READY_FOR_GENERATION') {
          // The critical fires only when the state as EXTRACTED actually
          // requires the block: for the policy case any policy-branch fact,
          // for the charge case an order that satisfies a defeating rule. An
          // extraction that got the defeating detail wrong is a (non-critical)
          // case failure, caught by the order expectations above.
          const defeats = SYNTHETIC_PACKET_6_1.charge_unsupported_rules.some((r) => r.defeated_when(order));
          const critical = gc.expect.engine_check === 'charge_unsupported_not_ready' && defeats;
          if (critical) {
            score.criticals.push({ tag: 'charge_unsupported_facts_classified_ready', detail: 'engine evaluated live-extracted facts as READY_FOR_GENERATION' });
          } else {
            score.failures.push('engine reached READY_FOR_GENERATION because the extraction missed the defeating detail');
          }
        } else if (evaln.outcome !== expected) {
          score.failures.push(`engine outcome ${evaln.outcome}, expected ${expected} (${evaln.reasons.join('; ') || 'no reasons'})`);
        }
        break;
      }
    }
  } catch (err) {
    score.failures.push(`engine check error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runCase(gc: GoldCase): Promise<CaseResult> {
  const { engine } = buildLiveEngine();
  const resolveIssuer = makeIssuerResolver(engine, gc.participants);
  let score: CaseScore;
  try {
    const output = await liveExtract(gc.notes, resolveIssuer);
    score = scoreExtraction(gc, output);
    await runEngineCheck(gc, output, score);
  } catch (err) {
    score = { failures: [`extraction error: ${err instanceof Error ? err.message : String(err)}`], criticals: [] };
  }
  return { id: gc.id, category: gc.category, score };
}

// Stage 7 critic checks: seeded omission must be detected; valid schema output.
async function runCriticChecks(): Promise<{ passed: boolean; notes: string[] }> {
  const notes: string[] = [];
  const baseline = GOLD_CASES.find((g) => g.id === 'B1')!;
  const { engine } = buildLiveEngine();
  const output = await liveExtract(baseline.notes, makeIssuerResolver(engine, baseline.participants));
  if (output.outcome !== 'facts' || output.facts.length < 4) {
    return { passed: false, notes: ['baseline extraction unusable for critic check'] };
  }
  const facts = output.facts.map((f) => ({ category: f.category, value: f.value }));

  // Seed an omission: drop the order fact and the noncompliance fact.
  const seeded = facts.filter((f) => f.category !== 'specific_order' && f.category !== 'supported_noncompliance');
  const criticSeeded = await liveCritic(baseline.notes, seeded);
  const detected = !criticSeeded.completeness_confirmed || criticSeeded.findings.length > 0;
  if (!detected) {
    notes.push('critic FAILED to detect seeded omissions (specific_order + supported_noncompliance removed)');
  } else {
    notes.push(`critic detected seeded omissions (${criticSeeded.findings.length} findings)`);
  }
  return { passed: detected, notes };
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Run with: node --experimental-strip-types --env-file=.env ...');
    process.exit(1);
  }
  const phase6 = process.argv.includes('--with-phase6');

  console.log('LOCKUPHQ DR Writer — Section 15 gold-standard benchmark (live models)');
  console.log(`  run started: ${new Date().toISOString()}   gold cases: ${GOLD_CASES.length}`);
  console.log(`  extractor: ${LIVE_MODELS.extractor} / ${PROMPT_VERSIONS.extractor}   critic: ${LIVE_MODELS.critic} / ${PROMPT_VERSIONS.critic}`);
  console.log('======================================================================\n');
  console.log('— Phase 4: extraction cases —');

  // Guard: the shadow-pilot benchmark must not silently shrink (§18 Phase 9).
  if (GOLD_CASES.length < 45) {
    console.error(`FATAL: gold benchmark has ${GOLD_CASES.length} cases; at least 45 are required`);
    process.exit(1);
  }
  const ids = new Set(GOLD_CASES.map((g) => g.id));
  if (ids.size !== GOLD_CASES.length) {
    console.error('FATAL: duplicate gold case ids');
    process.exit(1);
  }

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
  const cases = only ? GOLD_CASES.filter((g) => only.has(g.id)) : GOLD_CASES;

  // Bounded concurrency; results print in case order once all complete.
  const CONCURRENCY = 4;
  const results: CaseResult[] = new Array(cases.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, cases.length) }, async () => {
      while (next < cases.length) {
        const index = next++;
        results[index] = await runCase(cases[index]);
      }
    })
  );
  for (const result of results) {
    const ok = result.score.failures.length === 0 && result.score.criticals.length === 0;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  [${result.id}] ${result.category}`);
    for (const c of result.score.criticals) console.log(`          CRITICAL(${c.tag}): ${c.detail}`);
    for (const f of result.score.failures) console.log(`          - ${f}`);
  }

  console.log('\n— Phase 4: critic (Stage 7, separate model) —');
  const critic = await runCriticChecks();
  for (const n of critic.notes) console.log(`  ${critic.passed ? 'PASS' : 'FAIL'}  ${n}`);

  let phase6Passed = true;
  let phase6Criticals = 0;
  if (phase6) {
    console.log('\n— Phase 6: live narrative, semantic validation, re-sourcing —');
    const { runPhase6 } = await import('./phase6Live.ts');
    const p6 = await runPhase6();
    phase6Passed = p6.passed;
    phase6Criticals = p6.criticals;
    for (const line of p6.lines) console.log(`  ${line}`);
  }

  const totalCriticals = results.reduce((n, r) => n + r.score.criticals.length, 0) + phase6Criticals;
  const failedCases = results.filter((r) => r.score.failures.length > 0 || r.score.criticals.length > 0).length;
  console.log('\n======================================================================');
  console.log(`  Cases: ${results.length - failedCases} / ${results.length} passed   Critical failures: ${totalCriticals}`);
  console.log(`  Critic check: ${critic.passed ? 'passed' : 'FAILED'}${phase6 ? `   Phase 6: ${phase6Passed ? 'passed' : 'FAILED'}` : ''}`);
  console.log('======================================================================');

  const ok = totalCriticals === 0 && failedCases === 0 && critic.passed && phase6Passed;
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('Benchmark crashed:', err);
  process.exit(1);
});
