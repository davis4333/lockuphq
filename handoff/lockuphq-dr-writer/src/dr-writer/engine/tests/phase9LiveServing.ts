// LOCKUPHQ DR Writer — Phase 9 prep tests: live-AI serving path and shadow
// harness plumbing. These use INJECTED fake adapters (no network, no API key)
// so the stub-mode suite fully verifies the wiring: mailbox pre-fetch, engine
// enforcement over live-shaped output, SYSTEM HOLD on malformed output, and
// the discrepancy report format. Real-model runs use bench:extraction /
// bench:full / shadow:pilot.
//
// Usage: node --experimental-strip-types src/dr-writer/engine/tests/phase9LiveServing.ts

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { T } from './harness.ts';
import { createLiveApp, handleApiRequest, handleApiRequestLive, resolveAiMode } from '../../server/appServer.ts';
import type { LiveAdapters } from '../../server/liveBridge.ts';
import { LiveAdapterError } from '../ai/liveAdapters.ts';
import { runShadowBatch } from '../benchmark/shadowPilot.ts';
import type { ShadowRunReport } from '../benchmark/shadowPilot.ts';
import { GOLD_CASES } from '../benchmark/goldCases.ts';
import { hashValue } from '../hash.ts';
import type { ExtractionOutput } from '../aiStubs.ts';

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lockuphq-p9-'));
  cleanupDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Fake adapters producing live-shaped output (same types the real ones map to)
// ---------------------------------------------------------------------------

const B1 = GOLD_CASES.find((g) => g.id === 'B1')!;
const D1 = GOLD_CASES.find((g) => g.id === 'D1')!;
const I1 = GOLD_CASES.find((g) => g.id === 'I1')!;

function b1Extraction(resolveIssuer: (name: string) => string): ExtractionOutput {
  const lines = B1.notes.split('\n');
  const fact = (category: string, value: string, line: number, speaker: string | null, subject: string | null) => ({
    category,
    value,
    certainty: 'exact' as const,
    speaker_ref: speaker,
    subject_ref: subject,
    source_line: lines[line],
  });
  return {
    outcome: 'facts',
    injection_suspected: false,
    facts: [
      fact('scene_context', 'On 06/01/2026 at approximately 2115 hours in Dorm C', 0, '@Officer', null),
      fact('subject_identity', 'Inmate Synthetic, DC# Z99999', 1, '@Officer', '@Synthetic'),
      fact('issuer_identity', 'Sergeant Officer issued the order', 3, '@Officer', null),
      fact('authority_basis', 'Post orders authorize dorm officers to direct inmate movement during count', 2, '@Officer', null),
      fact('specific_order', 'return to his bunk', 3, '@Officer', '@Synthetic'),
      fact('subject_applicability', 'The order applied to Synthetic individually because he was the only inmate out of place', 3, '@Officer', '@Synthetic'),
      fact('post_order_conduct', 'Synthetic remained seated at the dayroom table', 4, '@Officer', '@Synthetic'),
      fact('supported_noncompliance', 'Synthetic stated "I am not going back"', 4, '@Synthetic', '@Synthetic'),
      fact('immediate_action', 'I notified the dorm supervisor immediately', 5, '@Officer', null),
    ],
    orders: [
      {
        issuer_ref: resolveIssuer('Officer'),
        specific_command: 'return to his bunk',
        authority_status: 'supported',
        subject_applicability: 'applies',
        compliance_result: 'did_not_comply',
        compliance_timing: 'none',
        rescinded_before_conduct: false,
        source_line: lines[3],
      },
    ],
  };
}

function i1Extraction(resolveIssuer: (name: string) => string): ExtractionOutput {
  const lines = I1.notes.split('\n');
  return {
    outcome: 'facts',
    injection_suspected: true,
    facts: [
      {
        category: 'specific_order',
        value: 'return his food tray',
        certainty: 'exact',
        speaker_ref: '@Officer',
        subject_ref: '@Synthetic',
        source_line: lines[0],
      },
    ],
    orders: [
      {
        issuer_ref: resolveIssuer('Officer'),
        specific_command: 'return his food tray',
        authority_status: 'unknown',
        subject_applicability: 'unknown',
        compliance_result: 'complied',
        compliance_timing: 'delayed',
        rescinded_before_conduct: false,
        source_line: lines[0],
      },
    ],
  };
}

interface FakeStats {
  extract: number;
  critic: number;
  generate: number;
  semantic: number;
  resource: number;
  selectIntents: number;
}

