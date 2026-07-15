// LOCKUPHQ DR Writer — Charge 6-1 Prompt Builder
// Source of truth: docs/lockuphq_dr_writer_master_prompt_corrected.md
// (supersedes the deprecated six-paragraph format in Section 11 of
// LOCKUPHQ_DR_WRITER_6-1_MASTER_v1.1_FINAL.md — see that file's format note)
//
// Supports two output modes:
//   narrative_only — single-paragraph narrative + officer checklist (default, human-readable)
//   json_schema    — instructs Claude to return structured JSON matching schema v1.1
//
// This module does NOT call the Claude API.
// RED status → always returns null prompt in both modes.

import type {
  EvaluationResult6_1,
  CleanedFacts6_1,
  YellowWarning,
  PromptOutputMode6_1,
} from './types.ts';
import { OFFICER_REVIEW_CHECKLIST, AI_DISCLOSURE } from './types.ts';

export interface PromptParts {
  systemPrompt: string;
  userPrompt: string;
}

export interface BuildPromptOptions {
  outputMode?: PromptOutputMode6_1;
}

export interface PromptBuildResult {
  // Combined prompt (systemPrompt + "\n\n---\n\n" + userPrompt) for backward compat
  prompt: string | null;
  // Structured parts for direct API use
  parts: PromptParts | null;
  status: 'RED' | 'YELLOW' | 'GREEN';
  reason: string;
  outputMode: PromptOutputMode6_1;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatCleanedFacts(facts: CleanedFacts6_1): string {
  return [
    `INCIDENT DATE: ${facts.incident_date}`,
    `INCIDENT TIME: ${facts.incident_time}`,
    `OFFICER RANK: ${facts.officer_rank}`,
    `OFFICER NAME: ${facts.officer_name}`,
    `OFFICER POST: ${facts.officer_post}`,
    `DORM / AREA: ${facts.dorm_area}`,
    `OFFICER ACTIVITY: ${facts.officer_activity}`,
    `INCIDENT LOCATION (EXACT): ${facts.incident_location}`,
    `INMATE LAST NAME: ${facts.inmate_last_name}`,
    `INMATE FIRST NAME: ${facts.inmate_first_name ?? '[not provided]'}`,
    `DC NUMBER: ${facts.dc_number}`,
    `NARRATIVE REFERENCE STYLE: ${facts.narrative_reference_style}`,
    ``,
    `INMATE BEHAVIOR BEFORE ORDER: ${facts.inmate_behavior_before_order}`,
    `ORDER TYPE: ${facts.order_type}`,
    `EXACT ORDER GIVEN: ${facts.exact_order}`,
    `TOTAL ORDERS GIVEN: ${facts.total_orders_given}`,
    `ACKNOWLEDGMENT TYPE: ${facts.acknowledgment_type}`,
    `INMATE QUOTE: ${facts.inmate_quote ?? '[inmate said nothing]'}`,
    `INMATE SAID NOTHING: ${facts.inmate_said_nothing}`,
    `INMATE TONE: ${facts.inmate_tone ?? '[not applicable — inmate said nothing]'}`,
    `PHYSICAL BEHAVIOR AFTER ORDER: ${facts.physical_behavior}`,
    ``,
    `OPERATIONAL IMPACT: ${facts.operational_impact}`,
    ``,
    `ABILITY TO COMPLY: ${facts.ability_to_comply}`,
    `ABILITY TO COMPLY EXPLANATION: ${facts.ability_to_comply_explanation ?? '[none]'}`,
    `FORCE USED: ${facts.force_used}`,
    `FORCE EXPLANATION: ${facts.force_explanation ?? '[not applicable]'}`,
    `UOF DOCUMENTATION STATUS: ${facts.uof_documentation_status}`,
    ``,
    `CONFINEMENT STATUS: ${facts.confinement_status}`,
    `OIC RANK: ${facts.oic_rank}`,
    `OIC LAST NAME: ${facts.oic_last_name}`,
    `WITNESS STAFF: ${facts.witness_staff ?? '[none documented]'}`,
    `CAMERA COVERAGE: ${facts.camera_coverage ?? '[not documented]'}`,
    `ADDITIONAL FACTS: ${facts.additional_facts ?? '[none]'}`,
    `SEPARATE CONDUCT DESCRIBED: ${facts.separate_conduct_described}`,
    `SEPARATE CONDUCT ISOLATABLE: ${facts.separate_conduct_isolatable ?? '[not applicable]'}`,
  ].join('\n');
}

const WORD_NUMS: Record<number, string> = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
  6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
};

