// LOCKUPHQ DR Writer — Charge 6-1 UI Server Tests (Validate + Generate + 5F HTML)
// Step 5D: Tests handleValidate, handleGenerate, and handleRequest directly.
//          No real server startup. No network. No Claude API calls.
// Step 5F: SF01-SF02 verify HTML includes export button and toast element.
//
// TS01–TS08 = Step 5C validate tests (unchanged)
// TG01–TG08 = Step 5D generate tests
// SF01–SF02 = Step 5F HTML element checks
//
// Usage: node --experimental-strip-types src/dr-writer/server/testDevServer6_1.ts

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleValidate, handleGenerate, handleRequest } from './devServer6_1.ts';
import type { IntakeFacts6_1 } from '../charges/6-1/types.ts';
import type { ClaudeJsonClient, ClaudePromptParts } from '../llm/claudeTypes.ts'; // src/dr-writer/llm/claudeTypes.ts
import { ClaudeClientError } from '../llm/claudeClient.ts';

// ---------------------------------------------------------------------------
// Fake intake data (reuses dev-inputs for consistency with other test suites)
// ---------------------------------------------------------------------------

function loadIntake(relativePath: string): IntakeFacts6_1 {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf-8')) as IntakeFacts6_1;
}

const GREEN_INTAKE = loadIntake('dev-inputs/6-1/fake-green-direct-refusal.json');
const YELLOW_INTAKE = loadIntake('dev-inputs/6-1/fake-yellow-quote-summary.json');
const RED_INTAKE = loadIntake('dev-inputs/6-1/fake-red-missing-dc.json');

async function withPublicDemoMode<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  const saved = process.env.LOCKUPHQ_PUBLIC_DEMO_MODE;
  if (enabled) {
    process.env.LOCKUPHQ_PUBLIC_DEMO_MODE = 'true';
  } else {
    delete process.env.LOCKUPHQ_PUBLIC_DEMO_MODE;
  }
  try {
    return await fn();
  } finally {
    if (saved === undefined) {
      delete process.env.LOCKUPHQ_PUBLIC_DEMO_MODE;
    } else {
      process.env.LOCKUPHQ_PUBLIC_DEMO_MODE = saved;
    }
  }
}

// handleGenerate's live-mode guard checks process.env.ANTHROPIC_API_KEY regardless of whether a
// clientOverride is supplied — so EH-series failure-mode tests need a (dummy, unused) key present
// to get past the guard and actually exercise the injected client. The override never calls the
// real API, so the value doesn't need to be a real key.
async function withFakeApiKey<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'REPLACE_WITH_ROTATED_KEY_VIA_REPLIT_SECRETS';
  try {
    return await fn();
  } finally {
    if (saved === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = saved;
    }
  }
}

// ---------------------------------------------------------------------------
// Mock helpers for handleRequest (no network, no server startup)
// ---------------------------------------------------------------------------

function makeMockReq(method: string, url: string, body?: string): IncomingMessage {
  const chunks = body != null ? [body] : [];
  const stream = Readable.from(chunks);
  (stream as Record<string, unknown>).method = method;
  (stream as Record<string, unknown>).url = url;
  return stream as unknown as IncomingMessage;
}

interface CapturedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function makeMockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 200, headers: {}, body: '' };
  const res = {
    setHeader(name: string, value: string | string[]) {
      captured.headers[String(name)] = Array.isArray(value) ? value.join(', ') : String(value);
    },
    writeHead(code: number, hdrs?: Record<string, string | string[]>) {
      captured.statusCode = code;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          captured.headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
        }
      }
    },
    end(data?: string) {
      if (data != null) captured.body = data;
    },
    headersSent: false,
  };
  return { res: res as unknown as ServerResponse, captured };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

interface ServerTest {
  test_id: string;
  name: string;
  check: () => Promise<{ pass: boolean; notes: string[] }>;
}

