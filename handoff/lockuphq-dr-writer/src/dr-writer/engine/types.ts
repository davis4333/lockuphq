// LOCKUPHQ DR Writer — Engine core entity and event schemas.
// Source of truth: LOCKUPHQ_DR_WRITER_MASTER_BLUEPRINT_V2_5.md §5 (core entities),
// §13 (minimum schemas), Stage 10 (order event), Stage 24 (finalization token).
// Phase 1 of §18. Synthetic data only — never real inmate data.

// ---------------------------------------------------------------------------
// §5.1 / §13 Person
// ---------------------------------------------------------------------------

export type PersonType = 'staff' | 'inmate' | 'medical_staff' | 'witness' | 'unknown';
export type PersonConfirmationStatus = 'unconfirmed' | 'confirmed';
export type PersonAmbiguityStatus = 'unambiguous' | 'ambiguous';

export interface Person {
  person_id: string;
  report_id: string | null;
  incident_group_id: string | null;
  person_type: PersonType;
  first_name: string | null;
  last_name: string;
  initial: string | null;
  rank_or_role: string | null;
  dc_number: string | null;
  identity_source: string;
  confirmation_status: PersonConfirmationStatus;
  ambiguity_status: PersonAmbiguityStatus;
}

// An unresolved textual reference such as a bare "Smith" when two Smiths exist.
export interface AmbiguousPersonReference {
  reference_id: string;
  report_id: string;
  raw_text: string;
  candidate_person_ids: string[];
  resolved_person_id: string | null;
}

// ---------------------------------------------------------------------------
// §5.2 Incident group
// ---------------------------------------------------------------------------

export interface IncidentGroup {
  incident_group_id: string;
  shared_scene_facts: Fact[];
  shared_staff: string[]; // person_ids
  shared_date_time_location: {
    incident_start: string;
    incident_end: string | null;
    general_area: string;
    specific_location: string;
  } | null;
  sibling_report_ids: string[];
  creation_source: string;
  created_by: string;
}

// ---------------------------------------------------------------------------
// §5.3 Report lifecycle
// ---------------------------------------------------------------------------

export type Lifecycle = 'DRAFT' | 'ABANDONED' | 'EXPIRED' | 'FINALIZED' | 'VOIDED';

// ---------------------------------------------------------------------------
// §5.4 Independent gates — separately stored, simultaneously visible.
// A derived display status is never the source of truth (invariant 13).
// ---------------------------------------------------------------------------

export type GateName =
  | 'system_gate'
  | 'procedural_gate'
  | 'policy_gate'
  | 'fact_gate'
  | 'quality_gate'
  | 'narrative_gate'
  | 'certification_gate'
  | 'audit_gate';

export type GateState = 'pass' | 'hold' | 'pending';

export interface GateRecord {
  state: GateState;
  reasons: string[];
}

export type Gates = Record<GateName, GateRecord>;

// ---------------------------------------------------------------------------
// §6 Display statuses (derived, never authoritative)
// ---------------------------------------------------------------------------

export type DisplayStatus =
  | 'SYSTEM HOLD'
  | 'PROCEDURAL REVIEW'
  | 'POLICY REVIEW'
  | 'FACTS INCOMPLETE'
  | 'CHARGE UNSUPPORTED'
  | 'REVIEW REQUIRED'
  | 'READY FOR GENERATION'
  | 'VALIDATION HOLD'
  | 'READY FOR CERTIFICATION'
  | 'FINALIZED';

// ---------------------------------------------------------------------------
// §13 Raw notes (Stage 4 — atomic, immutable after commit)
// ---------------------------------------------------------------------------

export interface RawNotes {
  raw_notes_id: string;
  report_id: string;
  original_text: string;
  committed_hash: string;
  created_by: string;
  created_at: string;
  request_id: string;
  encoding: string;
  length: number;
  truncated: false; // silent truncation is prohibited; oversize input is rejected
  immutable: true;
}

// ---------------------------------------------------------------------------
// §13 Amendment (Stage 5 — separate immutable record, never overwrites notes)
// ---------------------------------------------------------------------------

