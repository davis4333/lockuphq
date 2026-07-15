// LOCKUPHQ DR Writer — Charge 6-1 Local Developer Runner
//
// CLI harness that simulates future website intake submission without a UI.
// Reads a JSON intake file and runs it through generate6_1 in mock or live mode.
//
// Usage (safe — no API cost):
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-yellow-quote-summary.json
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-red-missing-dc.json
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --print-narrative
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --print-json
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --out dev-output/6-1/out.json
//
// Usage (live — requires explicit confirmation AND Tyler approval):
//   npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --mode live --confirm-live
//
// Default mode: mock (no API calls, no credits spent)
// Live mode: requires --mode live AND --confirm-live AND ANTHROPIC_API_KEY AND path under dev-inputs/6-1/
//
// Exports are used by testDevRun6_1.ts — do not remove them.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate6_1, Generate6_1Error } from './generate6_1.ts';
import { evaluate6_1 } from './evaluate6_1.ts';
import { createClaudeClient, ClaudeClientError } from '../../llm/claudeClient.ts';
import { formatIncidentDateForNarrative6_1 } from './displayDate6_1.ts';
import type { IntakeFacts6_1, OutputSchema6_1, EvaluationResult6_1, CleanedFacts6_1, YellowWarning } from './types.ts';
import { AI_DISCLOSURE, OFFICER_REVIEW_CHECKLIST } from './types.ts';
import type { ClaudeJsonClient, ClaudePromptParts } from '../../llm/claudeTypes.ts';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export interface ParsedDevArgs {
  input: string;
  mode: 'mock' | 'live';
  out: string | null;
  printNarrative: boolean;
  printJson: boolean;
  confirmLive: boolean;
}

export type ParseDevArgsResult =
  | { ok: true; args: ParsedDevArgs }
  | { ok: false; error: string };

export function parseDevArgs(argv: string[]): ParseDevArgsResult {
  let input: string | null = null;
  let mode: 'mock' | 'live' = 'mock';
  let out: string | null = null;
  let printNarrative = false;
  let printJson = false;
  let confirmLive = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') {
      input = argv[++i] ?? null;
      if (!input) return { ok: false, error: '--input requires a path argument' };
    } else if (arg === '--mode') {
      const val = argv[++i] ?? '';
      if (val !== 'mock' && val !== 'live') {
        return { ok: false, error: `--mode must be "mock" or "live", got "${val}"` };
      }
      mode = val;
    } else if (arg === '--out') {
      out = argv[++i] ?? null;
      if (!out) return { ok: false, error: '--out requires a path argument' };
    } else if (arg === '--print-narrative') {
      printNarrative = true;
    } else if (arg === '--print-json') {
      printJson = true;
    } else if (arg === '--confirm-live') {
      confirmLive = true;
    } else if (arg === '--safe-summary') {
      // Explicit default — no-op, safe-summary is the default behavior
    }
  }

  if (!input) {
    return { ok: false, error: '--input <path> is required' };
  }

  return { ok: true, args: { input, mode, out, printNarrative, printJson, confirmLive } };
}

// ---------------------------------------------------------------------------
// Live input path security — only dev-inputs/6-1/ is allowed for live mode
// ---------------------------------------------------------------------------

export function isAllowedLiveInput(inputPath: string): boolean {
  const allowedBase = resolve(process.cwd(), 'dev-inputs', '6-1');
  const resolved = resolve(process.cwd(), inputPath);
  // resolved must start with allowedBase + platform sep to be strictly inside the dir
  return resolved.startsWith(allowedBase + sep);
}

// ---------------------------------------------------------------------------
// Mock client factory — builds valid canned response from local evaluation
// ---------------------------------------------------------------------------

// ── Narrative helpers for realistic mock output ──────────────────────────────

function getMockPossessive(style: string): string {
  if (style === 'he/him')    return 'his';
  if (style === 'she/her')   return 'her';
  if (style === 'they/them') return 'their';
  return '';
}

