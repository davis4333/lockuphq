// LOCKUPHQ DR Writer — Phase 5 adaptive-question-engine tests (Stage 14).
// Deterministic; runs against the fakes. Verifies: approved intents only,
// AI never authors question text, batch/round bounds, six answer options,
// uncertainty answers never fabricate facts, manual fact review after limit.

import type { Section14Test } from './harness.ts';
import { runTests } from './harness.ts';
import { ANSWER_TYPES, SYNTHETIC_PACKET_6_1 } from '../packets.ts';
import { driveTo, makeEngine, newReport, type Ctx } from './fixtures.ts';
import type { Engine } from '../engine.ts';

const SPARSE_NOTES = [
  'FACT|category=subject_identity|value=Inmate Synthetic, DC Z99999|speaker=P-OFF|subject=P-INM|certainty=exact',
  'ORDER|issuer=P-OFF|command=Return to your bunk|authority=supported|applicability=applies|compliance=did_not_comply|timing=none|rescinded_before_conduct=no',
].join('\n');

function sparseReport(engine: Engine): Ctx {
  const c = newReport(engine);
  driveTo(c, 'order_selected', { notes: SPARSE_NOTES });
  engine.evaluateCharge(c.rid, c.v(), c.op); // FACTS_INCOMPLETE — 7 missing + 1 unconfirmed
  return c;
}

const APPROVED_IDS = new Set(SYNTHETIC_PACKET_6_1.question_intents.map((qi) => qi.intent_id));