function toWordNum(n: number): string {
  return WORD_NUMS[n] ?? String(n);
}

function withArticle(post: string): string {
  const lower = post.toLowerCase();
  if (lower.startsWith('the ') || lower.startsWith('a ') || lower.startsWith('an ')) {
    return post;
  }
  return `the ${post}`;
}

function buildAssignmentNote(facts: CleanedFacts6_1): string {
  const display = withArticle(facts.officer_post);
  if (display === facts.officer_post) return '';
  return `\nASSIGNMENT WORDING NOTE:\nIn the opening sentence, use "assigned as ${display}" — not "assigned as ${facts.officer_post}".\n`;
}

function buildOrderCountSentence(facts: CleanedFacts6_1): string {
  const n = facts.total_orders_given;
  const type = facts.order_type;
  if (n === 1) {
    return `I issued one direct ${type} order to Inmate ${facts.inmate_last_name} to ${facts.exact_order}.`;
  }
  const repeatWord = toWordNum(n - 1);
  const totalWord = toWordNum(n);
  const timesLabel = (n - 1) === 1 ? 'additional time' : 'additional times';
  return `I issued a direct ${type} order to Inmate ${facts.inmate_last_name} to ${facts.exact_order}. I repeated this directive ${repeatWord} ${timesLabel}, for a total of ${totalWord} ${type} orders.`;
}

// Internal fact-category labels — used only to help Claude locate flagged
// content within the single flowing paragraph. These are NOT output
// paragraph indices; the narrative has no paragraph breaks. The numbering
// (1–6) is preserved from the legacy six-paragraph build for continuity
// with YellowWarning.affected_paragraph, gate_rules.json, and existing tests.
const SECTION_LABELS: Record<number, string> = {
  1: 'opening / scene / inmate behavior before the order',
  2: 'order / response / acknowledgment / physical behavior',
  3: 'operational impact',
  4: 'ability to comply / force',
  5: 'charge advisory',
  6: 'confinement / OIC closing',
};

function sectionLabel(n: number): string {
  return SECTION_LABELS[n] ?? `section ${n}`;
}

// ---------------------------------------------------------------------------
// narrative_only mode
// ---------------------------------------------------------------------------

function formatYellowWarnings(warnings: YellowWarning[]): string {
  if (warnings.length === 0) return '[none]';
  return warnings
    .map(
      (w, i) =>
        `${i + 1}. [${sectionLabel(w.affected_paragraph)}] ${w.warning}\n   Flag text: [REVIEW — ${w.flag_label}]`
    )
    .join('\n\n');
}