function fakeAdapters(stats: FakeStats, opts: { failExtract?: boolean; providerError?: boolean; failSelect?: boolean; semanticPass?: boolean } = {}): LiveAdapters {
  return {
    extract: async (notes, resolveIssuer) => {
      stats.extract += 1;
      if (opts.failExtract) throw new LiveAdapterError('[extractor] malformed output after 3 attempts: response was not valid JSON');
      if (opts.providerError) throw new Error('provider unavailable');
      if (notes.includes('Nothing unusual observed')) return { outcome: 'CANNOT_DETERMINE' };
      if (notes.includes('SYSTEM MESSAGE')) return i1Extraction(resolveIssuer);
      return b1Extraction(resolveIssuer);
    },
    critic: async () => {
      stats.critic += 1;
      return { completeness_confirmed: true, findings: [] };
    },
    generate: async (facts) => {
      stats.generate += 1;
      return facts.map((f) => ({
        section: f.category,
        text: `The following was documented: ${f.value}.`,
        source_fact_ids: [f.fact_id],
        certainty: f.certainty,
      }));
    },
    resource: async (sentenceText, confirmedFacts) => {
      stats.resource += 1;
      const matches = confirmedFacts.filter((f) => sentenceText.includes(f.value));
      return matches.length > 0 ? { fact_ids: matches.map((f) => f.fact_id) } : 'UNSUPPORTED';
    },
    semantic: async () => {
      stats.semantic += 1;
      return opts.semanticPass === false
        ? { passed: false, issues: [{ category: 'seeded', detail: 'seeded validation failure', sentence_id: null }] }
        : { passed: true, issues: [] };
    },
    selectIntents: async (_unresolved, approved) => {
      stats.selectIntents += 1;
      if (opts.failSelect) throw new LiveAdapterError('[intent_selector] malformed output after 3 attempts');
      return approved.map((i) => i.intent_id);
    },
  };
}

function newStats(): FakeStats {
  return { extract: 0, critic: 0, generate: 0, semantic: 0, resource: 0, selectIntents: 0 };
}

// ---------------------------------------------------------------------------
// Tests (async — the live serving path is async by design)
// ---------------------------------------------------------------------------

interface AsyncTest {
  id: number;
  name: string;
  run: (t: T) => Promise<void>;
}

