// LOCKUPHQ DR Writer — Charge 6-1 Live Claude Fake Officer Cases
//
// Runs three realistic fake-officer intake scenarios through the full
// generate6_1 pipeline. GREEN and YELLOW cases use the real Claude API.
// RED case is validated locally — Claude is never called for RED.
//
// Requires: ANTHROPIC_API_KEY set in environment (for GREEN and YELLOW cases).
// Uses ONLY synthetic/fake data — no real inmate or officer information.
//
// Run:
//   $env:ANTHROPIC_API_KEY = "your-key-here"   (PowerShell)
//   npm run test:6-1:live-fake-cases
//
// To see raw Claude narratives:
//   $env:DEBUG_CLAUDE_RAW = "true"

import { generate6_1, Generate6_1Error } from './generate6_1.ts';
import { createClaudeClient, ClaudeClientError, DEFAULT_CLAUDE_MODEL } from '../../llm/claudeClient.ts';
import type { IntakeFacts6_1 } from './types.ts';
import type { ClaudeJsonClient, ClaudePromptParts } from '../../llm/claudeTypes.ts';

// ---------------------------------------------------------------------------
// Fake intake cases — synthetic data only, no real officer/inmate information
// ---------------------------------------------------------------------------

const CASE_LIVE_01_GREEN_DIRECT_REFUSAL: IntakeFacts6_1 = {
  incident_date: 'March 12, 2026',
  incident_time: '1400',
  officer_rank: 'Officer',
  officer_name: 'T. Davis',
  officer_post: 'housing officer',
  dorm_area: 'E Dorm',
  officer_activity: 'conducting the master roster count',
  incident_location: 'cell E3107',
  inmate_last_name: 'Smith',
  inmate_first_name: 'John',
  dc_number: 'A12345',
  narrative_reference_style: 'he/him',
  inmate_behavior_before_order: 'standing at the cell door outside of his assigned cell',
  order_type: 'verbal',
  exact_order: 'return to his assigned cell',
  total_orders_given: 3,
  acknowledgment_type: 'eye_contact_and_verbal_response',
  inmate_quote: "No, I ain't doing that.",
  inmate_said_nothing: false,
  inmate_tone: 'loud and argumentative',
  physical_behavior: 'crossed his arms and remained positioned at the cell door',
  operational_impact: 'temporarily interrupting the master roster count and drawing the attention of surrounding inmates',
  ability_to_comply: 'no_issue',
  ability_to_comply_explanation: null,
  force_used: 'no',
  force_explanation: null,
  uof_documentation_status: 'not_applicable',
  confinement_status: 'placed',
  oic_rank: 'Captain',
  oic_last_name: 'Brown',
  oic_authorized_confirmed: true,
  witness_staff: null,
  camera_coverage: null,
  additional_facts: null,
  separate_conduct_described: false,
  separate_conduct_isolatable: null,
  request_to_invent: false,
};

const CASE_LIVE_02_YELLOW_APPROXIMATE_QUOTE: IntakeFacts6_1 = {
  incident_date: 'March 12, 2026',
  incident_time: '1400',
  officer_rank: 'Officer',
  officer_name: 'T. Davis',
  officer_post: 'housing officer',
  dorm_area: 'E Dorm',
  officer_activity: 'conducting the master roster count',
  incident_location: 'cell E3107',
  inmate_last_name: 'Smith',
  inmate_first_name: 'John',
  dc_number: 'A12345',
  narrative_reference_style: 'he/him',
  inmate_behavior_before_order: 'standing at the cell door outside of his assigned cell',
  order_type: 'verbal',
  exact_order: 'return to his assigned cell',
  total_orders_given: 3,
  acknowledgment_type: 'eye_contact_and_verbal_response',
  // Summary phrasing — triggers quote_is_summary YELLOW warning
  inmate_quote: 'He said he was not going back to his cell.',
  inmate_said_nothing: false,
  inmate_tone: 'loud and argumentative',
  physical_behavior: 'crossed his arms and remained positioned at the cell door',
  operational_impact: 'temporarily interrupting the master roster count and drawing the attention of surrounding inmates',
  ability_to_comply: 'no_issue',
  ability_to_comply_explanation: null,
  force_used: 'no',
  force_explanation: null,
  uof_documentation_status: 'not_applicable',
  confinement_status: 'placed',
  oic_rank: 'Captain',
  oic_last_name: 'Brown',
  oic_authorized_confirmed: true,
  witness_staff: null,
  camera_coverage: null,
  additional_facts: null,
  separate_conduct_described: false,
  separate_conduct_isolatable: null,
  request_to_invent: false,
};