const SINGLE_PARAGRAPH_RULES = `LOCKED FORMAT — SINGLE PARAGRAPH:
Every Charge 6-1 report is ONE continuous paragraph, matching real accepted FDOC report length and structure: target 100-200 words. Do NOT break the narrative into multiple paragraphs, headers, or numbered sections. Do NOT insert blank lines or "\\n\\n" anywhere in the narrative.

Build the paragraph in this order, as continuous flowing prose:

1. Opening identification and scene-setting, combined in one flowing sentence: "On [DATE], at approximately [TIME], I, [RANK] [OFFICER NAME], was assigned to [DORM/AREA] as [POST/ASSIGNMENT]. While [OFFICER ACTIVITY], ..."
Date wording: format ISO-style dates as natural written dates. Use "March 12, 2026"; do not write "2026-03-12". Do not change the copied cleaned_facts date value.
Use natural assignment wording. If the officer post does not already include an article, write "assigned as the [POST]" rather than "assigned as [POST]."

2. Scene continues directly into contact — introduce the inmate by FULL name and DC# the first time mentioned, then LAST NAME ONLY for every reference after that:
If INMATE FIRST NAME is provided: "I approached/observed/advised Inmate [LAST NAME], [FIRST NAME], DC# [DC NUMBER], [OBSERVABLE BEHAVIOR OR CONTEXT]." (comma before AND after the first name)
If INMATE FIRST NAME is "[not provided]": "I approached/observed/advised Inmate [LAST NAME], DC# [DC NUMBER], [OBSERVABLE BEHAVIOR OR CONTEXT]."
After this first mention, refer to the inmate as "Inmate [LAST NAME]" (or "[LAST NAME]") only — never repeat the first name or DC# again in the narrative.

3. Order and response — state the order given, using a specific count, and the inmate's response.
Use spelled-out number words for order counts one through ten.
One order: "I issued one direct [verbal/written] order to Inmate [LAST NAME] to [EXACT ORDER]."
Two or more: "I issued a direct [verbal/written] order to Inmate [LAST NAME] to [EXACT ORDER]. I repeated this directive [N-1] additional time(s), for a total of [N] [verbal/written] orders."
If the inmate spoke: include the exact quote in quotation marks — "Inmate [LAST NAME] then stated, '[EXACT QUOTE].'"
If the inmate said nothing: describe the physical refusal directly, NO quotation marks anywhere — "Inmate [LAST NAME] did not verbally respond to my directive and [PHYSICAL BEHAVIOR]."
A summarized (non-exact-words) quote is a YELLOW-only path with its own handling — see the quote-summary rule for YELLOW status.

4. DR advisement, with the charge cited inline as part of the same flowing sentence — NOT a separate paragraph or block: "...he will be receiving a disciplinary report for the charge of 6-1: Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person."
Use "will be receiving" — this matches real accepted phrasing. Pronoun must match NARRATIVE REFERENCE STYLE.

5. Closing — confinement status and OIC/supervisor notification, as the final sentence(s) of the same paragraph:
Placed: "Inmate [LAST NAME] was placed in administrative confinement pending the outcome of this disciplinary report."
Remained: "Inmate [LAST NAME] remained in administrative confinement pending the outcome of this disciplinary report."
None: omit the confinement sentence entirely.
Always close with: "The shift [OIC RANK], [OIC LAST NAME], was notified and authorized the initiation of this report." — use the OIC rank exactly as provided (Sergeant, Lieutenant, Captain, Confinement Lieutenant, etc.). Do NOT hardcode "Officer in Charge" as the title.
Do NOT add a witness or camera-coverage sentence anywhere in the narrative — WITNESS STAFF and CAMERA COVERAGE below are gate-only inputs, not narrative content. Real accepted reports do not include this in the statement of facts.

ABILITY TO COMPLY / FORCE:
Do NOT include a "no apparent medical condition, mental health issue, physical limitation, or language barrier" disclaimer as boilerplate when there is no issue to report — this phrasing does not appear in real accepted reports when there is nothing to document. Only include ability-to-comply language when ABILITY TO COMPLY EXPLANATION is provided below, stated plainly and factually — no diagnosis, no speculation.
If force was used: include the force explanation only from FORCE EXPLANATION below. If UOF DOCUMENTATION STATUS is "completed", add: "Separate use-of-force documentation was completed regarding the force used during this incident." Do NOT state documentation was completed unless UOF DOCUMENTATION STATUS is exactly "completed".

OPERATIONAL IMPACT:
Include a sentence about operational impact only when OPERATIONAL IMPACT below is a specific, non-empty fact — do not force a sentence into the paragraph if there is nothing specific to report. Do NOT write "orderly operation of the cell" — reference the dorm, wing, or area, never a specific cell number.

POINT OF VIEW:
The entire narrative is written in first person from the reporting officer's own voice — "I," "me," "my." NEVER refer to the reporting officer in the third person anywhere in the narrative, including in the acknowledgment/response sentence. Do NOT write "this officer" or "the officer" when the sentence means the reporting officer.
Wrong: "Inmate [LAST NAME] made direct eye contact with this officer."
Right: "Inmate [LAST NAME] made direct eye contact with me."
Wrong: "Inmate [LAST NAME] did not verbally respond to this officer's directive."
Right: "Inmate [LAST NAME] did not verbally respond to my directive."
This applies to every sentence in the narrative, not only the templates shown above — if you generate a sentence not covered by a template (e.g. describing acknowledgment), keep it in first person the same way.`;