export interface Amendment {
  amendment_id: string;
  report_id: string;
  amendment_text: string;
  amendment_hash: string;
  reason: string;
  created_by: string;
  created_at: string;
  rollback_triggered_at: string | null;
}

// ---------------------------------------------------------------------------
// §13 Fact (Stage 9 — append-only ledger; corrections create new versions)
// ---------------------------------------------------------------------------

export type FactCertainty = 'exact' | 'approximate' | 'unknown';
export type FactSourceType = 'original_notes' | 'amendment' | 'procedural_screen' | 'officer_answer';
export type ExtractionStatus = 'extracted' | 'officer_added' | 'superseded';
export type FactConfirmationStatus = 'unconfirmed' | 'confirmed' | 'rejected';

export interface Fact {
  fact_id: string;
  report_id: string;
  category: string;
  value: string;
  certainty: FactCertainty;
  source_type: FactSourceType;
  source_record_id: string;
  source_text: string; // exact source passage
  speaker_person_id: string | null;
  subject_person_id: string | null;
  ambiguous_reference_id: string | null; // set while a person reference is unresolved
  ambiguous_reference_field: 'speaker' | 'subject' | null;
  sequence: number;
  extraction_status: ExtractionStatus;
  confirmation_status: FactConfirmationStatus;
  prior_fact_version: string | null;
  created_version: number;
  modified_version: number;
}

// ---------------------------------------------------------------------------
// Stage 10 — Order event
// ---------------------------------------------------------------------------

export type OrderCountMode = 'exact' | 'at_least' | 'unknown';

export interface OrderEvent {
  order_event_id: string;
  report_id: string;
  issuer_person_id: string;
  issuer_role_source: string;
  authority_status: 'supported' | 'unsupported' | 'unknown';
  authority_source: string | null;
  order_type: string;
  specific_command: string;
  delivery_scope: 'individual' | 'group';
  subject_applicability: 'applies' | 'does_not_apply' | 'unknown';
  first_delivery_datetime: string | null;
  count_mode: OrderCountMode;
  exact_count: number | null;
  minimum_count: number | null;
  modification: string | null;
  rescission: { rescinded: boolean; rescinded_at: string | null; before_alleged_conduct: boolean } | null;
  conflicting_orders: string[];
  awareness_basis: string | null;
  opportunity: string | null;
  verbal_response_type: string | null;
  verbal_response: string | null;
  physical_response: string | null;
  compliance_result: 'complied' | 'did_not_comply' | 'partial' | 'unknown';
  compliance_timing: 'timely' | 'delayed' | 'none' | 'unknown';
  selected_for_charge: boolean;
}

// ---------------------------------------------------------------------------
// §13 Fact confirmation event (Stage 15 — hash-bound, invariant 21)
// ---------------------------------------------------------------------------

export interface FactConfirmationDecision {
  fact_id: string;
  fact_version: number;
  decision: 'confirm' | 'reject' | 'correct';
}

export interface FactConfirmationEvent {
  confirmation_event_id: string;
  report_id: string;
  user_id: string;
  ledger_hash: string;
  displayed_fact_versions: { fact_id: string; version: number }[];
  decisions: FactConfirmationDecision[];
  source_passages_shown: string[];
  timing_metadata: { started_at: string; submitted_at: string; rapid_confirmation: boolean };
  created_at: string;
}

// ---------------------------------------------------------------------------
// §13 Fact snapshot (Stage 16 — immutable basis for generation)
// ---------------------------------------------------------------------------

