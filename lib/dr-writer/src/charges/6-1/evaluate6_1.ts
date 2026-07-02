// LOCKUPHQ DR Writer — Charge 6-1 Evaluator
// Implements Sections 6 and 7 of LOCKUPHQ_DR_WRITER_6-1_MASTER_v1.1_FINAL.md
//
// Accepts raw IntakeFacts6_1. Internally calls cleanFacts6_1 first.
// Returns EvaluationResult6_1 with status RED, YELLOW, or GREEN.
//
// RED  = missing required facts → narrative must be null, cleaned_facts is null
// YELLOW = all required facts present but weak/vague → marked draft allowed
// GREEN = all facts present and specific → clean certifiable draft allowed
//
// This evaluator does NOT call the Claude API.
// This evaluator does NOT generate the final narrative.
// It only gates and prepares facts.

import type {
  IntakeFacts6_1,
  CleanedFacts6_1,
  EvaluationResult6_1,
  RedBlocker,
  YellowWarning,
} from './types';
import {
  cleanFacts6_1,
  isNonNumericTimeDescriptor,
  isVagueCount,
  parseTotalOrders,
} from './cleanFacts6_1';

// --- Red blocker detection helpers ---

function isBlank(val: string | null | undefined): boolean {
  return val === null || val === undefined || val.trim() === '';
}

const VAGUE_ORDER_SINGLE_VERBS = new Set([
  'stop', 'go', 'sit', 'move', 'leave', 'stand', 'come', 'back', 'stay', 'wait',
]);

function isVagueOrder(order: string): boolean {
  const words = order.trim().split(/\s+/);
  if (words.length < 2) {
    // Single-word command with no object is inherently vague
    return VAGUE_ORDER_SINGLE_VERBS.has(words[0].toLowerCase()) || words.length === 1;
  }
  return false;
}