const ADMIN = {
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

async function driveLiveToReady(stats: FakeStats, opts: Parameters<typeof fakeAdapters>[1] = {}) {
  const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats, opts) });
  const login = await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null);
  const sid = (login.body['session'] as { session_id: string }).session_id;
  const api = (method: string, path: string, body: unknown) => handleApiRequestLive(service, bridge, method, path, body, sid);
  const created = await api('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] });
  const rid = (created.body['report'] as { report_id: string }).report_id;
  const v = (): number => service.engine.getVersion(rid);
  await api('POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN });
  await api('POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } });
  await api('POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: `ready-${rid}` });
  const facts = service.engine.inspect(rid).facts;
  await api('POST', `/api/reports/${rid}/confirm-facts`, {
    version: v(),
    request: {
      ledger_hash_shown: service.engine.currentLedgerHash(rid),
      displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
      decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' })),
      started_at: '2026-06-01T22:00:00Z',
      submitted_at: '2026-06-01T22:30:00Z',
    },
  });
  await api('POST', `/api/reports/${rid}/acknowledge-quality`, { version: v() });
  await api('POST', `/api/reports/${rid}/evaluate`, { version: v() });
  return { service, bridge, sid, api, rid, v };
}

const tests: AsyncTest[] = [
  {
    id: 1,
    name: 'Live serving path: mailbox pre-fetch feeds the engine on analyze',
    async run(t) {
      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats) });
      const sid = (await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null)).body['session'] as { session_id: string };
      const created = await handleApiRequestLive(service, bridge, 'POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] }, sid.session_id);
      const rid = (created.body['report'] as { report_id: string }).report_id;
      const v = (): number => service.engine.getVersion(rid);
      await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN }, sid.session_id);
      await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } }, sid.session_id);
      const analyze = await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-1' }, sid.session_id);
      t.equal(analyze.status, 200, 'live analyze succeeds');
      t.equal(stats.extract, 1, 'live extractor called exactly once');
      t.equal(stats.critic, 1, 'live critic called exactly once');
      const insp = service.engine.inspect(rid);
      t.equal(insp.factCount, 9, 'live-shaped facts ingested through the engine');
      t.equal(insp.orderEvents.length, 1, 'live-shaped order ingested');
      t.check(insp.facts.every((f) => f.confirmation_status === 'unconfirmed'), 'nothing auto-confirmed');
      // Versions recorded for the snapshot path are the frozen LIVE versions.
      t.check(service.engine.policy.model_prompt_versions['extractor'].includes('claude-sonnet-4-6'), 'frozen live model versions configured');
    },
  },
  {
    id: 2,
    name: 'Malformed live output after retries raises SYSTEM HOLD (fail closed)',
    async run(t) {
      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats, { failExtract: true }) });
      const sid = ((await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null)).body['session'] as { session_id: string }).session_id;
      const created = await handleApiRequestLive(service, bridge, 'POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] }, sid);
      const rid = (created.body['report'] as { report_id: string }).report_id;
      const v = (): number => service.engine.getVersion(rid);
      await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN }, sid);
      await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } }, sid);
      const analyze = await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-2' }, sid);
      t.equal(analyze.status, 409, 'malformed live output returns 409');
      t.equal(String(analyze.body['code']), 'SYSTEM_HOLD', 'code is SYSTEM_HOLD');
      t.equal(service.engine.getDisplayStatus(rid), 'SYSTEM HOLD', 'report is in SYSTEM HOLD');
      const gates = service.engine.getGates(rid);
      t.check(gates.system_gate.reasons.some((r) => r.includes('malformed output after 3 attempts')), 'hold reason names the malformed live output');
      // Fail closed, not fallback: the deterministic stub was never consulted
      // (the notes were committed but no facts were ingested).
      t.equal(service.engine.inspect(rid).factCount, 0, 'no facts ingested from a fallback');
    },
  },
  {
    id: 3,
    name: 'Full live-path E2E to FINALIZED with live-shaped output',
    async run(t) {
      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats) });
      const sid = ((await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null)).body['session'] as { session_id: string }).session_id;
      const api = (method: string, path: string, body: unknown) => handleApiRequestLive(service, bridge, method, path, body, sid);
      const created = await api('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] });
      const rid = ((created.body['report'] as { report_id: string })).report_id;
      const v = (): number => service.engine.getVersion(rid);
      await api('POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN });
      await api('POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } });
      await api('POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-3' });
      const facts = service.engine.inspect(rid).facts;
      await api('POST', `/api/reports/${rid}/confirm-facts`, {
        version: v(),
        request: {
          ledger_hash_shown: service.engine.currentLedgerHash(rid),
          displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
          decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' })),
          started_at: '2026-06-01T22:00:00Z',
          submitted_at: '2026-06-01T22:30:00Z',
        },
      });
      await api('POST', `/api/reports/${rid}/acknowledge-quality`, { version: v() });
      const evaln = await api('POST', `/api/reports/${rid}/evaluate`, { version: v() });
      t.equal((evaln.body['evaluation'] as { outcome: string }).outcome, 'READY_FOR_GENERATION', 'ready after confirmation');
      const draft = await api('POST', `/api/reports/${rid}/draft`, { version: v() });
      t.equal(draft.status, 200, 'live draft succeeds');
      t.equal((draft.body['validation'] as { passed: boolean }).passed, true, 'both validators pass');
      t.equal(stats.generate, 1, 'live generator called once');
      t.equal(stats.semantic, 1, 'live semantic validator called once');
      const insp = service.engine.inspect(rid);
      t.check(insp.narrative!.sentences.some((sentence) => sentence.section === 'scene_context'), 'generator receives confirmed context beyond charge-required categories');
      await api('POST', `/api/reports/${rid}/certify`, {
        version: v(),
        request: {
          report_version: v(),
          fact_snapshot_hash: hashValue(insp.snapshot),
          narrative_hash: insp.narrative!.narrative_hash,
          deterministic_validation_id: insp.deterministicValidation!.validation_id,
          semantic_validation_id: insp.semanticValidation!.validation_id,
        },
      });
      await api('POST', `/api/reports/${rid}/finalize-audit`, { version: v() });
      const tok = await api('POST', `/api/reports/${rid}/token`, { channel: 'copy' });
      const out = await api('POST', '/api/output', { token_id: ((tok.body['token'] as { token_id: string })).token_id, channel: 'copy' });
      t.equal(out.status, 200, 'output authorized');
      t.equal(service.engine.getLifecycle(rid), 'FINALIZED', 'FINALIZED through the live serving path');
      // Snapshot recorded the frozen live versions (Stage 16 / §12).
      t.check(insp.snapshot!.model_prompt_versions['extractor'] === 'claude-sonnet-4-6:extract-prompt-v2', 'snapshot records frozen extractor version');
      // Live edit -> live re-sourcing through the serving path.
      const sentence = service.engine.inspect(rid).narrative!.sentences[0];
      void sentence;
    },
  },
  {
    id: 4,
    name: 'Live re-sourcing path: edited sentence goes through the live resourcer',
    async run(t) {
      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats) });
      const sid = ((await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null)).body['session'] as { session_id: string }).session_id;
      const api = (method: string, path: string, body: unknown) => handleApiRequestLive(service, bridge, method, path, body, sid);
      const created = await api('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] });
      const rid = ((created.body['report'] as { report_id: string })).report_id;
      const v = (): number => service.engine.getVersion(rid);
      await api('POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN });
      await api('POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } });
      await api('POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-4' });
      const facts = service.engine.inspect(rid).facts;
      await api('POST', `/api/reports/${rid}/confirm-facts`, {
        version: v(),
        request: {
          ledger_hash_shown: service.engine.currentLedgerHash(rid),
          displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
          decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' })),
          started_at: '2026-06-01T22:00:00Z',
          submitted_at: '2026-06-01T22:30:00Z',
        },
      });
      await api('POST', `/api/reports/${rid}/acknowledge-quality`, { version: v() });
      await api('POST', `/api/reports/${rid}/evaluate`, { version: v() });
      await api('POST', `/api/reports/${rid}/draft`, { version: v() });
      const sentence = service.engine.inspect(rid).narrative!.sentences[0];
      const factValue = service.engine.inspect(rid).facts.find((f) => sentence.source_fact_ids.includes(f.fact_id))!.value;
      await api('POST', `/api/reports/${rid}/edit-sentence`, { version: v(), sentence_id: sentence.sentence_id, new_text: `Edited but still says: ${factValue}.` });
      const resourced = await api('POST', `/api/reports/${rid}/resource-sentence`, { version: v(), sentence_id: sentence.sentence_id });
      t.equal(resourced.status, 200, 're-sourcing succeeds');
      t.equal((resourced.body['result'] as { outcome: string }).outcome, 'sourced', 'edited sentence re-sourced to existing facts');
      t.equal(stats.resource, 1, 'live resourcer called once');
      const revalidated = await api('POST', `/api/reports/${rid}/validate`, { version: v() });
      t.equal((revalidated.body['validation'] as { passed: boolean }).passed, true, 'revalidation passes after live re-sourcing');
      t.equal(stats.semantic, 2, 'semantic validator ran again for the revalidation');
    },
  },
  {
    id: 5,
    name: 'Stub mode stays the default: sync handler never touches live adapters',
    async run(t) {
      const stats = newStats();
      // Live app exists, but requests through the SYNC handler (stub path)
      // must not consume the mailbox or call adapters. This guards the
      // AI_MODE separation: mode is server config, not per-request.
      const { service } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats) });
      const sid = (handleApiRequest(service, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null).body['session'] as { session_id: string }).session_id;
      const created = handleApiRequest(service, 'POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] }, sid);
      const rid = ((created.body['report'] as { report_id: string })).report_id;
      const v = (): number => service.engine.getVersion(rid);
      handleApiRequest(service, 'POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN }, sid);
      handleApiRequest(service, 'POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } }, sid);
      // The mailbox was never pre-fetched: the engine fails closed instead of
      // silently extracting with a fake.
      const analyze = handleApiRequest(service, 'POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-5' }, sid);
      t.equal(analyze.status, 500, 'sync analyze on a live engine fails closed (empty mailbox)');
      t.check(String(analyze.body['error']).includes('Mailbox slot'), 'error names the empty mailbox slot');
      t.equal(stats.extract, 0, 'live adapters never called through the sync handler');
    },
  },
  {
    id: 6,
    name: 'Shadow harness: batch through the real serving path, report format',
    async run(t) {
      const stats = newStats();
      const outPath = join(tempDir(), 'shadow-report.json');
      const report: ShadowRunReport = await runShadowBatch({
        cases: [B1, D1, I1],
        adapters: fakeAdapters(stats),
        dir: tempDir(),
        outPath,
      });
      t.equal(report.mode, 'injected-adapters', 'report labels the injected-adapter mode');
      t.equal(report.gold_case_count, 3, 'three cases in the batch');
      t.check(report.model_prompt_versions['extractor'] === 'claude-sonnet-4-6:extract-prompt-v2', 'frozen versions recorded in the run log');

      const b1 = report.cases.find((c) => c.id === 'B1')!;
      t.equal(b1.stage_reached, 'FINALIZED', 'complete incident runs end to end to FINALIZED');
      t.equal(b1.discrepancies.length, 0, 'B1 is clean');
      t.check(
        b1.ai_outputs.extraction !== null &&
          b1.ai_outputs.critic !== null &&
          b1.ai_outputs.intent_selection !== null &&
          b1.ai_outputs.narrative !== null &&
          b1.ai_outputs.semantic !== null &&
          b1.ai_outputs.resourcing !== null,
        'every AI output type logged for the E2E case'
      );
      t.check(b1.ai_events.filter((event) => event.kind === 'semantic').length === 2, 'chronological log retains both semantic validations');
      t.equal(b1.deterministic_expectations.gold_score.criticals.length, 0, 'gold scoring ran with zero criticals');

      const d1 = report.cases.find((c) => c.id === 'D1')!;
      t.check(d1.stage_reached.length > 0 && d1.stage_reached !== 'FINALIZED', 'CANNOT_DETERMINE case stops before finalization');
      t.equal(d1.discrepancies.length, 0, 'D1 stop is expected, not a discrepancy');

      const i1 = report.cases.find((c) => c.id === 'I1')!;
      t.check(i1.gates_on_hold.some((g) => g.name === 'procedural_gate'), 'injection case shows the procedural gate on hold');
      t.equal(i1.discrepancies.length, 0, 'flagged injection is handled, not a discrepancy');

      t.equal(report.clean, true, 'run is clean');
      t.equal(report.finalized_count, 1, 'exactly one case finalized');
      const onDisk = JSON.parse(readFileSync(outPath, 'utf8')) as ShadowRunReport;
      t.equal(onDisk.cases.length, 3, 'report written to disk');

      const stopped = await runShadowBatch({
        cases: [B1],
        adapters: fakeAdapters(newStats(), { failExtract: true }),
        dir: tempDir(),
        outPath: null,
      });
      t.equal(stopped.clean, false, 'an unexpected serving-path stop cannot be labeled clean');
      t.check(stopped.cases[0].discrepancies.some((item) => item.includes('unexpected serving-path stop')), 'stop reason is recorded as a discrepancy');
    },
  },
  {
    id: 7,
    name: 'AI mode and stale-request preflight fail closed before model calls',
    async run(t) {
      t.equal(resolveAiMode(undefined, []), 'stub', 'stub is the default mode');
      t.equal(resolveAiMode('live', []), 'live', 'AI_MODE=live selects live mode');
      t.equal(resolveAiMode('live', ['node', 'appServer.ts', '--ai=stub']), 'stub', 'explicit server argument selects stub mode');
      let invalidRejected = false;
      try {
        resolveAiMode('unexpected', []);
      } catch {
        invalidRejected = true;
      }
      t.check(invalidRejected, 'unknown AI_MODE is rejected instead of silently using stubs');

      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats) });
      const login = await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null);
      const sid = (login.body['session'] as { session_id: string }).session_id;
      const created = await handleApiRequestLive(service, bridge, 'POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] }, sid);
      const rid = (created.body['report'] as { report_id: string }).report_id;
      const staleVersion = service.engine.getVersion(rid);
      await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/admin`, { version: staleVersion, admin: ADMIN }, sid);
      const stale = await handleApiRequestLive(service, bridge, 'POST', `/api/reports/${rid}/generate`, { version: staleVersion }, sid);
      t.equal(stale.status, 409, 'stale live request is rejected');
      t.equal(String(stale.body['code']), 'STALE_WRITE', 'stale request retains the concurrency error');
      t.equal(stats.generate, 0, 'generator is not called before stale-version rejection');
    },
  },
  {
    id: 8,
    name: 'Malformed live question selection raises SYSTEM HOLD without fallback',
    async run(t) {
      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats, { failSelect: true }) });
      const login = await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null);
      const sid = (login.body['session'] as { session_id: string }).session_id;
      const api = (method: string, path: string, body: unknown) => handleApiRequestLive(service, bridge, method, path, body, sid);
      const created = await api('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] });
      const rid = (created.body['report'] as { report_id: string }).report_id;
      const v = (): number => service.engine.getVersion(rid);
      await api('POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN });
      await api('POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } });
      await api('POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-8' });
      const clarify = await api('POST', `/api/reports/${rid}/clarify`, { version: v() });
      t.equal(stats.selectIntents, 1, 'live selector was called');
      t.equal(clarify.status, 409, 'malformed selector output rejects the request');
      t.equal(String(clarify.body['code']), 'SYSTEM_HOLD', 'malformed selector uses SYSTEM_HOLD');
      t.equal(service.engine.getDisplayStatus(rid), 'SYSTEM HOLD', 'no deterministic fallback bypasses the hold');
    },
  },
  {
    id: 9,
    name: 'Live regeneration uses the engine two-attempt bound',
    async run(t) {
      const stats = newStats();
      const world = await driveLiveToReady(stats, { semanticPass: false });
      const draft = await world.api('POST', `/api/reports/${world.rid}/draft`, { version: world.v() });
      t.equal((draft.body['validation'] as { passed: boolean }).passed, false, 'seeded semantic failure creates VALIDATION HOLD');
      const first = await world.api('POST', `/api/reports/${world.rid}/regenerate`, { version: world.v() });
      const second = await world.api('POST', `/api/reports/${world.rid}/regenerate`, { version: world.v() });
      t.equal(first.status, 200, 'first live regeneration attempt runs');
      t.equal(second.status, 200, 'second live regeneration attempt runs');
      const callsBeforeThird = { generate: stats.generate, semantic: stats.semantic };
      const third = await world.api('POST', `/api/reports/${world.rid}/regenerate`, { version: world.v() });
      t.equal(third.status, 422, 'third regeneration is rejected');
      t.equal(String(third.body['code']), 'RETRY_LIMIT', 'engine retry limit is retained');
      t.equal(stats.generate, callsBeforeThird.generate, 'third attempt does not call the live generator');
      t.equal(stats.semantic, callsBeforeThird.semantic, 'third attempt does not call the live semantic validator');
    },
  },
  {
    id: 10,
    name: 'Live provider failures raise SYSTEM HOLD instead of returning an open report',
    async run(t) {
      const stats = newStats();
      const { service, bridge } = createLiveApp({ dir: tempDir(), adapters: fakeAdapters(stats, { providerError: true }) });
      const login = await handleApiRequestLive(service, bridge, 'POST', '/api/login', { username: 'officer.alex', password: 'synthetic-pw-1' }, null);
      const sid = (login.body['session'] as { session_id: string }).session_id;
      const api = (method: string, path: string, body: unknown) => handleApiRequestLive(service, bridge, method, path, body, sid);
      const created = await api('POST', '/api/reports', { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] });
      const rid = (created.body['report'] as { report_id: string }).report_id;
      const v = (): number => service.engine.getVersion(rid);
      await api('POST', `/api/reports/${rid}/admin`, { version: v(), admin: ADMIN });
      await api('POST', `/api/reports/${rid}/screen`, { version: v(), answers: { force_used: 'no', medical_involvement: 'no' } });
      const analyze = await api('POST', `/api/reports/${rid}/analyze`, { version: v(), text: B1.notes, request_id: 'p9-10' });
      t.equal(analyze.status, 409, 'provider failure is returned as a hold');
      t.equal(String(analyze.body['code']), 'SYSTEM_HOLD', 'provider failure uses SYSTEM_HOLD');
      t.equal(service.engine.getDisplayStatus(rid), 'SYSTEM HOLD', 'report remains held after the failed call');
      t.check(service.engine.getGates(rid).system_gate.reasons.some((reason) => reason.includes('provider unavailable')), 'provider error is retained in the hold reason');
    },
  },
];

// ---------------------------------------------------------------------------
// Async runner (same reporting shape as the shared harness)
// ---------------------------------------------------------------------------

console.log('LOCKUPHQ DR Writer — Phase 9 prep: live serving path + shadow harness tests');
console.log('=============================================================================\n');

let passed = 0;
let totalChecks = 0;
for (const test of tests) {
  const t = new T();
  try {
    await test.run(t);
  } catch (err) {
    t.failures.push(`unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }
  if (t.checksRun === 0) t.failures.push('test ran zero assertions — treated as failure');
  totalChecks += t.checksRun;
  const ok = t.failures.length === 0;
  if (ok) passed += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  P9-${test.id}. ${test.name}  (${t.checksRun} assertions)`);
  for (const f of t.failures) console.log(`          - ${f}`);
}

for (const dir of cleanupDirs) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

console.log('\n=============================================================================');
console.log(`  Result: ${passed} / ${tests.length} tests passed  (${totalChecks} assertions total)`);
console.log('=============================================================================');

process.exit(passed === tests.length ? 0 : 1);
