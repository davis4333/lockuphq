// LOCKUPHQ DR Writer — Phase 7 tests: persistence and security integration
// (blueprint §18 Phase 7; §9 concurrency/sessions/recovery; §12 security;
// Stages 22-24). All data synthetic. No network, no real AI.
//
// Usage: node --experimental-strip-types src/dr-writer/engine/tests/phase7Security.ts

import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTests, T } from './harness.ts';
import type { Section14Test } from './harness.ts';
import { SecureService, REVIEW_DRAFT_WATERMARK } from '../service/secureService.ts';
import type { BootConfig } from '../service/secureService.ts';
import { AuthError } from '../service/authService.ts';
import { StoreIntegrityError } from '../service/store.ts';
import { SYNTHETIC_PACKET_6_1, SYNTHETIC_POLICY_PROFILE } from '../packets.ts';
import { goodRegistries, GOOD_NOTES, adminIntake, addStandardPersons } from './fixtures.ts';
import { hashValue } from '../hash.ts';
import type { AuditEventType, OutputChannel } from '../types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cleanupDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lockuphq-p7-'));
  cleanupDirs.push(dir);
  return dir;
}

interface World {
  dir: string;
  service: SecureService;
  now: { value: Date };
  reboot(): SecureService;
}

const SEED_USERS: NonNullable<BootConfig['seedUsers']> = [
  { username: 'officer.alex', password: 'synthetic-pw-1', role: 'officer', display_name: 'Ofc. Alex Officer', person_id: 'P-OFF' },
  { username: 'officer.riley', password: 'synthetic-pw-2', role: 'officer', display_name: 'Ofc. Riley Second' },
  { username: 'sup.morgan', password: 'synthetic-pw-3', role: 'supervisor', display_name: 'Lt. Morgan Supervisor' },
  { username: 'admin.sys', password: 'synthetic-pw-4', role: 'system_admin', display_name: 'System Admin' },
  { username: 'audit.reader', password: 'synthetic-pw-5', role: 'audit_reader', display_name: 'Audit Reader' },
];

function makeWorld(opts: { dir?: string } = {}): World {
  const dir = opts.dir ?? tempDir();
  const now = { value: new Date('2026-06-01T20:00:00Z') };
  const boot = (): SecureService => {
    const { requirements, sources } = goodRegistries();
    return SecureService.boot({
      dir,
      engine: {
        requirements,
        sources,
        packet: SYNTHETIC_PACKET_6_1,
        policy: SYNTHETIC_POLICY_PROFILE,
        deployment_check_date: '2026-06-01',
        clock: () => now.value,
      },
      auth: { clock: () => now.value },
      seedUsers: SEED_USERS,
    });
  };
  const world: World = { dir, service: boot(), now, reboot: () => (world.service = boot()) };
  // A fresh engine has no persons; a rebooted one restores them from state.
  if (world.service.engine.persons.all().length === 0) {
    addStandardPersons(world.service.engine);
  }
  return world;
}

function login(world: World, username: string, password?: string): string {
  const pw = password ?? SEED_USERS.find((u) => u.username === username)!.password;
  return world.service.login(username, pw).session_id;
}

// Drives a report through the synthetic happy path via the SERVICE layer only.
type ServiceStage =
  | 'created' | 'admin' | 'screen' | 'notes' | 'extracted' | 'critic' | 'order_selected'
  | 'evaluated' | 'confirmed' | 'ready' | 'snapshot' | 'generated' | 'validated'
  | 'certified' | 'audit_finalized';

const SERVICE_STAGES: ServiceStage[] = [
  'created', 'admin', 'screen', 'notes', 'extracted', 'critic', 'order_selected',
  'evaluated', 'confirmed', 'ready', 'snapshot', 'generated', 'validated',
  'certified', 'audit_finalized',
];

