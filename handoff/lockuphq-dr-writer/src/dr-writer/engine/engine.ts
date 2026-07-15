// LOCKUPHQ DR Writer — executable state machine (blueprint §18 Phase 2).
// Implements: independent gates, derived statuses, rollback dependency graph
// (Stage 21 Triggers A-D), CHARGE UNSUPPORTED, optimistic concurrency (§9),
// atomic stage commits, kill switch (§10), audit-before-token ordering
// (invariant 23), finalization-token stub and central output-authorization
// stub (Stage 24). All AI calls go through deterministic fakes (aiStubs.ts).
// The engine fails closed: a false block is safer than a false ready-state.

import type {
  AdministrativeIntake,
  Amendment,
  AuditEvent,
  AuditEventType,
  Certification,
  DisplayStatus,
  Fact,
  FactCertainty,
  FactConfirmationEvent,
  FactSnapshot,
  FinalizationToken,
  Gates,
  IncidentGroup,
  Lifecycle,
  Narrative,
  NarrativeSentence,
  OrderEvent,
  OutputChannel,
  ProceduralScreen,
  RawNotes,
  ValidationIssue,
  ValidationResult,
} from './types.ts';
import type { AnswerType, ChargePacket, PolicyProfile } from './packets.ts';
import { ANSWER_TYPES, deriveReportDate, validateChargePacket } from './packets.ts';
import type { RequirementRegistry, SourceRegistry } from './registries.ts';
import { runDeploymentCheck } from './registries.ts';
import { randomBytes } from 'node:crypto';
import { PersonRegistry } from './personRegistry.ts';
import type { PersonRegistryState } from './personRegistry.ts';
import { deriveDisplayStatus, initialGates } from './gates.ts';
import { EngineError } from './errors.ts';
import { hashText, hashValue } from './hash.ts';
import type { AiStubs, CriticOutput } from './aiStubs.ts';
import { defaultAiStubs } from './aiStubs.ts';
import { assertTransitionAllowed } from './lifecycle.ts';

const MAX_NOTES_LENGTH = 100_000;
const MAX_EXTRACTION_RETRIES = 2;
const RAPID_CONFIRMATION_MS_PER_FACT = 2_000;

// Fact categories that may be shared through an incident group. Everything
// else is subject-specific and may never be reused across siblings (§5.2).
const SHARED_SCENE_CATEGORIES = ['scene_location', 'scene_time', 'scene_context', 'staff_present'];

// Procedural-screen keys deterministically cross-checked against extracted
// fact categories (Stage 12).
const CROSS_CHECKED_SCREEN_KEYS = ['force_used', 'medical_involvement'];

const FORBIDDEN_CONCLUSIONS = ['guilty', 'should be punished', 'diagnosis', 'unlawful order'];
const PLACEHOLDER_MARKERS = ['[TODO', '[REVIEW', '[PLACEHOLDER', '<insert'];

export interface ChargeEvaluation {
  outcome: 'FACTS_INCOMPLETE' | 'POLICY_REVIEW' | 'CHARGE_UNSUPPORTED' | 'REVIEW_REQUIRED' | 'READY_FOR_GENERATION';
  missing_categories: string[];
  unconfirmed_categories: string[];
  reasons: string[];
  failed_unsupported_rule: { rule_id: string; description: string } | null;
  quality_warnings: string[];
}

interface Workspace {
  report_id: string;
  incident_group_id: string | null;
  lifecycle: Lifecycle;
  report_version: number;
  owner_user_id: string;
  session_id: string;
  institution_id: string;
  subject_person_id: string;
  charge_code: string;
  gates: Gates;
  chargeUnsupported: { rule_id: string; description: string } | null;
  admin: AdministrativeIntake | null;
  proceduralScreen: ProceduralScreen | null;
  proceduralResolutions: string[];
  policyResolutions: Record<string, { resolved_by: string; resolution: string; policy_version: string; resolved_at: string }>;
  rawNotes: RawNotes | null;
  amendments: Amendment[];
  extractionDone: boolean;
  cannotDetermine: boolean;
  injectionSuspected: boolean;
  critic: CriticOutput | null;
  facts: Fact[];
  orderEvents: OrderEvent[];
  participants: string[];
  confirmationEvent: FactConfirmationEvent | null;
  chargeEvaluation: ChargeEvaluation | null;
  clarificationRounds: number;
  questionAnswers: { intent_id: string; answer_type: AnswerType; created_at: string }[];
  manualFactReview: string[];
  qualityAcknowledged: boolean;
  snapshot: FactSnapshot | null;
  narrative: Narrative | null;
  originalSentences: Record<string, { text: string; source_fact_ids: string[] }>;
  deterministicValidation: ValidationResult | null;
  semanticValidation: ValidationResult | null;
  regenAttempts: number;
  resourcingAttempts: Record<string, number>;
  certification: Certification | null;
  auditFinalizationCommitted: boolean;
  outputCompleted: boolean;
  created_at: string;
  updated_at: string;
}

// Phase 7 — the complete plain-data engine state. Everything here is
// JSON-serializable; no functions, class instances, or Dates.
export interface EngineState {
  state_version: 1;
  workspaces: Workspace[];
  groups: IncidentGroup[];
  tokens: FinalizationToken[];
  auditLog: AuditEvent[];
  idempotency: { key: string; result: unknown }[];
  killSwitchEngaged: boolean;
  idCounter: number;
  auditSeq: number;
  persons: PersonRegistryState;
}

export interface EngineConfig {
  requirements: RequirementRegistry;
  sources: SourceRegistry;
  packet: ChargePacket;
  policy: PolicyProfile;
  deployment_check_date: string; // incident/deployment date for §11 checks
  clock?: () => Date;
  stubs?: Partial<AiStubs>;
}

interface OpContext {
  session_id: string;
  actor: string;
  idempotency_key?: string;
}

export class Engine {
  readonly packet: ChargePacket;
  readonly policy: PolicyProfile;
  readonly persons: PersonRegistry;
  private readonly stubs: AiStubs;
  private readonly clock: () => Date;
  private readonly workspaces = new Map<string, Workspace>();
  private readonly groups = new Map<string, IncidentGroup>();
  private readonly tokens = new Map<string, FinalizationToken>();
  private readonly auditLog: AuditEvent[] = [];
  private readonly idempotencyResults = new Map<string, unknown>();
  private killSwitchEngaged = false;
  private idCounter = 0;
  private auditSeq = 0;
  private lastCommitReplayed = false;

  private constructor(config: EngineConfig) {
    this.packet = config.packet;
    this.policy = config.policy;
    this.persons = new PersonRegistry();
    this.clock = config.clock ?? (() => new Date());
    this.stubs = { ...defaultAiStubs(), ...(config.stubs ?? {}) };
  }

