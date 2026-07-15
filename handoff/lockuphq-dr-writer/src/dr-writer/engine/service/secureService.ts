// LOCKUPHQ DR Writer — secure service layer (blueprint §18 Phase 7).
//
// This is the single trust boundary in front of the engine:
//   - Every call requires a valid, unexpired, unlocked session (authService).
//   - Every operation is role-authorized before the engine runs.
//   - Every successful or failed operation persists atomically (store): state
//     first, then the append-only audit delta, so audit.log never claims an
//     event whose state was lost (§9 — resume from last completed commit).
//   - Output authorization is CENTRAL (invariant 8): redeemOutput is the only
//     method anywhere that returns the final narrative text, and it requires a
//     session-bound, channel-bound, single-use, unexpired finalization token
//     (Stage 24). Review drafts are always watermarked (§8) and logged.
//   - Retention/lifecycle enforcement: an idle-draft expiry sweep runs at boot
//     and on demand (§5.3).
//
// Synthetic data only — not authorized for production or real inmate data.

import { Engine } from '../engine.ts';
import type { ChargeEvaluation, EngineConfig, EngineState } from '../engine.ts';
import type { AuthConfig, Role, SessionRecord, UserRecord } from './authService.ts';
import { AuthError, AuthService } from './authService.ts';
import { AUDIT_CHAIN_GENESIS, FileStore, StoreIntegrityError, chainHash } from './store.ts';
import { EngineError } from '../errors.ts';
import type { AnswerType } from '../packets.ts';
import type {
  AdministrativeIntake,
  AuditEvent,
  FactCertainty,
  FinalizationToken,
  Gates,
  OutputChannel,
  Person,
} from '../types.ts';

export const REVIEW_DRAFT_WATERMARK = 'REVIEW DRAFT — NOT A DISCIPLINARY REPORT';

// Plain-English gate names for the UI (§5.4 — all gates simultaneously visible).
export const GATE_LABELS: Record<string, string> = {
  system_gate: 'System check',
  procedural_gate: 'Procedural check',
  policy_gate: 'Policy review',
  fact_gate: 'Required facts',
  quality_gate: 'Quality review',
  narrative_gate: 'Narrative check',
  certification_gate: 'Your certification',
  audit_gate: 'Audit record',
};

export interface BootConfig {
  dir: string;
  engine: EngineConfig;
  auth?: AuthConfig;
  // Seeded only when no users.json exists yet (first boot).
  seedUsers?: { username: string; password: string; role: Role; display_name: string; person_id?: string }[];
}

interface OpCtx {
  session_id: string;
  actor: string;
  idempotency_key?: string;
}

const WORKFLOW: Role[] = ['officer', 'supervisor'];
const OFFICER_ONLY: Role[] = ['officer'];
const SUPERVISOR_ONLY: Role[] = ['supervisor'];
const AUDIT_READERS: Role[] = ['audit_reader', 'system_admin'];

export class SecureService {
  readonly engine: Engine;
  readonly auth: AuthService;
  private readonly store: FileStore;
  private lastPersistedAuditSeq = 0;
  private lastChainHash = AUDIT_CHAIN_GENESIS;

  private constructor(engine: Engine, auth: AuthService, store: FileStore) {
    this.engine = engine;
    this.auth = auth;
    this.store = store;
  }

  // ------------------------------------------------------------------
  // Boot and crash recovery (§9)
  // ------------------------------------------------------------------

