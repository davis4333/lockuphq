// LOCKUPHQ DR Writer — Charge 6-1 Generation Pipeline
//
// Full async pipeline: intake facts → evaluate → prompt → Claude → parse → validate.
// The Claude client is injected as a parameter — no singleton, no global state.
//
// RED status: returns a local RED OutputSchema6_1 immediately. Never calls client.
// GREEN/YELLOW: calls client once, parses raw response, validates against local evaluation.
//
// This module does NOT contain network code.
// The real Claude client is wired in Step 4C.

import { evaluate6_1 } from './evaluate6_1.ts';
import { buildPrompt6_1 } from './buildPrompt6_1.ts';
import { parseResponse6_1, ParseError } from './parseResponse6_1.ts';
import type { IntakeFacts6_1, OutputSchema6_1, EvaluationResult6_1, YellowWarning } from './types.ts';
import { AI_DISCLOSURE, OFFICER_REVIEW_CHECKLIST } from './types.ts';
import type { ClaudeJsonClient } from '../../llm/claudeTypes.ts';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class Generate6_1Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Generate6_1Error';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function countParagraphs(narrative: string): number {
  return narrative.split(/\n\n+/).filter(p => p.trim().length > 0).length;
}

// Repairs formatting noise (stray blank lines, CRLF, trailing/leading whitespace) that a live
// model can introduce without the underlying content actually being multi-paragraph. The
// single-paragraph requirement is enforced by the prompt (docs/lockuphq_dr_writer_master_prompt_corrected.md);
// this step keeps a cosmetic slip from hard-failing an otherwise-good report. It is not a
// license for Claude to ignore the format — a response that reads as genuinely structured
// (headers, six distinct blocks) is still a prompt-adherence problem worth catching in testing,
// just not by throwing away a certifiable report over a stray blank line.
function normalizeNarrativeFormatting(narrative: string): string {
  return narrative
    .replace(/\r\n?/g, '\n')       // normalize CRLF/CR to LF
    .replace(/\n\s*\n+/g, ' ')     // collapse any blank-line break into a single space
    .replace(/[ \t]{2,}/g, ' ')    // collapse whitespace runs left behind by the collapse above
    .trim();
}

function toOutputWarnings(
  warnings: YellowWarning[]
): OutputSchema6_1['yellow_warnings'] {
  return warnings.map(w => ({
    warning: w.warning,
    affected_paragraph: w.affected_paragraph,
    suggested_clarification: w.suggested_clarification,
    example_stronger_answer: w.example_stronger_answer,
  }));
}

// flagged_sections is a boolean-style marker in the single-paragraph format,
// not a paragraph index — [] if nothing is flagged, [1] otherwise. See
// docs/lockuphq_dr_writer_master_prompt_corrected.md.
function deriveFlaggedSections(warnings: YellowWarning[]): number[] {
  return warnings.length > 0 ? [1] : [];
}

// ---------------------------------------------------------------------------
// Post-parse validation
// ---------------------------------------------------------------------------

