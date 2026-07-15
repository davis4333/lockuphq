// LOCKUPHQ DR Writer — Charge 6-1 Fact Cleanup
// Implements Section 8 of LOCKUPHQ_DR_WRITER_6-1_MASTER_v1.1_FINAL.md
//
// IMPORTANT: This module normalizes format, grammar, spelling, time, and rank only.
// It never invents missing facts. If a value is missing or too vague to translate
// safely, it is passed through as-is for evaluate6_1 to gate.

import type {
  IntakeFacts6_1,
  CleanedFacts6_1,
  YellowWarning,
  NarrativeReferenceStyle,
  OrderType,
  AcknowledgmentType,
  AbilityToComply,
  ConfinementStatus,
} from './types.ts';

export interface CleanupResult {
  cleaned: Partial<CleanedFacts6_1>;
  extra_warnings: YellowWarning[];
  // Internal cleanup artifact — not part of normalized facts
  confinement_corrected: boolean;
}

// --- Time normalization ---

const NON_NUMERIC_TIME_PATTERNS = [
  /lunchtime/i,
  /late evening/i,
  /early morning/i,
  /after chow/i,
  /before chow/i,
  /midday/i,
  /mid-day/i,
  /mid day/i,
  /shift change/i,
  /before shift/i,
  /after shift/i,
  /morning/i,
  /evening/i,
  /afternoon/i,
  /night/i,
];

export function isNonNumericTimeDescriptor(time: string): boolean {
  const t = time.trim();
  if (/^\d/.test(t)) return false; // starts with a digit — has numeric component
  return NON_NUMERIC_TIME_PATTERNS.some((p) => p.test(t));
}

export function normalizeTime(raw: string): string {
  const t = raw.trim();

  // Already 4-digit 24h (e.g., "1800", "0830")
  if (/^\d{4}$/.test(t)) {
    return `${t} hours`;
  }

  // 3-digit shorthand (e.g., "830")
  if (/^\d{3}$/.test(t)) {
    return `0${t} hours`;
  }

  // Already has "hours" suffix
  if (/^\d{3,4}\s*hours$/i.test(t)) {
    const digits = t.replace(/\s*hours$/i, '').trim().padStart(4, '0');
    return `${digits} hours`;
  }

  // noon / 12pm
  if (/^(noon|12\s*pm)$/i.test(t)) {
    return '1200 hours';
  }

  // midnight / 12am
  if (/^(midnight|12\s*am)$/i.test(t)) {
    return '0000 hours';
  }

  // 12-hour format: 6pm, 6:30pm, 6:30 PM, 6 pm, 11:45am, etc.
  const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hours = parseInt(ampm[1], 10);
    const minutes = parseInt(ampm[2] ?? '0', 10);
    const meridiem = ampm[3].toLowerCase();
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    return `${hh}${mm} hours`;
  }

  // Non-numeric descriptor — return as-is for evaluator to flag RED
  return t;
}

// --- Rank normalization ---

const RANK_MAP: Record<string, string> = {
  'ofc': 'Officer',
  'officer': 'Officer',
  'sgt': 'Sergeant',
  'sargent': 'Sergeant',
  'sargeant': 'Sergeant',
  's/sgt': 'Staff Sergeant',
  'lt': 'Lieutenant',
  'lieut': 'Lieutenant',
  'liutenant': 'Lieutenant',
  'cpt': 'Captain',
  'capt': 'Captain',
  'captain': 'Captain',
  'maj': 'Major',
  'major': 'Major',
  'col': 'Colonel',
  'colonel': 'Colonel',
  'sergeant': 'Sergeant',
  'lieutenant': 'Lieutenant',
};

export function normalizeRank(raw: string): string {
  const key = raw.trim().toLowerCase();
  return RANK_MAP[key] ?? toTitleCase(raw);
}

// --- Name / title case ---
// Handles hyphenated names: SMITH-JONES → Smith-Jones

export function toTitleCase(str: string): string {
  return str
    .trim()
    .split('-')
    .map((segment) =>
      segment.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    )
    .join('-');
}

// --- Order cleanup: remove first-person prefix ---

const ORDER_FIRST_PERSON_PREFIXES = [
  /^I (told|ordered|directed|instructed|commanded|asked) (him|her|them|the inmate) to /i,
  /^I (said|told) (him|her|them|the inmate) (to )?/i,
];

export function cleanOrder(raw: string): string {
  let cleaned = raw.trim();
  for (const pattern of ORDER_FIRST_PERSON_PREFIXES) {
    const match = cleaned.match(pattern);
    if (match) {
      cleaned = cleaned.slice(match[0].length).trim();
      // Lowercase the first word of the resulting command
      cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
      break;
    }
  }
  return cleaned;
}

