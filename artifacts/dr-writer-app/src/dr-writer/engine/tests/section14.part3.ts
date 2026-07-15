// Section 14 tests 18-25 (blueprint §14). Synthetic data only.

import type { Section14Test } from './harness.ts';
import { Engine } from '../engine.ts';
import { RequirementRegistry, SourceRegistry, type RequirementRecord, type SourceRecord } from '../registries.ts';
import { SYNTHETIC_PACKET_6_1, SYNTHETIC_POLICY_PROFILE, deriveReportDate } from '../packets.ts';
import {
  AMENDMENT_TEXT,
  INCIDENT_DATE,
  adminIntake,
  certRequest,
  driveTo,
  makeEngine,
  newReport,
  type Ctx,
  type Stage,
} from './fixtures.ts';

export const part3: Section14Test[] = [
  {
    id: 18,
    name: 'Report-version stale-write rejection at every stage',
    run: (t) => {
      // Every stage operation, attempted with a stale report_version.
      const rows: { stage: Stage; name: string; op: (c: Ctx, staleV: number) => void }[] = [
        { stage: 'created', name: 'setAdministrativeIntake', op: (c, v) => c.engine.setAdministrativeIntake(c.rid, v, c.op, adminIntake()) },
        { stage: 'admin', name: 'submitProceduralScreen', op: (c, v) => c.engine.submitProceduralScreen(c.rid, v, c.op, { force_used: 'no' }) },
        { stage: 'screen', name: 'commitOriginalNotes', op: (c, v) => c.engine.commitOriginalNotes(c.rid, v, c.op, { text: 'FACT|category=x|value=y', request_id: 'r' }) },
        { stage: 'notes', name: 'runExtraction', op: (c, v) => c.engine.runExtraction(c.rid, v, c.op) },
        { stage: 'extracted', name: 'runCritic', op: (c, v) => c.engine.runCritic(c.rid, v, c.op) },
        { stage: 'critic', name: 'selectOrderForCharge', op: (c, v) => c.engine.selectOrderForCharge(c.rid, v, c.op, c.engine.inspect(c.rid).orderEvents[0].order_event_id) },
        { stage: 'order_selected', name: 'evaluateCharge', op: (c, v) => c.engine.evaluateCharge(c.rid, v, c.op) },
        {
          stage: 'evaluated',
          name: 'confirmFacts',
          op: (c, v) => {
            const facts = c.engine.inspect(c.rid).facts;
            c.engine.confirmFacts(c.rid, v, c.op, {
              ledger_hash_shown: c.engine.currentLedgerHash(c.rid),
              displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
              decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
              started_at: '2026-06-01T22:00:00Z',
              submitted_at: '2026-06-01T22:05:00Z',
            });
          },
        },
        { stage: 'confirmed', name: 'acknowledgeQualityWarnings', op: (c, v) => c.engine.acknowledgeQualityWarnings(c.rid, v, c.op) },
        { stage: 'ready', name: 'createSnapshot', op: (c, v) => c.engine.createSnapshot(c.rid, v, c.op) },
        { stage: 'snapshot', name: 'generateNarrative', op: (c, v) => c.engine.generateNarrative(c.rid, v, c.op) },
        { stage: 'generated', name: 'validateNarrative', op: (c, v) => c.engine.validateNarrative(c.rid, v, c.op) },
        {
          stage: 'validated',
          name: 'editSentence',
          op: (c, v) => c.engine.editSentence(c.rid, v, c.op, { sentence_id: c.engine.inspect(c.rid).narrative!.sentences[0].sentence_id, new_text: 'x' }),
        },
        { stage: 'validated', name: 'certify', op: (c, v) => c.engine.certify(c.rid, v, c.op, certRequest(c)) },
        { stage: 'certified', name: 'commitAuditFinalization', op: (c, v) => c.engine.commitAuditFinalization(c.rid, v, c.op) },
        { stage: 'audit_finalized', name: 'addAmendment', op: (c, v) => c.engine.addAmendment(c.rid, v, c.op, { text: AMENDMENT_TEXT, reason: 'r' }) },
      ];
      for (const row of rows) {
        const engine = makeEngine();
        const c = newReport(engine);
        driveTo(c, row.stage);
        const versionBefore = c.v();
        t.throws(() => row.op(c, versionBefore - 1), 'STALE_WRITE', `[${row.name}] stale write rejected`);
        t.equal(c.v(), versionBefore, `[${row.name}] no state change on stale write`);
        t.check(
          engine.auditEvents(c.rid).some((e) => e.event_type === 'concurrency_rejected'),
          `[${row.name}] concurrency rejection audited`
        );
        // The same call with the current version succeeds — no auto-merge, the
        // caller must reload the latest committed state.
        row.op(c, versionBefore);
        t.equal(c.v(), versionBefore + 1, `[${row.name}] current-version write commits`);
      }
    },
  },

  {
    id: 19,
    name: 'Session-lock transfer',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine); // locked to sess-A
      driveTo(c, 'notes');
      const sessB = { session_id: 'sess-B', actor: 'officer-2' };
      t.throws(() => engine.runExtraction(c.rid, c.v(), sessB), 'SESSION_LOCK', 'foreign session rejected before transfer');
      t.check(engine.auditEvents(c.rid).some((e) => e.event_type === 'session_locked'), 'initial lock audited');

      engine.transferSessionLock(c.rid, c.v(), { to_session_id: 'sess-B', actor: 'supervisor-1' });
      t.check(engine.auditEvents(c.rid).some((e) => e.event_type === 'session_lock_transferred'), 'transfer is an explicit audited action');

      engine.runExtraction(c.rid, c.v(), sessB);
      t.check(engine.inspect(c.rid).factCount > 0, 'new session operates after transfer');
      t.throws(() => engine.runCritic(c.rid, c.v(), c.op), 'SESSION_LOCK', 'old session rejected after transfer');
    },
  },

  {
    id: 20,
    name: 'Kill-switch activation and recovery',
    run: (t) => {
      const engine = makeEngine();
      const finalizable = newReport(engine);
      driveTo(finalizable, 'token_issued');
      const midFlow = newReport(engine, { session_id: 'sess-A', actor: 'officer-1' });
      driveTo(midFlow, 'extracted');
      const factsBefore = engine.inspect(midFlow.rid).factCount;

      // Only policy-authorized roles may operate the switch.
      t.throws(() => engine.engageKillSwitch({ actor: 'officer-1', role: 'officer', reason: 'x' }), 'FORBIDDEN', 'unauthorized role rejected');

      engine.engageKillSwitch({ actor: 'admin-1', role: 'system_admin', reason: 'model fault suspected' });
      t.check(engine.isKillSwitchEngaged(), 'switch engaged');
      t.equal(engine.getDisplayStatus(finalizable.rid), 'SYSTEM HOLD', 'open report A in SYSTEM HOLD');
      t.equal(engine.getDisplayStatus(midFlow.rid), 'SYSTEM HOLD', 'open report B in SYSTEM HOLD');
      t.check(engine.getToken(finalizable.token!.token_id)!.revoked_at !== null, 'existing unused token revoked');
      t.throws(() => engine.issueToken(finalizable.rid, { ...finalizable.op, role: 'officer' }, 'print'), 'TOKEN_REJECTED', 'token issuance stopped');
      t.throws(() => engine.authorizeOutput(finalizable.token!.token_id, finalizable.op, 'print'), 'TOKEN_REJECTED', 'output authorization rejects all requests');
      t.throws(() => engine.addAmendment(midFlow.rid, midFlow.v(), midFlow.op, { text: 'x', reason: 'r' }), 'SYSTEM_HOLD', 'mutations blocked');
      t.check(engine.auditEvents().some((e) => e.event_type === 'kill_switch_engaged'), 'engagement audited');

      engine.releaseKillSwitch({ actor: 'admin-1', role: 'system_admin' });
      t.check(!engine.isKillSwitchEngaged(), 'switch released');
      t.check(engine.auditEvents().some((e) => e.event_type === 'kill_switch_released'), 'release audited');
      t.equal(engine.inspect(midFlow.rid).factCount, factsBefore, 'committed work preserved through the outage');
      t.equal(engine.getDisplayStatus(midFlow.rid), 'FACTS INCOMPLETE', 'mid-flow report recovered after compatibility check');

      // The revoked token stays dead; a fresh token completes the flow.
      t.throws(() => engine.authorizeOutput(finalizable.token!.token_id, finalizable.op, 'print'), 'TOKEN_REJECTED', 'revoked token unusable after release');
      const fresh = engine.issueToken(finalizable.rid, { ...finalizable.op, role: 'officer' }, 'print');
      engine.authorizeOutput(fresh.token_id, finalizable.op, 'print');
      t.equal(engine.getLifecycle(finalizable.rid), 'FINALIZED', 'work resumes to finalization after recovery');
    },
  },

  {
    id: 21,
    name: 'Lifecycle transitions',
    run: (t) => {
      // DRAFT -> ABANDONED (policy-permitted, audited, then immutable).
      const e1 = makeEngine();
      const c1 = newReport(e1);
      driveTo(c1, 'extracted');
      e1.transitionLifecycle(c1.rid, c1.v(), c1.op, 'ABANDONED');
      t.equal(e1.getLifecycle(c1.rid), 'ABANDONED', 'DRAFT -> ABANDONED permitted');
      t.check(e1.auditEvents(c1.rid).some((e) => e.event_type === 'report_abandoned'), 'abandonment audited');
      t.throws(() => e1.addAmendment(c1.rid, c1.v(), c1.op, { text: 'x', reason: 'r' }), 'LIFECYCLE', 'abandoned report rejects mutation');
      t.throwsAny(() => e1.transitionLifecycle(c1.rid, c1.v(), c1.op, 'VOIDED'), 'ABANDONED -> VOIDED not policy-permitted');

      // DRAFT -> VOIDED and DRAFT -> EXPIRED are policy-permitted.
      const e2 = makeEngine();
      const c2 = newReport(e2);
      e2.transitionLifecycle(c2.rid, c2.v(), c2.op, 'VOIDED');
      t.equal(e2.getLifecycle(c2.rid), 'VOIDED', 'DRAFT -> VOIDED permitted');
      const e3 = makeEngine();
      const c3 = newReport(e3);
      e3.transitionLifecycle(c3.rid, c3.v(), c3.op, 'EXPIRED');
      t.equal(e3.getLifecycle(c3.rid), 'EXPIRED', 'DRAFT -> EXPIRED permitted');
      t.throwsAny(() => e3.transitionLifecycle(c3.rid, c3.v(), c3.op, 'ABANDONED'), 'EXPIRED -> ABANDONED rejected');

      // FINALIZED is reached only through the full output path.
      const e4 = makeEngine();
      const c4 = newReport(e4);
      driveTo(c4, 'audit_finalized');
      t.throws(() => e4.transitionLifecycle(c4.rid, c4.v(), c4.op, 'FINALIZED'), 'FORBIDDEN', 'direct FINALIZED transition rejected');
      const token = e4.issueToken(c4.rid, { ...c4.op, role: 'officer' }, 'print');
      e4.authorizeOutput(token.token_id, c4.op, 'print');
      t.equal(e4.getLifecycle(c4.rid), 'FINALIZED', 'FINALIZED via certification/audit/token/output');
      // FINALIZED -> VOIDED is policy-permitted and audited.
      e4.transitionLifecycle(c4.rid, c4.v(), c4.op, 'VOIDED');
      t.equal(e4.getLifecycle(c4.rid), 'VOIDED', 'FINALIZED -> VOIDED permitted');
      t.check(e4.auditEvents(c4.rid).some((e) => e.event_type === 'report_voided'), 'voiding audited');
    },
  },

  {
    id: 22,
    name: 'Abandonment and expiry rules',
    run: (t) => {
      const now = { t: Date.parse('2026-06-02T00:00:00Z') };
      const engine = makeEngine({ clock: () => new Date(now.t) });
      const c = newReport(engine);
      driveTo(c, 'extracted');

      // Not yet idle past the policy window: expiry must NOT fire (fail closed
      // means no premature state changes either way — the rule is the rule).
      now.t += 24 * 3_600_000;
      t.equal(engine.expireIfInactive(c.rid, 'system'), false, 'active report not expired at 24h (policy: 72h)');
      t.equal(engine.getLifecycle(c.rid), 'DRAFT', 'report still DRAFT');

      // Past the policy window: expiry fires, is audited, and locks the report.
      now.t += 60 * 3_600_000; // total 84h idle
      t.equal(engine.expireIfInactive(c.rid, 'system'), true, 'idle report expired after policy window');
      t.equal(engine.getLifecycle(c.rid), 'EXPIRED', 'lifecycle is EXPIRED');
      t.check(engine.auditEvents(c.rid).some((e) => e.event_type === 'report_expired'), 'expiry audited');
      t.throws(() => engine.addAmendment(c.rid, c.v(), c.op, { text: 'x', reason: 'r' }), 'LIFECYCLE', 'expired report rejects mutation');
      t.equal(engine.expireIfInactive(c.rid, 'system'), false, 'expiry is idempotent on non-DRAFT reports');

      // Abandonment is an explicit officer action, audited, and terminal.
      const e2 = makeEngine();
      const c2 = newReport(e2);
      driveTo(c2, 'confirmed');
      e2.transitionLifecycle(c2.rid, c2.v(), c2.op, 'ABANDONED');
      t.equal(e2.getLifecycle(c2.rid), 'ABANDONED', 'explicit abandonment');
      t.check(e2.auditEvents(c2.rid).some((e) => e.event_type === 'report_abandoned'), 'abandonment audited');
      t.throws(() => e2.evaluateCharge(c2.rid, c2.v(), c2.op), 'LIFECYCLE', 'abandoned report rejects further work');
    },
  },

  {
    id: 23,
    name: 'Validation retry bounds',
    run: (t) => {
      // A semantic validator that always fails: the automated loop must stop
      // at the policy bound and hold for officer resolution.
      const engine = makeEngine({ stubs: { semanticValidate: () => ({ passed: false, issues: ['injected semantic failure'] }) } });
      const c = newReport(engine);
      driveTo(c, 'generated');
      const initial = engine.validateNarrative(c.rid, c.v(), c.op);
      t.check(!initial.passed, 'initial validation fails');
      t.equal(engine.getDisplayStatus(c.rid), 'VALIDATION HOLD', 'report enters VALIDATION HOLD');

      t.check(!engine.regenerateNarrative(c.rid, c.v(), c.op).passed, 'automated attempt 1 runs and fails');
      t.check(!engine.regenerateNarrative(c.rid, c.v(), c.op).passed, 'automated attempt 2 runs and fails');
      t.throws(() => engine.regenerateNarrative(c.rid, c.v(), c.op), 'RETRY_LIMIT', 'automated attempt 3 rejected (max 2)');
      t.equal(engine.getDisplayStatus(c.rid), 'VALIDATION HOLD', 'remains in VALIDATION HOLD after the bound');
      t.throws(() => engine.certify(c.rid, c.v(), c.op, certRequest(c)), 'GATE_BLOCKED', 'certification requires officer resolution');
      t.check(engine.auditEvents(c.rid).filter((e) => e.event_type === 'validation_failed').length >= 3, 'each failed validation audited');
    },
  },

  {
    id: 24,
    name: 'Midnight-crossover data handling',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      // Incident starts before midnight and ends after it. The displayed report
      // date comes from the versioned policy rule, never from a guess.
      engine.setAdministrativeIntake(c.rid, c.v(), c.op, {
        ...adminIntake(),
        incident_start: '2026-06-01T23:50:00Z',
        incident_end: '2026-06-02T00:15:00Z',
      });
      const admin = engine.inspect(c.rid).admin!;
      t.equal(admin.derived_report_date, '2026-06-01', 'report date derived from incident start across midnight');
      t.equal(admin.report_date_rule_version, 'report-date-rule-v1', 'derivation records the rule version');
      t.equal(admin.incident_end, '2026-06-02T00:15:00Z', 'end datetime on the next calendar day preserved');

      // Fail closed: a date without a time cannot resolve midnight crossover.
      const c2 = newReport(engine);
      t.throwsAny(
        () => engine.setAdministrativeIntake(c2.rid, c2.v(), c2.op, { ...adminIntake(), incident_start: '2026-06-01' }),
        'date-only incident start rejected, not guessed'
      );
      t.check(engine.inspect(c2.rid).admin === null, 'no administrative record committed on rejection');

      // The rule itself is versioned: an unknown version fails closed.
      t.throwsAny(() => deriveReportDate('2026-06-01T23:50:00Z', 'report-date-rule-v999'), 'unknown rule version rejected');
      t.equal(deriveReportDate('2026-06-02T00:15:00Z', 'report-date-rule-v1'), '2026-06-02', 'post-midnight start yields the next date deterministically');
    },
  },

  {
    id: 25,
    name: 'Deployment failure for unsourced hard blockers',
    run: (t) => {
      const goodSource: SourceRecord = {
        source_id: 'SRC-OK', title: 'Rule book', jurisdiction: 'SYN', citation: 'c1', version: '1',
        effective_date: '2025-01-01', expiration_date: null, approved: true, approved_by: 'a', approved_at: '2025-01-01',
      };
      const hardBlocker = (over: Partial<RequirementRecord>): RequirementRecord => ({
        requirement_id: 'REQ-X', tier: 1, title: 'rule', enforcement: 'hard_blocker', source_id: 'SRC-OK',
        effective_date: '2025-01-01', jurisdiction: 'SYN', version: '1', requirement_mapping: 'fact_gate',
        conflict_status: 'none', approved: true, ...over,
      });
      const attempt = (req: RequirementRecord, source: SourceRecord | null): (() => Engine) => () => {
        const requirements = new RequirementRegistry();
        requirements.add(req);
        const sources = new SourceRegistry();
        if (source) sources.add(source);
        return Engine.create({
          requirements, sources, packet: SYNTHETIC_PACKET_6_1, policy: SYNTHETIC_POLICY_PROFILE,
          deployment_check_date: INCIDENT_DATE,
        });
      };

      // §11 — every hard-blocker defect fails deployment, fail closed.
      t.throws(attempt(hardBlocker({ source_id: null }), goodSource), 'DEPLOYMENT_FAILED', 'unsourced Tier 1 hard blocker blocks deployment');
      t.throws(attempt(hardBlocker({ tier: 2, source_id: null }), goodSource), 'DEPLOYMENT_FAILED', 'unsourced Tier 2 hard blocker blocks deployment');
      t.throws(attempt(hardBlocker({ approved: false }), goodSource), 'DEPLOYMENT_FAILED', 'unapproved requirement blocks deployment');
      t.throws(attempt(hardBlocker({}), { ...goodSource, approved: false }), 'DEPLOYMENT_FAILED', 'unapproved source blocks deployment');
      t.throws(attempt(hardBlocker({}), { ...goodSource, effective_date: '2026-12-01' }), 'DEPLOYMENT_FAILED', 'source not yet effective for the incident date blocks deployment');
      t.throws(attempt(hardBlocker({}), { ...goodSource, expiration_date: '2026-01-01' }), 'DEPLOYMENT_FAILED', 'source expired before the incident date blocks deployment');
      t.throws(attempt(hardBlocker({ conflict_status: 'conflicted' }), goodSource), 'DEPLOYMENT_FAILED', 'conflicted requirement blocks deployment');
      t.throws(attempt(hardBlocker({ conflict_status: 'overridden_unapproved' }), goodSource), 'DEPLOYMENT_FAILED', 'unapproved local override blocks deployment');
      t.throws(attempt(hardBlocker({ source_id: 'SRC-MISSING' }), goodSource), 'DEPLOYMENT_FAILED', 'dangling source reference blocks deployment');

      // Non-blocking tiers deploy: an unsourced quality safeguard is permitted
      // (until verified it remains a safeguard, not a hard blocker).
      const softEngine = attempt(hardBlocker({ tier: 4, enforcement: 'quality_safeguard', source_id: null }), goodSource)();
      t.check(softEngine instanceof Engine, 'unsourced Tier 4 quality safeguard does not block deployment');
      const goodEngine = attempt(hardBlocker({}), goodSource)();
      t.check(goodEngine instanceof Engine, 'fully sourced, approved, effective hard blocker deploys');
    },
  },
];
