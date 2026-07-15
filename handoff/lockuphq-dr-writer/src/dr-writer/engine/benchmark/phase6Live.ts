// LOCKUPHQ DR Writer — Phase 6 live benchmark (blueprint §18 Phase 6).
// Runs the REAL generator, semantic validator, and constrained re-sourcer
// through the engine on a live-extracted baseline incident:
//
//   Stage 17 — live narrative generation with sentence-level fact sourcing
//              (the engine rejects any sentence without valid confirmed IDs).
//   Stage 18 — deterministic validation incl. exact-quote containment (engine).
//   Stage 19 — live semantic validation with the 2-attempt regeneration cap.
//   Stage 20 — live constrained re-sourcing: existing fact IDs or UNSUPPORTED,
//              2 attempts, then manual fact review (engine-enforced).
//
// Section 15 criticals watched here: summary_converted_to_quote (generator
// invents a quotation) and unsupported_sentence_passing_resourcing.

import { GOLD_CASES } from './goldCases.ts';
import { liveExtract, liveGenerate, liveResource, liveSemanticValidate, liveSelectIntents } from '../ai/liveAdapters.ts';
import {
  buildLiveEngine,
  confirmUnambiguousFacts,
  confirmedFactValues,
  generatorFacts,
  ingestIntoEngine,
  makeIssuerResolver,
} from './liveHarness.ts';
import { LIVE_MODEL_PROMPT_VERSIONS } from '../ai/promptVersions.ts';
import { SYNTHETIC_PACKET_6_1 } from '../packets.ts';
import { certRequest } from '../tests/fixtures.ts';

const REPORTING_OFFICER = 'Sergeant Officer';

export interface Phase6Result {
  passed: boolean;
  criticals: number;
  lines: string[];
}