  // §11 — deployment fails closed when any Tier 1/2 hard blocker is unsourced,
  // unapproved, not effective, conflicted, or overridden by an unapproved rule.
  static create(config: EngineConfig): Engine {
    const deployment = runDeploymentCheck(config.requirements, config.sources, config.deployment_check_date);
    if (!deployment.ok) {
      const detail = deployment.failures.map((f) => `${f.requirement_id}:${f.reason}`).join('; ');
      throw new EngineError('DEPLOYMENT_FAILED', `Deployment check failed: ${detail}`);
    }
    const packetProblems = validateChargePacket(config.packet);
    if (packetProblems.length > 0) {
      throw new EngineError('DEPLOYMENT_FAILED', `Charge packet invalid: ${packetProblems.join('; ')}`);
    }
    return new Engine(config);
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private audit(eventType: AuditEventType, reportId: string | null, actor: string | null, payload: Record<string, unknown> = {}): void {
    this.auditSeq += 1;
    this.auditLog.push({
      audit_seq: this.auditSeq,
      event_type: eventType,
      report_id: reportId,
      actor_user_id: actor,
      created_at: this.now(),
      payload,
    });
  }

  auditEvents(reportId?: string): AuditEvent[] {
    const events = reportId ? this.auditLog.filter((e) => e.report_id === reportId) : this.auditLog;
    return events.map((e) => ({ ...e }));
  }

  private ws(reportId: string): Workspace {
    const ws = this.workspaces.get(reportId);
    if (!ws) throw new EngineError('NOT_FOUND', `Unknown report: ${reportId}`);
    return ws;
  }

  private assertCommitContext(
    current: Workspace,
    ctx: OpContext,
    opts: { allowNonDraft?: boolean; bypassSessionLock?: boolean } = {}
  ): void {
    if (this.killSwitchEngaged) {
      throw new EngineError('SYSTEM_HOLD', 'Kill switch engaged: all reports are in SYSTEM HOLD');
    }
    if (current.gates.system_gate.state !== 'pass') {
      throw new EngineError('SYSTEM_HOLD', `SYSTEM HOLD: ${current.gates.system_gate.reasons.join('; ')}`);
    }
    if (!opts.allowNonDraft && current.lifecycle !== 'DRAFT') {
      throw new EngineError('LIFECYCLE', `Report is ${current.lifecycle}; content mutation is not permitted`);
    }
    if (!opts.bypassSessionLock && ctx.session_id !== current.session_id) {
      throw new EngineError('SESSION_LOCK', 'Report is locked to another session');
    }
  }

  private assertExpectedVersion(current: Workspace, expectedVersion: number, actor: string): void {
    if (expectedVersion === current.report_version) return;
    this.audit('concurrency_rejected', current.report_id, actor, {
      expected_version: expectedVersion,
      current_version: current.report_version,
    });
    throw new EngineError(
      'STALE_WRITE',
      `Stale write rejected: expected version ${expectedVersion}, current is ${current.report_version}. Reload the latest committed state; no automatic merge.`
    );
  }

  // Serving-layer preflight before a live model call. This applies the same
  // lifecycle, system, session-lock, and optimistic-concurrency checks as an
  // engine commit without mutating report state or consuming a mailbox slot.
  preflightWorkflow(reportId: string, expectedVersion: number, ctx: OpContext): void {
    const current = this.ws(reportId);
    this.assertCommitContext(current, ctx);
    this.assertExpectedVersion(current, expectedVersion, ctx.actor);
  }

  preflightRegeneration(reportId: string, expectedVersion: number, ctx: OpContext): void {
    this.preflightWorkflow(reportId, expectedVersion, ctx);
    const current = this.ws(reportId);
    if (!current.narrative) throw new EngineError('GATE_BLOCKED', 'No narrative to regenerate');
    if (current.gates.narrative_gate.state === 'pass') {
      throw new EngineError('FORBIDDEN', 'Narrative already passed validation');
    }
    if (current.regenAttempts >= this.policy.max_regeneration_attempts) {
      throw new EngineError(
        'RETRY_LIMIT',
        `Automated regeneration limit (${this.policy.max_regeneration_attempts}) reached; remain in VALIDATION HOLD pending officer resolution`
      );
    }
  }

  // Atomic stage commit with optimistic concurrency (§9). The mutator runs
  // against a deep copy; on any throw the original state is untouched — a
  // partial stage result is never promoted.
  private commit<T>(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext,
    mutator: (ws: Workspace) => T,
    opts: { allowNonDraft?: boolean; bypassSessionLock?: boolean } = {}
  ): T {
    const current = this.ws(reportId);

    this.assertCommitContext(current, ctx, opts);
    // Idempotency is checked before the version gate: a retried request whose
    // original attempt already committed (client saw a network failure) must
    // return the original result, not a spurious STALE_WRITE (§9). Replays
    // must not re-fire post-commit audit events either.
    this.lastCommitReplayed = false;
    if (ctx.idempotency_key) {
      const key = `${reportId}:${ctx.idempotency_key}`;
      if (this.idempotencyResults.has(key)) {
        this.lastCommitReplayed = true;
        return this.idempotencyResults.get(key) as T;
      }
    }
    this.assertExpectedVersion(current, expectedVersion, ctx.actor);

    const working = structuredClone(current);
    const result = mutator(working); // throws => no state change
    working.report_version = current.report_version + 1;
    working.updated_at = this.now();
    this.workspaces.set(reportId, working);

    if (ctx.idempotency_key) {
      this.idempotencyResults.set(`${reportId}:${ctx.idempotency_key}`, result);
    }
    return result;
  }

  private ledgerHash(ws: Workspace): string {
    return hashValue(
      ws.facts.map((f) => ({
        fact_id: f.fact_id,
        modified_version: f.modified_version,
        category: f.category,
        value: f.value,
        source_text: f.source_text,
      }))
    );
  }

  private narrativeHash(sentences: NarrativeSentence[]): string {
    return hashValue(sentences.map((s) => ({ sentence_id: s.sentence_id, text: s.text, source_fact_ids: s.source_fact_ids })));
  }

  private confirmedFacts(ws: Workspace): Fact[] {
    return ws.facts.filter((f) => f.confirmation_status === 'confirmed' && f.extraction_status !== 'superseded');
  }

  private selectedOrder(ws: Workspace): OrderEvent | null {
    const selected = ws.orderEvents.filter((o) => o.selected_for_charge);
    return selected.length === 1 ? selected[0] : null;
  }

  private revokeReportTokens(reportId: string, reason: string, actor: string | null): void {
    for (const token of this.tokens.values()) {
      if (token.report_id === reportId && token.redeemed_at === null && token.revoked_at === null) {
        token.revoked_at = this.now();
        this.audit('token_revoked', reportId, actor, { token_id: token.token_id, reason });
      }
    }
  }

  // ------------------------------------------------------------------
  // Stage 21 — rollback dependency graph
  // ------------------------------------------------------------------

  // Trigger A — administrative or factual change: rollback to charge
  // evaluation; every downstream artifact is invalidated (invariant 14).
  private applyTriggerA(ws: Workspace, reason: string): void {
    ws.chargeEvaluation = null;
    ws.chargeUnsupported = null; // terminal state lifts only because a fact changed
    ws.confirmationEvent = null;
    ws.snapshot = null;
    ws.narrative = null;
    ws.originalSentences = {};
    ws.deterministicValidation = null;
    ws.semanticValidation = null;
    ws.certification = null;
    ws.auditFinalizationCommitted = false;
    ws.qualityAcknowledged = false;
    ws.regenAttempts = 0;
    ws.resourcingAttempts = {};
    ws.gates.fact_gate = { state: 'pending', reasons: [`re-evaluation required: ${reason}`] };
    ws.gates.narrative_gate = { state: 'pending', reasons: ['no narrative generated'] };
    ws.gates.certification_gate = { state: 'pending', reasons: ['no certification'] };
    ws.gates.audit_gate = { state: 'pending', reasons: ['audit finalization not committed'] };
  }

  // Trigger B — narrative-only edit: rollback to re-sourcing and both
  // validators; certification, audit finalization, and token are invalidated.
  private applyTriggerB(ws: Workspace, reason: string): void {
    ws.deterministicValidation = null;
    ws.semanticValidation = null;
    ws.certification = null;
    ws.auditFinalizationCommitted = false;
    ws.gates.narrative_gate = { state: 'hold', reasons: [reason] };
    ws.gates.certification_gate = { state: 'pending', reasons: ['no certification'] };
    ws.gates.audit_gate = { state: 'pending', reasons: ['audit finalization not committed'] };
  }

  // Trigger C — version, policy, kill-switch, session, or concurrency event:
  // SYSTEM HOLD until compatibility or current-state recovery.
  raiseSystemEvent(reportId: string, kind: string): void {
    const ws = this.ws(reportId);
    ws.gates.system_gate = { state: 'hold', reasons: [kind] };
  }

  recoverSystemHold(reportId: string): void {
    const ws = this.ws(reportId);
    if (this.killSwitchEngaged) {
      throw new EngineError('SYSTEM_HOLD', 'Cannot recover while kill switch is engaged');
    }
    if (!this.isVersionCompatible(ws)) {
      throw new EngineError('SYSTEM_HOLD', 'Version compatibility check failed; report remains in SYSTEM HOLD');
    }
    ws.gates.system_gate = { state: 'pass', reasons: [] };
  }

  private isVersionCompatible(ws: Workspace): boolean {
    if (ws.snapshot === null) return true;
    return (
      ws.snapshot.charge_version === this.packet.charge_version &&
      ws.snapshot.policy_version === this.policy.policy_version &&
      ws.snapshot.schema_version === this.policy.schema_version
    );
  }

  // ------------------------------------------------------------------
  // Workspace, persons, incident groups
  // ------------------------------------------------------------------

  addPerson(person: Parameters<PersonRegistry['add']>[0]): void {
    this.persons.add(person);
  }

  createIncidentGroup(args: { created_by: string; creation_source: string; shared_staff?: string[] }): IncidentGroup {
    const group: IncidentGroup = {
      incident_group_id: this.nextId('grp'),
      shared_scene_facts: [],
      shared_staff: args.shared_staff ?? [],
      shared_date_time_location: null,
      sibling_report_ids: [],
      creation_source: args.creation_source,
      created_by: args.created_by,
    };
    this.groups.set(group.incident_group_id, group);
    return group;
  }

  getIncidentGroup(groupId: string): IncidentGroup {
    const group = this.groups.get(groupId);
    if (!group) throw new EngineError('NOT_FOUND', `Unknown incident group: ${groupId}`);
    return group;
  }

  createWorkspace(args: {
    owner_user_id: string;
    session_id: string;
    institution_id: string;
    subject_person_id: string;
    charge_code: string;
    incident_group_id?: string;
    participants?: string[];
  }): { report_id: string; report_version: number } {
    if (this.killSwitchEngaged) {
      throw new EngineError('SYSTEM_HOLD', 'Kill switch engaged: workspace creation rejected');
    }
    if (args.charge_code !== this.packet.charge_code) {
      throw new EngineError('INPUT_REJECTED', `No approved charge packet for charge ${args.charge_code}`);
    }
    const subject = this.persons.get(args.subject_person_id);
    if (!subject || subject.person_type !== 'inmate') {
      throw new EngineError('INPUT_REJECTED', 'Subject must be a registered inmate person record');
    }
    if (args.incident_group_id) {
      this.getIncidentGroup(args.incident_group_id); // must exist
    }
    const reportId = this.nextId('rpt');
    const nowIso = this.now();
    const ws: Workspace = {
      report_id: reportId,
      incident_group_id: args.incident_group_id ?? null,
      lifecycle: 'DRAFT',
      report_version: 1,
      owner_user_id: args.owner_user_id,
      session_id: args.session_id,
      institution_id: args.institution_id,
      subject_person_id: args.subject_person_id,
      charge_code: args.charge_code,
      gates: initialGates(),
      chargeUnsupported: null,
      admin: null,
      proceduralScreen: null,
      proceduralResolutions: [],
      policyResolutions: {},
      rawNotes: null,
      amendments: [],
      extractionDone: false,
      cannotDetermine: false,
      injectionSuspected: false,
      critic: null,
      facts: [],
      orderEvents: [],
      participants: [...new Set([...(args.participants ?? []), args.subject_person_id])],
      confirmationEvent: null,
      chargeEvaluation: null,
      clarificationRounds: 0,
      questionAnswers: [],
      manualFactReview: [],
      qualityAcknowledged: false,
      snapshot: null,
      narrative: null,
      originalSentences: {},
      deterministicValidation: null,
      semanticValidation: null,
      regenAttempts: 0,
      resourcingAttempts: {},
      certification: null,
      auditFinalizationCommitted: false,
      outputCompleted: false,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.workspaces.set(reportId, ws);
    if (args.incident_group_id) {
      this.getIncidentGroup(args.incident_group_id).sibling_report_ids.push(reportId);
    }
    this.audit('workspace_created', reportId, args.owner_user_id, { charge_code: args.charge_code });
    this.audit('session_locked', reportId, args.owner_user_id, { session_id: args.session_id });
    return { report_id: reportId, report_version: ws.report_version };
  }

  getVersion(reportId: string): number {
    return this.ws(reportId).report_version;
  }

  // Phase 7 — ownership/lock metadata for the authorization layer.
  getWorkspaceMeta(reportId: string): {
    report_id: string;
    owner_user_id: string;
    session_id: string;
    institution_id: string;
    subject_person_id: string;
    charge_code: string;
    incident_group_id: string | null;
    lifecycle: Lifecycle;
    report_version: number;
    participants: string[];
    created_at: string;
    updated_at: string;
  } {
    const ws = this.ws(reportId);
    return {
      report_id: ws.report_id,
      owner_user_id: ws.owner_user_id,
      session_id: ws.session_id,
      institution_id: ws.institution_id,
      subject_person_id: ws.subject_person_id,
      charge_code: ws.charge_code,
      incident_group_id: ws.incident_group_id,
      lifecycle: ws.lifecycle,
      report_version: ws.report_version,
      participants: [...ws.participants],
      created_at: ws.created_at,
      updated_at: ws.updated_at,
    };
  }

  listWorkspaces(): ReturnType<Engine['getWorkspaceMeta']>[] {
    return [...this.workspaces.keys()].map((id) => this.getWorkspaceMeta(id));
  }

  getLifecycle(reportId: string): Lifecycle {
    return this.ws(reportId).lifecycle;
  }

  getGates(reportId: string): Gates {
    return structuredClone(this.ws(reportId).gates);
  }

  getDisplayStatus(reportId: string): DisplayStatus {
    const ws = this.ws(reportId);
    if (this.killSwitchEngaged) return 'SYSTEM HOLD';
    return deriveDisplayStatus({
      gates: ws.gates,
      chargeUnsupported: ws.chargeUnsupported !== null,
      hasNarrative: ws.narrative !== null,
      outputCompleted: ws.outputCompleted,
    });
  }

  inspect(reportId: string): {
    lifecycle: Lifecycle;
    report_version: number;
    chargeEvaluation: ChargeEvaluation | null;
    chargeUnsupported: { rule_id: string; description: string } | null;
    factCount: number;
    facts: Fact[];
    orderEvents: OrderEvent[];
    confirmationEvent: FactConfirmationEvent | null;
    snapshot: FactSnapshot | null;
    narrative: Narrative | null;
    critic: CriticOutput | null;
    certification: Certification | null;
    deterministicValidation: ValidationResult | null;
    semanticValidation: ValidationResult | null;
    auditFinalizationCommitted: boolean;
    outputCompleted: boolean;
    amendments: Amendment[];
    manualFactReview: string[];
    questionAnswers: { intent_id: string; answer_type: AnswerType; created_at: string }[];
    admin: AdministrativeIntake | null;
    proceduralScreen: ProceduralScreen | null;
    rawNotes: RawNotes | null;
  } {
    const ws = this.ws(reportId);
    return structuredClone({
      lifecycle: ws.lifecycle,
      report_version: ws.report_version,
      chargeEvaluation: ws.chargeEvaluation,
      chargeUnsupported: ws.chargeUnsupported,
      factCount: ws.facts.length,
      facts: ws.facts,
      orderEvents: ws.orderEvents,
      confirmationEvent: ws.confirmationEvent,
      snapshot: ws.snapshot,
      narrative: ws.narrative,
      critic: ws.critic,
      certification: ws.certification,
      deterministicValidation: ws.deterministicValidation,
      semanticValidation: ws.semanticValidation,
      auditFinalizationCommitted: ws.auditFinalizationCommitted,
      outputCompleted: ws.outputCompleted,
      amendments: ws.amendments,
      manualFactReview: ws.manualFactReview,
      questionAnswers: ws.questionAnswers,
      admin: ws.admin,
      proceduralScreen: ws.proceduralScreen,
      rawNotes: ws.rawNotes,
    });
  }

  currentLedgerHash(reportId: string): string {
    return this.ledgerHash(this.ws(reportId));
  }

  currentSnapshotHash(reportId: string): string {
    const ws = this.ws(reportId);
    if (!ws.snapshot) throw new EngineError('NOT_FOUND', 'No snapshot exists');
    return hashValue(ws.snapshot);
  }

  currentNarrativeHash(reportId: string): string {
    const ws = this.ws(reportId);
    if (!ws.narrative) throw new EngineError('NOT_FOUND', 'No narrative exists');
    return ws.narrative.narrative_hash;
  }

  // ------------------------------------------------------------------
  // Stage 2 — administrative intake (versioned report-date rule)
  // ------------------------------------------------------------------

  setAdministrativeIntake(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext,
    admin: Omit<AdministrativeIntake, 'derived_report_date' | 'report_date_rule_version'>
  ): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      const subject = this.persons.get(admin.subject_person_id);
      if (!subject) throw new EngineError('INPUT_REJECTED', 'Unknown subject person');
      if (subject.dc_number !== admin.subject_dc_number) {
        throw new EngineError('INPUT_REJECTED', 'Subject DC number does not match the person registry');
      }
      // Midnight crossover is resolved by the versioned policy rule, never guessed.
      const derived = deriveReportDate(admin.incident_start, this.policy.report_date_rule_version);
      const isEdit = ws.admin !== null;
      ws.admin = {
        ...admin,
        derived_report_date: derived,
        report_date_rule_version: this.policy.report_date_rule_version,
      };
      if (!ws.participants.includes(admin.reporting_officer_person_id)) {
        ws.participants.push(admin.reporting_officer_person_id);
      }
      if (isEdit && (ws.chargeEvaluation !== null || ws.confirmationEvent !== null)) {
        this.applyTriggerA(ws, 'administrative edit');
      }
    });
    const ws = this.ws(reportId);
    if (ws.chargeEvaluation === null && ws.snapshot === null) {
      this.revokeReportTokens(reportId, 'administrative edit', ctx.actor);
    }
  }

  addParticipant(reportId: string, expectedVersion: number, ctx: OpContext, personId: string): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!this.persons.get(personId)) throw new EngineError('INPUT_REJECTED', `Unknown person: ${personId}`);
      if (!ws.participants.includes(personId)) ws.participants.push(personId);
    });
  }

  // ------------------------------------------------------------------
  // Stage 3 — procedural screen
  // ------------------------------------------------------------------

  submitProceduralScreen(reportId: string, expectedVersion: number, ctx: OpContext, answers: Record<string, string>): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      ws.proceduralScreen = {
        screen_id: this.nextId('scr'),
        report_id: reportId,
        answers: { ...answers },
        created_at: this.now(),
      };
    });
  }

  // ------------------------------------------------------------------
  // Stage 4 — atomic original-notes commit (immutable afterwards)
  // ------------------------------------------------------------------

  commitOriginalNotes(reportId: string, expectedVersion: number, ctx: OpContext, args: { text: string; request_id: string }): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (ws.rawNotes !== null) {
        throw new EngineError('FORBIDDEN', 'Original notes are immutable after atomic commit (invariant 9)');
      }
      if (args.text.length > MAX_NOTES_LENGTH) {
        // Silent truncation is prohibited — reject instead.
        throw new EngineError('INPUT_REJECTED', `Notes exceed maximum length ${MAX_NOTES_LENGTH}; input rejected, not truncated`);
      }
      ws.rawNotes = {
        raw_notes_id: this.nextId('notes'),
        report_id: reportId,
        original_text: args.text,
        committed_hash: hashText(args.text),
        created_by: ctx.actor,
        created_at: this.now(),
        request_id: args.request_id,
        encoding: 'utf-8',
        length: args.text.length,
        truncated: false,
        immutable: true,
      };
    });
    if (!this.lastCommitReplayed) {
      this.audit('original_notes_committed', reportId, ctx.actor, { hash: this.ws(reportId).rawNotes!.committed_hash });
    }
  }

  // ------------------------------------------------------------------
  // Stage 6 — atomic fact extraction (deterministic fake)
  // ------------------------------------------------------------------

  private ingestExtraction(ws: Workspace, sourceType: 'original_notes' | 'amendment', sourceRecordId: string, text: string): void {
    // At most two idempotent retries for malformed output, then SYSTEM HOLD.
    let output = this.stubs.extract(text);
    let retries = 0;
    while (output.outcome === 'malformed' && retries < MAX_EXTRACTION_RETRIES) {
      retries += 1;
      output = this.stubs.extract(text);
    }
    if (output.outcome === 'malformed') {
      ws.gates.system_gate = { state: 'hold', reasons: ['extraction produced malformed output after retries'] };
      throw new EngineError('SYSTEM_HOLD', 'Extraction failed after retries; SYSTEM HOLD');
    }
    if (output.outcome === 'CANNOT_DETERMINE') {
      ws.cannotDetermine = true;
      ws.gates.fact_gate = { state: 'hold', reasons: ['extractor returned CANNOT_DETERMINE'] };
      return;
    }
    if (output.injection_suspected) {
      ws.injectionSuspected = true;
      ws.gates.procedural_gate = { state: 'hold', reasons: ['injection_suspected: notes contained instruction-like content'] };
    }
    let sequence = ws.facts.length;
    for (const draft of output.facts) {
      sequence += 1;
      let speakerId: string | null = null;
      let subjectId: string | null = null;
      let ambiguousRefId: string | null = null;
      let ambiguousField: 'speaker' | 'subject' | null = null;

      for (const [field, ref] of [['speaker', draft.speaker_ref], ['subject', draft.subject_ref]] as const) {
        if (ref === null) continue;
        if (ref.startsWith('@')) {
          const resolved = this.persons.resolveReference(ws.report_id, ref.slice(1), ws.participants);
          if ('person_id' in resolved) {
            if (field === 'speaker') speakerId = resolved.person_id;
            else subjectId = resolved.person_id;
          } else if (ambiguousRefId === null) {
            ambiguousRefId = resolved.reference.reference_id;
            ambiguousField = field;
          }
        } else {
          if (!this.persons.get(ref)) throw new EngineError('INPUT_REJECTED', `Extraction referenced unknown person ${ref}`);
          if (field === 'speaker') speakerId = ref;
          else subjectId = ref;
        }
      }

      ws.facts.push({
        fact_id: this.nextId('fact'),
        report_id: ws.report_id,
        category: draft.category,
        value: draft.value,
        certainty: draft.certainty,
        source_type: sourceType,
        source_record_id: sourceRecordId,
        source_text: draft.source_line,
        speaker_person_id: speakerId,
        subject_person_id: subjectId,
        ambiguous_reference_id: ambiguousRefId,
        ambiguous_reference_field: ambiguousField,
        sequence,
        extraction_status: 'extracted',
        confirmation_status: 'unconfirmed',
        prior_fact_version: null,
        created_version: ws.report_version,
        modified_version: ws.report_version,
      });
    }
    for (const order of output.orders) {
      if (!this.persons.get(order.issuer_ref)) {
        throw new EngineError('INPUT_REJECTED', `Order issuer is not a registered person: ${order.issuer_ref}`);
      }
      ws.orderEvents.push({
        order_event_id: this.nextId('ord'),
        report_id: ws.report_id,
        issuer_person_id: order.issuer_ref,
        issuer_role_source: sourceType,
        authority_status: order.authority_status,
        authority_source: order.authority_status === 'supported' ? sourceRecordId : null,
        order_type: 'verbal',
        specific_command: order.specific_command,
        delivery_scope: 'individual',
        subject_applicability: order.subject_applicability,
        first_delivery_datetime: null,
        count_mode: 'unknown',
        exact_count: null,
        minimum_count: null,
        modification: null,
        rescission: order.rescinded_before_conduct
          ? { rescinded: true, rescinded_at: null, before_alleged_conduct: true }
          : { rescinded: false, rescinded_at: null, before_alleged_conduct: false },
        conflicting_orders: [],
        awareness_basis: null,
        opportunity: null,
        verbal_response_type: null,
        verbal_response: null,
        physical_response: null,
        compliance_result: order.compliance_result,
        compliance_timing: order.compliance_timing,
        selected_for_charge: false,
      });
    }
  }

  runExtraction(reportId: string, expectedVersion: number, ctx: OpContext): void {
    this.audit('extraction_started', reportId, ctx.actor, {});
    try {
      this.commit(reportId, expectedVersion, ctx, (ws) => {
        if (!ws.rawNotes) throw new EngineError('GATE_BLOCKED', 'Original notes must be committed before extraction');
        if (ws.extractionDone) throw new EngineError('FORBIDDEN', 'Extraction already ran for the original notes');
        this.ingestExtraction(ws, 'original_notes', ws.rawNotes.raw_notes_id, ws.rawNotes.original_text);
        ws.extractionDone = true;
      });
    } catch (err) {
      // SYSTEM HOLD from malformed extraction must persist even though the
      // stage commit itself rolled back (fail closed).
      if (err instanceof EngineError && err.code === 'SYSTEM_HOLD') {
        const ws = this.ws(reportId);
        ws.gates.system_gate = { state: 'hold', reasons: ['extraction produced malformed output after retries'] };
        this.audit('extraction_failed', reportId, ctx.actor, { reason: 'malformed output after retries' });
      }
      throw err;
    }
    this.audit('extraction_completed', reportId, ctx.actor, { fact_count: this.ws(reportId).facts.length });
  }

  // Stage 7 — extraction critic. Critic agreement never confirms a fact.
  runCritic(reportId: string, expectedVersion: number, ctx: OpContext): CriticOutput {
    const result = this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.extractionDone || !ws.rawNotes) throw new EngineError('GATE_BLOCKED', 'Extraction must complete before the critic runs');
      const critic = this.stubs.critic(ws.rawNotes.original_text, ws.facts.filter((f) => f.source_type === 'original_notes').length);
      ws.critic = critic;
      return critic;
    });
    this.audit('critic_completed', reportId, ctx.actor, { completeness_confirmed: result.completeness_confirmed });
    return result;
  }

  // ------------------------------------------------------------------
  // Stage 5 — amendments (separate immutable records; rollback triggers)
  // ------------------------------------------------------------------

  addAmendment(reportId: string, expectedVersion: number, ctx: OpContext, args: { text: string; reason: string }): string {
    const hadDownstream = this.ws(reportId).extractionDone;
    const amendmentId = this.commit(reportId, expectedVersion, ctx, (ws) => {
      const amendment: Amendment = {
        amendment_id: this.nextId('amd'),
        report_id: reportId,
        amendment_text: args.text,
        amendment_hash: hashText(args.text),
        reason: args.reason,
        created_by: ctx.actor,
        created_at: this.now(),
        rollback_triggered_at: null,
      };
      ws.amendments.push(amendment);
      if (ws.extractionDone) {
        // 1. Invalidate the critic's prior completeness judgment.
        ws.critic = null;
        // 2. Run extraction against the amendment. 3. Reconcile with the ledger.
        this.ingestExtraction(ws, 'amendment', amendment.amendment_id, args.text);
        // 4. Trigger factual rollback (Trigger A) — invalidates snapshot,
        // narrative, source map, validations, certification, audit
        // finalization, and (below) the finalization token.
        this.applyTriggerA(ws, `amendment ${amendment.amendment_id}`);
        amendment.rollback_triggered_at = this.now();
      }
      return amendment.amendment_id;
    });
    if (hadDownstream) {
      this.revokeReportTokens(reportId, `amendment ${amendmentId}`, ctx.actor);
    }
    this.audit('amendment_added', reportId, ctx.actor, { amendment_id: amendmentId, rollback: hadDownstream });
    return amendmentId;
  }

  // Factual-edit path: a correction creates a new fact version (append-only)
  // and triggers Trigger A.
  correctFact(reportId: string, expectedVersion: number, ctx: OpContext, args: { fact_id: string; value: string; certainty: FactCertainty }): string {
    const newId = this.commit(reportId, expectedVersion, ctx, (ws) => {
      const prior = ws.facts.find((f) => f.fact_id === args.fact_id && f.extraction_status !== 'superseded');
      if (!prior) throw new EngineError('NOT_FOUND', `Unknown or superseded fact: ${args.fact_id}`);
      prior.extraction_status = 'superseded';
      const corrected: Fact = {
        ...prior,
        fact_id: this.nextId('fact'),
        value: args.value,
        certainty: args.certainty,
        source_type: 'officer_answer',
        source_text: args.value,
        extraction_status: 'officer_added',
        confirmation_status: 'unconfirmed',
        prior_fact_version: prior.fact_id,
        created_version: ws.report_version,
        modified_version: ws.report_version,
        sequence: ws.facts.length + 1,
      };
      ws.facts.push(corrected);
      this.applyTriggerA(ws, `fact correction of ${args.fact_id}`);
      return corrected.fact_id;
    });
    this.revokeReportTokens(reportId, `fact correction of ${args.fact_id}`, ctx.actor);
    return newId;
  }

  // ------------------------------------------------------------------
  // Stage 8 — person disambiguation
  // ------------------------------------------------------------------

  disambiguatePerson(reportId: string, expectedVersion: number, ctx: OpContext, args: { reference_id: string; person_id: string }): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      this.persons.resolveAmbiguity(args.reference_id, args.person_id);
      for (const fact of ws.facts) {
        if (fact.ambiguous_reference_id === args.reference_id) {
          if (fact.ambiguous_reference_field === 'speaker') fact.speaker_person_id = args.person_id;
          else if (fact.ambiguous_reference_field === 'subject') fact.subject_person_id = args.person_id;
          fact.ambiguous_reference_id = null;
          fact.ambiguous_reference_field = null;
          fact.modified_version = ws.report_version;
        }
      }
      // Identity correction after evaluation/confirmation is a Trigger A event.
      if (ws.chargeEvaluation !== null || ws.confirmationEvent !== null) {
        this.applyTriggerA(ws, `person disambiguation ${args.reference_id}`);
      }
    });
    this.audit('person_disambiguated', reportId, ctx.actor, args as unknown as Record<string, unknown>);
  }

  // ------------------------------------------------------------------
  // Stage 10 — order selection (one charge-supporting order event)
  // ------------------------------------------------------------------

  selectOrderForCharge(reportId: string, expectedVersion: number, ctx: OpContext, orderEventId: string): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      const order = ws.orderEvents.find((o) => o.order_event_id === orderEventId);
      if (!order) throw new EngineError('NOT_FOUND', `Unknown order event: ${orderEventId}`);
      const previouslySelected = ws.orderEvents.find((o) => o.selected_for_charge);
      for (const o of ws.orderEvents) o.selected_for_charge = o.order_event_id === orderEventId;
      if (previouslySelected && previouslySelected.order_event_id !== orderEventId && ws.chargeEvaluation !== null) {
        this.applyTriggerA(ws, 'selected-order change');
      }
    });
  }

  // ------------------------------------------------------------------
  // Stages 12-13 — cross-consistency checks and deterministic charge evaluation
  // ------------------------------------------------------------------

  evaluateCharge(reportId: string, expectedVersion: number, ctx: OpContext): ChargeEvaluation {
    const evaluation = this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.extractionDone) throw new EngineError('GATE_BLOCKED', 'Extraction must complete before charge evaluation');
      if (ws.chargeUnsupported !== null) {
        // Trigger D — terminal unless a fact actually changes.
        throw new EngineError('CHARGE_UNSUPPORTED_TERMINAL', 'CHARGE UNSUPPORTED is terminal for the selected charge unless a fact changes');
      }

      // Stage 12 — deterministic cross-consistency checks.
      const proceduralConflicts: string[] = [];
      if (ws.proceduralScreen) {
        for (const key of CROSS_CHECKED_SCREEN_KEYS) {
          if (ws.proceduralResolutions.includes(key)) continue;
          const screenAnswer = ws.proceduralScreen.answers[key];
          const noteFact = ws.facts.some((f) => f.category === key && f.extraction_status !== 'superseded');
          if (screenAnswer === 'no' && noteFact) proceduralConflicts.push(`screen_conflict:${key}`);
        }
      }
      if (ws.admin) {
        const subject = this.persons.get(ws.admin.subject_person_id);
        if (subject && subject.dc_number !== ws.admin.subject_dc_number) {
          proceduralConflicts.push('screen_conflict:subject_dc_number');
        }
      }
      if (ws.injectionSuspected) proceduralConflicts.push('injection_suspected');
      ws.gates.procedural_gate = proceduralConflicts.length > 0
        ? { state: 'hold', reasons: proceduralConflicts }
        : { state: 'pass', reasons: [] };

      // Tier 2 — unverified policy-sensitive branches route to policy review.
      const policyPending = this.packet.policy_review_categories.filter(
        (cat) => ws.facts.some((f) => f.category === cat && f.extraction_status !== 'superseded') && !(cat in ws.policyResolutions)
      );
      ws.gates.policy_gate = policyPending.length > 0
        ? { state: 'hold', reasons: policyPending.map((c) => `policy determination required: ${c}`) }
        : { state: 'pass', reasons: [] };

      // Stage 13 — deterministic packet evaluation over officer-confirmed facts.
      const activeFacts = ws.facts.filter((f) => f.extraction_status !== 'superseded');
      const missing = this.packet.required_fact_categories.filter((cat) => !activeFacts.some((f) => f.category === cat));
      const unconfirmed = this.packet.required_fact_categories.filter(
        (cat) =>
          activeFacts.some((f) => f.category === cat) &&
          !activeFacts.some((f) => f.category === cat && f.confirmation_status === 'confirmed')
      );
      const ambiguous = activeFacts.filter((f) => f.ambiguous_reference_id !== null);
      const reasons: string[] = [];
      if (ws.cannotDetermine) reasons.push('extractor returned CANNOT_DETERMINE');
      for (const cat of missing) reasons.push(`missing required fact: ${cat}`);
      for (const cat of unconfirmed) reasons.push(`required fact not officer-confirmed: ${cat}`);
      for (const f of ambiguous) reasons.push(`ambiguous person reference on fact ${f.fact_id}`);

      const selectedOrders = ws.orderEvents.filter((o) => o.selected_for_charge);
      if (selectedOrders.length !== 1) reasons.push('exactly one charge-supporting order event must be selected');
      const order = selectedOrders.length === 1 ? selectedOrders[0] : null;
      if (order && this.packet.issuer_authority_rules.require_supported_authority && order.authority_status !== 'supported') {
        reasons.push('issuer authority basis is not supported by a source');
      }

      let evaluation: ChargeEvaluation;
      if (reasons.length > 0) {
        evaluation = {
          outcome: 'FACTS_INCOMPLETE',
          missing_categories: missing,
          unconfirmed_categories: unconfirmed,
          reasons,
          failed_unsupported_rule: null,
          quality_warnings: [],
        };
        ws.gates.fact_gate = { state: 'hold', reasons };
      } else {
        // Complete, confirmed facts: check the packet's defeating rules.
        const defeated = this.packet.charge_unsupported_rules.find((rule) => rule.defeated_when(order!));
        if (defeated) {
          evaluation = {
            outcome: 'CHARGE_UNSUPPORTED',
            missing_categories: [],
            unconfirmed_categories: [],
            reasons: [`charge-unsupported rule failed: ${defeated.rule_id} — ${defeated.description}`],
            failed_unsupported_rule: { rule_id: defeated.rule_id, description: defeated.description },
            quality_warnings: [],
          };
          ws.chargeUnsupported = { rule_id: defeated.rule_id, description: defeated.description };
          ws.gates.fact_gate = { state: 'hold', reasons: evaluation.reasons };
        } else {
          const warnings: string[] = [];
          for (const f of activeFacts) {
            if (f.confirmation_status === 'confirmed' && f.certainty === 'approximate') {
              warnings.push(`approximate certainty on ${f.category}`);
            }
          }
          if (order!.count_mode !== 'exact') warnings.push('order count is not exact');
          if (warnings.length > 0 && !ws.qualityAcknowledged) {
            ws.gates.quality_gate = { state: 'hold', reasons: warnings };
            evaluation = {
              outcome: 'REVIEW_REQUIRED',
              missing_categories: [],
              unconfirmed_categories: [],
              reasons: [],
              failed_unsupported_rule: null,
              quality_warnings: warnings,
            };
          } else {
            ws.gates.quality_gate = { state: 'pass', reasons: ws.qualityAcknowledged ? ['warnings acknowledged by officer'] : [] };
            evaluation = {
              outcome: 'READY_FOR_GENERATION',
              missing_categories: [],
              unconfirmed_categories: [],
              reasons: [],
              failed_unsupported_rule: null,
              quality_warnings: warnings,
            };
          }
          ws.gates.fact_gate = { state: 'pass', reasons: [] };
        }
      }
      if (ws.gates.policy_gate.state !== 'pass' && evaluation.outcome !== 'CHARGE_UNSUPPORTED') {
        evaluation = { ...evaluation, outcome: 'POLICY_REVIEW' };
      }
      ws.chargeEvaluation = evaluation;
      return evaluation;
    });
    if (evaluation.outcome === 'CHARGE_UNSUPPORTED') {
      this.audit('charge_unsupported', reportId, ctx.actor, { rule: evaluation.failed_unsupported_rule });
    }
    return evaluation;
  }

  resolvePolicyReview(reportId: string, expectedVersion: number, ctx: OpContext, args: { category: string; resolution: string }): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      ws.policyResolutions[args.category] = {
        resolved_by: ctx.actor,
        resolution: args.resolution,
        policy_version: this.policy.policy_version,
        resolved_at: this.now(),
      };
    });
    this.audit('policy_review_resolved', reportId, ctx.actor, { category: args.category, policy_version: this.policy.policy_version });
  }

  resolveProceduralConflict(reportId: string, expectedVersion: number, ctx: OpContext, key: string): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.proceduralResolutions.includes(key)) ws.proceduralResolutions.push(key);
    });
    this.audit('policy_review_resolved', reportId, ctx.actor, { gate: 'procedural', key });
  }

  acknowledgeQualityWarnings(reportId: string, expectedVersion: number, ctx: OpContext): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      ws.qualityAcknowledged = true;
    });
  }

  // ------------------------------------------------------------------
  // Stage 14 — controlled adaptive questions. AI does not freely author
  // questions: the engine selects approved question intents and fills safe
  // ledger slots. An optional AI selector may only subset/rank the approved,
  // applicable intents — anything else is discarded (fail closed).
  // ------------------------------------------------------------------

  requestClarification(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext
  ): {
    questions: { intent_id: string; ledger_slot: string; text: string; answer_options: AnswerType[] }[];
    moved_to_manual_review: string[];
    round: number;
  } {
    return this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (ws.chargeUnsupported !== null) {
        // Trigger D — do not restart clarification unless a fact actually changes.
        throw new EngineError('CHARGE_UNSUPPORTED_TERMINAL', 'CHARGE UNSUPPORTED: clarification does not restart unless a fact changes');
      }
      if (!ws.chargeEvaluation) throw new EngineError('GATE_BLOCKED', 'Charge evaluation must run before clarification');
      const unresolved = [...ws.chargeEvaluation.missing_categories, ...ws.chargeEvaluation.unconfirmed_categories];
      if (ws.clarificationRounds >= this.policy.max_clarification_rounds) {
        // After the limit, unresolved items move to manual fact review.
        for (const cat of unresolved) {
          if (!ws.manualFactReview.includes(cat)) ws.manualFactReview.push(cat);
        }
        return { questions: [], moved_to_manual_review: unresolved, round: ws.clarificationRounds };
      }
      ws.clarificationRounds += 1;

      const applicable = this.packet.question_intents.filter((qi) => unresolved.includes(qi.ledger_slot));
      let chosen = applicable;
      if (this.stubs.selectIntents) {
        const proposal = this.stubs.selectIntents(
          unresolved,
          applicable.map((qi) => ({ intent_id: qi.intent_id, ledger_slot: qi.ledger_slot }))
        );
        // Fail closed: keep only approved, applicable intents the selector
        // named. An empty/unusable selection falls back to the deterministic
        // approved list — an unapproved question is never emitted.
        const valid = applicable.filter((qi) => proposal.includes(qi.intent_id));
        if (valid.length > 0) chosen = valid;
      }
      const batchSize = Math.min(this.policy.question_batch_size, this.policy.question_max_batch_size);
      const questions = chosen.slice(0, batchSize).map((qi) => ({
        intent_id: qi.intent_id,
        ledger_slot: qi.ledger_slot,
        // Question text comes ONLY from the approved template.
        text: qi.text_template,
        answer_options: [...ANSWER_TYPES],
      }));
      return { questions, moved_to_manual_review: [], round: ws.clarificationRounds };
    });
  }

  // Stage 14 — officer answer to an approved question intent. Substantive
  // answers (exact/approximate) create an officer_answer fact in the intent's
  // ledger slot; uncertainty answers are recorded but NEVER fabricate a fact —
  // the slot stays unresolved (fail closed).
  answerQuestion(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext,
    args: { intent_id: string; answer_type: AnswerType; value?: string }
  ): { fact_id: string | null } {
    const result = this.commit(reportId, expectedVersion, ctx, (ws) => {
      const intent = this.packet.question_intents.find((qi) => qi.intent_id === args.intent_id);
      if (!intent) {
        throw new EngineError('INPUT_REJECTED', `Not an approved question intent: ${args.intent_id}`);
      }
      if (!ANSWER_TYPES.includes(args.answer_type)) {
        throw new EngineError('INPUT_REJECTED', `Invalid answer type: ${String(args.answer_type)}`);
      }
      ws.questionAnswers.push({ intent_id: args.intent_id, answer_type: args.answer_type, created_at: this.now() });

      if (args.answer_type !== 'exact' && args.answer_type !== 'approximate') {
        return { fact_id: null, rolledBack: false };
      }
      if (!args.value || args.value.trim().length === 0) {
        throw new EngineError('INPUT_REJECTED', 'A substantive answer requires a value');
      }
      const fact: Fact = {
        fact_id: this.nextId('fact'),
        report_id: reportId,
        category: intent.ledger_slot,
        value: args.value,
        certainty: args.answer_type,
        source_type: 'officer_answer',
        source_record_id: intent.intent_id,
        source_text: args.value,
        speaker_person_id: null,
        subject_person_id: null,
        ambiguous_reference_id: null,
        ambiguous_reference_field: null,
        sequence: ws.facts.length + 1,
        extraction_status: 'officer_added',
        confirmation_status: 'unconfirmed',
        prior_fact_version: null,
        created_version: ws.report_version,
        modified_version: ws.report_version,
      };
      ws.facts.push(fact);
      let rolledBack = false;
      if (ws.chargeEvaluation !== null || ws.confirmationEvent !== null) {
        this.applyTriggerA(ws, `officer answer to ${intent.intent_id}`);
        rolledBack = true;
      }
      return { fact_id: fact.fact_id, rolledBack };
    });
    if (result.rolledBack) {
      this.revokeReportTokens(reportId, `officer answer to ${args.intent_id}`, ctx.actor);
    }
    return { fact_id: result.fact_id };
  }

  // ------------------------------------------------------------------
  // Stage 15 — hash-bound officer fact confirmation (invariant 21)
  // ------------------------------------------------------------------

  confirmFacts(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext,
    request: {
      ledger_hash_shown: string;
      displayed: { fact_id: string; version: number }[];
      decisions: { fact_id: string; decision: 'confirm' | 'reject' }[];
      started_at: string;
      submitted_at: string;
      second_confirmation?: boolean;
    }
  ): string {
    const eventId = this.commit(reportId, expectedVersion, ctx, (ws) => {
      const currentHash = this.ledgerHash(ws);
      if (request.ledger_hash_shown !== currentHash) {
        throw new EngineError('HASH_MISMATCH', 'Ledger changed since it was displayed; confirmation rejected. Reload and review the current facts.');
      }
      for (const shown of request.displayed) {
        const fact = ws.facts.find((f) => f.fact_id === shown.fact_id);
        if (!fact || fact.modified_version !== shown.version) {
          throw new EngineError('HASH_MISMATCH', `Displayed fact version is stale: ${shown.fact_id}`);
        }
      }
      const elapsed = Date.parse(request.submitted_at) - Date.parse(request.started_at);
      const rapid = elapsed < request.decisions.length * RAPID_CONFIRMATION_MS_PER_FACT;
      if (rapid && !request.second_confirmation) {
        // Adaptive friction: re-display and require a second explicit confirmation.
        throw new EngineError('RAPID_CONFIRMATION', 'Rapid confirmation detected: re-review the source passages and confirm a second time');
      }
      const passages: string[] = [];
      for (const decision of request.decisions) {
        const fact = ws.facts.find((f) => f.fact_id === decision.fact_id && f.extraction_status !== 'superseded');
        if (!fact) throw new EngineError('NOT_FOUND', `Unknown fact in decisions: ${decision.fact_id}`);
        if (fact.ambiguous_reference_id !== null) {
          throw new EngineError(
            'AMBIGUOUS_PERSON',
            `Fact ${fact.fact_id} has an unresolved person reference; disambiguate before confirmation (Stage 8)`
          );
        }
        // Confirmation changes status only — never the fact content or its
        // version, so the ledger hash the officer confirmed remains valid.
        fact.confirmation_status = decision.decision === 'confirm' ? 'confirmed' : 'rejected';
        passages.push(fact.source_text);
      }
      const event: FactConfirmationEvent = {
        confirmation_event_id: this.nextId('cnf'),
        report_id: reportId,
        user_id: ctx.actor,
        ledger_hash: currentHash,
        displayed_fact_versions: request.displayed,
        decisions: request.decisions.map((d) => ({
          fact_id: d.fact_id,
          fact_version: ws.facts.find((f) => f.fact_id === d.fact_id)?.modified_version ?? 0,
          decision: d.decision,
        })),
        source_passages_shown: passages,
        timing_metadata: { started_at: request.started_at, submitted_at: request.submitted_at, rapid_confirmation: rapid },
        created_at: this.now(),
      };
      ws.confirmationEvent = event;
      return event.confirmation_event_id;
    });
    this.audit('facts_confirmed', reportId, ctx.actor, { confirmation_event_id: eventId });
    return eventId;
  }

  // ------------------------------------------------------------------
  // Stage 16 — immutable fact snapshot
  // ------------------------------------------------------------------

  createSnapshot(reportId: string, expectedVersion: number, ctx: OpContext): string {
    const snapshotId = this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.chargeEvaluation || ws.chargeEvaluation.outcome !== 'READY_FOR_GENERATION') {
        throw new EngineError('GATE_BLOCKED', 'Snapshot requires READY FOR GENERATION');
      }
      for (const gate of ['system_gate', 'procedural_gate', 'policy_gate', 'fact_gate', 'quality_gate'] as const) {
        if (ws.gates[gate].state !== 'pass') {
          throw new EngineError('GATE_BLOCKED', `Pre-generation gate not passing: ${gate}`);
        }
      }
      if (!ws.confirmationEvent) throw new EngineError('GATE_BLOCKED', 'No current officer confirmation event');
      if (ws.confirmationEvent.ledger_hash !== this.ledgerHash(ws)) {
        throw new EngineError('HASH_MISMATCH', 'Ledger changed since officer confirmation; re-confirmation required');
      }
      if (!ws.rawNotes || !ws.admin) throw new EngineError('GATE_BLOCKED', 'Notes and administrative intake are required');
      const order = this.selectedOrder(ws);
      if (!order) throw new EngineError('GATE_BLOCKED', 'Exactly one selected order event is required');
      const group = ws.incident_group_id ? this.groups.get(ws.incident_group_id) : null;
      const snapshot: FactSnapshot = {
        snapshot_id: this.nextId('snap'),
        report_id: reportId,
        report_version: ws.report_version,
        administrative_hash: hashValue(ws.admin),
        ledger_hash: this.ledgerHash(ws),
        selected_order_hash: hashValue(order),
        raw_notes_hash: ws.rawNotes.committed_hash,
        amendment_hashes: ws.amendments.map((a) => a.amendment_hash),
        person_registry_hash: this.persons.registryHash(),
        incident_group_hash: group ? hashValue(group.shared_scene_facts) : null,
        charge_version: this.packet.charge_version,
        policy_version: this.policy.policy_version,
        schema_version: this.policy.schema_version,
        model_prompt_versions: { ...this.policy.model_prompt_versions },
        confirmation_event_id: ws.confirmationEvent.confirmation_event_id,
        created_at: this.now(),
      };
      ws.snapshot = snapshot;
      return snapshot.snapshot_id;
    });
    this.audit('snapshot_created', reportId, ctx.actor, { snapshot_id: snapshotId });
    return snapshotId;
  }

  // ------------------------------------------------------------------
  // Stage 17 — narrative generation (deterministic fake generator)
  // ------------------------------------------------------------------

  generateNarrative(reportId: string, expectedVersion: number, ctx: OpContext): string {
    const narrativeId = this.commit(reportId, expectedVersion, ctx, (ws) => this.generateNarrativeInternal(ws));
    this.audit('narrative_generated', reportId, ctx.actor, { narrative_id: narrativeId });
    return narrativeId;
  }

  private generateNarrativeInternal(ws: Workspace): string {
    if (!ws.snapshot) throw new EngineError('GATE_BLOCKED', 'Narrative generation requires an immutable fact snapshot');
    if (ws.snapshot.ledger_hash !== this.ledgerHash(ws)) {
      throw new EngineError('HASH_MISMATCH', 'Facts changed since snapshot; snapshot is stale');
    }
    if (ws.gates.fact_gate.state !== 'pass') throw new EngineError('GATE_BLOCKED', 'fact_gate is not passing');
    const confirmed = this.confirmedFacts(ws);
    const drafts = this.stubs.generate(
      confirmed.map((f) => ({ fact_id: f.fact_id, category: f.category, value: f.value, certainty: f.certainty }))
    );
    const confirmedIds = new Set(this.confirmedFacts(ws).map((f) => f.fact_id));
    const sentences: NarrativeSentence[] = drafts.map((draft, i) => {
      if (draft.source_fact_ids.length === 0) {
        // No source IDs means rejection (Stage 17).
        throw new EngineError('VALIDATION', `Generated sentence ${i + 1} has no source fact IDs; narrative rejected`);
      }
      for (const id of draft.source_fact_ids) {
        if (!confirmedIds.has(id)) {
          throw new EngineError('UNKNOWN_FACT_ID', `Generated sentence cites unknown or unconfirmed fact ${id}; narrative rejected`);
        }
      }
      return {
        sentence_id: this.nextId('sen'),
        section: draft.section,
        text: draft.text,
        source_fact_ids: [...draft.source_fact_ids],
        certainty: draft.certainty,
        edited: false,
        resourcing_status: 'sourced' as const,
      };
    });
    const narrative: Narrative = {
      narrative_id: this.nextId('nar'),
      report_id: ws.report_id,
      snapshot_id: ws.snapshot.snapshot_id,
      sentences,
      narrative_hash: this.narrativeHash(sentences),
      created_at: this.now(),
    };
    ws.narrative = narrative;
    ws.deterministicValidation = null;
    ws.semanticValidation = null;
    ws.gates.narrative_gate = { state: 'hold', reasons: ['validation pending'] };
    return narrative.narrative_id;
  }

  // ------------------------------------------------------------------
  // Stages 18-19 — deterministic and semantic validation
  // ------------------------------------------------------------------

  validateNarrative(reportId: string, expectedVersion: number, ctx: OpContext): { passed: boolean; issues: ValidationIssue[] } {
    const result = this.commit(reportId, expectedVersion, ctx, (ws) => this.validateNarrativeInternal(ws));
    if (result.passed) this.audit('validation_completed', reportId, ctx.actor, {});
    else this.audit('validation_failed', reportId, ctx.actor, { issues: result.issues.map((i) => i.message) });
    return result;
  }

  private validateNarrativeInternal(ws: Workspace): { passed: boolean; issues: ValidationIssue[] } {
    if (!ws.narrative || !ws.snapshot) throw new EngineError('GATE_BLOCKED', 'No narrative to validate');
    const issues: ValidationIssue[] = [];
    const makeIssue = (category: string, message: string, sentenceId: string | null): ValidationIssue => ({
      issue_id: this.nextId('iss'),
      severity: 'blocker',
      category,
      sentence_id: sentenceId,
      fact_ids: [],
      message,
      resolver: null,
      resolution: null,
      created_at: this.now(),
      resolved_at: null,
    });

    if (ws.narrative.snapshot_id !== ws.snapshot.snapshot_id) {
      issues.push(makeIssue('version_hash', 'Narrative was generated from a different snapshot', null));
    }
    if (ws.snapshot.ledger_hash !== this.ledgerHash(ws)) {
      issues.push(makeIssue('version_hash', 'Ledger changed since snapshot', null));
    }
    const confirmedById = new Map(this.confirmedFacts(ws).map((f) => [f.fact_id, f]));
    for (const s of ws.narrative.sentences) {
      if (s.resourcing_status !== 'sourced') {
        issues.push(makeIssue('sentence_source', `Sentence ${s.sentence_id} is not sourced (${s.resourcing_status})`, s.sentence_id));
        continue;
      }
      if (s.source_fact_ids.length === 0) {
        issues.push(makeIssue('sentence_source', `Sentence ${s.sentence_id} has no source fact IDs`, s.sentence_id));
        continue;
      }
      const sourceFacts = s.source_fact_ids.map((id) => confirmedById.get(id));
      if (sourceFacts.some((f) => f === undefined)) {
        issues.push(makeIssue('sentence_source', `Sentence ${s.sentence_id} cites a fact that is not confirmed`, s.sentence_id));
        continue;
      }
      // Exact-quote containment: every quoted string must appear verbatim in a
      // cited source passage (Stage 18).
      const quotes = [...s.text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      for (const quote of quotes) {
        const contained = sourceFacts.some((f) => f!.source_text.includes(`"${quote}"`) || f!.source_text.includes(quote));
        if (!contained) {
          issues.push(makeIssue('quote_containment', `Quoted text "${quote}" does not appear verbatim in any cited source passage`, s.sentence_id));
        }
      }
      const lower = s.text.toLowerCase();
      for (const marker of PLACEHOLDER_MARKERS) {
        if (lower.includes(marker.toLowerCase())) {
          issues.push(makeIssue('placeholder', `Sentence ${s.sentence_id} contains placeholder marker ${marker}`, s.sentence_id));
        }
      }
      for (const phrase of FORBIDDEN_CONCLUSIONS) {
        if (lower.includes(phrase)) {
          issues.push(makeIssue('forbidden_conclusion', `Sentence ${s.sentence_id} states a forbidden conclusion: "${phrase}"`, s.sentence_id));
        }
      }
    }

    const deterministicPassed = issues.length === 0;
    ws.deterministicValidation = {
      validation_id: this.nextId('valD'),
      report_id: ws.report_id,
      kind: 'deterministic',
      narrative_hash: ws.narrative.narrative_hash,
      passed: deterministicPassed,
      issues,
      created_at: this.now(),
    };

    // Stage 19 — semantic validation (deterministic fake). The validator
    // cannot silently repair and approve its own change.
    const semantic = this.stubs.semanticValidate(ws.narrative.sentences);
    const semanticIssues: ValidationIssue[] = semantic.issues.map((msg) => makeIssue('semantic', msg, null));
    ws.semanticValidation = {
      validation_id: this.nextId('valS'),
      report_id: ws.report_id,
      kind: 'semantic',
      narrative_hash: ws.narrative.narrative_hash,
      passed: semantic.passed,
      issues: semanticIssues,
      created_at: this.now(),
    };

    const allIssues = [...issues, ...semanticIssues];
    const passed = deterministicPassed && semantic.passed;
    ws.gates.narrative_gate = passed
      ? { state: 'pass', reasons: [] }
      : { state: 'hold', reasons: allIssues.map((i) => i.message) };
    return { passed, issues: allIssues };
  }

  // Automated regeneration + revalidation. Bounded by policy (max 2); after
  // that the report remains in VALIDATION HOLD and requires officer resolution.
  regenerateNarrative(reportId: string, expectedVersion: number, ctx: OpContext): { passed: boolean } {
    const result = this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.narrative) throw new EngineError('GATE_BLOCKED', 'No narrative to regenerate');
      if (ws.gates.narrative_gate.state === 'pass') throw new EngineError('FORBIDDEN', 'Narrative already passed validation');
      if (ws.regenAttempts >= this.policy.max_regeneration_attempts) {
        throw new EngineError(
          'RETRY_LIMIT',
          `Automated regeneration limit (${this.policy.max_regeneration_attempts}) reached; remain in VALIDATION HOLD pending officer resolution`
        );
      }
      ws.regenAttempts += 1;
      this.generateNarrativeInternal(ws);
      const validation = this.validateNarrativeInternal(ws);
      return { passed: validation.passed, issues: validation.issues };
    });
    this.audit('narrative_generated', reportId, ctx.actor, { automated_regeneration: true });
    if (result.passed) this.audit('validation_completed', reportId, ctx.actor, { automated_regeneration: true });
    else this.audit('validation_failed', reportId, ctx.actor, { automated_regeneration: true, issues: result.issues.map((i) => i.message) });
    return { passed: result.passed };
  }

  // ------------------------------------------------------------------
  // Stage 20 — officer narrative editing and constrained re-sourcing
  // ------------------------------------------------------------------

  editSentence(reportId: string, expectedVersion: number, ctx: OpContext, args: { sentence_id: string; new_text: string }): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.narrative) throw new EngineError('GATE_BLOCKED', 'No narrative to edit');
      const sentence = ws.narrative.sentences.find((s) => s.sentence_id === args.sentence_id);
      if (!sentence) throw new EngineError('NOT_FOUND', `Unknown sentence: ${args.sentence_id}`);
      if (sentence.resourcing_status === 'manual_fact_review') {
        throw new EngineError('RETRY_LIMIT', 'Sentence is in manual fact review; automated editing path is closed');
      }
      if (!(args.sentence_id in ws.originalSentences)) {
        ws.originalSentences[args.sentence_id] = { text: sentence.text, source_fact_ids: [...sentence.source_fact_ids] };
      }
      sentence.text = args.new_text;
      sentence.edited = true;
      sentence.source_fact_ids = []; // sentence-source mapping invalidated
      sentence.resourcing_status = 'pending_resourcing';
      ws.narrative.narrative_hash = this.narrativeHash(ws.narrative.sentences);
      this.applyTriggerB(ws, `sentence ${args.sentence_id} edited; re-sourcing required`);
    });
    this.revokeReportTokens(reportId, `narrative edit ${args.sentence_id}`, ctx.actor);
    this.audit('narrative_edited', reportId, ctx.actor, { sentence_id: args.sentence_id });
  }

  resourceSentence(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext,
    sentenceId: string
  ): { outcome: 'sourced' | 'UNSUPPORTED' | 'manual_fact_review' | 'rejected_unknown_fact_ids'; fact_ids: string[] } {
    return this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.narrative) throw new EngineError('GATE_BLOCKED', 'No narrative');
      const sentence = ws.narrative.sentences.find((s) => s.sentence_id === sentenceId);
      if (!sentence) throw new EngineError('NOT_FOUND', `Unknown sentence: ${sentenceId}`);
      if (sentence.resourcing_status === 'manual_fact_review') {
        throw new EngineError('RETRY_LIMIT', 'Re-sourcing attempts exhausted; sentence requires manual fact review');
      }
      if (sentence.resourcing_status === 'sourced') {
        throw new EngineError('FORBIDDEN', 'Sentence is already sourced');
      }
      const attempts = ws.resourcingAttempts[sentenceId] ?? 0;
      if (attempts >= this.policy.max_resourcing_attempts) {
        throw new EngineError('RETRY_LIMIT', 'Re-sourcing attempts exhausted; sentence forced to manual fact review');
      }

      const confirmed = this.confirmedFacts(ws).map((f) => ({ fact_id: f.fact_id, value: f.value }));
      const output = this.stubs.resource(sentence.text, confirmed);

      // A failed attempt must persist even though the outcome is a rejection,
      // so the two-attempt bound is enforceable (Stage 20).
      const recordFailure = (): 'UNSUPPORTED' | 'manual_fact_review' => {
        const next = attempts + 1;
        ws.resourcingAttempts[sentenceId] = next;
        sentence.resourcing_status = 'unsupported';
        if (next >= this.policy.max_resourcing_attempts) {
          sentence.resourcing_status = 'manual_fact_review';
          if (!ws.manualFactReview.includes(sentenceId)) ws.manualFactReview.push(sentenceId);
          return 'manual_fact_review';
        }
        return 'UNSUPPORTED';
      };

      if (output === 'UNSUPPORTED') {
        return { outcome: recordFailure(), fact_ids: [] };
      }
      // The only allowed outputs are EXISTING confirmed fact IDs or UNSUPPORTED.
      // Anything else fails closed: the output is rejected, the sentence stays
      // unsourced, and the attempt is consumed.
      const confirmedIds = new Set(confirmed.map((f) => f.fact_id));
      const unknown = output.fact_ids.filter((id) => !confirmedIds.has(id));
      if (output.fact_ids.length === 0 || unknown.length > 0) {
        recordFailure();
        return { outcome: 'rejected_unknown_fact_ids' as const, fact_ids: [] };
      }
      sentence.source_fact_ids = [...output.fact_ids];
      sentence.resourcing_status = 'sourced';
      ws.narrative.narrative_hash = this.narrativeHash(ws.narrative.sentences);
      ws.gates.narrative_gate = { state: 'hold', reasons: ['revalidation required after re-sourcing'] };
      return { outcome: 'sourced' as const, fact_ids: [...output.fact_ids] };
    });
  }

  // Officer resolution of an UNSUPPORTED sentence: revert or restate.
  // The third option — add/correct the underlying fact — is the factual-edit
  // path (correctFact / addAmendment), which triggers Trigger A.
  revertSentence(reportId: string, expectedVersion: number, ctx: OpContext, sentenceId: string): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.narrative) throw new EngineError('GATE_BLOCKED', 'No narrative');
      const sentence = ws.narrative.sentences.find((s) => s.sentence_id === sentenceId);
      if (!sentence) throw new EngineError('NOT_FOUND', `Unknown sentence: ${sentenceId}`);
      const original = ws.originalSentences[sentenceId];
      if (!original) throw new EngineError('NOT_FOUND', 'No original version stored for this sentence');
      sentence.text = original.text;
      sentence.source_fact_ids = [...original.source_fact_ids];
      sentence.edited = false;
      sentence.resourcing_status = 'sourced';
      ws.narrative.narrative_hash = this.narrativeHash(ws.narrative.sentences);
      ws.gates.narrative_gate = { state: 'hold', reasons: ['revalidation required after revert'] };
    });
  }

  restateSentence(reportId: string, expectedVersion: number, ctx: OpContext, args: { sentence_id: string; new_text: string }): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.narrative) throw new EngineError('GATE_BLOCKED', 'No narrative');
      const sentence = ws.narrative.sentences.find((s) => s.sentence_id === args.sentence_id);
      if (!sentence) throw new EngineError('NOT_FOUND', `Unknown sentence: ${args.sentence_id}`);
      if (sentence.resourcing_status === 'manual_fact_review') {
        throw new EngineError('RETRY_LIMIT', 'Sentence is in manual fact review');
      }
      sentence.text = args.new_text;
      sentence.source_fact_ids = [];
      sentence.resourcing_status = 'pending_resourcing';
      ws.narrative.narrative_hash = this.narrativeHash(ws.narrative.sentences);
    });
  }

  // ------------------------------------------------------------------
  // Stage 22 — hash-bound certification
  // ------------------------------------------------------------------

  certify(
    reportId: string,
    expectedVersion: number,
    ctx: OpContext,
    request: {
      report_version: number;
      fact_snapshot_hash: string;
      narrative_hash: string;
      deterministic_validation_id: string;
      semantic_validation_id: string;
    }
  ): string {
    try {
      const certId = this.commit(reportId, expectedVersion, ctx, (ws) => {
        if (!ws.narrative || !ws.snapshot || !ws.deterministicValidation || !ws.semanticValidation) {
          throw new EngineError('GATE_BLOCKED', 'Certification requires a validated narrative');
        }
        if (ws.gates.narrative_gate.state !== 'pass') {
          throw new EngineError('GATE_BLOCKED', 'Narrative has not passed validation');
        }
        const mismatches: string[] = [];
        if (request.report_version !== ws.report_version) mismatches.push('report_version');
        if (request.fact_snapshot_hash !== hashValue(ws.snapshot)) mismatches.push('fact_snapshot_hash');
        if (request.narrative_hash !== ws.narrative.narrative_hash) mismatches.push('narrative_hash');
        if (request.deterministic_validation_id !== ws.deterministicValidation.validation_id) mismatches.push('deterministic_validation_id');
        if (request.semantic_validation_id !== ws.semanticValidation.validation_id) mismatches.push('semantic_validation_id');
        if (mismatches.length > 0) {
          throw new EngineError('CERTIFICATION_REJECTED', `Certification request does not match current state: ${mismatches.join(', ')}`);
        }
        const cert: Certification = {
          certification_id: this.nextId('cert'),
          report_id: reportId,
          user_id: ctx.actor,
          session_id: ctx.session_id,
          report_version: ws.report_version,
          fact_snapshot_hash: request.fact_snapshot_hash,
          narrative_hash: request.narrative_hash,
          validation_ids: [request.deterministic_validation_id, request.semantic_validation_id],
          created_at: this.now(),
        };
        ws.certification = cert;
        ws.gates.certification_gate = { state: 'pass', reasons: [] };
        return cert.certification_id;
      });
      this.audit('certification_created', reportId, ctx.actor, { certification_id: certId });
      return certId;
    } catch (err) {
      if (err instanceof EngineError && err.code === 'CERTIFICATION_REJECTED') {
        this.audit('certification_rejected', reportId, ctx.actor, { reason: err.message });
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------
  // Stage 23 — audit finalization commit (must precede token issuance)
  // ------------------------------------------------------------------

  commitAuditFinalization(reportId: string, expectedVersion: number, ctx: OpContext): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.certification || ws.gates.certification_gate.state !== 'pass') {
        throw new EngineError('GATE_BLOCKED', 'Audit finalization requires a current certification');
      }
      if (!ws.narrative || ws.certification.narrative_hash !== ws.narrative.narrative_hash) {
        throw new EngineError('HASH_MISMATCH', 'Certification is stale against the current narrative');
      }
      ws.auditFinalizationCommitted = true;
      ws.gates.audit_gate = { state: 'pass', reasons: [] };
    });
    this.audit('audit_finalization_committed', reportId, ctx.actor, {});
  }

  // ------------------------------------------------------------------
  // Stage 24 — finalization token stub (invariants 22-23)
  // ------------------------------------------------------------------

  issueToken(reportId: string, ctx: OpContext & { role: string }, channel: OutputChannel): FinalizationToken {
    if (this.killSwitchEngaged) {
      throw new EngineError('TOKEN_REJECTED', 'Kill switch engaged: token issuance stopped');
    }
    const ws = this.ws(reportId);
    if (ws.gates.system_gate.state !== 'pass') throw new EngineError('TOKEN_REJECTED', 'Report is in SYSTEM HOLD');
    // Phase 9 prep: a FINALIZED report may issue additional tokens for other
    // channels — content is immutable after finalization, and the hash checks
    // below still bind every token to the exact certified state. Any other
    // terminal lifecycle rejects.
    if (ws.lifecycle !== 'DRAFT' && ws.lifecycle !== 'FINALIZED') {
      throw new EngineError('TOKEN_REJECTED', `Report is ${ws.lifecycle}`);
    }
    if (!ws.certification || ws.gates.certification_gate.state !== 'pass') {
      throw new EngineError('TOKEN_REJECTED', 'No current certification');
    }
    // Invariant 23: audit commit precedes token issuance. The audit
    // finalization row must already be committed.
    if (!ws.auditFinalizationCommitted) {
      throw new EngineError('TOKEN_REJECTED', 'Audit finalization has not been committed; token issuance is not permitted before the audit row');
    }
    if (!ws.narrative || !ws.snapshot || !ws.deterministicValidation || !ws.semanticValidation) {
      throw new EngineError('TOKEN_REJECTED', 'Finalization artifacts missing');
    }
    if (ws.certification.narrative_hash !== ws.narrative.narrative_hash) {
      throw new EngineError('TOKEN_REJECTED', 'Certification is stale against the current narrative');
    }
    const issuedAt = this.clock();
    // Real finalization token (Phase 7): the token id is an unguessable
    // capability, not a sequential counter value.
    const token: FinalizationToken = {
      token_id: `${this.nextId('tok')}-${randomBytes(16).toString('hex')}`,
      report_id: reportId,
      user_id: ctx.actor,
      role: ctx.role,
      session_id: ctx.session_id,
      report_version: ws.report_version,
      fact_snapshot_hash: hashValue(ws.snapshot),
      narrative_hash: ws.narrative.narrative_hash,
      deterministic_validation_hash: hashValue(ws.deterministicValidation),
      semantic_validation_hash: hashValue(ws.semanticValidation),
      charge_version: this.packet.charge_version,
      policy_version: this.policy.policy_version,
      schema_version: this.policy.schema_version,
      output_channel: channel,
      issued_at: issuedAt.toISOString(),
      expires_at: new Date(issuedAt.getTime() + this.policy.token_expiry_seconds * 1000).toISOString(),
      single_use: true,
      redeemed_at: null,
      revoked_at: null,
    };
    this.tokens.set(token.token_id, token);
    this.audit('token_issued', reportId, ctx.actor, { token_id: token.token_id, channel });
    return { ...token };
  }

  revokeToken(tokenId: string, ctx: OpContext): void {
    const token = this.tokens.get(tokenId);
    if (!token) throw new EngineError('NOT_FOUND', `Unknown token: ${tokenId}`);
    if (token.revoked_at === null) {
      token.revoked_at = this.now();
      this.audit('token_revoked', token.report_id, ctx.actor, { token_id: tokenId, reason: 'explicit revocation' });
    }
  }

  private redeemToken(tokenId: string, ctx: OpContext, channel: OutputChannel): FinalizationToken {
    if (this.killSwitchEngaged) throw new EngineError('TOKEN_REJECTED', 'Kill switch engaged: output authorization rejects all requests');
    const token = this.tokens.get(tokenId);
    if (!token) throw new EngineError('TOKEN_REJECTED', 'Unknown token');
    if (token.revoked_at !== null) throw new EngineError('TOKEN_REJECTED', 'Token has been revoked');
    if (token.redeemed_at !== null) throw new EngineError('TOKEN_REJECTED', 'Token already redeemed (single-use)');
    if (this.clock().toISOString() > token.expires_at) throw new EngineError('TOKEN_REJECTED', 'Token expired');
    if (token.session_id !== ctx.session_id) throw new EngineError('TOKEN_REJECTED', 'Token is bound to a different session');
    if (token.output_channel !== channel) throw new EngineError('TOKEN_REJECTED', `Token is bound to channel ${token.output_channel}`);
    const ws = this.ws(token.report_id);
    if (ws.gates.system_gate.state !== 'pass') throw new EngineError('TOKEN_REJECTED', 'Report is in SYSTEM HOLD');
    if (
      token.report_version !== ws.report_version ||
      !ws.narrative ||
      token.narrative_hash !== ws.narrative.narrative_hash ||
      !ws.snapshot ||
      token.fact_snapshot_hash !== hashValue(ws.snapshot)
    ) {
      throw new EngineError('TOKEN_REJECTED', 'Report state changed since token issuance');
    }
    token.redeemed_at = this.now();
    this.audit('token_redeemed', token.report_id, ctx.actor, { token_id: tokenId, channel });
    return token;
  }

  // Central server-side output authorization stub (invariant 8). The only
  // output path. V1 channels: copy, print, pdf.
  authorizeOutput(
    tokenId: string,
    ctx: OpContext,
    channel: OutputChannel,
    opts: { simulate_failure?: boolean } = {}
  ): { output: string } {
    const token = this.redeemToken(tokenId, ctx, channel);
    const ws = this.ws(token.report_id);
    if (opts.simulate_failure) {
      // Failed output does not mark output complete (§9).
      this.audit('output_failed', token.report_id, ctx.actor, { token_id: tokenId, channel });
      throw new EngineError('OUTPUT_REJECTED', 'Output channel failure; output not marked complete');
    }
    ws.outputCompleted = true;
    if (ws.lifecycle === 'DRAFT') {
      assertTransitionAllowed(this.policy, ws.lifecycle, 'FINALIZED');
      ws.lifecycle = 'FINALIZED';
    }
    this.audit('output_completed', token.report_id, ctx.actor, { token_id: tokenId, channel });
    const text = ws.narrative!.sentences.map((s) => s.text).join(' ');
    return { output: text };
  }

  // ------------------------------------------------------------------
  // §10 — kill switch (server-side)
  // ------------------------------------------------------------------

  engageKillSwitch(ctx: { actor: string; role: string; reason: string }): void {
    if (!this.policy.kill_switch_roles.includes(ctx.role)) {
      throw new EngineError('FORBIDDEN', `Role ${ctx.role} is not authorized to operate the kill switch`);
    }
    this.killSwitchEngaged = true;
    for (const ws of this.workspaces.values()) {
      if (ws.lifecycle === 'DRAFT') {
        ws.gates.system_gate = { state: 'hold', reasons: [`kill switch engaged: ${ctx.reason}`] };
      }
    }
    for (const token of this.tokens.values()) {
      if (token.redeemed_at === null && token.revoked_at === null) {
        token.revoked_at = this.now();
        this.audit('token_revoked', token.report_id, ctx.actor, { token_id: token.token_id, reason: 'kill switch engaged' });
      }
    }
    this.audit('kill_switch_engaged', null, ctx.actor, { reason: ctx.reason });
  }

  releaseKillSwitch(ctx: { actor: string; role: string }): void {
    if (!this.policy.kill_switch_roles.includes(ctx.role)) {
      throw new EngineError('FORBIDDEN', `Role ${ctx.role} is not authorized to operate the kill switch`);
    }
    this.killSwitchEngaged = false;
    for (const ws of this.workspaces.values()) {
      if (ws.lifecycle === 'DRAFT' && ws.gates.system_gate.state === 'hold') {
        // Resumption requires current-version compatibility checks.
        if (this.isVersionCompatible(ws)) {
          ws.gates.system_gate = { state: 'pass', reasons: [] };
        } else {
          ws.gates.system_gate = { state: 'hold', reasons: ['version incompatibility after kill-switch release'] };
        }
      }
    }
    this.audit('kill_switch_released', null, ctx.actor, {});
  }

  isKillSwitchEngaged(): boolean {
    return this.killSwitchEngaged;
  }

  getToken(tokenId: string): FinalizationToken | null {
    const token = this.tokens.get(tokenId);
    return token ? { ...token } : null;
  }

  // ------------------------------------------------------------------
  // §9 — session-lock transfer (explicit audited action)
  // ------------------------------------------------------------------

  transferSessionLock(reportId: string, expectedVersion: number, args: { to_session_id: string; actor: string }): void {
    // allowNonDraft: transferring the lock is not a content mutation — a
    // FINALIZED report's lock may move (e.g. next-shift reprint via another
    // channel). The version bump invalidates any unredeemed tokens (fail
    // closed: they were bound to the old version).
    this.commit(
      reportId,
      expectedVersion,
      { session_id: args.to_session_id, actor: args.actor },
      (ws) => {
        ws.session_id = args.to_session_id;
      },
      { bypassSessionLock: true, allowNonDraft: true }
    );
    this.audit('session_lock_transferred', reportId, args.actor, { to_session_id: args.to_session_id });
  }

  // ------------------------------------------------------------------
  // §5.3 — lifecycle transitions (policy-configured, audited)
  // ------------------------------------------------------------------

  transitionLifecycle(reportId: string, expectedVersion: number, ctx: OpContext, to: Lifecycle): void {
    if (to === 'FINALIZED') {
      throw new EngineError('FORBIDDEN', 'FINALIZED is reached only through the certification/audit/token/output path');
    }
    this.commit(
      reportId,
      expectedVersion,
      ctx,
      (ws) => {
        assertTransitionAllowed(this.policy, ws.lifecycle, to);
        ws.lifecycle = to;
      },
      { allowNonDraft: true }
    );
    this.revokeReportTokens(reportId, `lifecycle transition to ${to}`, ctx.actor);
    const eventType: AuditEventType = to === 'ABANDONED' ? 'report_abandoned' : to === 'EXPIRED' ? 'report_expired' : 'report_voided';
    this.audit(eventType, reportId, ctx.actor, { to });
  }

  // §5.3 / test 22 — policy-configured expiry of inactive drafts.
  expireIfInactive(reportId: string, actor: string): boolean {
    const ws = this.ws(reportId);
    if (ws.lifecycle !== 'DRAFT') return false;
    const idleMs = this.clock().getTime() - Date.parse(ws.updated_at);
    if (idleMs < this.policy.report_expiry_hours * 3_600_000) return false;
    assertTransitionAllowed(this.policy, ws.lifecycle, 'EXPIRED');
    ws.lifecycle = 'EXPIRED';
    this.revokeReportTokens(reportId, 'report expired', actor);
    this.audit('report_expired', reportId, actor, { idle_hours: idleMs / 3_600_000 });
    return true;
  }

  // ------------------------------------------------------------------
  // §5.2 — incident-group shared facts and subject-specific paste checks
  // ------------------------------------------------------------------

  private isSubjectSpecificFact(fact: Fact): boolean {
    if (SHARED_SCENE_CATEGORIES.includes(fact.category)) {
      // Even a scene-category fact is subject-specific if it is tied to a
      // subject inmate of some sibling report (fail closed).
      if (fact.subject_person_id !== null) {
        for (const ws of this.workspaces.values()) {
          if (ws.subject_person_id === fact.subject_person_id) return true;
        }
      }
      return false;
    }
    return true;
  }

  shareFactToGroup(reportId: string, expectedVersion: number, ctx: OpContext, factId: string): void {
    this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.incident_group_id) throw new EngineError('FORBIDDEN', 'Report is not part of an incident group');
      const fact = ws.facts.find((f) => f.fact_id === factId && f.extraction_status !== 'superseded');
      if (!fact) throw new EngineError('NOT_FOUND', `Unknown fact: ${factId}`);
      if (this.isSubjectSpecificFact(fact)) {
        throw new EngineError('SUBJECT_SPECIFIC_FACT', `Fact ${factId} (${fact.category}) is subject-specific and may not be shared through the incident group`);
      }
      const group = this.getIncidentGroup(ws.incident_group_id);
      group.shared_scene_facts.push(structuredClone(fact));
    });
  }

  importSharedFacts(reportId: string, expectedVersion: number, ctx: OpContext): number {
    return this.commit(reportId, expectedVersion, ctx, (ws) => {
      if (!ws.incident_group_id) throw new EngineError('FORBIDDEN', 'Report is not part of an incident group');
      const group = this.getIncidentGroup(ws.incident_group_id);
      let imported = 0;
      for (const shared of group.shared_scene_facts) {
        if (ws.facts.some((f) => f.source_record_id === shared.source_record_id && f.category === shared.category && f.value === shared.value)) {
          continue;
        }
        ws.facts.push({
          ...structuredClone(shared),
          fact_id: this.nextId('fact'),
          report_id: reportId,
          confirmation_status: 'unconfirmed',
          sequence: ws.facts.length + 1,
          created_version: ws.report_version,
          modified_version: ws.report_version,
        });
        imported += 1;
      }
      if (imported > 0 && (ws.chargeEvaluation !== null || ws.confirmationEvent !== null)) {
        this.applyTriggerA(ws, 'incident-group shared-fact change');
      }
      return imported;
    });
  }

  // §8 / Stage 23 — review-draft views are logged. The engine records the
  // audit event; watermarking itself happens at the service/UI boundary.
  recordDraftView(reportId: string, actor: string): void {
    this.ws(reportId); // report must exist
    this.audit('review_draft_viewed', reportId, actor, {});
  }

  // ------------------------------------------------------------------
  // Phase 7 — plain-data state snapshot for atomic persistence and crash
  // recovery (§9). Configuration (packet, policy, stubs, registries) is code,
  // not state: a restored engine must be created with the same config.
  // ------------------------------------------------------------------

  serializeState(): EngineState {
    return structuredClone({
      state_version: 1 as const,
      workspaces: [...this.workspaces.values()],
      groups: [...this.groups.values()],
      tokens: [...this.tokens.values()],
      auditLog: this.auditLog,
      idempotency: [...this.idempotencyResults.entries()].map(([key, result]) => ({ key, result })),
      killSwitchEngaged: this.killSwitchEngaged,
      idCounter: this.idCounter,
      auditSeq: this.auditSeq,
      persons: this.persons.serialize(),
    });
  }

  restoreState(state: EngineState): void {
    if (state.state_version !== 1) {
      throw new EngineError('DEPLOYMENT_FAILED', `Unknown persisted state_version: ${String(state.state_version)}`);
    }
    const restored = structuredClone(state);
    this.workspaces.clear();
    for (const ws of restored.workspaces) this.workspaces.set(ws.report_id, ws);
    this.groups.clear();
    for (const group of restored.groups) this.groups.set(group.incident_group_id, group);
    this.tokens.clear();
    for (const token of restored.tokens) this.tokens.set(token.token_id, token);
    this.auditLog.length = 0;
    this.auditLog.push(...restored.auditLog);
    this.idempotencyResults.clear();
    for (const entry of restored.idempotency) this.idempotencyResults.set(entry.key, entry.result);
    this.killSwitchEngaged = restored.killSwitchEngaged;
    this.idCounter = restored.idCounter;
    this.auditSeq = restored.auditSeq;
    this.persons.restore(restored.persons);
    // §9 — recovery resumes from the last completed commit; any snapshot that
    // no longer matches the running versions goes to SYSTEM HOLD (Trigger C).
    for (const ws of this.workspaces.values()) {
      if (ws.lifecycle === 'DRAFT' && !this.isVersionCompatible(ws)) {
        ws.gates.system_gate = { state: 'hold', reasons: ['version incompatibility detected during crash recovery'] };
      }
    }
  }

  // Direct cross-report paste. Subject-specific facts may never cross reports.
  pasteFact(fromReportId: string, toReportId: string, expectedVersion: number, ctx: OpContext, factId: string): void {
    const from = this.ws(fromReportId);
    const fact = from.facts.find((f) => f.fact_id === factId && f.extraction_status !== 'superseded');
    if (!fact) throw new EngineError('NOT_FOUND', `Unknown fact: ${factId}`);
    if (this.isSubjectSpecificFact(fact)) {
      throw new EngineError('SUBJECT_SPECIFIC_FACT', `Fact ${factId} (${fact.category}) is subject-specific and may not be pasted into another report`);
    }
    const to = this.ws(toReportId);
    if (!from.incident_group_id || from.incident_group_id !== to.incident_group_id) {
      throw new EngineError('FORBIDDEN', 'Cross-report fact reuse is only permitted between siblings of the same incident group');
    }
    this.commit(toReportId, expectedVersion, ctx, (ws) => {
      ws.facts.push({
        ...structuredClone(fact),
        fact_id: this.nextId('fact'),
        report_id: toReportId,
        confirmation_status: 'unconfirmed',
        sequence: ws.facts.length + 1,
        created_version: ws.report_version,
        modified_version: ws.report_version,
      });
    });
  }
}