const CASE_LIVE_03_RED_MISSING_REQUIRED_FACT: IntakeFacts6_1 = {
  incident_date: 'March 12, 2026',
  incident_time: '1400',
  officer_rank: 'Officer',
  officer_name: 'T. Davis',
  officer_post: 'housing officer',
  dorm_area: 'E Dorm',
  officer_activity: 'conducting the master roster count',
  incident_location: 'cell E3107',
  inmate_last_name: 'Smith',
  inmate_first_name: 'John',
  // DC number missing — officer forgot to look it up — triggers missing_dc_number RED
  dc_number: null,
  narrative_reference_style: 'he/him',
  inmate_behavior_before_order: 'standing at the cell door outside of his assigned cell',
  order_type: 'verbal',
  exact_order: 'return to his assigned cell',
  total_orders_given: 3,
  acknowledgment_type: 'eye_contact_and_verbal_response',
  inmate_quote: "No, I ain't doing that.",
  inmate_said_nothing: false,
  inmate_tone: 'loud and argumentative',
  physical_behavior: 'crossed his arms and remained positioned at the cell door',
  operational_impact: 'temporarily interrupting the master roster count and drawing the attention of surrounding inmates',
  ability_to_comply: 'no_issue',
  ability_to_comply_explanation: null,
  force_used: 'no',
  force_explanation: null,
  uof_documentation_status: 'not_applicable',
  confinement_status: 'placed',
  oic_rank: 'Captain',
  oic_last_name: 'Brown',
  oic_authorized_confirmed: true,
  witness_staff: null,
  camera_coverage: null,
  additional_facts: null,
  separate_conduct_described: false,
  separate_conduct_isolatable: null,
  request_to_invent: false,
};

const CASE_LIVE_04_OIC_NOT_CONFIRMED: IntakeFacts6_1 = {
  ...CASE_LIVE_01_GREEN_DIRECT_REFUSAL,
  // Officer named an OIC but never checked the authorization confirmation box —
  // triggers missing_oic_authorization_confirmation RED, same free-gate pattern as
  // CASE_LIVE_03's missing_dc_number (evaluated before any Claude call).
  oic_authorized_confirmed: false,
};

const CASE_LIVE_05_QUOTE_OVERRIDE_ONLY: IntakeFacts6_1 = {
  ...CASE_LIVE_01_GREEN_DIRECT_REFUSAL,
  // Phrasing the isQuoteSummary regex does NOT recognize as third-person paraphrase —
  // reads plausibly as exact words. Only the officer's own quote_is_summary attestation
  // should force YELLOW here; the regex alone would let this through as GREEN.
  inmate_quote: "Ain't happening, not today, not ever",
  quote_is_summary: true,
};

const CASE_LIVE_06_WITNESS_CAMERA: IntakeFacts6_1 = {
  ...CASE_LIVE_01_GREEN_DIRECT_REFUSAL,
  // 2026-07-02 correction: witness/camera narrative templating was reverted — confirmed
  // against real written DRs that this information does not appear in the statement of
  // facts. This case now proves the negative: both facts are still sent to Claude in the
  // fact list (formatCleanedFacts), but the narrative must not contain either one.
  witness_staff: 'Sergeant Johnson',
  camera_coverage: 'view of camera E3-12',
};

// ---------------------------------------------------------------------------
// Counting wrapper — wraps a real client, counts calls for verification
// ---------------------------------------------------------------------------