const NUM_WORDS = [
  'zero','one','two','three','four','five','six','seven','eight',
  'nine','ten','eleven','twelve','thirteen','fourteen','fifteen',
];
function numWord(n: number): string {
  return n >= 0 && n < NUM_WORDS.length ? NUM_WORDS[n] : String(n);
}

function orderTypeStr(ot: string): string {
  if (ot === 'verbal')  return 'verbal';
  if (ot === 'written') return 'written';
  return 'verbal and written';
}

function stripOuterQuotes(s: string): string {
  return s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

function withArticle(post: string): string {
  const lower = post.toLowerCase();
  if (lower.startsWith('the ') || lower.startsWith('a ') || lower.startsWith('an ')) {
    return post;
  }
  return `the ${post}`;
}

// Point of view: the narrative is first person throughout — "me"/"my", never "this officer".
// See the POINT OF VIEW rule in buildPrompt6_1.ts's SINGLE_PARAGRAPH_RULES.
function ackSentence(ref: string, ackType: string, poss: string): string {
  switch (ackType) {
    case 'eye_contact':
      return `Inmate ${ref} made direct eye contact with me.`;
    case 'verbal_response':
      return `Inmate ${ref} verbally acknowledged my directive.`;
    case 'eye_contact_and_verbal_response':
      return `Inmate ${ref} made direct eye contact with me and verbally responded.`;
    case 'physical_reaction':
      return `Inmate ${ref} physically reacted to my directive.`;
    case 'actions_showed_awareness':
      return poss
        ? `Inmate ${ref} demonstrated by ${poss} actions an awareness of my directive.`
        : `Inmate ${ref} demonstrated by actions an awareness of my directive.`;
    case 'within_hearing_distance':
      return `Inmate ${ref} was within hearing distance of me at the time the order was given.`;
    default:
      return `I issued the above directive to Inmate ${ref}.`;
  }
}

// Single continuous paragraph, matching docs/lockuphq_dr_writer_master_prompt_corrected.md.
// The legacy six-paragraph build is deprecated — do not reintroduce "\n\n" between
// sections. affected_paragraph (1–6) is kept only as an internal category tag for
// where to inline a [REVIEW — reason] flag; it is not an output paragraph index.
function buildRealisticNarrative(
  cf: CleanedFacts6_1,
  yellowWarnings: readonly YellowWarning[] = []
): string {
  const ref = cf.inmate_last_name;
  const poss = getMockPossessive(cf.narrative_reference_style);
  const ot = orderTypeStr(cf.order_type);
  const hasQuoteSummary = yellowWarnings.some(w => w.id === 'quote_is_summary');
  const reviewFlagsFor = (section: number): string =>
    yellowWarnings
      .filter(w => w.affected_paragraph === section && w.id !== 'quote_is_summary')
      .map(w => ` [REVIEW — ${w.flag_label}]`)
      .join('');

  const sentences: string[] = [];

  // ── Opening / scene / contact ──────────────────────────────────────────
  const inmateId = cf.inmate_first_name
    ? `Inmate ${ref}, ${cf.inmate_first_name}, DC# ${cf.dc_number}`
    : `Inmate ${ref}, DC# ${cf.dc_number}`;
  const displayDate = formatIncidentDateForNarrative6_1(cf.incident_date);
  sentences.push(
    `On ${displayDate}, at approximately ${cf.incident_time}, I, ${cf.officer_rank} ${cf.officer_name}, ` +
    `was assigned to ${cf.dorm_area} as ${withArticle(cf.officer_post)}. ` +
    `While ${cf.officer_activity}, I approached ${cf.incident_location} and observed ${inmateId}, ` +
    `${cf.inmate_behavior_before_order}${reviewFlagsFor(1)}.`
  );

  // ── Order, acknowledgment, response, physical behavior ─────────────────
  const orderParts: string[] = [];
  if (cf.total_orders_given === 1) {
    orderParts.push(`I issued one direct ${ot} order to Inmate ${ref} to ${cf.exact_order}.`);
  } else {
    orderParts.push(`I issued a direct ${ot} order to Inmate ${ref} to ${cf.exact_order}.`);
    const extra = cf.total_orders_given - 1;
    const extraPhrase = extra === 1 ? 'one additional time' : `${numWord(extra)} additional times`;
    orderParts.push(
      `I repeated this directive ${extraPhrase}, for a total of ` +
      `${numWord(cf.total_orders_given)} ${ot} orders.`
    );
  }
  orderParts.push(ackSentence(ref, cf.acknowledgment_type, poss));
  if (!cf.inmate_said_nothing && cf.inmate_quote) {
    if (hasQuoteSummary) {
      // Summary — no quotation marks; use "verbally responded in substance"
      const raw = stripOuterQuotes(cf.inmate_quote);
      const stripped = raw
        .replace(/^(he|she|they)\s+said\s+(that\s+)?/i, '')
        .replace(/^inmate\s+\S+\s+said\s+(that\s+)?/i, '');
      const lower = stripped.charAt(0).toLowerCase() + stripped.slice(1).replace(/\.?$/, '');
      orderParts.push(`Inmate ${ref} verbally responded in substance that ${lower} [REVIEW — quote is a summary].`);
    } else {
      const q = stripOuterQuotes(cf.inmate_quote);
      const qFormatted = /[.!?]$/.test(q) ? q : `${q}.`;
      const tonePart = cf.inmate_tone ? `In a ${cf.inmate_tone} tone, ` : '';
      orderParts.push(`${tonePart}Inmate ${ref} stated, "${qFormatted}"`);
    }
  } else if (cf.inmate_said_nothing) {
    orderParts.push(`Inmate ${ref} did not verbally respond to my directive.`);
  }
  const physLower = cf.physical_behavior.charAt(0).toLowerCase() + cf.physical_behavior.slice(1);
  orderParts.push(`Inmate ${ref} then ${physLower}${reviewFlagsFor(2)}.`);
  sentences.push(orderParts.join(' '));

  // ── Operational impact — omit entirely if nothing specific was reported ─
  if (cf.operational_impact && cf.operational_impact.trim().length > 0) {
    const impLower = cf.operational_impact.charAt(0).toLowerCase() +
      cf.operational_impact.slice(1).replace(/\.?$/, '');
    sentences.push(`This conduct disrupted the orderly operation of ${cf.dorm_area} by ${impLower}${reviewFlagsFor(3)}.`);
  }

  // ── Ability to comply / force — omit boilerplate when nothing to report ─
  const abilityForce: string[] = [];
  if (cf.ability_to_comply === 'issue_with_explanation' && cf.ability_to_comply_explanation) {
    const explLower = cf.ability_to_comply_explanation.charAt(0).toLowerCase() +
      cf.ability_to_comply_explanation.slice(1).replace(/\.?$/, '');
    abilityForce.push(`${explLower.charAt(0).toUpperCase()}${explLower.slice(1)}.`);
  }
  if (cf.force_used === 'yes') {
    const forceExp = cf.force_explanation?.trim() ?? '';
    if (forceExp) {
      abilityForce.push(/[.!?]$/.test(forceExp) ? forceExp : `${forceExp}.`);
    }
    if (cf.uof_documentation_status === 'completed') {
      abilityForce.push('Separate use-of-force documentation was completed regarding the force used during this incident.');
    }
  }
  if (abilityForce.length > 0) {
    sentences.push(`${abilityForce.join(' ')}${reviewFlagsFor(4)}`);
  }

  // ── Charge advisory ──────────────────────────────────────────────────────
  sentences.push(
    `I then advised Inmate ${ref}, who will be receiving a disciplinary report for the charge of 6-1: ` +
    `Disobeying verbal or written order – any order given to an inmate or inmates by a staff member or other authorized person${reviewFlagsFor(5)}.`
  );

  // ── Confinement and OIC closing ─────────────────────────────────────────
  const closing: string[] = [];
  if (cf.confinement_status === 'placed') {
    closing.push(`Inmate ${ref} was placed in administrative confinement pending the outcome of this disciplinary report.`);
  } else if (cf.confinement_status === 'remained') {
    closing.push(`Inmate ${ref} remained in administrative confinement pending the outcome of this disciplinary report.`);
  }
  closing.push(`The shift ${cf.oic_rank}, ${cf.oic_last_name}, was notified and authorized the initiation of this report.`);
  // WITNESS STAFF and CAMERA COVERAGE are gate-only inputs (witness_staff feeds the
  // vague-witness YELLOW check in evaluate6_1.ts) — real accepted reports do not include
  // either in the statement of facts, so neither is composed into the narrative here.
  // See buildPrompt6_1.ts's matching "Do NOT add a witness or camera-coverage sentence" rule.
  sentences.push(`${closing.join(' ')}${reviewFlagsFor(6)}`);

  return sentences.join(' ');
}

// ── Mock response builders ────────────────────────────────────────────────────

function buildMockGreenResponse(evaluation: EvaluationResult6_1): string {
  const cf = evaluation.cleaned_facts!;
  const response: OutputSchema6_1 = {
    schema_version: '1.1',
    charge: '6-1',
    status: 'GREEN',
    red_blockers: [],
    yellow_warnings: [],
    cleaned_facts: cf,
    narrative: buildRealisticNarrative(cf),
    flagged_sections: [],
    ai_disclosure: AI_DISCLOSURE,
    officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
  };
  return JSON.stringify(response);
}

function buildMockYellowResponse(evaluation: EvaluationResult6_1): string {
  const cf = evaluation.cleaned_facts!;
  const outputWarnings = evaluation.yellow_warnings.map(w => ({
    warning: w.warning,
    affected_paragraph: w.affected_paragraph,
    suggested_clarification: w.suggested_clarification,
    example_stronger_answer: w.example_stronger_answer,
  }));
  // flagged_sections is a boolean-style marker in the single-paragraph format,
  // not a paragraph index — [] if nothing is flagged, [1] otherwise.
  const flaggedSections = evaluation.yellow_warnings.length > 0 ? [1] : [];

  const response: OutputSchema6_1 = {
    schema_version: '1.1',
    charge: '6-1',
    status: 'YELLOW',
    red_blockers: [],
    yellow_warnings: outputWarnings,
    cleaned_facts: cf,
    narrative: buildRealisticNarrative(cf, evaluation.yellow_warnings),
    flagged_sections: flaggedSections,
    ai_disclosure: AI_DISCLOSURE,
    officer_review_checklist: OFFICER_REVIEW_CHECKLIST,
  };
  return JSON.stringify(response);
}

export function makeMockDevClient(evaluation: EvaluationResult6_1): {
  client: ClaudeJsonClient;
  getCallCount: () => number;
} {
  let calls = 0;
  // RED status never calls the client — skip building a response to avoid null cleaned_facts
  const responseJson: string | null =
    evaluation.status === 'YELLOW'
      ? buildMockYellowResponse(evaluation)
      : evaluation.status === 'GREEN'
        ? buildMockGreenResponse(evaluation)
        : null;

  return {
    client: {
      async completeJson(_parts: ClaudePromptParts): Promise<string> {
        calls++;
        if (responseJson === null) {
          throw new Error('Mock: completeJson must not be called for RED status');
        }
        return responseJson;
      },
    },
    getCallCount: () => calls,
  };
}

// ---------------------------------------------------------------------------
// Dev run executor (exported for testing)
// ---------------------------------------------------------------------------

export interface DevRunResult {
  output: OutputSchema6_1 | null;
  claudeCalls: number;
  outFileWritten: boolean;
  error?: string;
}

export async function executeDevRun(args: ParsedDevArgs): Promise<DevRunResult> {
  // Live mode guards — checked in order: confirmation, key, path
  if (args.mode === 'live') {
    if (!args.confirmLive) {
      return {
        output: null,
        claudeCalls: 0,
        outFileWritten: false,
        error:
          'Live mode uses API credits and must only use fake/sample data.\n' +
          'Re-run with --confirm-live if you intend to make a live API call.',
      };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        output: null,
        claudeCalls: 0,
        outFileWritten: false,
        error: 'Live mode requires ANTHROPIC_API_KEY to be set in your environment.',
      };
    }
    if (!isAllowedLiveInput(args.input)) {
      return {
        output: null,
        claudeCalls: 0,
        outFileWritten: false,
        error: `Live mode only allows input files under dev-inputs/6-1/. Blocked: "${args.input}"`,
      };
    }
  }

  // Read and parse intake
  let intake: IntakeFacts6_1;
  try {
    const raw = readFileSync(resolve(process.cwd(), args.input), 'utf-8');
    intake = JSON.parse(raw) as IntakeFacts6_1;
  } catch (err) {
    return {
      output: null,
      claudeCalls: 0,
      outFileWritten: false,
      error: `Failed to read "${args.input}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Build client
  let client: ClaudeJsonClient;
  let getCallCount: () => number;

  if (args.mode === 'mock') {
    const evaluation = evaluate6_1(intake);
    const mock = makeMockDevClient(evaluation);
    client = mock.client;
    getCallCount = mock.getCallCount;
  } else {
    const realClient = createClaudeClient();
    let calls = 0;
    client = {
      async completeJson(parts: ClaudePromptParts): Promise<string> {
        calls++;
        return realClient.completeJson(parts);
      },
    };
    getCallCount = () => calls;
  }

  // Run pipeline
  let output: OutputSchema6_1;
  try {
    output = await generate6_1(intake, client);
  } catch (err) {
    return {
      output: null,
      claudeCalls: getCallCount(),
      outFileWritten: false,
      error:
        err instanceof Generate6_1Error || err instanceof ClaudeClientError
          ? `${(err as Error).name}: ${(err as Error).message}`
          : `Unexpected error: ${err}`,
    };
  }

  const claudeCalls = getCallCount();

  // Write output file if --out specified
  let outFileWritten = false;
  if (args.out) {
    try {
      const outPath = resolve(process.cwd(), args.out);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
      outFileWritten = true;
    } catch (err) {
      return {
        output,
        claudeCalls,
        outFileWritten: false,
        error: `Failed to write "${args.out}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return { output, claudeCalls, outFileWritten };
}

// ---------------------------------------------------------------------------
// CLI output helpers
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log('');
  console.log('  Usage:');
  console.log('    npm run dev:6-1 -- --input <path> [options]');
  console.log('');
  console.log('  Options:');
  console.log('    --input <path>       Path to intake JSON file (required)');
  console.log('    --mode mock|live     mock (default, no API cost) or live Claude API call');
  console.log('    --confirm-live       Required to actually run in live mode (prevents accidents)');
  console.log('    --out <path>         Write OutputSchema6_1 JSON to this file');
  console.log('    --print-narrative    Print the generated narrative to stdout');
  console.log('    --print-json         Print the full OutputSchema6_1 JSON to stdout');
  console.log('    --safe-summary       Explicit default: summary only, no full JSON (no-op)');
  console.log('');
  console.log('  Mock examples (safe — no API credits):');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-yellow-quote-summary.json');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-red-missing-dc.json');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --print-narrative');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --print-json');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --out dev-output/6-1/out.json');
  console.log('');
  console.log('  Live example (requires Tyler approval + ANTHROPIC_API_KEY):');
  console.log('    npm run dev:6-1 -- --input dev-inputs/6-1/fake-green-direct-refusal.json --mode live --confirm-live');
  console.log('');
}