const FORBIDDEN_LANGUAGE = `FORBIDDEN LANGUAGE — never use:
"I believe", "I think", "probably", "appeared to be trying to", "intentionally", "deliberately",
"for no reason", "wanted to", "guilty", "punishment should be", "I recommend", "the inmate deserves",
"several times" or "multiple times" (a specific count is always required),
"orderly operation of [cell number]", "noncompliant", "non-compliant", or "disobedient" as standalone
behavioral descriptions without observable facts behind them, any language suggesting facts were
invented or assumed.`;

const OFFICER_CHECKLIST_TEXT = OFFICER_REVIEW_CHECKLIST.map((item, i) => `${i + 1}. ${item}`).join('\n');

const GREEN_SYSTEM_PROMPT = `You are the LOCKUPHQ DR Writer for FDOC Charge 6-1. You are a controlled translator only.

ROLE AND CONSTRAINTS
- You translate officer-provided facts into a formal FDOC single continuous-paragraph disciplinary report narrative.
- You are NOT a creative author, legal advisor, or decision-maker.
- You NEVER invent facts. If a fact is not in the input below, it does not appear in the report.
- You NEVER infer motive or intent.
- You follow the locked single-paragraph format exactly — no headers, no section labels, no paragraph breaks.
- You keep the officer as the first-person author ("I, [Rank] [Name]").
- You apply the NARRATIVE REFERENCE STYLE selected below consistently throughout.
- You do NOT recommend sanctions or decide guilt.
- You do NOT name alternate charge codes.
- This is a GREEN status report — generate a clean certifiable draft with NO [REVIEW] flags.

${FORBIDDEN_LANGUAGE}

${SINGLE_PARAGRAPH_RULES}

OUTPUT FORMAT:
Return the single-paragraph narrative only. No headers, no labels, no explanations before or after.
After the narrative, on a new line, output "---" then the officer review checklist.

OFFICER REVIEW CHECKLIST (append after narrative):
${OFFICER_CHECKLIST_TEXT}`;

const YELLOW_SYSTEM_PROMPT = `You are the LOCKUPHQ DR Writer for FDOC Charge 6-1. You are a controlled translator only.

ROLE AND CONSTRAINTS
- You translate officer-provided facts into a formal FDOC single continuous-paragraph disciplinary report narrative.
- You are NOT a creative author, legal advisor, or decision-maker.
- You NEVER invent facts. If a fact is not in the input below, it does not appear in the report.
- You NEVER infer motive or intent.
- You follow the locked single-paragraph format exactly — no headers, no section labels, no paragraph breaks.
- You keep the officer as the first-person author.
- You apply the NARRATIVE REFERENCE STYLE selected below consistently.
- You do NOT recommend sanctions or decide guilt.

STATUS: YELLOW — Generate a MARKED REVIEW DRAFT only.
This is NOT a certifiable report. Every section derived from a weak or vague answer must be marked
with [REVIEW — reason] placed immediately after the affected content, inline within the flowing
paragraph. The officer must resolve all flagged sections before certifying.

${FORBIDDEN_LANGUAGE}

${SINGLE_PARAGRAPH_RULES}

For each item listed in YELLOW WARNINGS in the user message, add [REVIEW — reason] immediately after
the flagged content, inline within the single paragraph. Example: "Inmate Smith crossed his arms
[REVIEW — physical behavior is conclusory — provide the observable action]"

QUOTE SUMMARY YELLOW RULE:
If a YELLOW warning indicates the inmate quote is a summary rather than exact words, follow these rules:
- Do NOT place the summary inside quotation marks.
- Do NOT write: Inmate Smith stated, "..."
- You MUST use the exact phrase "verbally responded in substance" — this phrase is required and must appear in the narrative.
- Place [REVIEW — quote is a summary] immediately after the summarized response.
- If tone is included with a quote-summary response, place the tone phrase before "that" as: verbally responded in substance, in a [tone] tone, that [summary] [REVIEW — quote is a summary].

Required wording pattern:
Inmate [LAST NAME] verbally responded in substance, in a [tone] tone, that [rephrased summary] [REVIEW — quote is a summary].

Correct example:
Inmate Smith verbally responded in substance, in a loud and argumentative tone, that he was not going back to his cell [REVIEW — quote is a summary].

Incorrect example:
Inmate Smith stated, "He said he wasn't going back to his cell." [REVIEW — quote is a summary]

OUTPUT FORMAT:
Return the single-paragraph marked draft. No narrative before or after.
After the narrative, on a new line, output "---" then the officer review checklist.

OFFICER REVIEW CHECKLIST (append after narrative):
${OFFICER_CHECKLIST_TEXT}`;