function makeCountingClient(realClient: ClaudeJsonClient): {
  client: ClaudeJsonClient;
  getCallCount: () => number;
} {
  let calls = 0;
  return {
    client: {
      async completeJson(parts: ClaudePromptParts): Promise<string> {
        calls++;
        return realClient.completeJson(parts);
      },
    },
    getCallCount: () => calls,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CheckResult = { label: string; pass: boolean; note?: string };

function check(label: string, pass: boolean, note?: string): CheckResult {
  return { label, pass, note };
}

function countParagraphs(narrative: string): number {
  return narrative.split(/\n\n+/).filter(p => p.trim().length > 0).length;
}

// ---------------------------------------------------------------------------
// Case definitions
// ---------------------------------------------------------------------------

interface CaseResult {
  name: string;
  expectedStatus: string;
  actualStatus: string;
  allPassed: boolean;
  checks: CheckResult[];
  claudeCalls: number;
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DIVIDER = '═'.repeat(72);
const SECTION  = '─'.repeat(72);

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('');
    console.error('  ERROR: ANTHROPIC_API_KEY is not set.');
    console.error('');
    console.error('  Set it in PowerShell before running this script:');
    console.error('    $env:ANTHROPIC_API_KEY = "your-key-here"');
    console.error('');
    console.error('  Optionally set the model:');
    console.error(`    $env:CLAUDE_MODEL = "${DEFAULT_CLAUDE_MODEL}"`);
    console.error('');
    console.error('  Then run:');
    console.error('    npm run test:6-1:live-fake-cases');
    console.error('');
    process.exitCode = 1;
    return;
  }

  const model = process.env.CLAUDE_MODEL ?? DEFAULT_CLAUDE_MODEL;
  const debugRaw = process.env.DEBUG_CLAUDE_RAW === 'true';

  console.log('');
  console.log(DIVIDER);
  console.log('  LOCKUPHQ DR Writer — Charge 6-1 Live Fake Officer Cases');
  console.log('  Step 4E | Synthetic data only | No real inmate/officer info');
  console.log(`  Model: ${model}`);
  console.log(DIVIDER);

  const realClient = createClaudeClient();
  const caseResults: CaseResult[] = [];

  // ─── CASE 1: GREEN — direct exact-quote refusal ─────────────────────────

  {
    const caseName = 'CASE_LIVE_01_GREEN_DIRECT_REFUSAL';
    console.log('');
    console.log(SECTION);
    console.log(`  ${caseName}`);
    console.log(`  Expected: GREEN`);
    console.log(SECTION);
    console.log('');

    const { client: countingClient, getCallCount } = makeCountingClient(realClient);
    let output;
    const startMs = Date.now();
    let fatalError: string | null = null;

    try {
      output = await generate6_1(CASE_LIVE_01_GREEN_DIRECT_REFUSAL, countingClient);
    } catch (err) {
      fatalError = err instanceof Generate6_1Error || err instanceof ClaudeClientError
        ? `${(err as Error).name}: ${(err as Error).message}`
        : `Unexpected error: ${err}`;
    }
    const elapsedMs = Date.now() - startMs;
    const claudeCalls = getCallCount();

    let checks: CheckResult[];
    let actualStatus: string;

    if (fatalError) {
      actualStatus = 'ERROR';
      checks = [check(`No fatal error`, false, fatalError)];
    } else {
      const narrative = output!.narrative ?? '';
      const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;
      actualStatus = output!.status;

      if (debugRaw) {
        console.log('  DEBUG: RAW NARRATIVE');
        console.log(narrative);
        console.log('');
      }

      checks = [
        check('status === "GREEN"', output!.status === 'GREEN'),
        check('charge === "6-1"', output!.charge === '6-1'),
        check('schema_version === "1.1"', output!.schema_version === '1.1'),
        check('red_blockers is []', output!.red_blockers.length === 0, output!.red_blockers.length > 0 ? `${output!.red_blockers.length} blocker(s)` : undefined),
        check('yellow_warnings is []', output!.yellow_warnings.length === 0, output!.yellow_warnings.length > 0 ? `${output!.yellow_warnings.length} warning(s)` : undefined),
        check('flagged_sections is []', output!.flagged_sections.length === 0),
        check('narrative exists', narrative.trim().length > 0),
        check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
        check('narrative does NOT include "[REVIEW"', !narrative.includes('[REVIEW')),
        check('narrative includes "three verbal orders"', narrative.includes('three verbal orders')),
        check('narrative includes inmate quote (ain\'t doing that)', narrative.includes("ain") && narrative.includes("doing that")),
        check('Claude called exactly once', claudeCalls === 1, `got ${claudeCalls}`),
      ];
    }

    const allPassed = checks.every(c => c.pass);
    for (const c of checks) {
      const icon = c.pass ? 'PASS' : 'FAIL';
      const note = c.note ? ` — ${c.note}` : '';
      console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
    }
    console.log('');
    console.log(`  Elapsed: ${elapsedMs}ms | Claude calls: ${claudeCalls} | Actual: ${actualStatus}`);
    console.log(`  Case result: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.pass).length}/${checks.length})`);

    caseResults.push({ name: caseName, expectedStatus: 'GREEN', actualStatus, allPassed, checks, claudeCalls, elapsedMs });
  }

  // ─── CASE 2: YELLOW — approximate/summary quote ──────────────────────────

  {
    const caseName = 'CASE_LIVE_02_YELLOW_APPROXIMATE_QUOTE';
    console.log('');
    console.log(SECTION);
    console.log(`  ${caseName}`);
    console.log(`  Expected: YELLOW`);
    console.log(SECTION);
    console.log('');

    const { client: countingClient, getCallCount } = makeCountingClient(realClient);
    let output;
    const startMs = Date.now();
    let fatalError: string | null = null;

    try {
      output = await generate6_1(CASE_LIVE_02_YELLOW_APPROXIMATE_QUOTE, countingClient);
    } catch (err) {
      fatalError = err instanceof Generate6_1Error || err instanceof ClaudeClientError
        ? `${(err as Error).name}: ${(err as Error).message}`
        : `Unexpected error: ${err}`;
    }
    const elapsedMs = Date.now() - startMs;
    const claudeCalls = getCallCount();

    // Case 2 summary text variants to check against
    const SUMMARY_LOWER = "he said he was not going back to his cell";
    const SUMMARY_UPPER = "He said he was not going back to his cell";

    let checks: CheckResult[];
    let actualStatus: string;

    if (fatalError) {
      actualStatus = 'ERROR';
      checks = [check('No fatal error', false, fatalError)];
    } else {
      const narrative = output!.narrative ?? '';
      const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;
      actualStatus = output!.status;

      if (debugRaw) {
        console.log('  DEBUG: RAW NARRATIVE');
        console.log(narrative);
        console.log('');
      }

      checks = [
        check('status === "YELLOW"', output!.status === 'YELLOW'),
        check('charge === "6-1"', output!.charge === '6-1'),
        check('schema_version === "1.1"', output!.schema_version === '1.1'),
        check('red_blockers is []', output!.red_blockers.length === 0, output!.red_blockers.length > 0 ? `${output!.red_blockers.length} blocker(s)` : undefined),
        check('yellow_warnings length >= 1', output!.yellow_warnings.length >= 1, output!.yellow_warnings.length === 0 ? 'no warnings' : undefined),
        check('flagged_sections is non-empty', output!.flagged_sections.length > 0, `flagged_sections: [${output!.flagged_sections.join(', ')}]`),
        check('narrative exists', narrative.trim().length > 0),
        check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
        check('narrative includes "[REVIEW — quote is a summary]"', narrative.includes('[REVIEW — quote is a summary]')),
        check('narrative includes "verbally responded in substance"', narrative.includes('verbally responded in substance')),
        check('narrative does NOT quote summary text (lowercase)', !narrative.includes(`"${SUMMARY_LOWER}"`)),
        check('narrative does NOT quote summary text (capitalized)', !narrative.includes(`"${SUMMARY_UPPER}"`)),
        check('Claude called exactly once', claudeCalls === 1, `got ${claudeCalls}`),
      ];
    }

    const allPassed = checks.every(c => c.pass);
    for (const c of checks) {
      const icon = c.pass ? 'PASS' : 'FAIL';
      const note = c.note ? ` — ${c.note}` : '';
      console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
    }
    console.log('');
    console.log(`  Elapsed: ${elapsedMs}ms | Claude calls: ${claudeCalls} | Actual: ${actualStatus}`);
    console.log(`  Case result: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.pass).length}/${checks.length})`);

    caseResults.push({ name: caseName, expectedStatus: 'YELLOW', actualStatus, allPassed, checks, claudeCalls, elapsedMs });
  }

  // ─── CASE 3: RED — missing DC number, Claude must not be called ──────────

  {
    const caseName = 'CASE_LIVE_03_RED_MISSING_REQUIRED_FACT';
    console.log('');
    console.log(SECTION);
    console.log(`  ${caseName}`);
    console.log(`  Expected: RED (no Claude call — no API spend)`);
    console.log(SECTION);
    console.log('');

    const { client: countingClient, getCallCount } = makeCountingClient(realClient);
    let output;
    const startMs = Date.now();
    let fatalError: string | null = null;

    try {
      output = await generate6_1(CASE_LIVE_03_RED_MISSING_REQUIRED_FACT, countingClient);
    } catch (err) {
      fatalError = err instanceof Generate6_1Error || err instanceof ClaudeClientError
        ? `${(err as Error).name}: ${(err as Error).message}`
        : `Unexpected error: ${err}`;
    }
    const elapsedMs = Date.now() - startMs;
    const claudeCalls = getCallCount();

    let checks: CheckResult[];
    let actualStatus: string;

    if (fatalError) {
      actualStatus = 'ERROR';
      checks = [check('No fatal error', false, fatalError)];
    } else {
      actualStatus = output!.status;

      checks = [
        check('status === "RED"', output!.status === 'RED'),
        check('charge === "6-1"', output!.charge === '6-1'),
        check('schema_version === "1.1"', output!.schema_version === '1.1'),
        check('narrative is null', output!.narrative === null),
        check('cleaned_facts is null', output!.cleaned_facts === null),
        check('red_blockers length >= 1', output!.red_blockers.length >= 1, output!.red_blockers.length === 0 ? 'no blockers' : undefined),
        check('red_blockers contains missing_dc_number', output!.red_blockers.some(b => b.id === 'missing_dc_number')),
        check('yellow_warnings is []', output!.yellow_warnings.length === 0),
        check('Claude NOT called (zero API spend)', claudeCalls === 0, claudeCalls > 0 ? `called ${claudeCalls} time(s)` : undefined),
      ];
    }

    const allPassed = checks.every(c => c.pass);
    for (const c of checks) {
      const icon = c.pass ? 'PASS' : 'FAIL';
      const note = c.note ? ` — ${c.note}` : '';
      console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
    }
    console.log('');
    console.log(`  Elapsed: ${elapsedMs}ms | Claude calls: ${claudeCalls} | Actual: ${actualStatus}`);
    console.log(`  Case result: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.pass).length}/${checks.length})`);

    caseResults.push({ name: caseName, expectedStatus: 'RED', actualStatus, allPassed, checks, claudeCalls, elapsedMs });
  }

  // ─── CASE 4: RED — OIC authorization checkbox unchecked, Claude must not be called ─

  {
    const caseName = 'CASE_LIVE_04_OIC_NOT_CONFIRMED';
    console.log('');
    console.log(SECTION);
    console.log(`  ${caseName}`);
    console.log(`  Expected: RED (no Claude call — no API spend)`);
    console.log(SECTION);
    console.log('');

    const { client: countingClient, getCallCount } = makeCountingClient(realClient);
    let output;
    const startMs = Date.now();
    let fatalError: string | null = null;

    try {
      output = await generate6_1(CASE_LIVE_04_OIC_NOT_CONFIRMED, countingClient);
    } catch (err) {
      fatalError = err instanceof Generate6_1Error || err instanceof ClaudeClientError
        ? `${(err as Error).name}: ${(err as Error).message}`
        : `Unexpected error: ${err}`;
    }
    const elapsedMs = Date.now() - startMs;
    const claudeCalls = getCallCount();

    let checks: CheckResult[];
    let actualStatus: string;

    if (fatalError) {
      actualStatus = 'ERROR';
      checks = [check('No fatal error', false, fatalError)];
    } else {
      actualStatus = output!.status;

      checks = [
        check('status === "RED"', output!.status === 'RED'),
        check('narrative is null', output!.narrative === null),
        check('cleaned_facts is null', output!.cleaned_facts === null),
        check('red_blockers contains missing_oic_authorization_confirmation', output!.red_blockers.some(b => b.id === 'missing_oic_authorization_confirmation')),
        check('red_blockers does NOT contain missing_oic_rank/missing_oic_last_name', !output!.red_blockers.some(b => b.id === 'missing_oic_rank' || b.id === 'missing_oic_last_name'), 'both were provided — only the confirmation is missing'),
        check('Claude NOT called (zero API spend)', claudeCalls === 0, claudeCalls > 0 ? `called ${claudeCalls} time(s)` : undefined),
      ];
    }

    const allPassed = checks.every(c => c.pass);
    for (const c of checks) {
      const icon = c.pass ? 'PASS' : 'FAIL';
      const note = c.note ? ` — ${c.note}` : '';
      console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
    }
    console.log('');
    console.log(`  Elapsed: ${elapsedMs}ms | Claude calls: ${claudeCalls} | Actual: ${actualStatus}`);
    console.log(`  Case result: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.pass).length}/${checks.length})`);

    caseResults.push({ name: caseName, expectedStatus: 'RED', actualStatus, allPassed, checks, claudeCalls, elapsedMs });
  }

  // ─── CASE 5: YELLOW — quote_is_summary checkbox forces the flag on a quote the regex alone would miss ─

  {
    const caseName = 'CASE_LIVE_05_QUOTE_OVERRIDE_ONLY';
    console.log('');
    console.log(SECTION);
    console.log(`  ${caseName}`);
    console.log(`  Expected: YELLOW (checkbox-forced — regex would not catch this phrasing)`);
    console.log(SECTION);
    console.log('');

    const { client: countingClient, getCallCount } = makeCountingClient(realClient);
    let output;
    const startMs = Date.now();
    let fatalError: string | null = null;

    try {
      output = await generate6_1(CASE_LIVE_05_QUOTE_OVERRIDE_ONLY, countingClient);
    } catch (err) {
      fatalError = err instanceof Generate6_1Error || err instanceof ClaudeClientError
        ? `${(err as Error).name}: ${(err as Error).message}`
        : `Unexpected error: ${err}`;
    }
    const elapsedMs = Date.now() - startMs;
    const claudeCalls = getCallCount();

    let checks: CheckResult[];
    let actualStatus: string;

    if (fatalError) {
      actualStatus = 'ERROR';
      checks = [check('No fatal error', false, fatalError)];
    } else {
      const narrative = output!.narrative ?? '';
      const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;
      actualStatus = output!.status;

      if (debugRaw) {
        console.log('  DEBUG: RAW NARRATIVE');
        console.log(narrative);
        console.log('');
      }

      checks = [
        check('status === "YELLOW"', output!.status === 'YELLOW'),
        check('yellow_warnings contains quote_is_summary', output!.yellow_warnings.length >= 1),
        check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
        check('narrative includes "[REVIEW — quote is a summary]"', narrative.includes('[REVIEW — quote is a summary]')),
        check('narrative includes "verbally responded in substance"', narrative.includes('verbally responded in substance')),
        check('narrative does NOT quote the phrase verbatim in quotation marks', !narrative.includes('"Ain\'t happening')),
        check('Claude called exactly once', claudeCalls === 1, `got ${claudeCalls}`),
      ];
    }

    const allPassed = checks.every(c => c.pass);
    for (const c of checks) {
      const icon = c.pass ? 'PASS' : 'FAIL';
      const note = c.note ? ` — ${c.note}` : '';
      console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
    }
    console.log('');
    console.log(`  Elapsed: ${elapsedMs}ms | Claude calls: ${claudeCalls} | Actual: ${actualStatus}`);
    console.log(`  Case result: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.pass).length}/${checks.length})`);

    caseResults.push({ name: caseName, expectedStatus: 'YELLOW', actualStatus, allPassed, checks, claudeCalls, elapsedMs });
  }

  // ─── CASE 6: GREEN — witness + camera present but must NOT appear in the narrative ─

  {
    const caseName = 'CASE_LIVE_06_WITNESS_CAMERA';
    console.log('');
    console.log(SECTION);
    console.log(`  ${caseName}`);
    console.log(`  Expected: GREEN — witness/camera facts must NOT leak into the narrative (reverted 2026-07-02)`);
    console.log(SECTION);
    console.log('');

    const { client: countingClient, getCallCount } = makeCountingClient(realClient);
    let output;
    const startMs = Date.now();
    let fatalError: string | null = null;

    try {
      output = await generate6_1(CASE_LIVE_06_WITNESS_CAMERA, countingClient);
    } catch (err) {
      fatalError = err instanceof Generate6_1Error || err instanceof ClaudeClientError
        ? `${(err as Error).name}: ${(err as Error).message}`
        : `Unexpected error: ${err}`;
    }
    const elapsedMs = Date.now() - startMs;
    const claudeCalls = getCallCount();

    let checks: CheckResult[];
    let actualStatus: string;

    if (fatalError) {
      actualStatus = 'ERROR';
      checks = [check('No fatal error', false, fatalError)];
    } else {
      const narrative = output!.narrative ?? '';
      const paragraphCount = narrative.trim().length > 0 ? countParagraphs(narrative) : 0;
      actualStatus = output!.status;

      if (debugRaw) {
        console.log('  DEBUG: RAW NARRATIVE');
        console.log(narrative);
        console.log('');
      }

      checks = [
        check('status === "GREEN"', output!.status === 'GREEN'),
        check('narrative is a single continuous paragraph', paragraphCount === 1, `got ${paragraphCount}`),
        check('narrative does NOT include "[REVIEW"', !narrative.includes('[REVIEW')),
        check('narrative does NOT include witness name "Sergeant Johnson"', !narrative.includes('Sergeant Johnson'), 'witness/camera are gate-only inputs, never narrative content'),
        check('narrative does NOT include camera reference "E3-12"', !narrative.includes('E3-12'), 'witness/camera are gate-only inputs, never narrative content'),
        check('Claude called exactly once', claudeCalls === 1, `got ${claudeCalls}`),
      ];
    }

    const allPassed = checks.every(c => c.pass);
    for (const c of checks) {
      const icon = c.pass ? 'PASS' : 'FAIL';
      const note = c.note ? ` — ${c.note}` : '';
      console.log(`    ${icon.padEnd(4)}  ${c.label}${note}`);
    }
    console.log('');
    console.log(`  Elapsed: ${elapsedMs}ms | Claude calls: ${claudeCalls} | Actual: ${actualStatus}`);
    console.log(`  Case result: ${allPassed ? 'PASS' : 'FAIL'} (${checks.filter(c => c.pass).length}/${checks.length})`);

    caseResults.push({ name: caseName, expectedStatus: 'GREEN', actualStatus, allPassed, checks, claudeCalls, elapsedMs });
  }

  // ─── Overall summary ──────────────────────────────────────────────────────

  const totalChecks = caseResults.reduce((sum, r) => sum + r.checks.length, 0);
  const totalPassed = caseResults.reduce((sum, r) => sum + r.checks.filter(c => c.pass).length, 0);
  const overallPass = caseResults.every(r => r.allPassed);

  console.log('');
  console.log(DIVIDER);
  console.log('  OVERALL RESULTS');
  console.log(DIVIDER);
  console.log('');
  for (const r of caseResults) {
    const icon = r.allPassed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.claudeCalls} Claude call${r.claudeCalls === 1 ? '' : 's'}, ${r.elapsedMs}ms)`);
  }
  console.log('');
  console.log(`  Model:   ${model}`);
  console.log(`  Checks:  ${totalPassed}/${totalChecks} passed across all cases`);
  console.log('');
  console.log(`  Overall: ${overallPass ? 'PASS' : 'FAIL'}`);
  console.log(DIVIDER);
  console.log('');

  if (!overallPass) {
    process.exitCode = 1;
  }
}

await main();
