// LOCKUPHQ DR Writer — Charge 6-1 Types
// Schema version: 1.1
// Source: Section 12 of LOCKUPHQ_DR_WRITER_6-1_MASTER_v1.1_FINAL.md

export type NarrativeReferenceStyle = 'he/him' | 'she/her' | 'they/them' | 'last-name-only';

export type OrderType = 'verbal' | 'written' | 'both';

export type Status = 'RED' | 'YELLOW' | 'GREEN';

export type PromptOutputMode6_1 = 'narrative_only' | 'json_schema';

export type ConfinementStatus = 'placed' | 'remained' | 'none';

export type UofDocumentationStatus = 'not_applicable' | 'completed' | 'not_confirmed';

export type AbilityToComply = 'no_issue' | 'issue_with_explanation';

export type AcknowledgmentType =
  | 'eye_contact'
  | 'verbal_response'
  | 'eye_contact_and_verbal_response'
  | 'physical_reaction'
  | 'actions_showed_awareness'
  | 'within_hearing_distance'
  | 'unknown';

// Raw officer intake — types accept messy input (string counts, null fields, etc.)
export interface IntakeFacts6_1 {
  incident_date: string | null;
  incident_time: string | null;
  officer_rank: string | null;
  officer_name: string | null;
  officer_post: string | null;
  dorm_area: string | null;
  officer_activity: string | null;
  incident_location: string | null;
  inmate_last_name: string | null;
  inmate_first_name: string | null;
  dc_number: string | null;
  narrative_reference_style: NarrativeReferenceStyle | null;
  inmate_behavior_before_order: string | null;
  order_type: OrderType | null;
  exact_order: string | null;
  // number | string to capture "several times", "multiple times", etc. at intake
  total_orders_given: number | string | null;
  acknowledgment_type: AcknowledgmentType | null;
  inmate_quote: string | null;
  inmate_said_nothing: boolean | null;
  // Officer's own attestation that inmate_quote is a paraphrase, not exact words. When true,
  // this overrides the automatic quote-summary regex detection in evaluate6_1.ts — the
  // officer's honest self-report wins over a pattern-matching guess.
  quote_is_summary: boolean | null;
  inmate_tone: string | null;
  physical_behavior: string | null;
  operational_impact: string | null;
  ability_to_comply: AbilityToComply | null;
  ability_to_comply_explanation: string | null;
  force_used: 'no' | 'yes' | null;
  force_explanation: string | null;
  uof_documentation_status: UofDocumentationStatus | null;
  confinement_status: ConfinementStatus | null;
  oic_rank: string | null;
  oic_last_name: string | null;
  // Officer's explicit attestation that the OIC named above actually authorized this report
  // (not just that a name was typed in). RED blocker if not true — see evaluate6_1.ts.
  oic_authorized_confirmed: boolean | null;
  witness_staff: string | null;
  camera_coverage: string | null;
  additional_facts: string | null;
  // Explicit flags for multi-charge and invent scenarios
  separate_conduct_described: boolean | null;
  separate_conduct_isolatable: boolean | null;
  request_to_invent: boolean | null;
}

// Normalized facts after cleanup — all required fields are non-null
export interface CleanedFacts6_1 {
  incident_date: string;
  incident_time: string; // normalized to "HHMM hours" format
  officer_rank: string;  // fully spelled out
  officer_name: string;  // title case
  officer_post: string;
  dorm_area: string;
  officer_activity: string;
  incident_location: string;
  inmate_last_name: string; // title case
  inmate_first_name: string | null;
  dc_number: string;
  narrative_reference_style: NarrativeReferenceStyle;
  inmate_behavior_before_order: string;
  order_type: OrderType;
  exact_order: string; // command only, no first-person phrasing
  total_orders_given: number;
  acknowledgment_type: AcknowledgmentType;
  inmate_quote: string | null;
  inmate_said_nothing: boolean;
  inmate_tone: string | null;
  physical_behavior: string;
  operational_impact: string;
  ability_to_comply: AbilityToComply;
  ability_to_comply_explanation: string | null;
  force_used: 'no' | 'yes';
  force_explanation: string | null;
  uof_documentation_status: UofDocumentationStatus;
  confinement_status: ConfinementStatus;
  oic_rank: string; // fully spelled out
  oic_last_name: string; // title case
  witness_staff: string | null;
  camera_coverage: string | null;
  additional_facts: string | null;
  separate_conduct_described: boolean;
  separate_conduct_isolatable: boolean | null;
}

export interface RedBlocker {
  id: string;
  missing_fact: string;
  follow_up_question: string;
}

export interface YellowWarning {
  id: string;
  flag_label: string; // short inline label used inside [REVIEW — ...] flags
  warning: string;
  affected_paragraph: 1 | 2 | 3 | 4 | 5 | 6;
  suggested_clarification: string;
  example_stronger_answer: string;
}

export interface EvaluationResult6_1 {
  status: Status;
  red_blockers: RedBlocker[];
  yellow_warnings: YellowWarning[];
  // null when status is RED (missing required facts prevent complete cleanup)
  cleaned_facts: CleanedFacts6_1 | null;
}

// Final output schema v1.1 — matches output_schema_v1_1.json
export interface OutputSchema6_1 {
  schema_version: '1.1';
  charge: '6-1';
  status: Status;
  red_blockers: RedBlocker[];
  yellow_warnings: Array<{
    warning: string;
    affected_paragraph: number;
    suggested_clarification: string;
    example_stronger_answer: string;
  }>;
  cleaned_facts: CleanedFacts6_1 | null;
  narrative: string | null;
  flagged_sections: number[];
  ai_disclosure: string;
  officer_review_checklist: string[];
}

export const AI_DISCLOSURE =
  'This narrative was formatted with AI assistance using LOCKUPHQ DR Writer v1.1, Charge 6-1. All factual content was provided by the reporting officer. The officer has reviewed and certified the accuracy of this report.';

export const OFFICER_REVIEW_CHECKLIST: string[] = [
  'The inmate\'s name and DC number are correct and match the inmate involved in this incident.',
  'The incident date and time are accurate.',
  'The location is the exact location where the incident occurred.',
  'The order you gave is documented exactly as you gave it.',
  'The order count is the exact number of orders you gave — not approximate.',
  'If the inmate spoke, the quote inside quotation marks is accurate to what was actually said.',
  'The physical behavior described matches what you directly observed.',
  'The OIC rank and name are correct and this officer did specifically authorize this report.',
  'The confinement status accurately reflects what occurred after the incident.',
  'No facts appear in this report that you did not provide.',
  'You have read the entire narrative and are satisfied it accurately represents your firsthand account.',
  'You understand that by certifying this report you are attesting to the accuracy of its contents.',
];