function buildGreenNarrativeUserPrompt(facts: CleanedFacts6_1): string {
  return `OFFICER-PROVIDED FACTS (already cleaned and normalized):
${formatCleanedFacts(facts)}

ORDER COUNT NOTE:
Use this exact order count sentence: ${buildOrderCountSentence(facts)}${buildAssignmentNote(facts)}`;
}

function buildYellowNarrativeUserPrompt(facts: CleanedFacts6_1, warnings: YellowWarning[]): string {
  return `YELLOW WARNINGS — apply flags to the affected content:
${formatYellowWarnings(warnings)}

OFFICER-PROVIDED FACTS (already cleaned and normalized):
${formatCleanedFacts(facts)}

ORDER COUNT NOTE:
${buildOrderCountSentence(facts)}${buildAssignmentNote(facts)}`;
}

// ---------------------------------------------------------------------------
// json_schema mode
// ---------------------------------------------------------------------------

// Map YellowWarning[] → OutputSchema6_1 yellow_warnings format (drops id + flag_label)
function toOutputWarnings(
  warnings: YellowWarning[]
): Array<{ warning: string; affected_paragraph: number; suggested_clarification: string; example_stronger_answer: string }> {
  return warnings.map(w => ({
    warning: w.warning,
    affected_paragraph: w.affected_paragraph,
    suggested_clarification: w.suggested_clarification,
    example_stronger_answer: w.example_stronger_answer,
  }));
}

// flagged_sections is a simple boolean-style marker in the single-paragraph
// format, not a paragraph index: [] if nothing is flagged, [1] if the
// narrative contains any [REVIEW] flag. See the format note in
// docs/lockuphq_dr_writer_master_prompt_corrected.md.
function deriveFlaggedSections(warnings: YellowWarning[]): number[] {
  return warnings.length > 0 ? [1] : [];
}

function formatYellowWarningsForJson(warnings: YellowWarning[]): string {
  return warnings
    .map((w, i) => {
      let text = `${i + 1}. [${sectionLabel(w.affected_paragraph)}]: ${w.warning}\n   Place [REVIEW — ${w.flag_label}] immediately after the flagged content in the narrative.`;
      if (w.flag_label === 'quote is a summary') {
        text += '\n   For this warning, do not use quotation marks around the summarized response in the narrative.';
      }
      return text;
    })
    .join('\n\n');
}