export async function runPhase6(): Promise<Phase6Result> {
  const lines: string[] = [];
  let criticals = 0;
  let failed = false;
  const fail = (msg: string): void => {
    failed = true;
    lines.push(`FAIL  ${msg}`);
  };
  const pass = (msg: string): void => {
    lines.push(`PASS  ${msg}`);
  };
  const critical = (msg: string): void => {
    criticals += 1;
    failed = true;
    lines.push(`CRITICAL  ${msg}`);
  };

  const baseline = GOLD_CASES.find((g) => g.id === 'B1')!;
  const { engine, mailbox } = buildLiveEngine();

  // ---- Stage 6: live extraction into the engine ----
  const extraction = await liveExtract(baseline.notes, makeIssuerResolver(engine, baseline.participants));
  if (extraction.outcome !== 'facts') {
    fail('baseline extraction returned CANNOT_DETERMINE; cannot run Phase 6');
    return { passed: false, criticals, lines };
  }
  const c = ingestIntoEngine(engine, mailbox, baseline, extraction);

  // ---- Stage 14: live intent selection over a mid-flow evaluation ----
  const order = engine.inspect(c.rid).orderEvents[0];
  if (!order) {
    fail('no order event extracted from baseline notes');
    return { passed: false, criticals, lines };
  }
  engine.selectOrderForCharge(c.rid, c.v(), c.op, order.order_event_id);
  const preEval = engine.evaluateCharge(c.rid, c.v(), c.op); // FACTS_INCOMPLETE (unconfirmed)
  const unresolved = [...preEval.missing_categories, ...preEval.unconfirmed_categories];
  if (unresolved.length > 0) {
    const applicable = SYNTHETIC_PACKET_6_1.question_intents
      .filter((qi) => unresolved.includes(qi.ledger_slot))
      .map((qi) => ({ intent_id: qi.intent_id, ledger_slot: qi.ledger_slot }));
    mailbox.selectIntents = await liveSelectIntents(unresolved, applicable, 4);
    const clarification = engine.requestClarification(c.rid, c.v(), c.op);
    const approvedIds = new Set(SYNTHETIC_PACKET_6_1.question_intents.map((qi) => qi.intent_id));
    if (clarification.questions.every((q) => approvedIds.has(q.intent_id))) {
      pass(`Stage 14: live selector chose ${clarification.questions.length} approved intents; engine emitted template text only`);
    } else {
      fail('Stage 14: an unapproved intent reached the question batch');
    }
  }

  // ---- Officer confirmation, quality ack, readiness ----
  confirmUnambiguousFacts(engine, c);
  engine.acknowledgeQualityWarnings(c.rid, c.v(), c.op);
  const evaln = engine.evaluateCharge(c.rid, c.v(), c.op);
  if (evaln.outcome !== 'READY_FOR_GENERATION') {
    fail(`baseline did not reach READY_FOR_GENERATION (${evaln.outcome}: ${evaln.reasons.join('; ')})`);
    return { passed: false, criticals, lines };
  }
  engine.createSnapshot(c.rid, c.v(), c.op);
  const snapshot = engine.inspect(c.rid).snapshot!;
  if (snapshot.model_prompt_versions.generator === LIVE_MODEL_PROMPT_VERSIONS.generator) {
    pass('Stage 16: snapshot records live model and prompt versions');
  } else {
    fail('Stage 16: snapshot does not record the live generator version');
  }

  // ---- Stage 17: live generation with sentence-level sourcing ----
  const genFacts = generatorFacts(engine, c.rid);
  mailbox.generate = await liveGenerate(genFacts, REPORTING_OFFICER);
  try {
    engine.generateNarrative(c.rid, c.v(), c.op);
    pass(`Stage 17: live narrative generated (${engine.inspect(c.rid).narrative!.sentences.length} sentences, all citing confirmed fact IDs)`);
  } catch (err) {
    fail(`Stage 17: engine rejected the generated narrative: ${err instanceof Error ? err.message : String(err)}`);
    return { passed: false, criticals, lines };
  }

  // ---- Stages 18-19: deterministic + live semantic validation, 2-regen cap ----
  const validateLive = async (): Promise<{ passed: boolean; issues: string[] }> => {
    const narrative = engine.inspect(c.rid).narrative!;
    // The semantic validator judges the narrative against the SAME fact set the
    // generator received (the snapshot's charge-relevant confirmed facts).
    mailbox.semantic = await liveSemanticValidate(
      narrative.sentences.map((s) => ({ sentence_id: s.sentence_id, text: s.text, source_fact_ids: s.source_fact_ids })),
      generatorFacts(engine, c.rid).map((f) => ({ fact_id: f.fact_id, value: f.value })),
      REPORTING_OFFICER
    );
    const result = engine.validateNarrative(c.rid, c.v(), c.op);
    return { passed: result.passed, issues: result.issues.map((i) => `${i.category}: ${i.message}`) };
  };

  const noteQuoteCritical = (v: { issues: string[] }): void => {
    const quoteIssues = v.issues.filter((i) => i.startsWith('quote_containment'));
    if (quoteIssues.length > 0) {
      critical(`summary_converted_to_quote — the generator invented a quotation: ${quoteIssues.join(' | ')}`);
    }
  };

  let validation = await validateLive();
  noteQuoteCritical(validation);
  let regenAttempts = 0;
  while (!validation.passed && regenAttempts < 2) {
    // Stage 19 — bounded automated regeneration (max 2). The engine-enforced
    // cap on regenerateNarrative is proven in Section 14 test 23; here the
    // regeneration re-runs the live generator, then the CURRENT narrative is
    // validated (deterministic in-engine + live semantic).
    regenAttempts += 1;
    mailbox.generate = await liveGenerate(genFacts, REPORTING_OFFICER);
    engine.generateNarrative(c.rid, c.v(), c.op);
    validation = await validateLive();
    noteQuoteCritical(validation);
  }
  if (validation.passed) {
    pass(`Stages 18-19: deterministic + live semantic validation passed${regenAttempts > 0 ? ` after ${regenAttempts} automated regeneration(s)` : ''}`);
  } else {
    fail(`Stages 18-19: validation failed after the 2-attempt cap: ${validation.issues.join(' | ')}`);
    return { passed: false, criticals, lines };
  }

  // ---- Stage 20a: UNSUPPORTED edit must not pass re-sourcing ----
  const sentences = engine.inspect(c.rid).narrative!.sentences;
  const target = sentences[sentences.length - 1];
  engine.editSentence(c.rid, c.v(), c.op, {
    sentence_id: target.sentence_id,
    new_text: 'Synthetic then struck me in the face and spat at responding staff.',
  });
  mailbox.resource = await liveResource(
    'Synthetic then struck me in the face and spat at responding staff.',
    confirmedFactValues(engine, c.rid)
  );
  const unsupported = engine.resourceSentence(c.rid, c.v(), c.op, target.sentence_id);
  if (unsupported.outcome === 'sourced') {
    critical('unsupported_sentence_passing_resourcing — a fabricated sentence was re-sourced to confirmed facts');
  } else if (unsupported.outcome === 'UNSUPPORTED') {
    pass('Stage 20: fabricated edit returned UNSUPPORTED (constrained re-sourcing held)');
  } else {
    pass(`Stage 20: fabricated edit rejected by the engine (${unsupported.outcome})`);
  }
  engine.revertSentence(c.rid, c.v(), c.op, target.sentence_id);
  validation = await validateLive();
  if (!validation.passed) {
    fail(`revalidation after revert failed: ${validation.issues.join(' | ')}`);
    return { passed: false, criticals, lines };
  }

  // ---- Stage 20b: a supported edit re-sources to existing fact IDs ----
  const supportedTarget = engine.inspect(c.rid).narrative!.sentences[0];
  const supportingFact = engine
    .inspect(c.rid)
    .facts.find((f) => f.fact_id === supportedTarget.source_fact_ids[0])!;
  const editedText = `${supportingFact.value}.`;
  engine.editSentence(c.rid, c.v(), c.op, { sentence_id: supportedTarget.sentence_id, new_text: editedText });
  mailbox.resource = await liveResource(editedText, confirmedFactValues(engine, c.rid));
  const resourced = engine.resourceSentence(c.rid, c.v(), c.op, supportedTarget.sentence_id);
  if (resourced.outcome === 'sourced') {
    pass(`Stage 20: supported edit re-sourced to ${resourced.fact_ids.length} existing confirmed fact ID(s)`);
  } else {
    fail(`Stage 20: supported edit was not re-sourced (${resourced.outcome})`);
    return { passed: false, criticals, lines };
  }
  validation = await validateLive();
  if (!validation.passed) {
    fail(`revalidation after supported edit failed: ${validation.issues.join(' | ')}`);
    return { passed: false, criticals, lines };
  }

  // ---- Stages 22-24: certification, audit, token, output ----
  engine.certify(c.rid, c.v(), c.op, certRequest(c));
  engine.commitAuditFinalization(c.rid, c.v(), c.op);
  const token = engine.issueToken(c.rid, { ...c.op, role: 'officer' }, 'print');
  const output = engine.authorizeOutput(token.token_id, c.op, 'print');
  if (engine.getLifecycle(c.rid) === 'FINALIZED' && output.output.length > 0) {
    pass('Stages 22-24: certified, audited, token issued and redeemed — report FINALIZED end to end on live output');
    lines.push(`      narrative: ${output.output.slice(0, 160)}${output.output.length > 160 ? '…' : ''}`);
  } else {
    fail('finalization did not complete');
  }

  return { passed: !failed, criticals, lines };
}