// ---------------------------------------------------------------------------
// Main CLI entry
// ---------------------------------------------------------------------------

const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

async function main(): Promise<void> {
  const parseResult = parseDevArgs(process.argv.slice(2));

  if (!parseResult.ok) {
    console.error('');
    console.error(`  Error: ${parseResult.error}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const { args } = parseResult;

  let modeLabel = args.mode;
  if (args.mode === 'live') {
    modeLabel = args.confirmLive
      ? 'live  (WARNING: uses API credits — fake/sample data only)'
      : 'live  (missing --confirm-live — will abort before API call)';
  }

  console.log('');
  console.log(DIVIDER);
  console.log('  LOCKUPHQ DR Writer — Charge 6-1 Developer Runner');
  console.log(SECTION);
  console.log(`  Input:  ${args.input}`);
  console.log(`  Mode:   ${modeLabel}`);
  if (args.out) console.log(`  Out:    ${args.out}`);
  console.log(DIVIDER);
  console.log('');

  const result = await executeDevRun(args);

  if (result.error && !result.output) {
    console.log(`  Error: ${result.error}`);
    console.log('');
    console.log('  Overall: FAIL');
    console.log(DIVIDER);
    console.log('');
    process.exitCode = 1;
    return;
  }

  const output = result.output!;
  const narrative = output.narrative ?? '';
  const paragraphCount =
    narrative.trim().length > 0
      ? narrative.split(/\n\n+/).filter(p => p.trim().length > 0).length
      : 0;

  console.log(`  Status:           ${output.status}`);
  console.log(`  Charge:           ${output.charge}`);
  console.log(`  Schema version:   ${output.schema_version}`);
  console.log(`  Red blockers:     ${output.red_blockers.length}`);
  console.log(`  Yellow warnings:  ${output.yellow_warnings.length}`);
  console.log(`  Flagged sections: [${output.flagged_sections.join(', ')}]`);
  console.log(`  Claude calls:     ${result.claudeCalls} (${args.mode})`);
  if (narrative.trim().length > 0) {
    console.log(`  Narrative paras:  ${paragraphCount}`);
  }
  if (result.outFileWritten && args.out) {
    console.log(`  Output written:   ${args.out}`);
  }

  if (output.red_blockers.length > 0) {
    console.log('');
    console.log(SECTION);
    console.log('  RED BLOCKERS — resolve before report can be generated');
    console.log(SECTION);
    console.log('');
    for (const b of output.red_blockers) {
      console.log(`  [${b.id}]`);
      console.log(`  Missing: ${b.missing_fact}`);
      console.log(`  Question: ${b.follow_up_question}`);
      console.log('');
    }
  }

  if (output.yellow_warnings.length > 0) {
    console.log('');
    console.log(SECTION);
    console.log('  YELLOW WARNINGS — review flagged sections before certifying');
    console.log(SECTION);
    console.log('');
    for (const w of output.yellow_warnings) {
      console.log(`  ${w.warning}`);
      console.log('');
    }
  }

  if (args.printNarrative && narrative.trim().length > 0) {
    console.log('');
    console.log(SECTION);
    console.log('  NARRATIVE');
    console.log(SECTION);
    console.log('');
    console.log(narrative);
    console.log('');
  }

  if (args.printJson) {
    console.log('');
    console.log(SECTION);
    console.log('  OUTPUT JSON');
    console.log(SECTION);
    console.log('');
    console.log(JSON.stringify(output, null, 2));
    console.log('');
  }

  if (result.error) {
    // Error occurred after pipeline succeeded (e.g. file write failure)
    console.log('');
    console.log(`  Warning: ${result.error}`);
  }

  console.log('');
  console.log(DIVIDER);
  console.log('');

  if (result.error) {
    process.exitCode = 1;
  }
}

// Only run main() when this file is executed directly as a CLI script.
// When imported as a module by tests, main() must not run.
const __thisFile = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? '') === resolve(__thisFile)) {
  await main();
}