const tests: ServerTest[] = [

  // ─── TS: handleValidate — core evaluation (no HTTP, no server) ───────────

  {
    test_id: 'TS01',
    name: 'handleValidate: GREEN intake → ok: true, status GREEN, 0 blockers, cleaned_facts not null',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = handleValidate(GREEN_INTAKE);
      if (!outcome.ok) {
        notes.push(`Expected ok: true, got error: ${(outcome as { ok: false; error: string }).error}`);
        pass = false; return { pass, notes };
      }
      if (outcome.result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${outcome.result.status}`); pass = false; }
      if (outcome.result.red_blockers.length !== 0) { notes.push(`Expected 0 blockers, got ${outcome.result.red_blockers.length}`); pass = false; }
      if (outcome.result.yellow_warnings.length !== 0) { notes.push(`Expected 0 warnings, got ${outcome.result.yellow_warnings.length}`); pass = false; }
      if (outcome.result.cleaned_facts === null) { notes.push('cleaned_facts should not be null for GREEN'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS02',
    name: 'handleValidate: YELLOW (quote summary) → ok: true, status YELLOW, quote_is_summary warning present',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = handleValidate(YELLOW_INTAKE);
      if (!outcome.ok) {
        notes.push(`Expected ok: true`); pass = false; return { pass, notes };
      }
      if (outcome.result.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${outcome.result.status}`); pass = false; }
      if (outcome.result.yellow_warnings.length === 0) { notes.push('Expected at least one yellow warning'); pass = false; }
      const hasQuoteWarning = outcome.result.yellow_warnings.some(w => w.id === 'quote_is_summary');
      if (!hasQuoteWarning) { notes.push('Expected quote_is_summary warning in yellow_warnings'); pass = false; }
      if (outcome.result.cleaned_facts === null) { notes.push('cleaned_facts should not be null for YELLOW'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS03',
    name: 'handleValidate: RED (missing DC) → ok: true, status RED, missing_dc_number blocker, cleaned_facts null',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = handleValidate(RED_INTAKE);
      if (!outcome.ok) {
        notes.push(`Expected ok: true`); pass = false; return { pass, notes };
      }
      if (outcome.result.status !== 'RED') { notes.push(`Expected RED, got ${outcome.result.status}`); pass = false; }
      if (outcome.result.red_blockers.length === 0) { notes.push('Expected at least one red blocker'); pass = false; }
      const hasDcBlocker = outcome.result.red_blockers.some(b => b.id === 'missing_dc_number');
      if (!hasDcBlocker) { notes.push('Expected missing_dc_number blocker in red_blockers'); pass = false; }
      if (outcome.result.cleaned_facts !== null) { notes.push('cleaned_facts must be null for RED'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS04',
    name: 'handleRequest: POST /validate with invalid JSON → 400, response contains error field',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const req = makeMockReq('POST', '/api/dr-writer/6-1/validate', 'not valid json {{{');
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 400) { notes.push(`Expected 400, got ${captured.statusCode}`); pass = false; }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(captured.body);
      } catch {
        notes.push(`Response body is not valid JSON: ${captured.body}`); pass = false; return { pass, notes };
      }
      if (!body['error']) { notes.push('Expected error field in 400 response body'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS05',
    name: 'handleRequest: GET / → 200, Content-Type text/html, body contains LOCKUPHQ',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const req = makeMockReq('GET', '/');
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 200) { notes.push(`Expected 200, got ${captured.statusCode}`); pass = false; }
      const ct = captured.headers['Content-Type'] ?? '';
      if (!ct.includes('text/html')) { notes.push(`Expected Content-Type text/html, got "${ct}"`); pass = false; }
      if (!captured.body.includes('LOCKUPHQ')) { notes.push('Response body should contain "LOCKUPHQ"'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS06',
    name: 'handleRequest: GET /charge-6-1-static-form.css → 200, Content-Type text/css, body contains :root',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const req = makeMockReq('GET', '/charge-6-1-static-form.css');
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 200) { notes.push(`Expected 200, got ${captured.statusCode}`); pass = false; }
      const ct = captured.headers['Content-Type'] ?? '';
      if (!ct.includes('text/css')) { notes.push(`Expected Content-Type text/css, got "${ct}"`); pass = false; }
      if (!captured.body.includes(':root')) { notes.push('CSS body should contain :root selector'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS07',
    name: 'handleRequest: GET /api/dr-writer/6-1/generate → 404 (only POST is supported for generate)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const req = makeMockReq('GET', '/api/dr-writer/6-1/generate');
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 404) {
        notes.push(`Expected 404 for GET /generate, got ${captured.statusCode}`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'TS08',
    name: 'handleValidate result shape: no narrative or ai_disclosure — evaluate6_1 only, never generate6_1',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = handleValidate(GREEN_INTAKE);
      if (!outcome.ok) { notes.push('Expected ok: true'); pass = false; return { pass, notes }; }
      const result = outcome.result as unknown as Record<string, unknown>;
      if ('narrative' in result) {
        notes.push('FAIL: result contains "narrative" — generate6_1 must not have been called');
        pass = false;
      }
      if ('ai_disclosure' in result) {
        notes.push('FAIL: result contains "ai_disclosure" — generate6_1 must not have been called');
        pass = false;
      }
      if ('schema_version' in result) {
        notes.push('FAIL: result contains "schema_version" — that is an OutputSchema6_1 field');
        pass = false;
      }
      if (!('status' in result)) { notes.push('Missing status field'); pass = false; }
      if (!('red_blockers' in result)) { notes.push('Missing red_blockers field'); pass = false; }
      if (!('yellow_warnings' in result)) { notes.push('Missing yellow_warnings field'); pass = false; }
      if (!('cleaned_facts' in result)) { notes.push('Missing cleaned_facts field'); pass = false; }
      return { pass, notes };
    },
  },

  // ─── TG: handleGenerate — generate endpoint tests ─────────────────────────

  {
    test_id: 'TG01',
    name: 'handleGenerate: mock GREEN → ok: true, status GREEN, narrative not null, no blockers',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) {
        notes.push(`Expected ok: true, got error: ${(outcome as { ok: false; error: string }).error}`);
        pass = false; return { pass, notes };
      }
      const r = outcome.result;
      if (r.status !== 'GREEN') { notes.push(`Expected GREEN, got ${r.status}`); pass = false; }
      if (r.narrative === null || r.narrative.trim().length === 0) { notes.push('narrative must not be null for GREEN'); pass = false; }
      if (r.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${r.red_blockers.length}`); pass = false; }
      if (r.yellow_warnings.length !== 0) { notes.push(`Expected 0 yellow_warnings for GREEN, got ${r.yellow_warnings.length}`); pass = false; }
      if (r.flagged_sections.length !== 0) { notes.push(`Expected 0 flagged_sections for GREEN, got ${r.flagged_sections.length}`); pass = false; }
      if (!r.ai_disclosure || r.ai_disclosure.trim().length === 0) { notes.push('ai_disclosure must be present'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG02',
    name: 'handleGenerate: mock YELLOW → ok: true, status YELLOW, narrative contains [REVIEW], warnings present',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: YELLOW_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) {
        notes.push(`Expected ok: true, got error: ${(outcome as { ok: false; error: string }).error}`);
        pass = false; return { pass, notes };
      }
      const r = outcome.result;
      if (r.status !== 'YELLOW') { notes.push(`Expected YELLOW, got ${r.status}`); pass = false; }
      if (r.narrative === null || r.narrative.trim().length === 0) { notes.push('narrative must not be null for YELLOW'); pass = false; }
      if (!r.narrative!.includes('[REVIEW')) { notes.push('YELLOW narrative must contain at least one [REVIEW] flag'); pass = false; }
      if (r.yellow_warnings.length === 0) { notes.push('Expected at least one yellow_warning'); pass = false; }
      if (r.flagged_sections.length === 0) { notes.push('Expected at least one flagged_section'); pass = false; }
      if (r.red_blockers.length !== 0) { notes.push(`Expected 0 red_blockers, got ${r.red_blockers.length}`); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG03',
    name: 'handleGenerate: RED input → status RED, narrative null, injected bomb client never called',
    async check() {
      const notes: string[] = [];
      let pass = true;

      // Bomb client proves the client is never reached for RED
      let bombCalled = false;
      const bombClient: ClaudeJsonClient = {
        async completeJson() {
          bombCalled = true;
          throw new Error('BOMB: mock client must not be called for RED input');
        },
      };

      const outcome = await handleGenerate(
        { intake: RED_INTAKE, mode: 'mock', confirmLive: false },
        bombClient
      );

      if (bombCalled) {
        notes.push('FAIL: mock client was called despite RED input — must short-circuit before any client call');
        pass = false;
      }
      if (!outcome.ok) {
        notes.push(`Expected ok: true even for RED, got error: ${(outcome as { ok: false; error: string }).error}`);
        pass = false; return { pass, notes };
      }
      const r = outcome.result;
      if (r.status !== 'RED') { notes.push(`Expected RED, got ${r.status}`); pass = false; }
      if (r.narrative !== null) { notes.push(`narrative must be null for RED, got: "${r.narrative}"`); pass = false; }
      if (r.red_blockers.length === 0) { notes.push('Expected at least one red_blocker'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG04',
    name: 'handleGenerate: live mode without confirmLive → controlled 400 error, no Claude call',
    async check() {
      const notes: string[] = [];
      let pass = true;

      let clientCalled = false;
      const spyClient: ClaudeJsonClient = {
        async completeJson() {
          clientCalled = true;
          return '{}';
        },
      };

      const outcome = await handleGenerate(
        { intake: GREEN_INTAKE, mode: 'live', confirmLive: false },
        spyClient
      );

      if (clientCalled) {
        notes.push('FAIL: client was called despite missing confirmLive');
        pass = false;
      }
      if (outcome.ok) {
        notes.push('Expected ok: false (controlled error) when confirmLive is missing');
        pass = false;
      } else {
        if (outcome.httpStatus !== 400) { notes.push(`Expected httpStatus 400, got ${outcome.httpStatus}`); pass = false; }
        if (!outcome.error.toLowerCase().includes('confirmation')) {
          notes.push(`Error message should mention confirmation, got: "${outcome.error}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG05',
    name: 'handleGenerate: live mode missing ANTHROPIC_API_KEY → controlled error, key not exposed',
    async check() {
      const notes: string[] = [];
      let pass = true;

      // Temporarily remove API key to simulate missing key environment
      const savedKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      let outcome: Awaited<ReturnType<typeof handleGenerate>>;
      try {
        outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'live', confirmLive: true });
      } finally {
        if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      }

      if (outcome.ok) {
        notes.push('Expected ok: false when ANTHROPIC_API_KEY is missing');
        pass = false;
      } else {
        if (outcome.httpStatus !== 400) { notes.push(`Expected httpStatus 400, got ${outcome.httpStatus}`); pass = false; }
        // Error must not expose key value (key is deleted, but the message should not say "key=..." etc.)
        if (outcome.error.includes('sk-') || outcome.error.includes('ant-')) {
          notes.push('FAIL: error message appears to expose key material');
          pass = false;
        }
        if (!outcome.error.toLowerCase().includes('anthropic_api_key')) {
          notes.push(`Error message should reference ANTHROPIC_API_KEY, got: "${outcome.error}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG06',
    name: 'handleRequest POST /validate: validate endpoint still does not call generate6_1 or Claude',
    async check() {
      const notes: string[] = [];
      let pass = true;
      // Validate via HTTP to also confirm the route itself doesn't call generate
      const req = makeMockReq(
        'POST',
        '/api/dr-writer/6-1/validate',
        JSON.stringify(GREEN_INTAKE)
      );
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 200) { notes.push(`Expected 200, got ${captured.statusCode}`); pass = false; }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(captured.body);
      } catch {
        notes.push('Response body is not valid JSON'); pass = false; return { pass, notes };
      }
      // Must be EvaluationResult6_1 shape — no OutputSchema6_1 fields
      if ('narrative' in body) {
        notes.push('FAIL: validate response contains "narrative" — generate6_1 must not have been called');
        pass = false;
      }
      if ('ai_disclosure' in body) {
        notes.push('FAIL: validate response contains "ai_disclosure" — that is a generate6_1 field');
        pass = false;
      }
      if ('schema_version' in body) {
        notes.push('FAIL: validate response contains "schema_version" — that is an OutputSchema6_1 field');
        pass = false;
      }
      if (!('status' in body)) { notes.push('Missing status in validate response'); pass = false; }
      if (!('red_blockers' in body)) { notes.push('Missing red_blockers in validate response'); pass = false; }
      if (!('cleaned_facts' in body)) { notes.push('Missing cleaned_facts in validate response'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG07',
    name: 'handleRequest: unknown generate-like route → 404',
    async check() {
      const notes: string[] = [];
      let pass = true;
      // POST to a non-existent sub-route of generate
      const req = makeMockReq('POST', '/api/dr-writer/6-1/generate/extra');
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 404) {
        notes.push(`Expected 404 for unknown route, got ${captured.statusCode}`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG08',
    name: 'handleRequest: POST /generate with invalid JSON body → 400 controlled error',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const req = makeMockReq('POST', '/api/dr-writer/6-1/generate', '{ bad json %%%');
      const { res, captured } = makeMockRes();
      await handleRequest(req, res);
      if (captured.statusCode !== 400) {
        notes.push(`Expected 400, got ${captured.statusCode}`);
        pass = false;
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(captured.body);
      } catch {
        notes.push('Response body is not valid JSON'); pass = false; return { pass, notes };
      }
      if (!body['error']) { notes.push('Expected error field in 400 response body'); pass = false; }
      return { pass, notes };
    },
  },

  {
    test_id: 'TG09',
    name: 'handleGenerate: normal local mode mock GREEN still works with public demo mode off',
    async check() {
      return withPublicDemoMode(false, async () => {
        const notes: string[] = [];
        let pass = true;
        const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
        if (!outcome.ok) {
          notes.push(`Expected ok: true, got error: ${(outcome as { ok: false; error: string }).error}`);
          pass = false; return { pass, notes };
        }
        if (outcome.result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${outcome.result.status}`); pass = false; }
        if (outcome.result.schema_version !== '1.1') { notes.push(`Schema changed: ${outcome.result.schema_version}`); pass = false; }
        return { pass, notes };
      });
    },
  },

  {
    test_id: 'TG10',
    name: 'handleGenerate: public demo mode mock GREEN still works',
    async check() {
      return withPublicDemoMode(true, async () => {
        const notes: string[] = [];
        let pass = true;
        const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
        if (!outcome.ok) {
          notes.push(`Expected ok: true, got error: ${(outcome as { ok: false; error: string }).error}`);
          pass = false; return { pass, notes };
        }
        if (outcome.result.status !== 'GREEN') { notes.push(`Expected GREEN, got ${outcome.result.status}`); pass = false; }
        if (outcome.result.charge !== '6-1') { notes.push(`Charge changed: ${outcome.result.charge}`); pass = false; }
        if (outcome.result.schema_version !== '1.1') { notes.push(`Schema changed: ${outcome.result.schema_version}`); pass = false; }
        if (outcome.result.narrative === null) { notes.push('Expected mock narrative'); pass = false; }
        return { pass, notes };
      });
    },
  },

  {
    test_id: 'TG11',
    name: 'handleGenerate: public demo mode live generation is blocked before Claude/API client',
    async check() {
      return withPublicDemoMode(true, async () => {
        const notes: string[] = [];
        let pass = true;
        let clientCalled = false;
        const spyClient: ClaudeJsonClient = {
          async completeJson() {
            clientCalled = true;
            return '{}';
          },
        };
        const outcome = await handleGenerate(
          { intake: GREEN_INTAKE, mode: 'live', confirmLive: true },
          spyClient
        );
        if (clientCalled) {
          notes.push('FAIL: client was called in public demo mode');
          pass = false;
        }
        if (outcome.ok) {
          notes.push('Expected public demo live request to be blocked');
          pass = false;
        } else {
          if (outcome.httpStatus !== 403) { notes.push(`Expected 403, got ${outcome.httpStatus}`); pass = false; }
          if (!outcome.error.toLowerCase().includes('mock-only')) {
            notes.push(`Expected mock-only error, got: "${outcome.error}"`);
            pass = false;
          }
          if (outcome.error.includes('ANTHROPIC_API_KEY')) {
            notes.push('Public demo error should not require or expose API key handling');
            pass = false;
          }
        }
        return { pass, notes };
      });
    },
  },

  {
    test_id: 'TG12',
    name: 'handleGenerate: public demo mode RED input still returns RED before generation',
    async check() {
      return withPublicDemoMode(true, async () => {
        const notes: string[] = [];
        let pass = true;
        let clientCalled = false;
        const spyClient: ClaudeJsonClient = {
          async completeJson() {
            clientCalled = true;
            return '{}';
          },
        };
        const outcome = await handleGenerate(
          { intake: RED_INTAKE, mode: 'mock', confirmLive: false },
          spyClient
        );
        if (clientCalled) {
          notes.push('FAIL: client was called for RED in public demo mode');
          pass = false;
        }
        if (!outcome.ok) {
          notes.push(`Expected ok: true for RED, got error: ${(outcome as { ok: false; error: string }).error}`);
          pass = false; return { pass, notes };
        }
        if (outcome.result.status !== 'RED') { notes.push(`Expected RED, got ${outcome.result.status}`); pass = false; }
        if (outcome.result.narrative !== null) { notes.push('RED narrative must be null'); pass = false; }
        if (outcome.result.cleaned_facts !== null) { notes.push('RED cleaned_facts must be null'); pass = false; }
        if (outcome.result.schema_version !== '1.1') { notes.push(`Schema changed: ${outcome.result.schema_version}`); pass = false; }
        return { pass, notes };
      });
    },
  },

  {
    test_id: 'TG13',
    name: 'handleRequest: public demo config endpoint reports live disabled',
    async check() {
      return withPublicDemoMode(true, async () => {
        const notes: string[] = [];
        let pass = true;
        const req = makeMockReq('GET', '/api/dr-writer/6-1/config');
        const { res, captured } = makeMockRes();
        await handleRequest(req, res);
        if (captured.statusCode !== 200) { notes.push(`Expected 200, got ${captured.statusCode}`); pass = false; }
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(captured.body);
        } catch {
          notes.push('Config response body is not valid JSON'); pass = false; return { pass, notes };
        }
        if (body['publicDemoMode'] !== true) { notes.push('Expected publicDemoMode true'); pass = false; }
        if (body['liveEnabled'] !== false) { notes.push('Expected liveEnabled false'); pass = false; }
        return { pass, notes };
      });
    },
  },

  // ─── SF: Step 5F — HTML prototype element checks ─────────────────────────

  {
    test_id: 'SF01',
    name: 'HTML prototype includes Export TXT button (id="btn-export-txt")',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      if (!html.includes('id="btn-export-txt"')) {
        notes.push('FAIL: HTML does not contain id="btn-export-txt"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SF02',
    name: 'HTML prototype includes copy-feedback toast element (id="copy-toast")',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      if (!html.includes('id="copy-toast"')) {
        notes.push('FAIL: HTML does not contain id="copy-toast"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  // ─── S6: Step 6 — Demo-safe UI checks ────────────────────────────────────

  {
    test_id: 'S601',
    name: 'HTML prototype includes required DEMO ONLY warning text',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const required = 'DEMO ONLY — Use fake/practice facts only.';
      if (!html.includes(required)) {
        notes.push(`FAIL: HTML does not contain required warning: "${required}"`);
        pass = false;
      }
      if (!html.includes('Do not enter real inmate names, DC numbers, case numbers, or real incident details.')) {
        notes.push('FAIL: HTML does not contain real-data prohibition text');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'S602',
    name: 'HTML prototype includes mock/live cost warning near generate controls',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const required = 'Mock mode is local and free. Live Claude mode uses API credits and must only be used with fake/practice data.';
      if (!html.includes(required)) {
        notes.push(`FAIL: HTML does not contain required generate warning: "${required}"`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'S603',
    name: 'HTML prototype includes Feedback Notes card and client-side buttons',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const requiredSnippets = [
        'Feedback Notes',
        'id="feedback_confusing"',
        'id="feedback_missing_field"',
        'id="feedback_professional"',
        'id="feedback_save_time"',
        'id="feedback_other"',
        'id="btn-copy-feedback"',
        'id="btn-clear-feedback"',
        'buildFeedbackNotesText',
      ];
      for (const snippet of requiredSnippets) {
        if (!html.includes(snippet)) {
          notes.push(`FAIL: HTML does not contain "${snippet}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'S604',
    name: 'HTML prototype includes Demo Review Checklist required items',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const requiredItems = [
        'Demo Review Checklist',
        'Use fake/practice facts only.',
        'Check facts before drafting.',
        'RED — Missing required facts. Drafting is blocked.',
        'YELLOW — Draft allowed, but review flagged items carefully.',
        'GREEN — Ready to draft after officer review.',
        'Do not treat this as an official report submission system.',
        'Do not enter real inmate data in demo mode.',
      ];
      for (const item of requiredItems) {
        if (!html.includes(item)) {
          notes.push(`FAIL: HTML does not contain checklist item "${item}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'S605',
    name: 'HTML prototype does not reset validation when generate mode or feedback controls change',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const requiredSnippets = [
        "target.closest('#generate-mode-controls')",
        "target.classList.contains('feedback-input')",
      ];
      for (const snippet of requiredSnippets) {
        if (!html.includes(snippet)) {
          notes.push(`FAIL: HTML does not contain "${snippet}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'S606',
    name: 'HTML prototype includes public demo mock-only notice and config hook',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const requiredSnippets = [
        'PUBLIC DEMO MODE — Mock generation only.',
        '/api/dr-writer/6-1/config',
        'publicDemoMode',
        'live-mode-radio-label',
      ];
      for (const snippet of requiredSnippets) {
        if (!html.includes(snippet)) {
          notes.push(`FAIL: HTML does not contain "${snippet}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'S607',
    name: 'HTML prototype includes Step 11A polished intake labels, choices, and status wording',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const html = readFileSync(resolve(process.cwd(), 'prototypes/charge-6-1-static-form.html'), 'utf-8');
      const requiredSnippets = [
        'What date did this happen?',
        'What dorm, wing, or area was involved?',
        'What name should appear on the report?',
        'How many direct orders did you give?',
        'What was the inmate\'s verbal response?',
        'Summary of what the inmate said',
        'What did the refusal disrupt?',
        'Was there any clear reason the inmate could not comply?',
        'What happened after the refusal?',
        'Verbal order',
        'Written order',
        'Verbal and written order',
        'Exact quote',
        'No verbal response',
        'No clear barrier observed',
        'Placed in administrative confinement',
        'Referred to supervisor/OIC; no confinement action',
        'Draft Mode',
        'Mock draft',
        'Live Claude draft',
        'Check Facts',
        'Draft Narrative',
        'RED — Missing required facts. Drafting is blocked.',
        'YELLOW — Draft allowed, but review flagged items carefully.',
        'GREEN — Ready to draft after officer review.',
      ];
      for (const snippet of requiredSnippets) {
        if (!html.includes(snippet)) {
          notes.push(`FAIL: HTML does not contain polished UI text "${snippet}"`);
          pass = false;
        }
      }
      return { pass, notes };
    },
  },

  // ─── SG: Step 5G — Realistic mock narrative content ──────────────────────

  {
    test_id: 'SG01',
    name: 'Mock GREEN narrative does not contain placeholder "Paragraph one —" text',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (narrative.includes('Paragraph one —')) {
        notes.push('FAIL: narrative still contains placeholder "Paragraph one —"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG02',
    name: 'Mock GREEN narrative opens with "On " (realistic date-based opening)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.startsWith('On ')) {
        notes.push(`FAIL: narrative should start with "On ", got: "${narrative.slice(0, 50)}"`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG03',
    name: 'Mock GREEN narrative is a single continuous paragraph (no blank-line breaks)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      const paraCount = narrative.split(/\n\n+/).filter(p => p.trim().length > 0).length;
      if (paraCount !== 1) {
        notes.push(`FAIL: expected 1 continuous paragraph, got ${paraCount}`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG04',
    name: 'Mock YELLOW narrative contains "verbally responded in substance" for quote_is_summary warning',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: YELLOW_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.includes('verbally responded in substance')) {
        notes.push('FAIL: YELLOW narrative should contain "verbally responded in substance"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG05',
    name: 'Mock YELLOW narrative does not put the quote summary inside quotation marks',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: YELLOW_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (/in substance that\s*"/.test(narrative)) {
        notes.push('FAIL: summary appears in quotation marks after "in substance that"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG06',
    name: 'Mock YELLOW narrative contains "[REVIEW — quote is a summary]" marker',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: YELLOW_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.includes('[REVIEW — quote is a summary]')) {
        notes.push('FAIL: YELLOW narrative should contain "[REVIEW — quote is a summary]"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG07',
    name: 'Mock GREEN narrative formats ISO incident date as natural written date',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const intake = { ...GREEN_INTAKE, incident_date: '2026-03-12' };
      const outcome = await handleGenerate({ intake, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.startsWith('On March 12, 2026, at approximately 1400')) {
        notes.push(`FAIL: narrative should open with natural date, got: "${narrative.slice(0, 80)}"`);
        pass = false;
      }
      if (narrative.startsWith('On 2026-03-12')) {
        notes.push('FAIL: narrative still starts with ISO date');
        pass = false;
      }
      if (outcome.result.cleaned_facts?.incident_date !== '2026-03-12') {
        notes.push(`FAIL: cleaned_facts incident_date changed to "${outcome.result.cleaned_facts?.incident_date}"`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG08',
    name: 'Mock GREEN narrative preserves natural language incident date',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const intake = { ...GREEN_INTAKE, incident_date: 'March 12, 2026' };
      const outcome = await handleGenerate({ intake, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.startsWith('On March 12, 2026, at approximately 1400')) {
        notes.push(`FAIL: natural date was not preserved in opener, got: "${narrative.slice(0, 80)}"`);
        pass = false;
      }
      if (outcome.result.cleaned_facts?.incident_date !== 'March 12, 2026') {
        notes.push(`FAIL: cleaned_facts incident_date changed to "${outcome.result.cleaned_facts?.incident_date}"`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG09',
    name: 'Mock YELLOW narrative formats ISO incident date as natural written date',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const intake = { ...YELLOW_INTAKE, incident_date: '2026-03-12' };
      const outcome = await handleGenerate({ intake, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.startsWith('On March 12, 2026, at approximately 1400')) {
        notes.push(`FAIL: YELLOW narrative should open with natural date, got: "${narrative.slice(0, 80)}"`);
        pass = false;
      }
      if (narrative.startsWith('On 2026-03-12')) {
        notes.push('FAIL: YELLOW narrative still starts with ISO date');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG10',
    name: 'Mock YELLOW date polish keeps quote-summary requirements',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const intake = { ...YELLOW_INTAKE, incident_date: '2026-03-12' };
      const outcome = await handleGenerate({ intake, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      if (!narrative.includes('[REVIEW — quote is a summary]')) {
        notes.push('FAIL: YELLOW narrative should contain "[REVIEW — quote is a summary]"');
        pass = false;
      }
      if (!narrative.includes('verbally responded in substance')) {
        notes.push('FAIL: YELLOW narrative should contain "verbally responded in substance"');
        pass = false;
      }
      if (/in substance that\s*"/.test(narrative)) {
        notes.push('FAIL: summary appears in quotation marks after "in substance that"');
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG11',
    name: 'Mock GREEN narrative introduces the inmate with full name on first mention, last name only after',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
      if (!outcome.ok) { notes.push(`Expected ok: true`); pass = false; return { pass, notes }; }
      const narrative = outcome.result.narrative ?? '';
      // GREEN_INTAKE (fake-green-direct-refusal.json) has inmate_last_name "Smith",
      // inmate_first_name "John", dc_number "A12345".
      if (!narrative.includes('Inmate Smith, John, DC# A12345')) {
        notes.push(`FAIL: expected full name "Inmate Smith, John, DC# A12345" on first mention, narrative opens: "${narrative.slice(0, 120)}"`);
        pass = false;
      }
      const firstNameCount = (narrative.match(/\bJohn\b/g) ?? []).length;
      if (firstNameCount !== 1) {
        notes.push(`FAIL: expected first name "John" to appear exactly once (first mention only), got ${firstNameCount} occurrence(s)`);
        pass = false;
      }
      const dcNumberCount = (narrative.match(/A12345/g) ?? []).length;
      if (dcNumberCount !== 1) {
        notes.push(`FAIL: expected DC# to appear exactly once (first mention only), got ${dcNumberCount} occurrence(s)`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'SG12',
    name: 'Mock narrative is first person throughout — never refers to the reporting officer as "this officer"',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const greenOutcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'mock', confirmLive: false });
      const yellowOutcome = await handleGenerate({ intake: YELLOW_INTAKE, mode: 'mock', confirmLive: false });
      if (!greenOutcome.ok || !yellowOutcome.ok) { notes.push('Expected ok: true for both GREEN and YELLOW'); pass = false; return { pass, notes }; }
      const greenNarrative = greenOutcome.result.narrative ?? '';
      const yellowNarrative = yellowOutcome.result.narrative ?? '';
      if (/\bthis officer\b/i.test(greenNarrative)) {
        notes.push(`FAIL: GREEN narrative contains third-person self-reference "this officer": "${greenNarrative}"`);
        pass = false;
      }
      if (/\bthis officer\b/i.test(yellowNarrative)) {
        notes.push(`FAIL: YELLOW narrative contains third-person self-reference "this officer": "${yellowNarrative}"`);
        pass = false;
      }
      // GREEN_INTAKE's acknowledgment_type is "eye_contact_and_verbal_response" — confirm the
      // acknowledgment sentence actually uses first person rather than just being silent on it.
      if (!greenNarrative.includes('made direct eye contact with me')) {
        notes.push(`FAIL: expected first-person acknowledgment "made direct eye contact with me", got: "${greenNarrative}"`);
        pass = false;
      }
      return { pass, notes };
    },
  },

  // ─── EH: Live-call failure modes — handleGenerate must return a clean error, never throw ──

  {
    test_id: 'EH01',
    name: 'Live client throws 429 rate-limit error — handleGenerate returns ok:false, httpStatus 500, readable message (no throw)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const rateLimitedClient: ClaudeJsonClient = {
        async completeJson(_parts: ClaudePromptParts): Promise<string> {
          throw new ClaudeClientError(
            'Claude API returned HTTP 429 (rate_limit_error: Number of request tokens has exceeded your per-minute rate limit)',
            429
          );
        },
      };
      try {
        const outcome = await withFakeApiKey(() => handleGenerate(
          { intake: GREEN_INTAKE, mode: 'live', confirmLive: true },
          rateLimitedClient
        ));
        if (outcome.ok) { notes.push('Expected ok: false for a 429 client failure'); pass = false; return { pass, notes }; }
        if (outcome.httpStatus !== 500) { notes.push(`Expected httpStatus 500, got ${outcome.httpStatus}`); pass = false; }
        if (!outcome.error || !/429/.test(outcome.error)) { notes.push(`Expected error message to reference the 429 failure, got: "${outcome.error}"`); pass = false; }
        if (/at Object\.|at Module\.|\.ts:\d+:\d+/.test(outcome.error)) { notes.push(`FAIL: error string looks like a raw stack trace: "${outcome.error}"`); pass = false; }
      } catch (err) {
        notes.push(`handleGenerate threw instead of returning a clean error outcome: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'EH02',
    name: 'Live client resolves with garbage (non-JSON) text — handleGenerate returns ok:false, readable parse-failure message (no throw)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const garbageClient: ClaudeJsonClient = {
        async completeJson(_parts: ClaudePromptParts): Promise<string> {
          return "I'm sorry, I can't help with that request.";
        },
      };
      try {
        const outcome = await withFakeApiKey(() => handleGenerate(
          { intake: GREEN_INTAKE, mode: 'live', confirmLive: true },
          garbageClient
        ));
        if (outcome.ok) { notes.push('Expected ok: false for a garbage (non-JSON) response'); pass = false; return { pass, notes }; }
        if (outcome.httpStatus !== 500) { notes.push(`Expected httpStatus 500, got ${outcome.httpStatus}`); pass = false; }
        if (!outcome.error || !/parse failed|not valid JSON|must start with/i.test(outcome.error)) {
          notes.push(`Expected a parse-failure message, got: "${outcome.error}"`); pass = false;
        }
      } catch (err) {
        notes.push(`handleGenerate threw instead of returning a clean error outcome: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'EH03',
    name: 'Live client rejects with an abort/timeout-style error — handleGenerate returns ok:false, readable message (no throw)',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const abortingClient: ClaudeJsonClient = {
        async completeJson(_parts: ClaudePromptParts): Promise<string> {
          // Simulates what fetch() throws on an aborted/timed-out request (DOMException,
          // name "AbortError") — the shape claudeClient.ts's network-error catch would see.
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          throw err;
        },
      };
      try {
        const outcome = await withFakeApiKey(() => handleGenerate(
          { intake: GREEN_INTAKE, mode: 'live', confirmLive: true },
          abortingClient
        ));
        if (outcome.ok) { notes.push('Expected ok: false for an aborted/timed-out client call'); pass = false; return { pass, notes }; }
        if (outcome.httpStatus !== 500) { notes.push(`Expected httpStatus 500, got ${outcome.httpStatus}`); pass = false; }
        if (!outcome.error) { notes.push('Expected a non-empty error message'); pass = false; }
      } catch (err) {
        notes.push(`handleGenerate threw instead of returning a clean error outcome: ${err}`); pass = false;
      }
      return { pass, notes };
    },
  },

  {
    test_id: 'EH04',
    name: 'Real claudeClient.ts: a hung fetch() is cut off by CLAUDE_TIMEOUT_MS — settles with a clear timeout error, does not hang',
    async check() {
      const notes: string[] = [];
      let pass = true;
      const savedFetch = globalThis.fetch;
      const savedKey = process.env.ANTHROPIC_API_KEY;
      const savedTimeout = process.env.CLAUDE_TIMEOUT_MS;
      const TEST_TIMEOUT_MS = 75;

      // Simulates a hung connection: never resolves on its own. Only settles (with an
      // AbortError, matching real fetch() behavior) if the AbortSignal passed by
      // claudeClient.ts actually fires — i.e. this only completes if the timeout works.
      (globalThis as any).fetch = (_url: unknown, options?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };
      process.env.ANTHROPIC_API_KEY = 'REPLACE_WITH_ROTATED_KEY_VIA_REPLIT_SECRETS';
      process.env.CLAUDE_TIMEOUT_MS = String(TEST_TIMEOUT_MS);

      try {
        const startMs = Date.now();
        // No clientOverride — this must go through the real createClaudeClient() in
        // claudeClient.ts to actually exercise the AbortController/timeout logic, not a mock.
        const outcome = await handleGenerate({ intake: GREEN_INTAKE, mode: 'live', confirmLive: true });
        const elapsedMs = Date.now() - startMs;

        if (outcome.ok) { notes.push('Expected ok: false for a hung fetch'); pass = false; return { pass, notes }; }
        if (outcome.httpStatus !== 500) { notes.push(`Expected httpStatus 500, got ${outcome.httpStatus}`); pass = false; }
        if (!outcome.error || !/timed out/i.test(outcome.error)) {
          notes.push(`Expected the error to identify itself as a timeout, got: "${outcome.error}"`); pass = false;
        }
        if (!outcome.error || !outcome.error.includes(String(TEST_TIMEOUT_MS))) {
          notes.push(`Expected the configured timeout (${TEST_TIMEOUT_MS}ms) named in the message, got: "${outcome.error}"`); pass = false;
        }
        // Elapsed time must be at least roughly the configured timeout — otherwise this
        // could be a fast rejection that happens to mention "timed out" by coincidence,
        // not proof the abort timer actually fired.
        if (elapsedMs < TEST_TIMEOUT_MS - 25) {
          notes.push(`FAIL: settled in ${elapsedMs}ms, faster than the configured ${TEST_TIMEOUT_MS}ms timeout — this does not prove the timeout path actually fired`); pass = false;
        }
        if (elapsedMs > 5000) {
          notes.push(`FAIL: took ${elapsedMs}ms to settle — the promise is not resolving promptly after the timeout fires`); pass = false;
        }
      } catch (err) {
        notes.push(`handleGenerate threw / hung instead of returning a clean timeout error: ${err}`); pass = false;
      } finally {
        globalThis.fetch = savedFetch;
        if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
        if (savedTimeout === undefined) delete process.env.CLAUDE_TIMEOUT_MS; else process.env.CLAUDE_TIMEOUT_MS = savedTimeout;
      }
      return { pass, notes };
    },
  },

];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

console.log('');
console.log('='.repeat(72));
console.log('  LOCKUPHQ DR Writer — Charge 6-1 UI Server Tests (Validate + Generate + 5F/6)');
console.log('  No server startup. No network. No Claude API calls.');
console.log('='.repeat(72));
console.log('');

let passed = 0;
let failed = 0;

for (const t of tests) {
  const { pass, notes } = await t.check();
  const icon = pass ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${t.test_id} — ${t.name}`);
  for (const note of notes) {
    console.log(`       NOTE: ${note}`);
  }
  console.log('');
  pass ? passed++ : failed++;
}

console.log('='.repeat(72));
console.log(`  TS (validate): 8 — TG (generate): 13 — SF (5F HTML): 2 — S6 (demo UI): 7 — SG (5G/7B narrative): 12 — EH (live failure modes): 4`);
console.log(`  Total: ${passed} passed / ${failed} failed / ${tests.length} total`);
console.log('='.repeat(72));
console.log('');

if (failed > 0) {
  process.exitCode = 1;
}