  static boot(config: BootConfig): SecureService {
    const store = new FileStore(config.dir);
    const engine = Engine.create(config.engine);

    const state = store.loadState<EngineState>();
    if (state) engine.restoreState(state);

    // Reconcile the append-only audit file with authoritative state. State is
    // written before the audit append, so the audit file can only ever be
    // EQUAL to or BEHIND state. A file that is ahead of state, or a broken
    // chain, means tampering — fail closed (readAudit throws on chain breaks).
    const stateEvents: AuditEvent[] = state ? state.auditLog : [];
    const { lines, tornTail } = store.readAudit();
    if (lines.length > stateEvents.length) {
      throw new StoreIntegrityError('audit.log contains events missing from state.json; refusing to boot');
    }
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].event.audit_seq !== stateEvents[i].audit_seq || lines[i].event.event_type !== stateEvents[i].event_type) {
        throw new StoreIntegrityError(`audit.log line ${i + 1} does not match state.json; refusing to boot`);
      }
    }
    let last = AUDIT_CHAIN_GENESIS;
    if (tornTail || lines.length < stateEvents.length) {
      // Crash between state save and audit append (or mid-append): heal the
      // audit file forward from state. No event is ever dropped.
      last = store.healAuditFromState(stateEvents);
    } else {
      last = lines.length > 0 ? lines[lines.length - 1].chain_hash : AUDIT_CHAIN_GENESIS;
      // Recompute defensively so lastChainHash is always chain-consistent.
      let expected = AUDIT_CHAIN_GENESIS;
      for (const line of lines) expected = chainHash(expected, line.event);
      if (lines.length > 0 && expected !== last) {
        throw new StoreIntegrityError('audit.log chain tail mismatch; refusing to boot');
      }
    }

    const auth = new AuthService(config.auth);
    const users = store.loadUsers<ReturnType<AuthService['serializeUsers']>>();
    if (users) {
      auth.restoreUsers(users);
    } else {
      for (const seed of config.seedUsers ?? []) auth.createUser(seed);
      store.saveUsers(auth.serializeUsers());
    }

    const service = new SecureService(engine, auth, store);
    service.lastPersistedAuditSeq = stateEvents.length > 0 ? stateEvents[stateEvents.length - 1].audit_seq : 0;
    service.lastChainHash = last;

    // Retention enforcement runs at every boot (§5.3).
    service.runRetentionSweep('system-retention');
    return service;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private persist(): void {
    const state = this.engine.serializeState();
    this.store.saveState(state);
    const newEvents = state.auditLog.filter((e) => e.audit_seq > this.lastPersistedAuditSeq);
    if (newEvents.length > 0) {
      this.lastChainHash = this.store.appendAudit(newEvents, this.lastChainHash);
      this.lastPersistedAuditSeq = newEvents[newEvents.length - 1].audit_seq;
    }
  }

  private requireRole(user: UserRecord, roles: Role[]): void {
    if (!roles.includes(user.role)) {
      throw new AuthError('FORBIDDEN', `This action requires role ${roles.join(' or ')}; your role is ${user.role}`);
    }
  }

  // Session + role check, then run the operation. Persistence happens in
  // finally: failed engine calls can still append audit events (for example
  // concurrency_rejected and certification_rejected), and those must land in
  // the append-only trail too.
  private run<T>(sessionId: string, roles: Role[], fn: (user: UserRecord, session: SessionRecord) => T): T {
    const { user, session } = this.auth.requireSession(sessionId);
    this.requireRole(user, roles);
    try {
      return fn(user, session);
    } finally {
      this.persist();
    }
  }

  private ctx(session: SessionRecord, user: UserRecord, idempotencyKey?: string): OpCtx {
    return { session_id: session.session_id, actor: user.user_id, idempotency_key: idempotencyKey };
  }

  // Mutations on a report additionally require the caller to be the report
  // owner or a supervisor. The engine's session lock enforces the rest.
  private requireReportAccess(user: UserRecord, reportId: string): void {
    const meta = this.engine.getWorkspaceMeta(reportId);
    if (meta.owner_user_id !== user.user_id && user.role !== 'supervisor') {
      throw new AuthError('FORBIDDEN', 'Only the reporting officer who owns this report (or a supervisor) can work on it');
    }
  }

  // ------------------------------------------------------------------
  // Sessions (delegated; kept here so the server has one dependency)
  // ------------------------------------------------------------------

  login(username: string, password: string): { session_id: string; user_id: string; role: Role; display_name: string; expires_at: string } {
    const session = this.auth.login(username, password);
    const user = this.auth.getUser(session.user_id)!;
    return {
      session_id: session.session_id,
      user_id: user.user_id,
      role: user.role,
      display_name: user.display_name,
      expires_at: session.absolute_expires_at,
    };
  }

  logout(sessionId: string): void {
    this.auth.logout(sessionId);
  }

  lockScreen(sessionId: string): void {
    this.auth.lockSession(sessionId);
  }

  unlockScreen(sessionId: string, password: string): void {
    this.auth.unlockSession(sessionId, password);
  }

  whoAmI(sessionId: string): { user_id: string; role: Role; display_name: string } {
    const { user } = this.auth.requireSession(sessionId);
    return { user_id: user.user_id, role: user.role, display_name: user.display_name };
  }

  // ------------------------------------------------------------------
  // Persons
  // ------------------------------------------------------------------

  addPerson(sessionId: string, person: Person): void {
    this.run(sessionId, WORKFLOW, () => this.engine.addPerson(person));
  }

  listPersons(sessionId: string): Person[] {
    return this.run(sessionId, [...WORKFLOW, ...AUDIT_READERS], () => this.engine.persons.all());
  }

  // ------------------------------------------------------------------
  // Report workspace
  // ------------------------------------------------------------------

  createReport(
    sessionId: string,
    args: { institution_id: string; subject_person_id: string; charge_code: string; incident_group_id?: string; participants?: string[] }
  ): { report_id: string; report_version: number } {
    return this.run(sessionId, OFFICER_ONLY, (user, session) =>
      this.engine.createWorkspace({
        owner_user_id: user.user_id,
        session_id: session.session_id,
        ...args,
      })
    );
  }

  listMyReports(sessionId: string): ReturnType<Engine['getWorkspaceMeta']>[] {
    return this.run(sessionId, [...WORKFLOW, ...AUDIT_READERS], (user) => {
      const all = this.engine.listWorkspaces();
      // Cross-user isolation (§12): officers see only their own reports.
      if (user.role === 'officer') return all.filter((m) => m.owner_user_id === user.user_id);
      return all;
    });
  }

  // Explicit, audited session-lock claim (§9). Owners may reclaim a report
  // whose locking session is dead (expired/revoked/unknown — e.g. after a
  // crash, shift change, or overnight session expiry). Supervisors may
  // transfer any report's lock to the current session.
  claimReport(sessionId: string, reportId: string): void {
    this.run(sessionId, WORKFLOW, (user, session) => {
      const meta = this.engine.getWorkspaceMeta(reportId);
      if (meta.session_id === session.session_id) return; // already held
      if (user.role !== 'supervisor') {
        if (meta.owner_user_id !== user.user_id) {
          throw new AuthError('FORBIDDEN', 'Only the reporting officer who owns this report (or a supervisor) can claim it');
        }
        if (this.auth.isSessionUsable(meta.session_id)) {
          throw new AuthError('FORBIDDEN', 'This report is open in another active session. Ask a supervisor to transfer it.');
        }
      }
      this.engine.transferSessionLock(reportId, meta.report_version, { to_session_id: session.session_id, actor: user.user_id });
    });
  }

  // Full workspace view for the UI. This is a REVIEW surface: narrative text
  // is exposed sentence-by-sentence for editing, and any joined rendering must
  // go through getReviewDraft (watermarked) or redeemOutput (token-gated).
  getReportView(sessionId: string, reportId: string): {
    meta: ReturnType<Engine['getWorkspaceMeta']>;
    display_status: string;
    gates: { name: string; label: string; state: string; reasons: string[] }[];
    inspect: ReturnType<Engine['inspect']>;
    ledger_hash: string;
    snapshot_hash: string | null;
    charge_evaluation: ChargeEvaluation | null;
    ambiguous_references: { reference_id: string; raw_text: string; candidate_person_ids: string[] }[];
  } {
    return this.run(sessionId, [...WORKFLOW, ...AUDIT_READERS], (user) => {
      const meta = this.engine.getWorkspaceMeta(reportId);
      if (user.role === 'officer' && meta.owner_user_id !== user.user_id) {
        throw new AuthError('FORBIDDEN', 'This report belongs to another officer');
      }
      const gates: Gates = this.engine.getGates(reportId);
      const inspect = this.engine.inspect(reportId);
      // Stage 8 — unresolved person references, with candidates for the picker.
      const ambiguousRefs: { reference_id: string; raw_text: string; candidate_person_ids: string[] }[] = [];
      for (const fact of inspect.facts) {
        if (fact.ambiguous_reference_id && !ambiguousRefs.some((r) => r.reference_id === fact.ambiguous_reference_id)) {
          const ref = this.engine.persons.getReference(fact.ambiguous_reference_id);
          if (ref && ref.resolved_person_id === null) {
            ambiguousRefs.push({ reference_id: ref.reference_id, raw_text: ref.raw_text, candidate_person_ids: ref.candidate_person_ids });
          }
        }
      }
      let snapshotHash: string | null = null;
      try {
        snapshotHash = inspect.snapshot ? this.engine.currentSnapshotHash(reportId) : null;
      } catch {
        snapshotHash = null;
      }
      return {
        meta,
        display_status: this.engine.getDisplayStatus(reportId),
        // §5.4 / Phase 8 constraint: ALL gates, each with reasons — never one
        // summary light.
        gates: Object.entries(gates).map(([name, record]) => ({
          name,
          label: GATE_LABELS[name] ?? name,
          state: record.state,
          reasons: record.reasons,
        })),
        inspect,
        ledger_hash: this.engine.currentLedgerHash(reportId),
        snapshot_hash: snapshotHash,
        charge_evaluation: inspect.chargeEvaluation,
        ambiguous_references: ambiguousRefs,
      };
    });
  }

  // ------------------------------------------------------------------
  // Workflow mutations (thin, role-checked, persisted wrappers)
  // ------------------------------------------------------------------

  private workflowOp<T>(sessionId: string, reportId: string, roles: Role[], fn: (ctx: OpCtx) => T, idempotencyKey?: string): T {
    return this.run(sessionId, roles, (user, session) => {
      this.requireReportAccess(user, reportId);
      return fn(this.ctx(session, user, idempotencyKey));
    });
  }

  preflightLiveWorkflow(sessionId: string, reportId: string, version: number): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.preflightWorkflow(reportId, version, ctx));
  }

  preflightLiveRegeneration(sessionId: string, reportId: string, version: number): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.preflightRegeneration(reportId, version, ctx));
  }

  setAdminIntake(sessionId: string, reportId: string, version: number, admin: Omit<AdministrativeIntake, 'derived_report_date' | 'report_date_rule_version'>): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.setAdministrativeIntake(reportId, version, ctx, admin));
  }

  submitProceduralScreen(sessionId: string, reportId: string, version: number, answers: Record<string, string>): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.submitProceduralScreen(reportId, version, ctx, answers));
  }

  commitNotes(sessionId: string, reportId: string, version: number, args: { text: string; request_id: string }): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.commitOriginalNotes(reportId, version, ctx, args), args.request_id);
  }

  runExtraction(sessionId: string, reportId: string, version: number): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.runExtraction(reportId, version, ctx));
  }

  runCritic(sessionId: string, reportId: string, version: number): ReturnType<Engine['runCritic']> {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.runCritic(reportId, version, ctx));
  }

  addAmendment(sessionId: string, reportId: string, version: number, args: { text: string; reason: string }): string {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.addAmendment(reportId, version, ctx, args));
  }

  correctFact(sessionId: string, reportId: string, version: number, args: { fact_id: string; value: string; certainty: FactCertainty }): string {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.correctFact(reportId, version, ctx, args));
  }

  disambiguatePerson(sessionId: string, reportId: string, version: number, args: { reference_id: string; person_id: string }): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.disambiguatePerson(reportId, version, ctx, args));
  }

  selectOrder(sessionId: string, reportId: string, version: number, orderEventId: string): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.selectOrderForCharge(reportId, version, ctx, orderEventId));
  }

  evaluateCharge(sessionId: string, reportId: string, version: number): ChargeEvaluation {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.evaluateCharge(reportId, version, ctx));
  }

  requestClarification(sessionId: string, reportId: string, version: number): ReturnType<Engine['requestClarification']> {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.requestClarification(reportId, version, ctx));
  }

  answerQuestion(sessionId: string, reportId: string, version: number, args: { intent_id: string; answer_type: AnswerType; value?: string }): { fact_id: string | null } {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.answerQuestion(reportId, version, ctx, args));
  }

  // Officer fact confirmation is personal: officer role only (Stage 15).
  confirmFacts(sessionId: string, reportId: string, version: number, request: Parameters<Engine['confirmFacts']>[3]): string {
    return this.workflowOp(sessionId, reportId, OFFICER_ONLY, (ctx) => this.engine.confirmFacts(reportId, version, ctx, request));
  }

  acknowledgeQualityWarnings(sessionId: string, reportId: string, version: number): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.acknowledgeQualityWarnings(reportId, version, ctx));
  }

  // Policy determinations are attributable, authorized actions (invariant 19).
  resolvePolicyReview(sessionId: string, reportId: string, version: number, args: { category: string; resolution: string }): void {
    this.workflowOp(sessionId, reportId, SUPERVISOR_ONLY, (ctx) => this.engine.resolvePolicyReview(reportId, version, ctx, args));
  }

  resolveProceduralConflict(sessionId: string, reportId: string, version: number, key: string): void {
    this.workflowOp(sessionId, reportId, SUPERVISOR_ONLY, (ctx) => this.engine.resolveProceduralConflict(reportId, version, ctx, key));
  }

  createSnapshot(sessionId: string, reportId: string, version: number): string {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.createSnapshot(reportId, version, ctx));
  }

  generateNarrative(sessionId: string, reportId: string, version: number): string {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.generateNarrative(reportId, version, ctx));
  }

  validateNarrative(sessionId: string, reportId: string, version: number): ReturnType<Engine['validateNarrative']> {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.validateNarrative(reportId, version, ctx));
  }

  regenerateNarrative(sessionId: string, reportId: string, version: number): { passed: boolean } {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.regenerateNarrative(reportId, version, ctx));
  }

  editSentence(sessionId: string, reportId: string, version: number, args: { sentence_id: string; new_text: string }): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.editSentence(reportId, version, ctx, args));
  }

  resourceSentence(sessionId: string, reportId: string, version: number, sentenceId: string): ReturnType<Engine['resourceSentence']> {
    return this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.resourceSentence(reportId, version, ctx, sentenceId));
  }

  revertSentence(sessionId: string, reportId: string, version: number, sentenceId: string): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.revertSentence(reportId, version, ctx, sentenceId));
  }

  restateSentence(sessionId: string, reportId: string, version: number, args: { sentence_id: string; new_text: string }): void {
    this.workflowOp(sessionId, reportId, WORKFLOW, (ctx) => this.engine.restateSentence(reportId, version, ctx, args));
  }

  // Certification is the reporting officer's personal act (Stage 22).
  certify(sessionId: string, reportId: string, version: number, request: Parameters<Engine['certify']>[3]): string {
    return this.run(sessionId, OFFICER_ONLY, (user, session) => {
      const meta = this.engine.getWorkspaceMeta(reportId);
      if (meta.owner_user_id !== user.user_id) {
        throw new AuthError('FORBIDDEN', 'Only the reporting officer who owns this report can certify it');
      }
      return this.engine.certify(reportId, version, this.ctx(session, user), request);
    });
  }

  commitAuditFinalization(sessionId: string, reportId: string, version: number): void {
    this.workflowOp(sessionId, reportId, OFFICER_ONLY, (ctx) => this.engine.commitAuditFinalization(reportId, version, ctx));
  }

  transitionLifecycle(sessionId: string, reportId: string, version: number, to: 'ABANDONED' | 'VOIDED'): void {
    const roles: Role[] = to === 'VOIDED' ? SUPERVISOR_ONLY : WORKFLOW;
    this.workflowOp(sessionId, reportId, roles, (ctx) => this.engine.transitionLifecycle(reportId, version, ctx, to));
  }

  // ------------------------------------------------------------------
  // §8 — review drafts: visibly nonfinal, watermarked, logged
  // ------------------------------------------------------------------

  getReviewDraft(sessionId: string, reportId: string): { watermark: string; lines: string[] } {
    return this.run(sessionId, [...WORKFLOW, ...AUDIT_READERS], (user) => {
      const meta = this.engine.getWorkspaceMeta(reportId);
      if (user.role === 'officer' && meta.owner_user_id !== user.user_id) {
        throw new AuthError('FORBIDDEN', 'This report belongs to another officer');
      }
      const inspect = this.engine.inspect(reportId);
      if (!inspect.narrative) {
        throw new EngineError('NOT_FOUND', 'No narrative draft exists yet');
      }
      this.engine.recordDraftView(reportId, user.user_id);
      // Inline textual watermarking between sections (§8).
      const lines: string[] = [REVIEW_DRAFT_WATERMARK];
      let lastSection: string | null = null;
      for (const sentence of inspect.narrative.sentences) {
        if (sentence.section !== lastSection) {
          if (lastSection !== null) lines.push(REVIEW_DRAFT_WATERMARK);
          lastSection = sentence.section;
        }
        lines.push(sentence.text);
      }
      lines.push(REVIEW_DRAFT_WATERMARK);
      return { watermark: REVIEW_DRAFT_WATERMARK, lines };
    });
  }

  // ------------------------------------------------------------------
  // Stage 24 — token issuance and CENTRAL output authorization
  // ------------------------------------------------------------------

  issueOutputToken(sessionId: string, reportId: string, channel: OutputChannel): FinalizationToken {
    return this.run(sessionId, OFFICER_ONLY, (user, session) => {
      const meta = this.engine.getWorkspaceMeta(reportId);
      if (meta.owner_user_id !== user.user_id) {
        throw new AuthError('FORBIDDEN', 'Only the reporting officer who owns this report can request final output');
      }
      if (meta.session_id !== session.session_id) {
        throw new AuthError('FORBIDDEN', 'This report is locked to a different session; claim it first');
      }
      return this.engine.issueToken(reportId, { session_id: session.session_id, actor: user.user_id, role: user.role }, channel);
    });
  }

  // Invariant 8: the ONLY path that returns final narrative text — for every
  // v1 channel, including copy.
  redeemOutput(sessionId: string, tokenId: string, channel: OutputChannel): { output: string } {
    return this.run(sessionId, OFFICER_ONLY, (user, session) =>
      this.engine.authorizeOutput(tokenId, this.ctx(session, user), channel)
    );
  }

  revokeToken(sessionId: string, tokenId: string): void {
    this.run(sessionId, [...WORKFLOW, 'system_admin'], (user, session) => this.engine.revokeToken(tokenId, this.ctx(session, user)));
  }

  // Trigger C (Stage 21) raised from the serving layer — e.g. live model
  // output stayed malformed after the retry bound. Audits nothing itself
  // (the engine gate state change is persisted); the caller reports the hold.
  raiseSystemHold(sessionId: string, reportId: string, reason: string): void {
    this.run(sessionId, [...WORKFLOW, 'system_admin'], (user) => {
      this.requireReportAccess(user, reportId);
      this.engine.raiseSystemEvent(reportId, reason);
    });
  }

  // ------------------------------------------------------------------
  // §10 — kill switch (engine checks the policy-configured roles)
  // ------------------------------------------------------------------

  engageKillSwitch(sessionId: string, reason: string): void {
    this.run(sessionId, ['system_admin'], (user) => this.engine.engageKillSwitch({ actor: user.user_id, role: user.role, reason }));
  }

  releaseKillSwitch(sessionId: string): void {
    this.run(sessionId, ['system_admin'], (user) => this.engine.releaseKillSwitch({ actor: user.user_id, role: user.role }));
  }

  // ------------------------------------------------------------------
  // Stage 23 — audit access (role-gated; stricter than app logs, §12)
  // ------------------------------------------------------------------

  readAudit(sessionId: string, reportId?: string): AuditEvent[] {
    return this.run(sessionId, AUDIT_READERS, () => this.engine.auditEvents(reportId));
  }

  // ------------------------------------------------------------------
  // §5.3 — retention/lifecycle enforcement
  // ------------------------------------------------------------------

  runRetentionSweep(actor: string): { expired: string[] } {
    const expired: string[] = [];
    for (const meta of this.engine.listWorkspaces()) {
      if (meta.lifecycle === 'DRAFT' && this.engine.expireIfInactive(meta.report_id, actor)) {
        expired.push(meta.report_id);
      }
    }
    this.persist();
    return { expired };
  }

  sweepRetention(sessionId: string): { expired: string[] } {
    const { user } = this.auth.requireSession(sessionId);
    this.requireRole(user, ['system_admin', 'supervisor']);
    return this.runRetentionSweep(user.user_id);
  }
}