function validateAgainstLocalEvaluation(
  parsed: OutputSchema6_1,
  evaluation: EvaluationResult6_1
): void {
  if (parsed.schema_version !== '1.1') {
    throw new Generate6_1Error(
      `Claude output validation failed: schema_version must be "1.1", got "${parsed.schema_version}"`
    );
  }

  if (parsed.charge !== '6-1') {
    throw new Generate6_1Error(
      `Claude output validation failed: wrong charge — expected "6-1", got "${parsed.charge}"`
    );
  }

  if (parsed.status !== evaluation.status) {
    throw new Generate6_1Error(
      `Claude output validation failed: status mismatch — local evaluation is "${evaluation.status}", Claude returned "${parsed.status}"`
    );
  }

  if (parsed.red_blockers.length !== 0) {
    throw new Generate6_1Error(
      `Claude output validation failed: red_blockers must be [] for ${evaluation.status} — got ${parsed.red_blockers.length} blocker(s)`
    );
  }

  if (parsed.narrative === null || parsed.narrative === undefined || parsed.narrative.trim().length === 0) {
    throw new Generate6_1Error('Claude output validation failed: narrative is missing or empty');
  }

  // Invariant check, not the primary gate — normalizeNarrativeFormatting already collapsed any
  // blank-line breaks before this function ran, so this should only fire on an edge case the
  // normalizer doesn't cover (e.g. unicode paragraph separators), not on ordinary formatting noise.
  const paragraphCount = countParagraphs(parsed.narrative);
  if (paragraphCount !== 1) {
    throw new Generate6_1Error(
      `Claude output validation failed: narrative must be a single continuous paragraph (no blank-line breaks) — got ${paragraphCount} paragraph(s)`
    );
  }

  if (evaluation.status === 'GREEN') {
    if (parsed.yellow_warnings.length !== 0) {
      throw new Generate6_1Error(
        `Claude output validation failed: GREEN status must have empty yellow_warnings — got ${parsed.yellow_warnings.length}`
      );
    }
    if (parsed.flagged_sections.length !== 0) {
      throw new Generate6_1Error(
        `Claude output validation failed: GREEN status must have empty flagged_sections — got ${parsed.flagged_sections.length}`
      );
    }
    if (parsed.narrative.includes('[REVIEW')) {
      throw new Generate6_1Error(
        'Claude output validation failed: GREEN narrative must not contain [REVIEW] flags'
      );
    }
  }

  if (evaluation.status === 'YELLOW') {
    if (!parsed.narrative.includes('[REVIEW')) {
      throw new Generate6_1Error(
        'Claude output validation failed: YELLOW narrative must contain at least one [REVIEW] flag'
      );
    }
    const expectedWarnings = toOutputWarnings(evaluation.yellow_warnings);
    const expectedSections = deriveFlaggedSections(evaluation.yellow_warnings);
    if (JSON.stringify(parsed.yellow_warnings) !== JSON.stringify(expectedWarnings)) {
      throw new Generate6_1Error(
        'Claude output validation failed: yellow_warnings mismatch — Claude must echo local warnings verbatim'
      );
    }
    if (JSON.stringify(parsed.flagged_sections) !== JSON.stringify(expectedSections)) {
      throw new Generate6_1Error(
        'Claude output validation failed: flagged_sections mismatch — Claude must echo local sections verbatim'
      );
    }
  }

  if (JSON.stringify(parsed.cleaned_facts) !== JSON.stringify(evaluation.cleaned_facts)) {
    throw new Generate6_1Error(
      'Claude output validation failed: cleaned_facts mismatch — Claude must not modify fact values'
    );
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function generate6_1(
  intake: IntakeFacts6_1,
  client: ClaudeJsonClient
): Promise<OutputSchema6_1> {
  const evaluation = evaluate6_1(intake);

  if (evaluation.status === 'RED') {
    return {
      schema_version: '1.1',
      charge: '6-1',
      status: 'RED',
      red_blockers: evaluation.red_blockers,
      yellow_warnings: [],
      cleaned_facts: null,
      narrative: null,
      flagged_sections: [],
      ai_disclosure: AI_DISCLOSURE,
      officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
    };
  }

  const promptResult = buildPrompt6_1(evaluation, { outputMode: 'json_schema' });
  if (!promptResult.parts) {
    throw new Generate6_1Error(
      'Prompt build failed — parts is null for non-RED status. This should not happen.'
    );
  }

  let raw: string;
  try {
    raw = await client.completeJson(promptResult.parts);
  } catch (err) {
    throw new Generate6_1Error(
      `Claude call failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: OutputSchema6_1;
  try {
    parsed = parseResponse6_1(raw);
  } catch (err) {
    if (err instanceof ParseError) {
      throw new Generate6_1Error(`Claude output parse failed: ${err.message}`);
    }
    throw err;
  }

  // Repair formatting noise before validating/returning — see normalizeNarrativeFormatting.
  if (typeof parsed.narrative === 'string') {
    parsed.narrative = normalizeNarrativeFormatting(parsed.narrative);
  }

  validateAgainstLocalEvaluation(parsed, evaluation);

  return parsed;
}