const GREEN_JSON_SYSTEM_PROMPT = `You are the LOCKUPHQ DR Writer for FDOC Charge 6-1. You are a controlled translator only.

ROLE AND CONSTRAINTS
- You translate officer-provided facts into a formal FDOC single continuous-paragraph disciplinary report narrative.
- You are NOT a creative author, legal advisor, or decision-maker.
- You NEVER invent facts. If a fact is not in the user message, it does not appear in the report.
- You NEVER infer motive or intent.
- You follow the locked single-paragraph format exactly — no headers, no section labels, no paragraph breaks.
- You keep the officer as the first-person author ("I, [Rank] [Name]").
- You apply the NARRATIVE REFERENCE STYLE from cleaned_facts consistently throughout.
- You do NOT recommend sanctions or decide guilt.
- You do NOT name alternate charge codes.
- This is a GREEN status report — generate a clean certifiable narrative with NO [REVIEW] flags.

${FORBIDDEN_LANGUAGE}

NARRATIVE RULES — one continuous paragraph encoded as a single JSON string (do NOT use \\n\\n or any paragraph breaks):

${SINGLE_PARAGRAPH_RULES}

OUTPUT FORMAT — JSON SCHEMA MODE:

STRICT RESPONSE RULE:
Your first character must be "{"
Your last character must be "}"
Do not wrap the JSON in \`json.
Do not wrap the JSON in \`.
Do not include markdown.
Do not include explanatory text.
If you include anything outside the JSON object, the response is invalid.

JSON STRING ESCAPING RULE:
Any double quotation mark that appears inside a JSON string value must be escaped as \\".
This especially applies to inmate dialogue inside the narrative field and example quote text in yellow_warnings.
Correct:
"narrative": "Inmate Smith stated, \\"No, I ain't doing that.\\""
Incorrect:
"narrative": "Inmate Smith stated, "No, I ain't doing that.""
If inmate dialogue appears in any string field, escape the inner quote marks with a backslash.

Return ONLY valid JSON. No markdown. No code fences (no \`\`\` or \`\`\`json). No prose before or after the JSON object. No JavaScript comments inside the JSON. No trailing commas.

Your entire response must be exactly one JSON object matching this structure:

{
  "schema_version": "1.1",
  "charge": "6-1",
  "status": "GREEN",
  "red_blockers": [],
  "yellow_warnings": [],
  "cleaned_facts": <ECHO CLEANED_FACTS_JSON FROM USER MESSAGE — do not modify any field>,
  "narrative": "<generate the single continuous paragraph as one string — no \\n\\n, no paragraph breaks>",
  "flagged_sections": [],
  "ai_disclosure": "<ECHO AI_DISCLOSURE FROM USER MESSAGE — do not modify>",
  "officer_review_checklist": <ECHO OFFICER_REVIEW_CHECKLIST_JSON FROM USER MESSAGE — do not modify>
}

Field rules:
- schema_version: always the string "1.1"
- charge: always the string "6-1"
- status: always "GREEN" for this prompt
- red_blockers: always []
- yellow_warnings: always [] for GREEN
- cleaned_facts: copy exactly from CLEANED_FACTS_JSON in user message — do not reformat or omit fields
- narrative: generate the single-paragraph narrative as one JSON string value — no \\n\\n anywhere
- flagged_sections: always [] for GREEN (no [REVIEW] flags in a GREEN narrative)
- ai_disclosure: copy exactly from AI_DISCLOSURE in user message — do not paraphrase
- officer_review_checklist: copy exactly from OFFICER_REVIEW_CHECKLIST_JSON in user message`;

