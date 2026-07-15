// LOCKUPHQ DR Writer — shadow-pilot harness (blueprint §18 Phase 9 prep).
//
// Discrepancy-logging mode: synthetic incidents run END TO END in live mode
// through the REAL app-server path (handleApiRequestLive -> SecureService ->
// engine), not the bench harness. Every AI output (extraction, critic,
// question selection, narrative, semantic validation, re-sourcing) is
// recorded alongside the deterministic expectations:
//   - the gold-case expectations, scored deterministically (score.ts), and
//   - the deterministic engine outcomes (gates, display status, evaluation).
// Each run writes a JSON discrepancy report with the frozen model/prompt
// versions. Synthetic data only — no real inmate data.
//
// Usage (real models, requires credits):
//   node --experimental-strip-types --env-file=.env src/dr-writer/engine/benchmark/shadowPilot.ts
//   ... [--only=B1,CU1] [--out=path.json]

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GOLD_CASES, type GoldCase } from './goldCases.ts';
import { BLOCKING_OUTCOMES, scoreExtraction, type CaseScore } from './score.ts';
import { LIVE_MODEL_PROMPT_VERSIONS } from '../ai/promptVersions.ts';
import { createLiveApp, handleApiRequestLive } from '../../server/appServer.ts';
import type { ApiResponse } from '../../server/appServer.ts';
import { realLiveAdapters, type LiveAdapters } from '../../server/liveBridge.ts';
import type { ExtractionOutput, CriticOutput, GeneratedSentenceDraft, ResourcingOutput, SemanticValidationOutput } from '../aiStubs.ts';
import { hashValue } from '../hash.ts';

// ---------------------------------------------------------------------------
// Per-case log structure (the discrepancy report is a list of these)
// ---------------------------------------------------------------------------

export interface ShadowCaseLog {
  id: string;
  category: string;
  stage_reached: string;
  stop_reason: string | null;
  display_status: string | null;
  gates_on_hold: { name: string; reasons: string[] }[];
  ai_outputs: {
    extraction: ExtractionOutput | null;
    critic: CriticOutput | null;
    intent_selection: string[] | null;
    narrative: GeneratedSentenceDraft[] | null;
    semantic: SemanticValidationOutput | null;
    resourcing: ResourcingOutput | null;
  };
  ai_events: { kind: 'extraction' | 'critic' | 'intent_selection' | 'narrative' | 'semantic' | 'resourcing'; output: unknown }[];
  deterministic_expectations: {
    gold_score: CaseScore;
    engine_check: string | null;
    engine_check_satisfied: boolean | null;
  };
  discrepancies: string[]; // gold failures + criticals + engine-check violations
  criticals: number;
  error: string | null;
}

export interface ShadowRunReport {
  run_started: string;
  run_finished: string;
  mode: 'live' | 'injected-adapters';
  model_prompt_versions: Record<string, string>;
  gold_case_count: number;
  cases: ShadowCaseLog[];
  total_discrepancies: number;
  total_criticals: number;
  finalized_count: number;
  clean: boolean;
}

// ---------------------------------------------------------------------------
// Recording adapters — every live output is captured into the current case log
// ---------------------------------------------------------------------------