export interface FactSnapshot {
  snapshot_id: string;
  report_id: string;
  report_version: number;
  administrative_hash: string;
  ledger_hash: string;
  selected_order_hash: string;
  raw_notes_hash: string;
  amendment_hashes: string[];
  person_registry_hash: string;
  incident_group_hash: string | null;
  charge_version: string;
  policy_version: string;
  schema_version: string;
  model_prompt_versions: Record<string, string>;
  confirmation_event_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Stage 17 — Narrative (every sentence maps to confirmed fact IDs, invariant 2)
// ---------------------------------------------------------------------------

export interface NarrativeSentence {
  sentence_id: string;
  section: string;
  text: string;
  source_fact_ids: string[];
  certainty: FactCertainty;
  edited: boolean;
  resourcing_status: 'sourced' | 'pending_resourcing' | 'unsupported' | 'manual_fact_review';
}

export interface Narrative {
  narrative_id: string;
  report_id: string;
  snapshot_id: string;
  sentences: NarrativeSentence[];
  narrative_hash: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// §13 Validation issue
// ---------------------------------------------------------------------------

export type IssueSeverity = 'blocker' | 'warning' | 'info';

export interface ValidationIssue {
  issue_id: string;
  severity: IssueSeverity;
  category: string;
  sentence_id: string | null;
  fact_ids: string[];
  message: string;
  resolver: string | null;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ValidationResult {
  validation_id: string;
  report_id: string;
  kind: 'deterministic' | 'semantic';
  narrative_hash: string;
  passed: boolean;
  issues: ValidationIssue[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// §13 Certification (Stage 22 — hash-bound, invariant 21)
// ---------------------------------------------------------------------------

export interface Certification {
  certification_id: string;
  report_id: string;
  user_id: string;
  session_id: string;
  report_version: number;
  fact_snapshot_hash: string;
  narrative_hash: string;
  validation_ids: string[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Stage 24 — Finalization token (invariant 22: session-bound, channel-bound,
// single-use, short-lived, revocable)
// ---------------------------------------------------------------------------

export type OutputChannel = 'copy' | 'print' | 'pdf';

export interface FinalizationToken {
  token_id: string;
  report_id: string;
  user_id: string;
  role: string;
  session_id: string;
  report_version: number;
  fact_snapshot_hash: string;
  narrative_hash: string;
  deterministic_validation_hash: string;
  semantic_validation_hash: string;
  charge_version: string;
  policy_version: string;
  schema_version: string;
  output_channel: OutputChannel;
  issued_at: string;
  expires_at: string;
  single_use: true;
  redeemed_at: string | null;
  revoked_at: string | null;
}

// ---------------------------------------------------------------------------
// Stage 23 — Audit events (append-only)
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'workspace_created'
  | 'original_notes_committed'
  | 'amendment_added'
  | 'extraction_started'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'critic_completed'
  | 'person_disambiguated'
  | 'facts_confirmed'
  | 'snapshot_created'
  | 'policy_review_resolved'
  | 'charge_unsupported'
  | 'narrative_generated'
  | 'narrative_edited'
  | 'validation_completed'
  | 'validation_failed'
  | 'certification_created'
  | 'certification_rejected'
  | 'session_locked'
  | 'session_lock_transferred'
  | 'concurrency_rejected'
  | 'kill_switch_engaged'
  | 'kill_switch_released'
  | 'review_draft_viewed'
  | 'audit_finalization_committed'
  | 'token_issued'
  | 'token_redeemed'
  | 'token_revoked'
  | 'output_completed'
  | 'output_failed'
  | 'report_abandoned'
  | 'report_expired'
  | 'report_voided';

export interface AuditEvent {
  audit_seq: number;
  event_type: AuditEventType;
  report_id: string | null;
  actor_user_id: string | null;
  created_at: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stage 2 — Administrative intake
// ---------------------------------------------------------------------------

export interface AdministrativeIntake {
  reporting_officer_person_id: string;
  institution_id: string;
  assignment: string;
  subject_person_id: string;
  subject_dc_number: string;
  incident_start: string; // full datetime, ISO 8601
  incident_end: string | null;
  time_certainty: FactCertainty;
  general_area: string;
  specific_location: string;
  charge_code: string;
  reference_style: string;
  incident_group_id: string | null;
  // Derived by a versioned policy rule — never guessed (Stage 2).
  derived_report_date: string | null;
  report_date_rule_version: string | null;
}

// ---------------------------------------------------------------------------
// Stage 3 — Procedural screen
// ---------------------------------------------------------------------------

export interface ProceduralScreen {
  screen_id: string;
  report_id: string;
  answers: Record<string, string>; // question intent id -> answer
  created_at: string;
}
