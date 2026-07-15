// LOCKUPHQ DR Writer — Charge packet schema and policy profile schema.
// Source of truth: blueprint §13 (charge packet), Stage 13 (deterministic charge
// evaluation), Stage 14 (question configuration), §5.3 (policy-configured
// lifecycle transitions), Stage 2 (versioned report-date rule), Stage 24 (token
// expiry). Synthetic configuration only — no agency policy is represented here.

import type { Lifecycle, OrderEvent } from './types.ts';

// ---------------------------------------------------------------------------
// Charge packet (§13) — deterministic, versioned, never recommends a charge
// ---------------------------------------------------------------------------

export interface ChargeUnsupportedRule {
  rule_id: string;
  description: string;
  // Deterministic predicate over the selected order event. True = the confirmed
  // facts affirmatively defeat the selected charge (Stage 13).
  defeated_when: (order: OrderEvent) => boolean;
}

export interface QuestionIntent {
  intent_id: string;
  ledger_slot: string; // safe slot the engine may fill; AI never authors questions
  text_template: string;
  supports_uncertainty_answers: true; // exact/approximate/did not observe/etc. (Stage 14)
}

// Stage 14 — every applicable question supports these answers.
export const ANSWER_TYPES = [
  'exact',
  'approximate',
  'did_not_observe',
  'do_not_remember',
  'unknown',
  'not_applicable',
] as const;

export type AnswerType = (typeof ANSWER_TYPES)[number];

export interface ChargePacket {
  charge_code: string;
  charge_version: string;
  title: string;
  // Tier 3 factual-grounding categories that must exist as confirmed facts.
  required_fact_categories: string[];
  // Fact categories that, when present but unverified, route to policy review (Tier 2).
  policy_review_categories: string[];
  charge_unsupported_rules: ChargeUnsupportedRule[];
  source_mappings: Record<string, string>; // fact category -> requirement_id
  acceptable_source_types: string[];
  issuer_authority_rules: { require_supported_authority: true };
  question_intents: QuestionIntent[];
  validation_rules: { require_one_violation: true; require_selected_order: true };
  effective_date: string;
  approval: { approved: boolean; approved_by: string | null; approved_at: string | null };
}

export function validateChargePacket(packet: ChargePacket): string[] {
  const problems: string[] = [];
  if (!packet.charge_code) problems.push('charge_code missing');
  if (!packet.charge_version) problems.push('charge_version missing');
  if (packet.required_fact_categories.length === 0) problems.push('required_fact_categories empty');
  if (!packet.approval.approved) problems.push('charge packet not approved');
  for (const rule of packet.charge_unsupported_rules) {
    if (typeof rule.defeated_when !== 'function') problems.push(`rule ${rule.rule_id} has no predicate`);
  }
  return problems;
}

// Synthetic Charge 6-1 packet (Tier 3 grounding per §4). Deterministic only.
export const SYNTHETIC_PACKET_6_1: ChargePacket = {
  charge_code: '6-1',
  charge_version: 'synthetic-6-1-v1',
  title: 'Disobeying a verbal or written order (synthetic test packet)',
  required_fact_categories: [
    'subject_identity',
    'issuer_identity',
    'authority_basis',
    'specific_order',
    'subject_applicability',
    'post_order_conduct',
    'supported_noncompliance',
    'immediate_action',
  ],
  policy_review_categories: ['force_used', 'medical_involvement'],
  charge_unsupported_rules: [
    {
      rule_id: 'timely_compliance',
      description: 'Subject complied with the selected order in a timely manner.',
      defeated_when: (order) =>
        order.compliance_result === 'complied' && order.compliance_timing === 'timely',
    },
    {
      rule_id: 'rescinded_before_conduct',
      description: 'The selected order was rescinded before the alleged conduct.',
      defeated_when: (order) =>
        order.rescission !== null && order.rescission.rescinded && order.rescission.before_alleged_conduct,
    },
    {
      rule_id: 'order_not_applicable',
      description: 'The selected order did not apply to the subject.',
      defeated_when: (order) => order.subject_applicability === 'does_not_apply',
    },
  ],
  source_mappings: {
    specific_order: 'REQ-T3-ORDER',
    supported_noncompliance: 'REQ-T3-NONCOMPLIANCE',
  },
  acceptable_source_types: ['original_notes', 'amendment', 'procedural_screen', 'officer_answer'],
  issuer_authority_rules: { require_supported_authority: true },
  question_intents: [
    {
      intent_id: 'subject_identity_detail',
      ledger_slot: 'subject_identity',
      text_template: 'Who is the subject inmate, including the DC number if known?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'issuer_identity_detail',
      ledger_slot: 'issuer_identity',
      text_template: 'Which staff member issued the order?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'authority_basis_detail',
      ledger_slot: 'authority_basis',
      text_template: 'What was the basis of the issuing officer’s authority (post orders, rank, assignment)?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'order_exact_wording',
      ledger_slot: 'specific_order',
      text_template: 'What was the exact wording of the order, if known?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'applicability_detail',
      ledger_slot: 'subject_applicability',
      text_template: 'How did the order apply to the subject (individually, or as part of a group)?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'compliance_timing',
      ledger_slot: 'post_order_conduct',
      text_template: 'What did the subject do immediately after the order?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'noncompliance_evidence',
      ledger_slot: 'supported_noncompliance',
      text_template: 'What statement or conduct showed the subject did not comply?',
      supports_uncertainty_answers: true,
    },
    {
      intent_id: 'immediate_action_detail',
      ledger_slot: 'immediate_action',
      text_template: 'What action did staff take immediately afterward?',
      supports_uncertainty_answers: true,
    },
  ],
  validation_rules: { require_one_violation: true, require_selected_order: true },
  effective_date: '2026-01-01',
  approval: { approved: true, approved_by: 'synthetic-approver', approved_at: '2026-01-01T00:00:00Z' },
};