function recordingAdapters(base: LiveAdapters, currentLog: () => ShadowCaseLog): LiveAdapters {
  const record = (kind: ShadowCaseLog['ai_events'][number]['kind'], output: unknown): void => {
    currentLog().ai_events.push({ kind, output });
  };
  return {
    extract: async (notes, resolver) => {
      const out = await base.extract(notes, resolver);
      currentLog().ai_outputs.extraction = out;
      record('extraction', out);
      return out;
    },
    critic: async (notes, facts) => {
      const out = await base.critic(notes, facts);
      currentLog().ai_outputs.critic = out;
      record('critic', out);
      return out;
    },
    generate: async (facts, officer) => {
      const out = await base.generate(facts, officer);
      currentLog().ai_outputs.narrative = out;
      record('narrative', out);
      return out;
    },
    resource: async (sentence, facts) => {
      const out = await base.resource(sentence, facts);
      currentLog().ai_outputs.resourcing = out;
      record('resourcing', out);
      return out;
    },
    semantic: async (sentences, facts, officer) => {
      const out = await base.semantic(sentences, facts, officer);
      currentLog().ai_outputs.semantic = out;
      record('semantic', out);
      return out;
    },
    selectIntents: async (unresolved, approved, max) => {
      const out = await base.selectIntents(unresolved, approved, max);
      currentLog().ai_outputs.intent_selection = out;
      record('intent_selection', out);
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Batch runner — the full benchmark through the real app-server path
// ---------------------------------------------------------------------------

export interface ShadowBatchOptions {
  cases?: GoldCase[];
  adapters?: LiveAdapters; // injected fakes for plumbing tests; real by default
  dir?: string; // service data dir (temp by default)
  outPath?: string | null; // report file; null = do not write
}

export async function runShadowBatch(opts: ShadowBatchOptions = {}): Promise<ShadowRunReport> {
  const runStarted = new Date().toISOString();
  const cases = opts.cases ?? GOLD_CASES;
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'lockuphq-shadow-'));
  const usingRealAdapters = opts.adapters === undefined;

  let current: ShadowCaseLog | null = null;
  const base = opts.adapters ?? realLiveAdapters();
  const { service, bridge } = createLiveApp({
    dir,
    adapters: recordingAdapters(base, () => current!),
  });
  // The benchmark roster includes the nurse (attribution/medical cases).
  if (!service.engine.persons.get('P-NURSE')) {
    service.engine.addPerson({
      person_id: 'P-NURSE',
      report_id: null,
      incident_group_id: null,
      person_type: 'medical_staff',
      first_name: 'Riley',
      last_name: 'Adams',
      initial: 'R',
      rank_or_role: 'Nurse',
      dc_number: null,
      identity_source: 'synthetic-roster',
      confirmation_status: 'confirmed',
      ambiguity_status: 'unambiguous',
    });
  }

  const login = await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null);
  const sid = (login.body['session'] as { session_id: string }).session_id;
  const api = (method: string, path: string, body: unknown): Promise<ApiResponse> =>
    handleApiRequestLive(service, bridge, method, path, body, sid);
  const expectOk = async (method: string, path: string, body: unknown, stage: string): Promise<Record<string, unknown>> => {
    const res = await api(method, path, body);
    if (res.status !== 200) {
      throw new ShadowStop(stage, `${String(res.body['code'])}: ${String(res.body['error'])}`);
    }
    return res.body;
  };

  const logs: ShadowCaseLog[] = [];
  for (const gc of cases) {
    current = {
      id: gc.id,
      category: gc.category,
      stage_reached: 'created',
      stop_reason: null,
      display_status: null,
      gates_on_hold: [],
      ai_outputs: { extraction: null, critic: null, intent_selection: null, narrative: null, semantic: null, resourcing: null },
      ai_events: [],
      deterministic_expectations: { gold_score: { failures: [], criticals: [] }, engine_check: gc.expect.engine_check ?? null, engine_check_satisfied: null },
      discrepancies: [],
      criticals: 0,
      error: null,
    };
    try {
      await runShadowCase(gc, current, service, api, expectOk);
    } catch (err) {
      if (err instanceof ShadowStop) {
        current.stage_reached = err.stage;
        current.stop_reason = err.reason;
        current.discrepancies.push(`unexpected serving-path stop at ${err.stage}: ${err.reason}`);
      } else {
        current.error = err instanceof Error ? err.message : String(err);
        current.discrepancies.push(`harness error: ${current.error}`);
      }
    }
    current.criticals = current.deterministic_expectations.gold_score.criticals.length;
    logs.push(current);
  }

  const report: ShadowRunReport = {
    run_started: runStarted,
    run_finished: new Date().toISOString(),
    mode: usingRealAdapters ? 'live' : 'injected-adapters',
    model_prompt_versions: { ...LIVE_MODEL_PROMPT_VERSIONS },
    gold_case_count: cases.length,
    cases: logs,
    total_discrepancies: logs.reduce((n, l) => n + l.discrepancies.length, 0),
    total_criticals: logs.reduce((n, l) => n + l.criticals, 0),
    finalized_count: logs.filter((l) => l.stage_reached === 'FINALIZED').length,
    clean: logs.every((l) => l.discrepancies.length === 0 && l.error === null),
  };

  if (opts.outPath !== null) {
    const outPath = opts.outPath ?? defaultReportPath();
    mkdirSync(resolve(outPath, '..'), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  }
  if (opts.dir === undefined) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup of the temp service dir
    }
  }
  return report;
}