function driveService(world: World, sessionId: string, target: ServiceStage, opts: { notes?: string } = {}): string {
  const s = world.service;
  const { report_id } = s.createReport(sessionId, { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1', participants: ['P-OFF'] });
  const rid = report_id;
  const v = (): number => s.engine.getVersion(rid);
  const targetIdx = SERVICE_STAGES.indexOf(target);
  const step = (stage: ServiceStage, fn: () => void): void => {
    if (SERVICE_STAGES.indexOf(stage) <= targetIdx) fn();
  };

  step('admin', () => s.setAdminIntake(sessionId, rid, v(), adminIntake()));
  step('screen', () => s.submitProceduralScreen(sessionId, rid, v(), { force_used: 'no', medical_involvement: 'no' }));
  step('notes', () => s.commitNotes(sessionId, rid, v(), { text: opts.notes ?? GOOD_NOTES, request_id: `req-${rid}` }));
  step('extracted', () => s.runExtraction(sessionId, rid, v()));
  step('critic', () => s.runCritic(sessionId, rid, v()));
  step('order_selected', () => {
    const order = s.engine.inspect(rid).orderEvents[0];
    s.selectOrder(sessionId, rid, v(), order.order_event_id);
  });
  step('evaluated', () => s.evaluateCharge(sessionId, rid, v()));
  step('confirmed', () => {
    const facts = s.engine.inspect(rid).facts.filter((f) => f.extraction_status !== 'superseded');
    s.confirmFacts(sessionId, rid, v(), {
      ledger_hash_shown: s.engine.currentLedgerHash(rid),
      displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
      decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
      started_at: '2026-06-01T22:00:00Z',
      submitted_at: '2026-06-01T22:05:00Z',
    });
  });
  step('ready', () => {
    s.acknowledgeQualityWarnings(sessionId, rid, v());
    const evaln = s.evaluateCharge(sessionId, rid, v());
    if (evaln.outcome !== 'READY_FOR_GENERATION') throw new Error(`driver: expected READY_FOR_GENERATION, got ${evaln.outcome}: ${evaln.reasons.join('; ')}`);
  });
  step('snapshot', () => s.createSnapshot(sessionId, rid, v()));
  step('generated', () => s.generateNarrative(sessionId, rid, v()));
  step('validated', () => {
    const result = s.validateNarrative(sessionId, rid, v());
    if (!result.passed) throw new Error(`driver: validation failed: ${result.issues.map((i) => i.message).join('; ')}`);
  });
  step('certified', () => {
    const insp = s.engine.inspect(rid);
    s.certify(sessionId, rid, v(), {
      report_version: v(),
      fact_snapshot_hash: hashValue(insp.snapshot),
      narrative_hash: insp.narrative!.narrative_hash,
      deterministic_validation_id: insp.deterministicValidation!.validation_id,
      semantic_validation_id: insp.semanticValidation!.validation_id,
    });
  });
  step('audit_finalized', () => s.commitAuditFinalization(sessionId, rid, v()));
  return rid;
}

function throwsAuth(t: T, fn: () => unknown, code: AuthError['code'], label: string): void {
  t.checksRun += 1;
  try {
    fn();
  } catch (err) {
    if (err instanceof AuthError && err.code === code) return;
    t.failures.push(`${label}: threw ${err instanceof Error ? err.message : String(err)} instead of AuthError [${code}]`);
    return;
  }
  t.failures.push(`${label}: expected AuthError [${code}], but no error was thrown`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const tests: Section14Test[] = [
  {
    id: 1,
    name: 'Authentication: credential checks, logout, no username probing',
    run(t) {
      const world = makeWorld();
      throwsAuth(t, () => world.service.login('officer.alex', 'wrong-password'), 'BAD_CREDENTIALS', 'wrong password rejected');
      throwsAuth(t, () => world.service.login('no.such.user', 'whatever-pw'), 'BAD_CREDENTIALS', 'unknown user rejected with the same error');
      const sess = login(world, 'officer.alex');
      const who = world.service.whoAmI(sess);
      t.equal(who.role, 'officer', 'logged-in role');
      t.equal(who.display_name, 'Ofc. Alex Officer', 'display name');
      world.service.logout(sess);
      throwsAuth(t, () => world.service.whoAmI(sess), 'AUTH_REQUIRED', 'session invalid after logout');
      throwsAuth(t, () => world.service.whoAmI('sess-forged'), 'AUTH_REQUIRED', 'forged session id rejected');
      throwsAuth(t, () => world.service.listMyReports(''), 'AUTH_REQUIRED', 'empty session id rejected');
    },
  },
  {
    id: 2,
    name: 'Session expiry and lock: idle lock, unlock with password, absolute expiry',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      t.equal(world.service.whoAmI(sess).user_id !== '', true, 'session works initially');

      // Idle past 30 minutes -> screen locks automatically.
      world.now.value = new Date(world.now.value.getTime() + 31 * 60_000);
      throwsAuth(t, () => world.service.whoAmI(sess), 'SESSION_LOCKED', 'idle session locks the screen');
      throwsAuth(t, () => world.service.unlockScreen(sess, 'wrong-pw'), 'BAD_CREDENTIALS', 'wrong unlock password rejected');
      world.service.unlockScreen(sess, 'synthetic-pw-1');
      t.equal(world.service.whoAmI(sess).role, 'officer', 'unlocked session works again');

      // Explicit lock also blocks use.
      world.service.lockScreen(sess);
      throwsAuth(t, () => world.service.whoAmI(sess), 'SESSION_LOCKED', 'explicitly locked session blocked');
      world.service.unlockScreen(sess, 'synthetic-pw-1');

      // Absolute expiry ends the session even if recently active.
      world.now.value = new Date(world.now.value.getTime() + 13 * 3_600_000);
      throwsAuth(t, () => world.service.whoAmI(sess), 'SESSION_EXPIRED', 'absolute expiry ends the session');
      // The expiry above already revoked the session, so unlock now reports it
      // as invalid outright — either way the session is unusable (fail closed).
      throwsAuth(t, () => world.service.unlockScreen(sess, 'synthetic-pw-1'), 'AUTH_REQUIRED', 'expired session cannot be unlocked');
    },
  },
  {
    id: 3,
    name: 'Role authorization: workflow, policy resolution, audit, kill switch',
    run(t) {
      const world = makeWorld();
      const officer = login(world, 'officer.alex');
      const supervisor = login(world, 'sup.morgan');
      const auditor = login(world, 'audit.reader');
      const admin = login(world, 'admin.sys');

      const rid = driveService(world, officer, 'evaluated');
      const v = (): number => world.service.engine.getVersion(rid);

      throwsAuth(t, () => world.service.createReport(supervisor, { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1' }), 'FORBIDDEN', 'supervisor cannot author a report');
      throwsAuth(t, () => world.service.createReport(auditor, { institution_id: 'INST-1', subject_person_id: 'P-INM', charge_code: '6-1' }), 'FORBIDDEN', 'audit reader cannot author a report');
      throwsAuth(t, () => world.service.resolvePolicyReview(officer, rid, v(), { category: 'force_used', resolution: 'reviewed' }), 'FORBIDDEN', 'officer cannot resolve policy review');
      // The supervisor must take the session lock explicitly (audited) first.
      world.service.claimReport(supervisor, rid);
      world.service.resolvePolicyReview(supervisor, rid, v(), { category: 'force_used', resolution: 'reviewed under synthetic policy' });
      t.check(true, 'supervisor can resolve policy review');

      throwsAuth(t, () => world.service.readAudit(officer, rid), 'FORBIDDEN', 'officer cannot read the audit trail');
      t.check(world.service.readAudit(auditor, rid).length > 0, 'audit reader can read the audit trail');
      t.check(world.service.readAudit(admin, rid).length > 0, 'system admin can read the audit trail');

      throwsAuth(t, () => world.service.engageKillSwitch(officer, 'test'), 'FORBIDDEN', 'officer cannot engage the kill switch');
      world.service.engageKillSwitch(admin, 'synthetic drill');
      t.equal(world.service.engine.isKillSwitchEngaged(), true, 'system admin can engage the kill switch');
      world.service.releaseKillSwitch(admin);
      t.equal(world.service.engine.isKillSwitchEngaged(), false, 'system admin can release the kill switch');
    },
  },
  {
    id: 4,
    name: 'Cross-user isolation: another officer cannot see or touch the report',
    run(t) {
      const world = makeWorld();
      const alex = login(world, 'officer.alex');
      const riley = login(world, 'officer.riley');
      const rid = driveService(world, alex, 'notes');
      const v = world.service.engine.getVersion(rid);

      throwsAuth(t, () => world.service.getReportView(riley, rid), 'FORBIDDEN', 'other officer cannot view the report');
      throwsAuth(t, () => world.service.runExtraction(riley, rid, v), 'FORBIDDEN', 'other officer cannot mutate the report');
      throwsAuth(t, () => world.service.issueOutputToken(riley, rid, 'print'), 'FORBIDDEN', 'other officer cannot request output');
      t.equal(world.service.listMyReports(riley).length, 0, 'other officer sees no foreign reports in the list');
      t.equal(world.service.listMyReports(alex).length, 1, 'owner sees the report');
      const supervisor = login(world, 'sup.morgan');
      t.equal(world.service.listMyReports(supervisor).length, 1, 'supervisor sees all reports');
      t.check(world.service.getReportView(supervisor, rid).meta.report_id === rid, 'supervisor can view the report');
    },
  },
  {
    id: 5,
    name: 'Session-lock claim and transfer are explicit and audited',
    run(t) {
      const world = makeWorld();
      const alex1 = login(world, 'officer.alex');
      const rid = driveService(world, alex1, 'notes');

      // A second login by the same officer cannot silently take the lock while
      // the first session is alive.
      const alex2 = login(world, 'officer.alex');
      throwsAuth(t, () => world.service.claimReport(alex2, rid), 'FORBIDDEN', 'claim denied while the holding session is alive');

      // After the holding session dies, the owner may reclaim explicitly.
      world.service.logout(alex1);
      world.service.claimReport(alex2, rid);
      const meta = world.service.engine.getWorkspaceMeta(rid);
      t.equal(meta.session_id, alex2, 'lock now held by the new session');
      const transfers = world.service.engine.auditEvents(rid).filter((e) => e.event_type === 'session_lock_transferred');
      t.check(transfers.length >= 1, 'session_lock_transferred audit event recorded');

      // Supervisor may transfer any report lock to the current session.
      const supervisor = login(world, 'sup.morgan');
      world.service.claimReport(supervisor, rid);
      t.equal(world.service.engine.getWorkspaceMeta(rid).session_id, supervisor, 'supervisor transfer succeeds');

      // A stale session that lost the lock is rejected by the engine lock.
      const v = world.service.engine.getVersion(rid);
      t.throws(() => world.service.runExtraction(alex2, rid, v), 'SESSION_LOCK', 'old session is locked out after transfer');
    },
  },
  {
    id: 6,
    name: 'Idempotency: a retried committed request returns the original result',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'screen');
      const v = world.service.engine.getVersion(rid);
      world.service.commitNotes(sess, rid, v, { text: GOOD_NOTES, request_id: 'req-retry-1' });
      const afterFirst = world.service.engine.getVersion(rid);
      // Client saw a network failure and retries the SAME request (same
      // expected version, same request id). Must be a no-op, not STALE_WRITE.
      world.service.commitNotes(sess, rid, v, { text: GOOD_NOTES, request_id: 'req-retry-1' });
      t.equal(world.service.engine.getVersion(rid), afterFirst, 'retry did not create a second commit');
      const noteCommits = world.service.engine.auditEvents(rid).filter((e) => e.event_type === 'original_notes_committed');
      t.equal(noteCommits.length, 1, 'exactly one original_notes_committed audit event');
      // A DIFFERENT request at the stale version is still rejected.
      t.throws(
        () => world.service.commitNotes(sess, rid, v, { text: GOOD_NOTES, request_id: 'req-retry-2' }),
        'STALE_WRITE',
        'different request at a stale version is rejected'
      );
    },
  },
  {
    id: 7,
    name: 'Crash recovery: reboot resumes from the last completed commit',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'confirmed');
      const versionBefore = world.service.engine.getVersion(rid);
      const factsBefore = world.service.engine.inspect(rid).factCount;

      // Simulate a crash: drop the in-memory service, plus an orphan tmp file
      // from a torn atomic write. Boot a fresh service from the same dir.
      writeFileSync(join(world.dir, 'state.json.tmp'), '{"partial": tr', 'utf8');
      world.reboot();

      t.equal(world.service.engine.getVersion(rid), versionBefore, 'report version survives the crash');
      t.equal(world.service.engine.inspect(rid).factCount, factsBefore, 'facts survive the crash');
      t.equal(world.service.engine.persons.all().length > 0, true, 'person registry survives the crash');

      // Sessions do NOT survive a restart (fail closed) — sign in again,
      // reclaim the lock explicitly, and continue to completion.
      throwsAuth(t, () => world.service.getReportView(sess, rid), 'AUTH_REQUIRED', 'old session is dead after reboot');
      const sess2 = login(world, 'officer.alex');
      world.service.claimReport(sess2, rid);
      const v = (): number => world.service.engine.getVersion(rid);
      world.service.acknowledgeQualityWarnings(sess2, rid, v());
      const evaln = world.service.evaluateCharge(sess2, rid, v());
      t.equal(evaln.outcome, 'READY_FOR_GENERATION', 'workflow continues after recovery');
      world.service.createSnapshot(sess2, rid, v());
      world.service.generateNarrative(sess2, rid, v());
      t.equal(world.service.validateNarrative(sess2, rid, v()).passed, true, 'validation passes after recovery');
    },
  },
  {
    id: 8,
    name: 'Torn audit tail is healed from state without losing events',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      driveService(world, sess, 'extracted');
      const eventsBefore = world.service.engine.auditEvents().length;

      // Crash mid-append: a torn, non-JSON final line.
      appendFileSync(join(world.dir, 'audit.log'), '{"event":{"audit_seq":999,"ev', 'utf8');
      world.reboot();

      t.equal(world.service.engine.auditEvents().length, eventsBefore, 'no audit events lost');
      const raw = readFileSync(join(world.dir, 'audit.log'), 'utf8').trim().split('\n');
      t.equal(raw.length, eventsBefore, 'audit file healed to exactly the committed events');
      t.check(raw.every((line) => { try { JSON.parse(line); return true; } catch { return false; } }), 'every healed line is valid JSON');
    },
  },
  {
    id: 9,
    name: 'Audit trail is tamper-evident: rewrites and insertions refuse to boot',
    run(t) {
      // Tampering with a middle line breaks the hash chain.
      const world1 = makeWorld();
      const sess1 = login(world1, 'officer.alex');
      driveService(world1, sess1, 'extracted');
      const auditPath1 = join(world1.dir, 'audit.log');
      const lines1 = readFileSync(auditPath1, 'utf8').trim().split('\n');
      const doctored = JSON.parse(lines1[1]) as { event: { actor_user_id: string | null } };
      doctored.event.actor_user_id = 'someone-else';
      lines1[1] = JSON.stringify(doctored);
      writeFileSync(auditPath1, lines1.join('\n') + '\n', 'utf8');
      t.checksRun += 1;
      try {
        world1.reboot();
        t.failures.push('boot succeeded on a tampered audit line');
      } catch (err) {
        if (!(err instanceof StoreIntegrityError)) t.failures.push(`expected StoreIntegrityError, got ${String(err)}`);
      }

      // Deleting a line also breaks the chain.
      const world2 = makeWorld();
      const sess2 = login(world2, 'officer.alex');
      driveService(world2, sess2, 'extracted');
      const auditPath2 = join(world2.dir, 'audit.log');
      const lines2 = readFileSync(auditPath2, 'utf8').trim().split('\n');
      lines2.splice(2, 1);
      writeFileSync(auditPath2, lines2.join('\n') + '\n', 'utf8');
      t.checksRun += 1;
      try {
        world2.reboot();
        t.failures.push('boot succeeded after an audit line was deleted');
      } catch (err) {
        if (!(err instanceof StoreIntegrityError)) t.failures.push(`expected StoreIntegrityError, got ${String(err)}`);
      }

      // An audit file AHEAD of state (forged extra committed events) refuses to boot.
      const world3 = makeWorld();
      const sess3 = login(world3, 'officer.alex');
      driveService(world3, sess3, 'notes');
      const statePath = join(world3.dir, 'state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as { auditLog: unknown[]; auditSeq: number };
      state.auditLog.pop();
      state.auditSeq -= 1;
      writeFileSync(statePath, JSON.stringify(state), 'utf8');
      t.checksRun += 1;
      try {
        world3.reboot();
        t.failures.push('boot succeeded with audit.log ahead of state.json');
      } catch (err) {
        if (!(err instanceof StoreIntegrityError)) t.failures.push(`expected StoreIntegrityError, got ${String(err)}`);
      }
    },
  },
  {
    id: 10,
    name: 'Append-only audit trail covers the full finalization path on disk',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'audit_finalized');
      world.service.getReviewDraft(sess, rid);
      const token = world.service.issueOutputToken(sess, rid, 'print');
      world.service.redeemOutput(sess, token.token_id, 'print');

      const raw = readFileSync(join(world.dir, 'audit.log'), 'utf8').trim().split('\n');
      const persisted = raw.map((line) => (JSON.parse(line) as { event: { event_type: AuditEventType; audit_seq: number } }).event);
      const types = new Set(persisted.map((e) => e.event_type));
      const expected: AuditEventType[] = [
        'workspace_created', 'session_locked', 'original_notes_committed', 'extraction_started',
        'extraction_completed', 'critic_completed', 'facts_confirmed', 'snapshot_created',
        'narrative_generated', 'validation_completed', 'certification_created',
        'audit_finalization_committed', 'review_draft_viewed', 'token_issued', 'token_redeemed', 'output_completed',
      ];
      for (const type of expected) {
        t.check(types.has(type), `persisted audit trail contains ${type}`);
      }
      const seqs = persisted.map((e) => e.audit_seq);
      t.check(seqs.every((seq, i) => i === 0 || seq > seqs[i - 1]), 'audit sequence numbers strictly increase on disk');
      // The on-disk trail matches the in-memory trail exactly.
      t.equal(persisted.length, world.service.engine.auditEvents().length, 'on-disk audit count matches engine');
    },
  },
  {
    id: 11,
    name: 'Real finalization tokens: unguessable, 5-minute expiry, single-use, session-bound',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'audit_finalized');

      const token = world.service.issueOutputToken(sess, rid, 'copy');
      t.check(/-[0-9a-f]{32}$/.test(token.token_id), 'token id ends in 32 hex chars of entropy');
      t.equal(Date.parse(token.expires_at) - Date.parse(token.issued_at), 300_000, 'token expires in exactly 5 minutes');

      // Expiry enforced by the injected clock.
      world.now.value = new Date(world.now.value.getTime() + 301_000);
      t.throws(() => world.service.redeemOutput(sess, token.token_id, 'copy'), 'TOKEN_REJECTED', 'expired token rejected');

      // Fresh token: single-use.
      const token2 = world.service.issueOutputToken(sess, rid, 'copy');
      const out = world.service.redeemOutput(sess, token2.token_id, 'copy');
      t.check(out.output.length > 0, 'redemption returns the final text');
      t.throws(() => world.service.redeemOutput(sess, token2.token_id, 'copy'), 'TOKEN_REJECTED', 'second redemption rejected (single-use)');

      // Session binding: token issued in one session cannot be redeemed in another.
      // (VOID the FINALIZED lifecycle is fine — issue a fresh report instead.)
      const rid2 = driveService(world, sess, 'audit_finalized');
      const token3 = world.service.issueOutputToken(sess, rid2, 'pdf');
      const sessB = login(world, 'officer.alex');
      t.throws(() => world.service.redeemOutput(sessB, token3.token_id, 'pdf'), 'TOKEN_REJECTED', 'token bound to the issuing session');
      // Channel binding.
      t.throws(() => world.service.redeemOutput(sess, token3.token_id, 'print'), 'TOKEN_REJECTED', 'token bound to its channel');
    },
  },
  {
    id: 12,
    name: 'Central output authorization: no path, including copy, bypasses tokens',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'audit_finalized');
      const insp = world.service.engine.inspect(rid);
      const finalText = insp.narrative!.sentences.map((s) => s.text).join(' ');

      // The workspace view exposes sentences for editing, but never the joined
      // final output text.
      const view = world.service.getReportView(sess, rid);
      t.check(!JSON.stringify(view).includes(finalText), 'workspace view does not contain the joined final text');

      // The review draft is watermarked at the boundaries and between sections.
      const draft = world.service.getReviewDraft(sess, rid);
      t.equal(draft.lines[0], REVIEW_DRAFT_WATERMARK, 'draft starts with the watermark');
      t.equal(draft.lines[draft.lines.length - 1], REVIEW_DRAFT_WATERMARK, 'draft ends with the watermark');
      t.check(draft.lines.filter((l) => l === REVIEW_DRAFT_WATERMARK).length > 2, 'watermark appears between sections');
      t.check(!draft.lines.join(' ').split(REVIEW_DRAFT_WATERMARK).some((chunk) => chunk.trim() === finalText), 'no unwatermarked contiguous final text in the draft');

      // Every v1 channel requires its own token — including copy.
      const channels: OutputChannel[] = ['copy', 'print', 'pdf'];
      for (const channel of channels) {
        t.throws(() => world.service.redeemOutput(sess, 'tok-forged-00000000000000000000000000000000', channel), 'TOKEN_REJECTED', `${channel} without a valid token rejected`);
      }
      const copyToken = world.service.issueOutputToken(sess, rid, 'copy');
      t.equal(world.service.redeemOutput(sess, copyToken.token_id, 'copy').output, finalText, 'copy returns final text only through token redemption');

      // Only redeemOutput returns final text: supervisor and audit-reader
      // read paths are draft/audit surfaces, never final output.
      const auditor = login(world, 'audit.reader');
      throwsAuth(t, () => world.service.issueOutputToken(auditor, rid, 'print'), 'FORBIDDEN', 'audit reader cannot request output tokens');
    },
  },
  {
    id: 13,
    name: 'Retention: idle drafts expire on sweep and at boot; expired reports reject work',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'notes');

      // 73 idle hours exceeds the 72-hour synthetic retention policy.
      world.now.value = new Date(world.now.value.getTime() + 73 * 3_600_000);
      const admin = login(world, 'admin.sys');
      const swept = world.service.sweepRetention(admin);
      t.check(swept.expired.includes(rid), 'sweep expires the idle draft');
      t.equal(world.service.engine.getLifecycle(rid), 'EXPIRED', 'lifecycle is EXPIRED');
      const sess2 = login(world, 'officer.alex');
      t.throws(
        () => world.service.commitNotes(sess2, rid, world.service.engine.getVersion(rid), { text: 'x', request_id: 'r' }),
        'LIFECYCLE',
        'expired report rejects mutation'
      );

      // Boot-time sweep: create a fresh draft, advance time, reboot.
      const rid2 = driveService(world, sess2, 'created');
      world.now.value = new Date(world.now.value.getTime() + 80 * 3_600_000);
      world.reboot();
      t.equal(world.service.engine.getLifecycle(rid2), 'EXPIRED', 'boot-time retention sweep expires idle drafts');
      const expiredEvents = world.service.engine.auditEvents(rid2).filter((e) => e.event_type === 'report_expired');
      t.equal(expiredEvents.length, 1, 'expiry is audited');
      // Officer role cannot run the sweep.
      const sess3 = login(world, 'officer.alex');
      throwsAuth(t, () => world.service.sweepRetention(sess3), 'FORBIDDEN', 'officers cannot run the retention sweep');
    },
  },
  {
    id: 14,
    name: 'Hash-bound confirmation and certification enforced through the service boundary',
    run(t) {
      const world = makeWorld();
      const sess = login(world, 'officer.alex');
      const rid = driveService(world, sess, 'evaluated');
      const v = (): number => world.service.engine.getVersion(rid);

      // Stale ledger hash (stale tab) is rejected server-side.
      const facts = world.service.engine.inspect(rid).facts;
      t.throws(
        () =>
          world.service.confirmFacts(sess, rid, v(), {
            ledger_hash_shown: 'stale-hash-from-old-tab',
            displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
            decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
            started_at: '2026-06-01T22:00:00Z',
            submitted_at: '2026-06-01T22:05:00Z',
          }),
        'HASH_MISMATCH',
        'stale ledger hash rejected'
      );

      // Rapid confirmation triggers adaptive friction server-side (Stage 15).
      t.throws(
        () =>
          world.service.confirmFacts(sess, rid, v(), {
            ledger_hash_shown: world.service.engine.currentLedgerHash(rid),
            displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
            decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
            started_at: '2026-06-01T22:00:00.000Z',
            submitted_at: '2026-06-01T22:00:01.000Z',
          }),
        'RAPID_CONFIRMATION',
        'rapid confirmation requires a second explicit confirmation'
      );

      // Certification with any stale value is rejected (Stage 22).
      const rid2 = driveService(world, sess, 'validated');
      const insp = world.service.engine.inspect(rid2);
      t.throws(
        () =>
          world.service.certify(sess, rid2, world.service.engine.getVersion(rid2), {
            report_version: world.service.engine.getVersion(rid2),
            fact_snapshot_hash: hashValue(insp.snapshot),
            narrative_hash: 'stale-narrative-hash',
            deterministic_validation_id: insp.deterministicValidation!.validation_id,
            semantic_validation_id: insp.semanticValidation!.validation_id,
          }),
        'CERTIFICATION_REJECTED',
        'stale certification request rejected'
      );
      const rejected = world.service.engine.auditEvents(rid2).filter((e) => e.event_type === 'certification_rejected');
      t.equal(rejected.length, 1, 'certification rejection is audited');
      // And the rejection made it to the on-disk trail (persisted in finally).
      const raw = readFileSync(join(world.dir, 'audit.log'), 'utf8');
      t.check(raw.includes('certification_rejected'), 'certification_rejected persisted to audit.log');
    },
  },
  {
    id: 15,
    name: 'Users persist across reboot; sessions and kill-switch state behave fail-closed',
    run(t) {
      const world = makeWorld();
      const admin = login(world, 'admin.sys');
      world.service.engageKillSwitch(admin, 'synthetic drill before crash');
      world.reboot();

      // Users came from users.json, not the seed list: password still works.
      const sess = login(world, 'officer.alex');
      t.equal(world.service.whoAmI(sess).role, 'officer', 'seeded user survives reboot via users.json');
      // Kill switch state is part of engine state and survives recovery.
      t.equal(world.service.engine.isKillSwitchEngaged(), true, 'kill switch stays engaged across a crash');
      throwsAuth(t, () => world.service.whoAmI(admin), 'AUTH_REQUIRED', 'admin session did not survive the reboot');
      const admin2 = login(world, 'admin.sys');
      world.service.releaseKillSwitch(admin2);
      t.equal(world.service.engine.isKillSwitchEngaged(), false, 'released after reboot by a fresh admin session');
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

console.log('LOCKUPHQ DR Writer — Phase 7 persistence and security tests');
console.log('============================================================\n');

const outcomes = runTests(tests);
let passed = 0;
let totalChecks = 0;
for (const o of outcomes) {
  totalChecks += o.checks;
  const label = `P7-${o.id}. ${o.name}`;
  if (o.passed) {
    passed += 1;
    console.log(`  PASS  ${label}  (${o.checks} assertions)`);
  } else {
    console.log(`  FAIL  ${label}  (${o.checks} assertions)`);
    for (const failure of o.failures) console.log(`          - ${failure}`);
  }
}

for (const dir of cleanupDirs) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

console.log('\n============================================================');
console.log(`  Result: ${passed} / ${outcomes.length} tests passed  (${totalChecks} assertions total)`);
console.log('============================================================');

process.exit(passed === outcomes.length ? 0 : 1);