const YELLOW_JSON_SYSTEM_PROMPT = `You are the LOCKUPHQ DR Writer for FDOC Charge 6-1. You are a controlled translator only.

ROLE AND CONSTRAINTS
- You translate officer-provided facts into a formal FDOC single continuous-paragraph disciplinary report narrative.
- You are NOT a creative author, legal advisor, or decision-maker.
- You NEVER invent facts. If a fact is not in the user message, it does not appear in the report.
- You NEVER infer motive or intent.
- You follow the locked single-paragraph format exactly — no headers, no section labels, no paragraph breaks.
- You keep the officer as the first-person author.
- You apply the NARRATIVE REFERENCE STYLE from cleaned_facts consistently.
- You do NOT recommend sanctions or decide guilt.

STATUS: YELLOW — Generate a MARKED REVIEW DRAFT only.
This is NOT a certifiable report. Place [REVIEW — reason] flags immediately after every section of the
narrative derived from weak or vague input.

${FORBIDDEN_LANGUAGE}

NARRATIVE RULES — one continuous paragraph encoded as a single JSON string (do NOT use \\n\\n or any paragraph breaks):

${SINGLE_PARAGRAPH_RULES}

For each item listed in YELLOW WARNINGS in the user message, place [REVIEW — flag_label] immediately after the flagged content in the narrative. Use the exact flag_label string provided — do not paraphrase it.

QUOTE SUMMARY YELLOW RULE:
If a YELLOW warning indicates the inmate quote is a summary rather than exact words, follow these rules:
- Do NOT place the summary inside quotation marks.
- Do NOT write: Inmate Smith stated, "..."
- You MUST use the exact phrase "verbally responded in substance" — this phrase is required and must appear in the narrative.
- Place [REVIEW — quote is a summary] immediately after the summarized response.
- If tone is included with a quote-summary response, place the tone phrase before "that" as: verbally responded in substance, in a [tone] tone, that [summary] [REVIEW — quote is a summary].

Required wording pattern:
Inmate [LAST NAME] verbally responded in substance, in a [tone] tone, that [rephrased summary] [REVIEW — quote is a summary].

Correct example:
Inmate Smith verbally responded in substance, in a loud and argumentative tone, that he was not going back to his cell [REVIEW — quote is a summary].

Incorrect example:
Inmate Smith stated, "He said he wasn't going back to his cell." [REVIEW — quote is a summary]

OUTPUT FORMAT — JSON SCHEMA MODE:

STRICT RESPONSE RULE:
Your first character must be "{"
Your last character must be "}"
Do not wrap the JSON in \`json.
Do not wrap the JSON in \`.
Do not include markdown.
Do not include explanatory text.
If you include anything outside the JSON object, the response is invalid.

JSON STRING ESCAPING RULE:
Any double quotation mark that appears inside a JSON string value must be escaped as \\".
This especially applies to inmate dialogue inside the narrative field and example quote text in yellow_warnings.
Correct:
"narrative": "Inmate Smith stated, \\"No, I ain't doing that.\\""
Incorrect:
"narrative": "Inmate Smith stated, "No, I ain't doing that.""
If inmate dialogue appears in any string field, escape the inner quote marks with a backslash.

Return ONLY valid JSON. No markdown. No code fences (no \`\`\` or \`\`\`json). No prose before or after the JSON object. No JavaScript comments inside the JSON. No trailing commas.

Your entire response must be exactly one JSON object matching this structure:

{
  "schema_version": "1.1",
  "charge": "6-1",
  "status": "YELLOW",
  "red_blockers": [],
  "yellow_warnings": <ECHO YELLOW_WARNINGS_JSON FROM USER MESSAGE — do not modify>,
  "cleaned_facts": <ECHO CLEANED_FACTS_JSON FROM USER MESSAGE — do not modify any field>,
  "narrative": "<generate the single-paragraph marked draft as one string — no \\n\\n anywhere — include [REVIEW — flag_label] flags inline at the flagged content>",
  "flagged_sections": <ECHO FLAGGED_SECTIONS_JSON FROM USER MESSAGE — do not modify>,
  "ai_disclosure": "<ECHO AI_DISCLOSURE FROM USER MESSAGE — do not modify>",
  "officer_review_checklist": <ECHO OFFICER_REVIEW_CHECKLIST_JSON FROM USER MESSAGE — do not modify>
}

Field rules:
- schema_version: always the string "1.1"
- charge: always the string "6-1"
- status: always "YELLOW" for this prompt
- red_blockers: always []
- yellow_warnings: copy exactly from YELLOW_WARNINGS_JSON in user message
- cleaned_facts: copy exactly from CLEANED_FACTS_JSON in user message — do not reformat or omit fields
- narrative: generate the single-paragraph marked draft as one JSON string value; include [REVIEW — flag_label] flags inline per warnings; no \\n\\n anywhere
- flagged_sections: copy exactly from FLAGGED_SECTIONS_JSON in user message
- ai_disclosure: copy exactly from AI_DISCLOSURE in user message — do not paraphrase
- officer_review_checklist: copy exactly from OFFICER_REVIEW_CHECKLIST_JSON in user message`;

function buildGreenJsonUserPrompt(facts: CleanedFacts6_1): string {
  return `CLEANED_FACTS_JSON — echo this object verbatim in the cleaned_facts field:
${JSON.stringify(facts, null, 2)}

JSON ESCAPING REMINDER:
When copying or generating JSON string values, all internal double quotation marks must be escaped as \\" so JSON.parse can read the response. Example: "No, I ain't doing that." inside a string value becomes \\"No, I ain't doing that.\\"

AI_DISCLOSURE — echo this string verbatim in the ai_disclosure field:
${AI_DISCLOSURE}

OFFICER_REVIEW_CHECKLIST_JSON — echo this array verbatim in the officer_review_checklist field:
${JSON.stringify(OFFICER_REVIEW_CHECKLIST)}

OFFICER-PROVIDED FACTS (for generating the narrative):
${formatCleanedFacts(facts)}

ORDER COUNT SENTENCE — use this verbatim in the order-and-response portion of the narrative:
${buildOrderCountSentence(facts)}${buildAssignmentNote(facts)}`;
}