export const phase5Tests: Section14Test[] = [
  {
    id: 1,
    name: 'Batch of approved intents with template text only',
    run: (t) => {
      const engine = makeEngine();
      const c = sparseReport(engine);
      const result = engine.requestClarification(c.rid, c.v(), c.op);
      t.equal(result.questions.length, 4, 'default batch size is 4');
      t.equal(result.round, 1, 'first clarification round');
      for (const q of result.questions) {
        t.check(APPROVED_IDS.has(q.intent_id), `intent ${q.intent_id} is an approved packet intent`);
        const intent = SYNTHETIC_PACKET_6_1.question_intents.find((qi) => qi.intent_id === q.intent_id)!;
        t.equal(q.text, intent.text_template, `question text is exactly the approved template (${q.intent_id})`);
        t.equal(q.ledger_slot, intent.ledger_slot, `question fills the intent's safe ledger slot (${q.intent_id})`);
      }
    },
  },
  {
    id: 2,
    name: 'Every question supports the six uncertainty answers',
    run: (t) => {
      const engine = makeEngine();
      const c = sparseReport(engine);
      const result = engine.requestClarification(c.rid, c.v(), c.op);
      t.check(result.questions.length > 0, 'questions returned');
      for (const q of result.questions) {
        t.equal(q.answer_options.length, 6, `six answer options (${q.intent_id})`);
        for (const opt of ['exact', 'approximate', 'did_not_observe', 'do_not_remember', 'unknown', 'not_applicable']) {
          t.check((q.answer_options as string[]).includes(opt), `option ${opt} present (${q.intent_id})`);
        }
      }
      t.equal(ANSWER_TYPES.length, 6, 'exactly six answer types configured');
    },
  },
  {
    id: 3,
    name: 'Three-round limit, then manual fact review',
    run: (t) => {
      const engine = makeEngine();
      const c = sparseReport(engine);
      for (let round = 1; round <= 3; round++) {
        const r = engine.requestClarification(c.rid, c.v(), c.op);
        t.equal(r.round, round, `round ${round} counted`);
        t.check(r.questions.length > 0, `round ${round} still asks questions`);
      }
      const fourth = engine.requestClarification(c.rid, c.v(), c.op);
      t.equal(fourth.questions.length, 0, 'no fourth automated round');
      t.check(fourth.moved_to_manual_review.length > 0, 'unresolved items moved to manual review');
      const review = engine.inspect(c.rid).manualFactReview;
      t.check(fourth.moved_to_manual_review.every((cat) => review.includes(cat)), 'manual review list persisted');
      t.equal(fourth.round, 3, 'round counter does not advance past the limit');
    },
  },
  {
    id: 4,
    name: 'Selector cannot author or smuggle unapproved questions',
    run: (t) => {
      // A malicious selector proposes a fabricated intent alongside a real one.
      const engine = makeEngine({
        stubs: { selectIntents: () => ['fabricated_evil_intent', 'order_exact_wording'] },
      });
      const c = sparseReport(engine);
      const result = engine.requestClarification(c.rid, c.v(), c.op);
      t.equal(result.questions.length, 1, 'only the approved intent survives');
      t.equal(result.questions[0].intent_id, 'order_exact_wording', 'the approved intent is asked');
      t.check(!result.questions.some((q) => q.intent_id === 'fabricated_evil_intent'), 'fabricated intent never emitted');

      // A selector returning ONLY garbage falls back to the deterministic
      // approved list — the round is never lost to a broken model.
      const engine2 = makeEngine({ stubs: { selectIntents: () => ['nonsense-1', 'nonsense-2'] } });
      const c2 = sparseReport(engine2);
      const r2 = engine2.requestClarification(c2.rid, c2.v(), c2.op);
      t.equal(r2.questions.length, 4, 'fail-closed fallback to deterministic approved intents');
      t.check(r2.questions.every((q) => APPROVED_IDS.has(q.intent_id)), 'fallback questions are approved intents');
    },
  },
  {
    id: 5,
    name: 'Selector may subset and prioritize applicable intents',
    run: (t) => {
      const engine = makeEngine({
        stubs: { selectIntents: () => ['noncompliance_evidence', 'authority_basis_detail'] },
      });
      const c = sparseReport(engine);
      const result = engine.requestClarification(c.rid, c.v(), c.op);
      t.equal(result.questions.length, 2, 'selector subset honored');
      const ids = result.questions.map((q) => q.intent_id);
      t.check(ids.includes('noncompliance_evidence') && ids.includes('authority_basis_detail'), 'both selected intents asked');
    },
  },
  {
    id: 6,
    name: 'Substantive officer answers fill the ledger slot and trigger rollback',
    run: (t) => {
      const engine = makeEngine();
      const c = sparseReport(engine);
      engine.requestClarification(c.rid, c.v(), c.op);
      const answer = engine.answerQuestion(c.rid, c.v(), c.op, {
        intent_id: 'order_exact_wording',
        answer_type: 'exact',
        value: 'Return to your bunk immediately',
      });
      t.check(answer.fact_id !== null, 'substantive answer creates a fact');
      const fact = engine.inspect(c.rid).facts.find((f) => f.fact_id === answer.fact_id)!;
      t.equal(fact.category, 'specific_order', 'fact lands in the intent ledger slot');
      t.equal(fact.source_type, 'officer_answer', 'source type is officer_answer');
      t.equal(fact.certainty, 'exact', 'certainty follows the answer type');
      t.equal(fact.confirmation_status, 'unconfirmed', 'officer answer still requires confirmation');
      t.check(engine.inspect(c.rid).chargeEvaluation === null, 'factual change triggered Trigger A re-evaluation');

      // Approximate answers carry approximate certainty.
      engine.evaluateCharge(c.rid, c.v(), c.op);
      const approx = engine.answerQuestion(c.rid, c.v(), c.op, {
        intent_id: 'immediate_action_detail',
        answer_type: 'approximate',
        value: 'Notified the supervisor within a few minutes',
      });
      const approxFact = engine.inspect(c.rid).facts.find((f) => f.fact_id === approx.fact_id)!;
      t.equal(approxFact.certainty, 'approximate', 'approximate answer certainty');

      // Rejections: unapproved intent, missing value, invalid answer type.
      t.throws(
        () => engine.answerQuestion(c.rid, c.v(), c.op, { intent_id: 'made_up_intent', answer_type: 'exact', value: 'x' }),
        'INPUT_REJECTED',
        'unapproved intent rejected'
      );
      t.throws(
        () => engine.answerQuestion(c.rid, c.v(), c.op, { intent_id: 'order_exact_wording', answer_type: 'exact' }),
        'INPUT_REJECTED',
        'substantive answer without value rejected'
      );
      t.throws(
        () =>
          engine.answerQuestion(c.rid, c.v(), c.op, {
            intent_id: 'order_exact_wording',
            answer_type: 'maybe' as never,
          }),
        'INPUT_REJECTED',
        'invalid answer type rejected'
      );
    },
  },
  {
    id: 7,
    name: 'Uncertainty answers never fabricate facts (fail closed)',
    run: (t) => {
      const engine = makeEngine();
      const c = sparseReport(engine);
      const before = engine.inspect(c.rid).factCount;
      for (const answerType of ['unknown', 'did_not_observe', 'do_not_remember', 'not_applicable'] as const) {
        engine.answerQuestion(c.rid, c.v(), c.op, { intent_id: 'authority_basis_detail', answer_type: answerType });
      }
      const insp = engine.inspect(c.rid);
      t.equal(insp.factCount, before, 'no fact was created from uncertainty answers');
      t.equal(insp.questionAnswers.length, 4, 'every answer was recorded');
      const evaln = engine.evaluateCharge(c.rid, c.v(), c.op);
      t.equal(evaln.outcome, 'FACTS_INCOMPLETE', 'unanswered slot stays unresolved — no false ready-state');
      t.check(evaln.missing_categories.includes('authority_basis'), 'the slot answered "unknown" is still missing');
    },
  },
];

// Standalone runner.
if (process.argv[1] && process.argv[1].includes('phase5Questions')) {
  console.log('LOCKUPHQ DR Writer — Phase 5 adaptive question engine tests (Stage 14)');
  console.log('======================================================================\n');
  const outcomes = runTests(phase5Tests);
  let passed = 0;
  let checks = 0;
  for (const o of outcomes) {
    checks += o.checks;
    if (o.passed) passed += 1;
    console.log(`  ${o.passed ? 'PASS' : 'FAIL'}  P5-${o.id}. ${o.name}  (${o.checks} assertions)`);
    for (const f of o.failures) console.log(`          - ${f}`);
  }
  console.log('\n======================================================================');
  console.log(`  Result: ${passed} / ${outcomes.length} tests passed  (${checks} assertions total)`);
  console.log('======================================================================');
  process.exit(passed === outcomes.length ? 0 : 1);
}