// --- Quote cleanup: fix capitalization and punctuation only, preserve all words ---

export function cleanQuote(raw: string): string {
  if (!raw || !raw.trim()) return raw;
  let q = raw.trim();
  // Capitalize first character
  q = q.charAt(0).toUpperCase() + q.slice(1);
  // Add terminal punctuation if missing
  if (!/[.!?]$/.test(q)) {
    q = `${q}.`;
  }
  return q;
}

// --- Confinement: detect "disciplinary confinement" typed before hearing ---

const DISCIPLINARY_CONFINEMENT_PATTERN = /disciplinary\s+confinement/i;

// --- Common typo corrections ---

const TYPO_MAP: Array<[RegExp, string]> = [
  [/\broaster\b/gi, 'roster'],
  [/\bconfinment\b/gi, 'confinement'],
  [/\brecieved\b/gi, 'received'],
  [/\bSargent\b/gi, 'Sergeant'],  // case-insensitive: catches both "Sargent" and "sargent"
  [/\bliutenant\b/gi, 'Lieutenant'],
  [/\bdissaplinary\b/gi, 'disciplinary'],
  [/\bincedent\b/gi, 'incident'],
  [/\bimediate\b/gi, 'immediate'],
  [/\bverbaly\b/gi, 'verbally'],
  [/\bcomplience\b/gi, 'compliance'],
  [/\boreder\b/gi, 'order'],
  [/\bnoncomplience\b/gi, 'noncompliance'],
];

export function applyTypoCorrections(text: string): string {
  let result = text;
  for (const [pattern, replacement] of TYPO_MAP) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// --- Parse total_orders_given safely ---

// Purely vague descriptors with no leading number
const VAGUE_COUNT_PATTERNS = [
  /^several\b/i,
  /^multiple\b/i,
  /^a few\b/i,
  /^many\b/i,
  /^some\b/i,
  /^numerous\b/i,
  /^various\b/i,
];

export function isVagueCount(value: number | string | null): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return false;
  if (typeof value === 'string') {
    // If the string starts with a parseable number ("3 times", "3 total"), treat as valid
    const numeric = parseInt(value, 10);
    if (!isNaN(numeric)) return false;
    // Purely vague descriptor with no numeric component
    return VAGUE_COUNT_PATTERNS.some((p) => p.test(value.trim()));
  }
  return false;
}

export function parseTotalOrders(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const numeric = parseInt(value, 10);
  if (!isNaN(numeric)) return numeric;
  return null; // vague or unparseable — evaluator will flag RED
}

// --- Main cleanup function ---