class ShadowStop extends Error {
  readonly stage: string;
  readonly reason: string;

  constructor(stage: string, reason: string) {
    super(`${stage}: ${reason}`);
    this.stage = stage;
    this.reason = reason;
  }
}

function defaultReportPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve('dev-output/shadow-pilot', `run-${stamp}.json`);
}

async function runShadowCase(
  gc: GoldCase,
  log: ShadowCaseLog,
  service: ReturnType<typeof createLiveApp>['service'],
  api: (method: string, path: string, body: unknown) => Promise<ApiResponse>,
  expectOk: (method: string, path: string, body: unknown, stage: string) => Promise<Record<string, unknown>>
): Promise<void> {
  const snapshotHolds = (rid: string): void => {
    log.display_status = service.engine.getDisplayStatus(rid);
    log.gates_on_hold = Object.entries(service.engine.getGates(rid))
      .filter(([, g]) => g.state === 'hold')
      .map(([name, g]) => ({ name, reasons: g.reasons }));
  };

  // Empty/whitespace-only notes are rejected at the server boundary — that IS
  // the expected fail-closed behavior for the empty-input category.
  if (gc.notes.trim().length === 0) {
    const created = await expectOk('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: gc.participants }, 'created');
    const rid = ((created['report'] as { report_id: string })).report_id;
    await expectOk('POST', `/api/reports/${rid}/admin`, { version: service.engine.getVersion(rid), admin: shadowAdmin() }, 'admin');
    await expectOk('POST', `/api/reports/${rid}/screen`, { version: service.engine.getVersion(rid), answers: shadowScreen(gc) }, 'screen');
    const res = await api('POST', `/api/reports/${rid}/analyze`, { version: service.engine.getVersion(rid), text: gc.notes, request_id: `shadow-${gc.id}` });
    if (res.status === 400 && res.body['code'] === 'INPUT_REJECTED') {
      log.stage_reached = 'rejected_empty_input';
      log.stop_reason = 'server rejected empty notes (fail closed, expected)';
    } else {
      log.discrepancies.push(`empty input was not rejected: ${res.status} ${String(res.body['code'])}`);
      log.stage_reached = 'analyze';
    }
    return;
  }

  const created = await expectOk('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: gc.participants }, 'created');
  const rid = (created['report'] as { report_id: string }).report_id;
  const v = (): number => service.engine.getVersion(rid);
  await expectOk('POST', `/api/reports/${rid}/admin`, { version: v(), admin: shadowAdmin() }, 'admin');
  await expectOk('POST', `/api/reports/${rid}/screen`, { version: v(), answers: shadowScreen(gc) }, 'screen');

  // Analyze Incident — live extraction + critic through the serving path.
  const analyzeRes = await api('POST', `/api/reports/${rid}/analyze`, { version: v(), text: gc.notes, request_id: `shadow-${gc.id}` });
  log.stage_reached = 'analyze';
  if (analyzeRes.status !== 200) {
    snapshotHolds(rid);
    throw new ShadowStop('analyze', `${String(analyzeRes.body['code'])}: ${String(analyzeRes.body['error'])}`);
  }
  snapshotHolds(rid);

  // Score the recorded live extraction against the gold expectations.
  if (log.ai_outputs.extraction) {
    log.deterministic_expectations.gold_score = scoreExtraction(gc, log.ai_outputs.extraction);
    log.discrepancies.push(
      ...log.deterministic_expectations.gold_score.criticals.map((c) => `CRITICAL(${c.tag}): ${c.detail}`),
      ...log.deterministic_expectations.gold_score.failures
    );
  } else {
    log.discrepancies.push('no live extraction output was recorded');
  }

  checkPostAnalyzeExpectation(gc, log, service, rid);

  // Exercise Stage 14 through the serving path before confirmation. The live
  // model may select only from approved intents; the engine independently
  // renders the approved template text and six answer options.
  const preConfirmEvaluation = service.engine.inspect(rid).chargeEvaluation;
  const unresolved = preConfirmEvaluation
    ? [...preConfirmEvaluation.missing_categories, ...preConfirmEvaluation.unconfirmed_categories]
    : [];
  if (unresolved.length > 0) {
    const clarification = await expectOk('POST', `/api/reports/${rid}/clarify`, { version: v() }, 'clarify');
    log.stage_reached = 'clarified';
    const approvedIds = new Set(
      service.engine.packet.question_intents
        .filter((intent) => unresolved.includes(intent.ledger_slot))
        .map((intent) => intent.intent_id)
    );
    const rawSelection = log.ai_outputs.intent_selection ?? [];
    const unapproved = rawSelection.filter((id) => !approvedIds.has(id));
    if (unapproved.length > 0) {
      log.discrepancies.push(`live selector returned unapproved intents: ${unapproved.join(', ')}`);
    }
    const questions = (clarification['clarification'] as { questions?: { intent_id: string }[] }).questions ?? [];
    if (questions.some((question) => !approvedIds.has(question.intent_id))) {
      log.discrepancies.push('engine emitted a question outside the approved applicable intent set');
    }
  }

  // Continue toward finalization where the incident supports it: confirm the
  // unambiguous facts, acknowledge quality, re-evaluate.
  const facts = service.engine.inspect(rid).facts.filter((f) => f.extraction_status !== 'superseded' && f.ambiguous_reference_id === null);
  if (facts.length === 0) {
    log.stop_reason = 'no confirmable facts (CANNOT_DETERMINE or empty extraction)';
    checkEngineExpectation(gc, log, 'FACTS_INCOMPLETE');
    return;
  }
  await expectOk('POST', `/api/reports/${rid}/confirm-facts`, {
    version: v(),
    request: {
      ledger_hash_shown: service.engine.currentLedgerHash(rid),
      displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
      decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' })),
      started_at: '2026-06-01T22:00:00Z',
      submitted_at: '2026-06-01T22:30:00Z',
    },
  }, 'confirm');
  log.stage_reached = 'confirmed';
  await expectOk('POST', `/api/reports/${rid}/acknowledge-quality`, { version: v() }, 'quality');
  const evalRes = await expectOk('POST', `/api/reports/${rid}/evaluate`, { version: v() }, 'evaluate');
  const outcome = (evalRes['evaluation'] as { outcome: string }).outcome;
  log.stage_reached = `evaluated:${outcome}`;
  snapshotHolds(rid);
  checkEngineExpectation(gc, log, outcome);
  if (outcome !== 'READY_FOR_GENERATION') {
    log.stop_reason = `charge evaluation: ${outcome}`;
    return;
  }

  // Live draft: snapshot -> live generation -> deterministic + live semantic.
  const draftRes = await api('POST', `/api/reports/${rid}/draft`, { version: v() });
  log.stage_reached = 'draft';
  if (draftRes.status !== 200) {
    snapshotHolds(rid);
    throw new ShadowStop('draft', `${String(draftRes.body['code'])}: ${String(draftRes.body['error'])}`);
  }
  const passed = (draftRes.body['validation'] as { passed: boolean }).passed;
  snapshotHolds(rid);
  if (!passed) {
    log.stop_reason = 'narrative validation did not pass (VALIDATION HOLD)';
    log.discrepancies.push('live narrative failed validation on a READY incident');
    return;
  }


  // Exercise Stage 20 on a supported sentence. Editing to the same sourced
  // text still invalidates the old source map, forcing the real constrained
  // resourcer and both validators to run through the serving path.
  const sentence = service.engine.inspect(rid).narrative?.sentences[0];
  if (!sentence) {
    log.discrepancies.push('validated narrative contained no sentence to re-source');
    return;
  }
  await expectOk('POST', `/api/reports/${rid}/edit-sentence`, { version: v(), sentence_id: sentence.sentence_id, new_text: sentence.text }, 'edit-for-resourcing');
  const resourced = await expectOk('POST', `/api/reports/${rid}/resource-sentence`, { version: v(), sentence_id: sentence.sentence_id }, 'resource-sentence');
  const resourceResult = resourced['result'] as { outcome: string };
  if (resourceResult.outcome !== 'sourced') {
    log.discrepancies.push(`supported sentence did not re-source: ${resourceResult.outcome}`);
    return;
  }
  const revalidation = await expectOk('POST', `/api/reports/${rid}/validate`, { version: v() }, 'revalidate');
  if (!(revalidation['validation'] as { passed: boolean }).passed) {
    log.discrepancies.push('supported re-sourced sentence failed revalidation');
    return;
  }

  // Certify, audit, token, output — the same hash-bound path an officer uses.
  const insp = service.engine.inspect(rid);
  await expectOk('POST', `/api/reports/${rid}/certify`, {
    version: v(),
    request: {
      report_version: v(),
      fact_snapshot_hash: hashValue(insp.snapshot),
      narrative_hash: insp.narrative!.narrative_hash,
      deterministic_validation_id: insp.deterministicValidation!.validation_id,
      semantic_validation_id: insp.semanticValidation!.validation_id,
    },
  }, 'certify');
  await expectOk('POST', `/api/reports/${rid}/finalize-audit`, { version: v() }, 'finalize-audit');
  const tok = await expectOk('POST', `/api/reports/${rid}/token`, { channel: 'print' }, 'token');
  await expectOk('POST', '/api/output', { token_id: (tok['token'] as { token_id: string }).token_id, channel: 'print' }, 'output');
  log.stage_reached = 'FINALIZED';
  snapshotHolds(rid);
}

function checkEngineExpectation(gc: GoldCase, log: ShadowCaseLog, outcome: string): void {
  const check = gc.expect.engine_check;
  if (!check) return;
  if (check === 'policy_review_not_ready') {
    // Passes only if BOTH hold: policy_gate on hold AND the derived status is
    // in BLOCKING_OUTCOMES. Draft-unlocking statuses (READY_FOR_GENERATION,
    // REVIEW_REQUIRED) are critical (see BLOCKING_OUTCOMES in score.ts).
    const policyHeld = log.gates_on_hold.some((gate) => gate.name === 'policy_gate');
    const satisfied = policyHeld && BLOCKING_OUTCOMES.has(outcome);
    log.deterministic_expectations.engine_check_satisfied = satisfied;
    if (!satisfied) {
      const detail = `policy-sensitive case outcome ${outcome}; policy_gate hold=${policyHeld}`;
      log.discrepancies.push(detail);
      if (outcome === 'READY_FOR_GENERATION' || outcome === 'REVIEW_REQUIRED') {
        log.deterministic_expectations.gold_score.criticals.push({
          tag: 'policy_review_converted_to_readiness',
          detail,
        });
      }
    }
    return;
  }
  const expected =
    check === 'charge_unsupported_not_ready' ? 'CHARGE_UNSUPPORTED' : null;
  if (expected === null) {
    return;
  }
  log.deterministic_expectations.engine_check_satisfied = outcome === expected;
  if (outcome !== expected) {
    const detail = `engine outcome ${outcome}, expected ${expected}`;
    log.discrepancies.push(detail);
    if (outcome === 'READY_FOR_GENERATION') {
      log.deterministic_expectations.gold_score.criticals.push({
        tag: 'charge_unsupported_facts_classified_ready',
        detail,
      });
    }
  }
}

function checkPostAnalyzeExpectation(
  gc: GoldCase,
  log: ShadowCaseLog,
  service: ReturnType<typeof createLiveApp>['service'],
  reportId: string
): void {
  const check = gc.expect.engine_check;
  if (check === 'ambiguous_reference') {
    const satisfied = service.engine.inspect(reportId).facts.some((fact) => fact.ambiguous_reference_id !== null);
    log.deterministic_expectations.engine_check_satisfied = satisfied;
    if (!satisfied) log.discrepancies.push('same-last-name extraction did not create an ambiguous person reference');
  }
  if (check === 'critic_never_confirms') {
    const satisfied = service.engine.inspect(reportId).facts.every((fact) => fact.confirmation_status === 'unconfirmed');
    log.deterministic_expectations.engine_check_satisfied = satisfied;
    if (!satisfied) log.discrepancies.push('critic agreement changed an officer confirmation status');
  }
}

function shadowScreen(gc: GoldCase): Record<string, string> {
  const medical = ['no medical conclusions + policy review', 'medical restriction', 'care-plan issue', 'force used'].includes(gc.category);
  return {
    force_used: gc.category === 'force used' ? 'yes' : 'no',
    medical_involvement: medical ? 'yes' : 'no',
  };
}

function shadowAdmin(): Record<string, unknown> {
  return {
    reporting_officer_person_id: 'P-OFF',
    institution_id: 'INST-1',
    assignment: 'Dorm C',
    subject_person_id: 'P-INM',
    subject_dc_number: 'Z99999',
    incident_start: '2026-06-01T21:15:00Z',
    incident_end: null,
    time_certainty: 'exact',
    general_area: 'Dorm C',
    specific_location: 'Cell 12',
    charge_code: '6-1',
    reference_style: 'last_name',
    incident_group_id: null,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && resolve(process.argv[1]).includes('shadowPilot');
if (isMain) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Run with: node --experimental-strip-types --env-file=.env ...');
    process.exit(1);
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  runShadowBatch({
    cases: only ? GOLD_CASES.filter((g) => only.has(g.id)) : undefined,
    outPath: outArg ? outArg.slice(6) : undefined,
  })
    .then((report) => {
      console.log('LOCKUPHQ DR Writer — shadow-pilot batch (real app-server path, live models)');
      console.log(`  run: ${report.run_started} -> ${report.run_finished}`);
      console.log(`  versions: ${JSON.stringify(report.model_prompt_versions)}`);
      console.log('===========================================================================\n');
      for (const c of report.cases) {
        const ok = c.discrepancies.length === 0 && c.error === null;
        console.log(`  ${ok ? 'CLEAN' : 'DISCREPANT'}  [${c.id}] ${c.category} — reached ${c.stage_reached}${c.stop_reason ? ` (${c.stop_reason})` : ''}`);
        for (const d of c.discrepancies) console.log(`          - ${d}`);
        if (c.error) console.log(`          ! ${c.error}`);
      }
      console.log('\n===========================================================================');
      console.log(`  Cases: ${report.cases.length}   Finalized end-to-end: ${report.finalized_count}`);
      console.log(`  Discrepancies: ${report.total_discrepancies}   Criticals: ${report.total_criticals}   Clean run: ${report.clean ? 'YES' : 'NO'}`);
      console.log('===========================================================================');
      process.exit(report.clean ? 0 : 1);
    })
    .catch((err) => {
      console.error('Shadow batch crashed:', err);
      process.exit(1);
    });
}