// Detect if a quote sounds like a summary (third-person description) rather than exact words
const SUMMARY_PATTERNS = [
  /^he said he\b/i,
  /^he said that\b/i,
  /^she said she\b/i,
  /^she said that\b/i,
  /^they said they\b/i,
  /^they said that\b/i,
  /^he told me\b/i,
  /^she told me\b/i,
  /^they told me\b/i,
  /^he stated that\b/i,
  /^she stated that\b/i,
  /^that he (wasn't|wasn't|wasn't|would|could|was)\b/i,
  /^that she (wasn't|wasn't|wasn't|would|could|was)\b/i,
  /^he (wasn't|wouldn't|didn't|was)\b/i,
  /^she (wasn't|wouldn't|didn't|was)\b/i,
];

function isQuoteSummary(quote: string): boolean {
  return SUMMARY_PATTERNS.some((p) => p.test(quote.trim()));
}

// Detect conclusory inmate-before-order behavior
const CONCLUSORY_BEHAVIOR_PATTERNS = [
  /\brefus(ing|ed|es)\b/i,
  /\bwouldn't\b/i,
  /\bwon't\b/i,
  /\bnot comply\b/i,
  /\bnoncompliant\b/i,
  /\bnon-compliant\b/i,
  /\bdisobedient\b/i,
  /\bacting up\b/i,
  /\bacting out\b/i,
  /\bacting crazy\b/i,
  /\bwouldn't listen\b/i,
  /\bwouldn't go\b/i,
];

function isConclusoryBehavior(text: string): boolean {
  if (text.trim().split(/\s+/).length < 5) return true; // fewer than 5 words is too vague
  return CONCLUSORY_BEHAVIOR_PATTERNS.some((p) => p.test(text));
}

// Detect conclusory physical behavior
const CONCLUSORY_PHYSICAL_PATTERNS = [
  /\bbeing disrespect/i,
  /\bbeing noncompliant\b/i,
  /\bbeing non-compliant\b/i,
  /\bbeing disobedient\b/i,
  /\bacting crazy\b/i,
  /\bacting up\b/i,
  /\bacting out\b/i,
  /\bwas noncompliant\b/i,
  /\bwas non-compliant\b/i,
  /\bwas disrespectful\b/i,
  /\bwas disobedient\b/i,
];

function isConclusoryPhysicalBehavior(text: string): boolean {
  return CONCLUSORY_PHYSICAL_PATTERNS.some((p) => p.test(text));
}

// Detect duration-only physical behavior without observable action
const DURATION_ONLY_PATTERN = /\bfor \d+ (minute|hour|second)/i;

function isDurationOnlyBehavior(text: string): boolean {
  if (!DURATION_ONLY_PATTERN.test(text)) return false;
  // If it also has a verb describing posture/action, it's probably OK
  const actionWords = /\b(stood|standing|sat|sitting|crossed|positioned|remained|leaned|paced|continued)\b/i;
  return !actionWords.test(text);
}

// Detect vague operational impact
const VAGUE_IMPACT_PATTERNS = [
  /^(yes|no|yeah|nope)\.?$/i,
  /^messed (it|things|up)/i,
  /^caused (problems|issues|trouble)/i,
  /^it was bad/i,
];

function isVagueOperationalImpact(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length < 5) {
    return VAGUE_IMPACT_PATTERNS.some((p) => p.test(trimmed)) || trimmed.length < 15;
  }
  return VAGUE_IMPACT_PATTERNS.some((p) => p.test(trimmed));
}

// Detect vague witness information
const VAGUE_WITNESS_PATTERNS = [
  /^(people|everyone|everybody|staff|inmates|other|others|they|some)(\s+saw|\.)?$/i,
];

function isVagueWitness(text: string): boolean {
  const trimmed = text.trim();
  // The witness question now collects a short "rank + last name" value (e.g. "Sergeant
  // Johnson") rather than a full sentence — 2 words is the minimum valid, complete answer.
  // A single word alone ("Sergeant", "Johnson", "staff") is still vague.
  return VAGUE_WITNESS_PATTERNS.some((p) => p.test(trimmed)) || trimmed.split(/\s+/).length < 2;
}

// Detect opinion or motive language
const OPINION_PATTERNS = [
  /\bI think\b/i,
  /\bI believe\b/i,
  /\bhe was trying to\b/i,
  /\bshe was trying to\b/i,
  /\bthey were trying to\b/i,
  /\bon purpose\b/i,
  /\bintentionally\b/i,
  /\bdeliberately\b/i,
  /\bwanted to make me\b/i,
  /\bto make me\b/i,
];

function hasOpinionLanguage(text: string): boolean {
  return OPINION_PATTERNS.some((p) => p.test(text));
}

// --- Build RED blockers ---

function collectRedBlockers(
  intake: IntakeFacts6_1,
  cleaned: Partial<CleanedFacts6_1>
): RedBlocker[] {
  const blockers: RedBlocker[] = [];

  if (isBlank(intake.incident_date)) {
    blockers.push({
      id: 'missing_incident_date',
      missing_fact: 'Missing incident date',
      follow_up_question: 'What date did this incident occur? (Example: January 18, 2026)',
    });
  }

  if (isBlank(intake.incident_time)) {
    blockers.push({
      id: 'missing_incident_time',
      missing_fact: 'Missing incident time or approximate time',
      follow_up_question:
        'What time did this incident occur? Provide your best approximate numeric time. (Examples: 1800, 6:30 PM, approximately 2000 hours)',
    });
  } else if (cleaned.incident_time && isNonNumericTimeDescriptor(intake.incident_time!)) {
    blockers.push({
      id: 'missing_incident_time',
      missing_fact:
        `Time provided ("${intake.incident_time}") is a non-numeric descriptor. A numeric or approximate numeric time is required.`,
      follow_up_question:
        'What is your best approximate numeric time? (Examples: 1800, 6:30 PM, approximately 2000 hours)',
    });
  }

  if (isBlank(intake.officer_name)) {
    blockers.push({
      id: 'missing_officer_name',
      missing_fact: 'Missing reporting officer name',
      follow_up_question: 'What is your name as it should appear in the report?',
    });
  }

  if (isBlank(intake.officer_rank)) {
    blockers.push({
      id: 'missing_officer_rank',
      missing_fact: 'Missing reporting officer rank',
      follow_up_question:
        'What is your rank? (Example: Officer, Sergeant, Lieutenant, Captain)',
    });
  }

  if (isBlank(intake.inmate_last_name)) {
    blockers.push({
      id: 'missing_inmate_identity',
      missing_fact: 'Missing inmate last name',
      follow_up_question: 'What is the inmate\'s last name?',
    });
  }

  if (isBlank(intake.dc_number)) {
    blockers.push({
      id: 'missing_dc_number',
      missing_fact: 'Missing inmate DC number',
      follow_up_question: 'What is the inmate\'s DC number? (Example: A12345)',
    });
  }

  if (isBlank(intake.incident_location)) {
    blockers.push({
      id: 'missing_incident_location',
      missing_fact: 'Missing specific incident location',
      follow_up_question:
        'What is the exact location where this incident occurred? (Example: cell E3107, the Wing 2 dayroom, the shower area)',
    });
  }

  if (isBlank(intake.officer_post)) {
    blockers.push({
      id: 'missing_officer_post',
      missing_fact: 'Missing officer post or assignment',
      follow_up_question:
        'What was your post or assignment at the time of this incident? (Example: housing officer, floor officer, wing officer)',
    });
  }

  if (isBlank(intake.dorm_area)) {
    blockers.push({
      id: 'missing_dorm_area',
      missing_fact: 'Missing dorm or area',
      follow_up_question:
        'What dorm, wing, or area did this incident occur in? (Example: E Dorm, Wing 2, North Housing Unit)',
    });
  }

  if (isBlank(intake.officer_activity)) {
    blockers.push({
      id: 'missing_officer_activity',
      missing_fact: 'Missing officer activity when incident began',
      follow_up_question:
        'What were you doing when this incident began? (Example: conducting the master roster count, performing security rounds)',
    });
  }

  if (isBlank(intake.inmate_behavior_before_order)) {
    blockers.push({
      id: 'missing_inmate_before_order',
      missing_fact: 'Missing observable inmate behavior before the order',
      follow_up_question:
        'What was the inmate doing before you gave any order? Describe only what you could see. (Example: standing at the cell door outside of his assigned cell during count procedures)',
    });
  }

  if (!intake.order_type) {
    blockers.push({
      id: 'missing_order_type',
      missing_fact: 'Missing order type — verbal, written, or both',
      follow_up_question: 'Was the order you gave verbal, written, or both?',
    });
  }

  if (isBlank(intake.exact_order)) {
    blockers.push({
      id: 'missing_specific_order',
      missing_fact: 'Missing specific order',
      follow_up_question:
        'What exactly did you order the inmate to do? (Example: return to his assigned cell, cease kicking the cell door, submit to hand restraints)',
    });
  } else {
    const cleanedOrder = cleaned.exact_order ?? '';
    if (isVagueOrder(cleanedOrder)) {
      blockers.push({
        id: 'missing_specific_order',
        missing_fact: `Order is too vague to determine what compliance required: "${cleanedOrder}"`,
        follow_up_question:
          'Your order is too vague. What specifically did you order the inmate to do? If you said "stop," stop what exactly? (Example: cease kicking the cell door, return to his assigned cell)',
      });
    }
  }

  if (intake.total_orders_given === null || intake.total_orders_given === undefined) {
    blockers.push({
      id: 'missing_specific_order_count',
      missing_fact: 'Missing total number of orders given',
      follow_up_question:
        'How many total orders did you give? Provide the exact number. (Example: 1, 2, 3)',
    });
  } else if (isVagueCount(intake.total_orders_given)) {
    blockers.push({
      id: 'missing_specific_order_count',
      missing_fact: `Vague order count provided: "${intake.total_orders_given}". A specific number is required.`,
      follow_up_question:
        'How many orders did you give — exactly? "Several times," "multiple times," and "a few times" are not acceptable. Provide the exact number.',
    });
  } else {
    const parsedCount = parseTotalOrders(intake.total_orders_given);
    if (parsedCount !== null && parsedCount <= 0) {
      blockers.push({
        id: 'missing_specific_order_count',
        missing_fact: `Invalid order count: ${intake.total_orders_given}. A 6-1 requires at least one order given.`,
        follow_up_question: 'How many orders did you give? The count must be 1 or greater.',
      });
    }
  }

  if (!intake.acknowledgment_type || intake.acknowledgment_type === 'unknown') {
    blockers.push({
      id: 'missing_acknowledgment',
      missing_fact: 'No facts showing the inmate received the order',
      follow_up_question:
        'What showed that the inmate received your order? Did the inmate make eye contact, verbally respond, turn toward you, or were they positioned close enough to clearly hear you?',
    });
  }

  const hasQuote = !isBlank(intake.inmate_quote);
  const saidNothing = intake.inmate_said_nothing === true;
  if (!hasQuote && !saidNothing) {
    blockers.push({
      id: 'missing_inmate_response',
      missing_fact: 'Missing inmate response — no quote provided and inmate-said-nothing not confirmed',
      follow_up_question:
        'Did the inmate say anything in response to your order? If yes, what were the exact words? If no, confirm the inmate made no verbal response.',
    });
  }

  if (isBlank(intake.physical_behavior)) {
    blockers.push({
      id: 'missing_physical_behavior',
      missing_fact: 'Missing physical behavior after the order',
      follow_up_question:
        'What did the inmate physically do after you gave the order? Describe observable actions — position, movement, posture. (Example: crossed his arms and remained positioned at the cell door)',
    });
  }

  if (!intake.ability_to_comply) {
    blockers.push({
      id: 'missing_ability_to_comply',
      missing_fact: 'Missing ability-to-comply answer',
      follow_up_question:
        'Did you observe any medical condition, mental health issue, physical limitation, or language barrier that might have prevented the inmate from complying?',
    });
  }

  if (
    intake.ability_to_comply === 'issue_with_explanation' &&
    isBlank(intake.ability_to_comply_explanation)
  ) {
    blockers.push({
      id: 'medical_issue_no_explanation',
      missing_fact: 'Medical/mental health/physical/language issue selected but no explanation provided',
      follow_up_question:
        'You indicated the inmate had a medical, mental health, physical, or language issue. Please describe what you observed or what was reported to you.',
    });
  }

  // Patch 4: force_used must be explicitly yes or no
  if (intake.force_used !== 'no' && intake.force_used !== 'yes') {
    blockers.push({
      id: 'missing_force_answer',
      missing_fact: 'Missing force-used answer',
      follow_up_question: 'Was force used during this incident? Answer yes or no.',
    });
  }

  if (intake.force_used === 'yes' && isBlank(intake.force_explanation)) {
    blockers.push({
      id: 'force_no_explanation',
      missing_fact: 'Force used but no force explanation provided',
      follow_up_question:
        'You indicated force was used. Briefly describe what happened — what force was applied and by whom? (Note: this is not a use-of-force report. Only provide a brief factual summary.)',
    });
  }

  if (isBlank(intake.oic_rank)) {
    blockers.push({
      id: 'missing_oic_rank',
      missing_fact: 'Missing OIC rank',
      follow_up_question:
        'What is the rank of the shift Officer in Charge you notified? (Example: Sergeant, Lieutenant, Captain)',
    });
  }

  if (isBlank(intake.oic_last_name)) {
    blockers.push({
      id: 'missing_oic_last_name',
      missing_fact: 'Missing OIC last name',
      follow_up_question:
        'What is the last name of the shift Officer in Charge who authorized this report?',
    });
  }

  if (intake.oic_authorized_confirmed !== true) {
    blockers.push({
      id: 'missing_oic_authorization_confirmation',
      missing_fact: 'Officer has not confirmed the OIC named above actually authorized this report',
      follow_up_question:
        'Please confirm that the OIC listed above was directly notified and specifically authorized the initiation of this report.',
    });
  }

  if (intake.separate_conduct_described === true && intake.separate_conduct_isolatable === false) {
    blockers.push({
      id: 'cannot_isolate_6_1',
      missing_fact:
        'Conduct described cannot be isolated as a 6-1 without inventing or omitting facts',
      follow_up_question:
        'Your answers describe conduct that cannot be separated from the 6-1 refusal without omitting key facts. A separate disciplinary report is required for each violation. Please answer questions specific to the order the inmate disobeyed only.',
    });
  }

  if (intake.request_to_invent === true) {
    blockers.push({
      id: 'request_to_invent',
      missing_fact: 'Request to invent, assume, or embellish facts',
      follow_up_question:
        'This system can only document facts you observed and provided. It cannot invent, assume, or embellish. Please provide the facts as you observed them.',
    });
  }

  // narrative_reference_style is required when pronouns will appear
  if (!intake.narrative_reference_style) {
    blockers.push({
      id: 'missing_narrative_reference_style',
      missing_fact: 'Missing narrative reference style',
      follow_up_question:
        'How should the inmate be referred to in the report? Choose one: he/him, she/her, they/them, or last-name-only (no pronouns).',
    });
  }

  return blockers;
}

// --- Build YELLOW warnings ---

function collectYellowWarnings(
  intake: IntakeFacts6_1,
  cleaned: Partial<CleanedFacts6_1>,
  extraWarnings: YellowWarning[]
): YellowWarning[] {
  const warnings: YellowWarning[] = [...extraWarnings];

  // Quote is a summary — the officer's own attestation (quote_is_summary checkbox) always wins
  // over the regex guess (isQuoteSummary). Either one alone is sufficient to trigger the flag.
  if (
    !isBlank(intake.inmate_quote) &&
    intake.inmate_said_nothing !== true &&
    (isQuoteSummary(intake.inmate_quote!) || intake.quote_is_summary === true)
  ) {
    warnings.push({
      id: 'quote_is_summary',
      flag_label: 'quote is a summary',
      warning:
        'The inmate quote appears to be a summary of what was said, not the exact words. Summaries must not be placed inside quotation marks.',
      affected_paragraph: 2,
      suggested_clarification:
        'What exact words came out of the inmate\'s mouth? If you cannot remember exactly, type your best recollection and we will note it as approximate.',
      example_stronger_answer: '"No, I ain\'t doing that."',
    });
  }

  // Vague operational impact
  if (!isBlank(intake.operational_impact) && isVagueOperationalImpact(intake.operational_impact!)) {
    warnings.push({
      id: 'vague_operational_impact',
      flag_label: 'operational impact vague',
      warning: 'Operational impact is vague. A specific description is needed.',
      affected_paragraph: 3,
      suggested_clarification:
        'Describe specifically how this incident affected your area or operation. What was interrupted, delayed, or disrupted?',
      example_stronger_answer:
        'temporarily interrupting the master roster count and drawing the attention of surrounding inmates',
    });
  }

  // Conclusory inmate-before-order behavior
  if (
    !isBlank(intake.inmate_behavior_before_order) &&
    isConclusoryBehavior(intake.inmate_behavior_before_order!)
  ) {
    warnings.push({
      id: 'conclusory_inmate_before_order',
      flag_label: 'behavior is conclusory',
      warning:
        'Inmate behavior before the order appears to be a conclusion rather than an observable description.',
      affected_paragraph: 1,
      suggested_clarification:
        'Describe only what you could see before you gave any order — the inmate\'s physical position, location, or action at that moment. Do not include conclusions about compliance.',
      example_stronger_answer:
        'standing at the cell door outside of his assigned cell during count procedures',
    });
  }

  // Conclusory physical behavior
  if (
    !isBlank(intake.physical_behavior) &&
    isConclusoryPhysicalBehavior(intake.physical_behavior!)
  ) {
    warnings.push({
      id: 'conclusory_physical_behavior',
      flag_label: 'physical behavior is conclusory',
      warning: 'Physical behavior appears to be a conclusion rather than an observable action.',
      affected_paragraph: 2,
      suggested_clarification:
        'Describe what you saw the inmate do physically after your order — position, movement, gestures, posture. Do not use conclusions.',
      example_stronger_answer: 'crossed his arms and remained positioned at the cell door',
    });
  }

  // Physical behavior: duration only
  if (
    !isBlank(intake.physical_behavior) &&
    isDurationOnlyBehavior(intake.physical_behavior!)
  ) {
    warnings.push({
      id: 'physical_behavior_duration_only',
      flag_label: 'duration only, no action',
      warning:
        'Physical behavior describes how long the inmate was somewhere, but not what the inmate was doing.',
      affected_paragraph: 2,
      suggested_clarification:
        'What was the inmate\'s physical position, posture, or action during that time?',
      example_stronger_answer: 'crossed his arms and remained positioned at the cell door',
    });
  }

  // Missing tone when inmate spoke
  const inmateSpoke =
    intake.inmate_said_nothing !== true && !isBlank(intake.inmate_quote);
  if (inmateSpoke && isBlank(intake.inmate_tone)) {
    warnings.push({
      id: 'missing_tone_when_inmate_spoke',
      flag_label: 'tone missing',
      warning: 'The inmate gave a verbal response but tone is not documented.',
      affected_paragraph: 2,
      suggested_clarification:
        'How would you describe the tone of the inmate\'s response — how did it sound? (Example: loud, argumentative, sarcastic, calm but refusing)',
      example_stronger_answer: 'loud and argumentative',
    });
  }

  // Vague witness information
  if (!isBlank(intake.witness_staff) && isVagueWitness(intake.witness_staff!)) {
    warnings.push({
      id: 'vague_witness_information',
      flag_label: 'witness info vague',
      warning: 'Witness information is vague — provides no names or titles.',
      affected_paragraph: 3,
      suggested_clarification:
        'If other staff members witnessed this incident, provide their rank and last name.',
      example_stronger_answer: 'Sergeant Johnson and Officer Williams were present during the incident.',
    });
  }

  // Opinion or motive language in additional facts
  if (!isBlank(intake.additional_facts) && hasOpinionLanguage(intake.additional_facts!)) {
    warnings.push({
      id: 'opinion_or_motive_language',
      flag_label: 'opinion or motive language',
      warning:
        'Additional facts contain opinion or motive language ("I think," "he was trying to," "on purpose," etc.).',
      affected_paragraph: 2,
      suggested_clarification:
        'This report should only document what you observed — not what you believe the inmate intended. Please remove any language about what you think the inmate was trying to do.',
      example_stronger_answer: 'Remove opinion language and describe only what was directly observed.',
    });
  }

  // OIC rank-only or name-only (not both missing — that's RED; this is partial)
  const hasOicRank = !isBlank(intake.oic_rank);
  const hasOicName = !isBlank(intake.oic_last_name);
  if (hasOicRank !== hasOicName) {
    warnings.push({
      id: 'oic_incomplete',
      flag_label: 'OIC incomplete',
      warning: hasOicRank
        ? 'OIC rank was provided but last name is missing.'
        : 'OIC last name was provided but rank is missing.',
      affected_paragraph: 6,
      suggested_clarification:
        'Please provide both the rank and last name of the OIC who authorized this report. Both are required.',
      example_stronger_answer: 'Captain Brown',
    });
  }

  // Within hearing distance only — weakest acknowledgment
  if (intake.acknowledgment_type === 'within_hearing_distance') {
    warnings.push({
      id: 'within_hearing_distance_only',
      flag_label: 'weakest acknowledgment',
      warning:
        '"Within hearing distance" is the weakest acknowledgment option. No eye contact, verbal response, or physical reaction is documented.',
      affected_paragraph: 2,
      suggested_clarification:
        'Did the inmate show any other sign of receiving the order — eye contact, a verbal response, turning toward you, or a physical reaction? If so, please describe it.',
      example_stronger_answer:
        'The inmate made direct eye contact with this officer and verbally responded to the directive.',
    });
  }

  // Conduct outside 6-1 but can be isolated
  if (intake.separate_conduct_described === true && intake.separate_conduct_isolatable === true) {
    warnings.push({
      id: 'conduct_outside_6_1_can_be_isolated',
      flag_label: 'conduct outside 6-1',
      warning:
        'Your answers describe conduct that may fall outside the 6-1 disobeying-order charge, but the 6-1 refusal can be isolated.',
      affected_paragraph: 5,
      suggested_clarification:
        'Your answers may describe conduct outside this 6-1 disobeying-order charge. This report will only document the order and the inmate\'s failure or refusal to comply. A separate report may be required for any other conduct.',
      example_stronger_answer:
        'File a separate disciplinary report for any conduct beyond the order refusal.',
    });
  }

  // UOF used but documentation not confirmed
  if (intake.force_used === 'yes' && !isBlank(intake.force_explanation)) {
    const uofStatus = cleaned.uof_documentation_status;
    if (uofStatus === 'not_confirmed') {
      warnings.push({
        id: 'uof_documentation_not_confirmed',
        flag_label: 'UOF documentation unconfirmed',
        warning:
          'Force was used but completion of separate use-of-force documentation was not confirmed.',
        affected_paragraph: 4,
        suggested_clarification:
          'Was separate use-of-force documentation completed for this incident?',
        example_stronger_answer: 'Yes, separate use-of-force documentation was completed.',
      });
    }
  }

  // Patch 7: Quote provided but officer also marked said-nothing — contradiction
  if (intake.inmate_said_nothing === true && !isBlank(intake.inmate_quote)) {
    warnings.push({
      id: 'quote_conflicts_with_said_nothing',
      flag_label: 'quote conflicts with said-nothing',
      warning:
        'A quote was provided but "inmate said nothing" was also marked true. This is a contradiction — a quote and a said-nothing cannot both be correct.',
      affected_paragraph: 2,
      suggested_clarification:
        'Did the inmate verbally respond? If yes, provide the exact words and set "inmate said nothing" to false. If no, clear the quote field.',
      example_stronger_answer:
        'Either: "No I ain\'t doing that." (if the inmate spoke) or blank (if the inmate said nothing).',
    });
  }

  return warnings;
}

// --- Main evaluation function ---

export function evaluate6_1(intake: IntakeFacts6_1): EvaluationResult6_1 {
  const { cleaned, extra_warnings } = cleanFacts6_1(intake);

  const red_blockers = collectRedBlockers(intake, cleaned);

  if (red_blockers.length > 0) {
    return {
      status: 'RED',
      red_blockers,
      yellow_warnings: [],
      cleaned_facts: null,
    };
  }

  const yellow_warnings = collectYellowWarnings(intake, cleaned, extra_warnings);

  // At GREEN/YELLOW, cleaned should have all required fields — cast is safe here
  // because all RED checks passed (all required fields are present and non-vague)
  const cleaned_facts = cleaned as CleanedFacts6_1;

  if (yellow_warnings.length > 0) {
    return {
      status: 'YELLOW',
      red_blockers: [],
      yellow_warnings,
      cleaned_facts,
    };
  }

  return {
    status: 'GREEN',
    red_blockers: [],
    yellow_warnings: [],
    cleaned_facts,
  };
}