export function cleanFacts6_1(intake: IntakeFacts6_1): CleanupResult {
  const extra_warnings: YellowWarning[] = [];
  const cleaned: Partial<CleanedFacts6_1> = {};

  // incident_date: pass through
  cleaned.incident_date = intake.incident_date?.trim() ?? undefined;

  // incident_time: normalize format
  if (intake.incident_time) {
    cleaned.incident_time = normalizeTime(intake.incident_time);
  }

  // officer_rank: normalize abbreviations
  if (intake.officer_rank) {
    cleaned.officer_rank = normalizeRank(intake.officer_rank);
  }

  // officer_name: title case
  if (intake.officer_name) {
    cleaned.officer_name = toTitleCase(intake.officer_name);
  }

  // officer_post: pass through, apply typo corrections
  if (intake.officer_post) {
    cleaned.officer_post = applyTypoCorrections(intake.officer_post.trim());
  }

  // dorm_area: pass through
  if (intake.dorm_area) {
    cleaned.dorm_area = intake.dorm_area.trim();
  }

  // officer_activity: apply typo corrections
  if (intake.officer_activity) {
    cleaned.officer_activity = applyTypoCorrections(intake.officer_activity.trim());
  }

  // incident_location: pass through
  if (intake.incident_location) {
    cleaned.incident_location = intake.incident_location.trim();
  }

  // inmate names: title case (supports hyphenated names)
  if (intake.inmate_last_name) {
    cleaned.inmate_last_name = toTitleCase(intake.inmate_last_name);
  }
  cleaned.inmate_first_name = intake.inmate_first_name
    ? toTitleCase(intake.inmate_first_name)
    : null;

  // dc_number: pass through (preserve formatting)
  if (intake.dc_number) {
    cleaned.dc_number = intake.dc_number.trim().toUpperCase();
  }

  // narrative_reference_style: pass through (validated type)
  if (intake.narrative_reference_style) {
    cleaned.narrative_reference_style = intake.narrative_reference_style as NarrativeReferenceStyle;
  }

  // inmate_behavior_before_order: apply typo corrections, pass through for evaluator to assess
  if (intake.inmate_behavior_before_order) {
    cleaned.inmate_behavior_before_order = applyTypoCorrections(
      intake.inmate_behavior_before_order.trim()
    );
  }

  // order_type: pass through (validated type)
  if (intake.order_type) {
    cleaned.order_type = intake.order_type as OrderType;
  }

  // exact_order: strip first-person prefix, then pass through
  if (intake.exact_order) {
    cleaned.exact_order = cleanOrder(intake.exact_order);
  }

  // total_orders_given: parse to number if possible
  const parsedOrders = parseTotalOrders(intake.total_orders_given);
  if (parsedOrders !== null) {
    cleaned.total_orders_given = parsedOrders;
  }
  // If vague or null, leave undefined — evaluator will flag RED

  // acknowledgment_type: pass through
  if (intake.acknowledgment_type) {
    cleaned.acknowledgment_type = intake.acknowledgment_type as AcknowledgmentType;
  }

  // inmate_quote: clean capitalization and punctuation only — never change words
  if (intake.inmate_quote) {
    cleaned.inmate_quote = cleanQuote(intake.inmate_quote);
  } else {
    cleaned.inmate_quote = null;
  }

  // inmate_said_nothing: pass through
  cleaned.inmate_said_nothing = intake.inmate_said_nothing ?? false;

  // inmate_tone: pass through (evaluator checks for missing tone when inmate spoke)
  cleaned.inmate_tone = intake.inmate_tone?.trim() ?? null;

  // physical_behavior: apply typo corrections
  if (intake.physical_behavior) {
    cleaned.physical_behavior = applyTypoCorrections(intake.physical_behavior.trim());
  }

  // operational_impact: apply typo corrections
  if (intake.operational_impact) {
    cleaned.operational_impact = applyTypoCorrections(intake.operational_impact.trim());
  }

  // ability_to_comply: pass through
  if (intake.ability_to_comply) {
    cleaned.ability_to_comply = intake.ability_to_comply as AbilityToComply;
  }
  cleaned.ability_to_comply_explanation = intake.ability_to_comply_explanation?.trim() ?? null;

  // force fields: enforce v1.1 schema
  if (intake.force_used === 'no') {
    cleaned.force_used = 'no';
    cleaned.force_explanation = null;
    cleaned.uof_documentation_status = 'not_applicable';
  } else if (intake.force_used === 'yes') {
    cleaned.force_used = 'yes';
    cleaned.force_explanation = intake.force_explanation?.trim() ?? null;
    // Only set completed if officer explicitly confirmed; otherwise not_confirmed
    cleaned.uof_documentation_status =
      intake.uof_documentation_status === 'completed' ? 'completed' : 'not_confirmed';
  }
  // null/undefined force_used passes through — evaluator will flag RED

  // confinement_status: pass through
  let confinementCorrected = false;
  if (intake.confinement_status) {
    cleaned.confinement_status = intake.confinement_status as ConfinementStatus;
  }

  // Check free-text additional_facts for "disciplinary confinement" language and auto-correct
  if (intake.additional_facts && DISCIPLINARY_CONFINEMENT_PATTERN.test(intake.additional_facts)) {
    confinementCorrected = true;
    cleaned.additional_facts = intake.additional_facts.replace(
      /disciplinary\s+confinement/gi,
      'administrative confinement'
    );
    extra_warnings.push({
      id: 'disciplinary_confinement_corrected',
      flag_label: 'confinement term corrected',
      warning:
        'You used the term "disciplinary confinement." This has been corrected to "administrative confinement." Disciplinary confinement is a post-hearing sanction. Pre-hearing placement is administrative confinement.',
      affected_paragraph: 6,
      suggested_clarification:
        'Confirm that the inmate was placed in administrative confinement pending the outcome of the disciplinary report — not as a post-hearing sanction.',
      example_stronger_answer:
        'The inmate was placed in administrative confinement pending the outcome of this disciplinary report.',
    });
  } else {
    cleaned.additional_facts = intake.additional_facts?.trim() ?? null;
  }

  // OIC: normalize rank and name
  if (intake.oic_rank) {
    cleaned.oic_rank = normalizeRank(intake.oic_rank);
  }
  if (intake.oic_last_name) {
    cleaned.oic_last_name = toTitleCase(intake.oic_last_name);
  }

  // Optional fields
  cleaned.witness_staff = intake.witness_staff?.trim() ?? null;
  cleaned.camera_coverage = intake.camera_coverage?.trim() ?? null;

  // Multi-charge / invent flags
  cleaned.separate_conduct_described = intake.separate_conduct_described ?? false;
  cleaned.separate_conduct_isolatable = intake.separate_conduct_isolatable ?? null;

  return { cleaned, extra_warnings, confinement_corrected: confinementCorrected };
}