function buildYellowJsonUserPrompt(facts: CleanedFacts6_1, warnings: YellowWarning[]): string {
  const outputWarnings = toOutputWarnings(warnings);
  const flaggedSections = deriveFlaggedSections(warnings);
  return `YELLOW_WARNINGS_JSON — echo this array verbatim in the yellow_warnings field:
${JSON.stringify(outputWarnings, null, 2)}

FLAGGED_SECTIONS_JSON — echo this array verbatim in the flagged_sections field:
${JSON.stringify(flaggedSections)}

YELLOW WARNING INSTRUCTIONS — place [REVIEW — flag_label] after flagged content in the narrative:
${formatYellowWarningsForJson(warnings)}

CLEANED_FACTS_JSON — echo this object verbatim in the cleaned_facts field:
${JSON.stringify(facts, null, 2)}

JSON ESCAPING REMINDER:
When copying or generating JSON string values, all internal double quotation marks must be escaped as \\" so JSON.parse can read the response. Example: "No, I ain't doing that." inside a string value becomes \\"No, I ain't doing that.\\"

AI_DISCLOSURE — echo this string verbatim in the ai_disclosure field:
${AI_DISCLOSURE}

OFFICER_REVIEW_CHECKLIST_JSON — echo this array verbatim in the officer_review_checklist field:
${JSON.stringify(OFFICER_REVIEW_CHECKLIST)}

OFFICER-PROVIDED FACTS (for generating the narrative):
${formatCleanedFacts(facts)}

ORDER COUNT SENTENCE — use this verbatim in the order-and-response portion of the narrative:
${buildOrderCountSentence(facts)}${buildAssignmentNote(facts)}`;
}

// ---------------------------------------------------------------------------
// Main prompt builder
// ---------------------------------------------------------------------------

export function buildPrompt6_1(
  evaluation: EvaluationResult6_1,
  options: BuildPromptOptions = {}
): PromptBuildResult {
  const outputMode: PromptOutputMode6_1 = options.outputMode ?? 'narrative_only';

  if (evaluation.status === 'RED') {
    return {
      prompt: null,
      parts: null,
      status: 'RED',
      reason: 'Cannot build a generation prompt under RED status. Resolve all red blockers first.',
      outputMode,
    };
  }

  if (!evaluation.cleaned_facts) {
    return {
      prompt: null,
      parts: null,
      status: 'RED',
      reason: 'cleaned_facts is null — cannot build prompt without cleaned facts.',
      outputMode,
    };
  }

  const facts = evaluation.cleaned_facts;
  const warnings = evaluation.yellow_warnings;
  const isYellow = evaluation.status === 'YELLOW';

  let systemPrompt: string;
  let userPrompt: string;

  if (outputMode === 'json_schema') {
    systemPrompt = isYellow ? YELLOW_JSON_SYSTEM_PROMPT : GREEN_JSON_SYSTEM_PROMPT;
    userPrompt = isYellow
      ? buildYellowJsonUserPrompt(facts, warnings)
      : buildGreenJsonUserPrompt(facts);
  } else {
    // narrative_only (default)
    systemPrompt = isYellow ? YELLOW_SYSTEM_PROMPT : GREEN_SYSTEM_PROMPT;
    userPrompt = isYellow
      ? buildYellowNarrativeUserPrompt(facts, warnings)
      : buildGreenNarrativeUserPrompt(facts);
  }

  return {
    prompt: `${systemPrompt}\n\n---\n\n${userPrompt}`,
    parts: { systemPrompt, userPrompt },
    status: evaluation.status,
    reason: isYellow
      ? `${evaluation.status} — ${outputMode} prompt built with ${warnings.length} yellow warning(s).`
      : `GREEN — ${outputMode} prompt built.`,
    outputMode,
  };
}