// ---------------------------------------------------------------------------
// Policy profile (§13, Stage 2, Stage 14, Stage 24, §5.3, §9)
// ---------------------------------------------------------------------------

export interface PolicyProfile {
  policy_version: string;
  schema_version: string;
  model_prompt_versions: Record<string, string>;
  // Stage 2 — displayed report date is derived by a versioned rule; midnight
  // crossover cannot be guessed by AI.
  report_date_rule_version: string;
  // Stage 14 defaults.
  question_batch_size: number;
  question_max_batch_size: number;
  max_clarification_rounds: number;
  // Stage 19 — automated regeneration/revalidation bound.
  max_regeneration_attempts: number;
  // Stage 20 — failed re-sourcing bound per sentence.
  max_resourcing_attempts: number;
  // Stage 24 — token expiry (default 5 minutes, configurable).
  token_expiry_seconds: number;
  // §5.3 — lifecycle transition permissions are policy-configured.
  allowed_lifecycle_transitions: { from: Lifecycle; to: Lifecycle }[];
  // §5.3 / test 22 — abandonment and expiry.
  report_expiry_hours: number;
  // §10 — roles authorized to operate the kill switch.
  kill_switch_roles: string[];
}

export const SYNTHETIC_POLICY_PROFILE: PolicyProfile = {
  policy_version: 'synthetic-policy-v1',
  schema_version: 'schema-v1',
  model_prompt_versions: { extractor: 'stub-extractor-v1', critic: 'stub-critic-v1', generator: 'stub-generator-v1', resourcer: 'stub-resourcer-v1', semantic_validator: 'stub-semantic-v1' },
  report_date_rule_version: 'report-date-rule-v1',
  question_batch_size: 4,
  question_max_batch_size: 5,
  max_clarification_rounds: 3,
  max_regeneration_attempts: 2,
  max_resourcing_attempts: 2,
  token_expiry_seconds: 300,
  allowed_lifecycle_transitions: [
    { from: 'DRAFT', to: 'ABANDONED' },
    { from: 'DRAFT', to: 'EXPIRED' },
    { from: 'DRAFT', to: 'VOIDED' },
    { from: 'DRAFT', to: 'FINALIZED' }, // only via the full finalization path
    { from: 'FINALIZED', to: 'VOIDED' },
  ],
  report_expiry_hours: 72,
  kill_switch_roles: ['system_admin'],
};

// Stage 2 — versioned report-date derivation. The rule, not AI, resolves
// midnight crossover: the report date is the calendar date of the incident
// START datetime. Fail closed on missing/invalid input.
export function deriveReportDate(incidentStartIso: string, ruleVersion: string): string {
  if (ruleVersion !== 'report-date-rule-v1') {
    throw new Error(`Unknown report_date_rule_version: ${ruleVersion}`);
  }
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}/.exec(incidentStartIso);
  if (!match) {
    throw new Error(`Cannot derive report date: incident_start is not a full datetime (${incidentStartIso})`);
  }
  return match[1];
}
