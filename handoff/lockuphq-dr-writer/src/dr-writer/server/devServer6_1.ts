// LOCKUPHQ DR Writer — Charge 6-1 Dev Server
// Step 5D: Serves the static form and exposes validate + generate endpoints.
//
// Routes:
//   GET /                              → serves prototypes/charge-6-1-static-form.html
//   GET /charge-6-1                    → same
//   GET /charge-6-1-static-form.css   → serves the CSS file
//   POST /api/dr-writer/6-1/validate  → runs evaluate6_1 only, returns EvaluationResult6_1
//   POST /api/dr-writer/6-1/generate  → mock or guarded-live generation, returns OutputSchema6_1
//
// Default generation mode: mock (no Claude, no API credits).
// Public demo mode: LOCKUPHQ_PUBLIC_DEMO_MODE=true disables live generation.
// Live generation: requires mode "live", confirmLive: true, and ANTHROPIC_API_KEY.
// RED status: returns RED immediately — never calls mock or live client.
//
// Validate endpoint does NOT call generate6_1. Does NOT call Claude.
// Does NOT persist data.
//
// Usage: node --experimental-strip-types src/dr-writer/server/devServer6_1.ts

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate6_1 } from '../charges/6-1/evaluate6_1.ts';
import { generate6_1 } from '../charges/6-1/generate6_1.ts';
import { makeMockDevClient } from '../charges/6-1/devRun6_1.ts';
import { createClaudeClient } from '../llm/claudeClient.ts';
import type {
  IntakeFacts6_1,
  EvaluationResult6_1,
  OutputSchema6_1,
} from '../charges/6-1/types.ts';
import { AI_DISCLOSURE, OFFICER_REVIEW_CHECKLIST } from '../charges/6-1/types.ts';
import type { ClaudeJsonClient } from '../llm/claudeTypes.ts';

const PORT = 5176;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROTO_DIR = resolve(__dirname, '../../../prototypes');
const ALLOWED_ORIGIN = process.env.LOCKUPHQ_ALLOWED_ORIGIN ?? `http://localhost:${PORT}`;

export function isPublicDemoMode(): boolean {
  return process.env.LOCKUPHQ_PUBLIC_DEMO_MODE === 'true';
}

// ---------------------------------------------------------------------------
// Validate handler — exported for direct testing (no server required)
// ---------------------------------------------------------------------------

export interface ValidateOk {
  ok: true;
  result: EvaluationResult6_1;
}

export interface ValidateError {
  ok: false;
  httpStatus: number;
  error: string;
}

export type ValidateOutcome = ValidateOk | ValidateError;

export function handleValidate(body: unknown): ValidateOutcome {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, httpStatus: 400, error: 'Request body must be a JSON object' };
  }
  const intake = body as IntakeFacts6_1;
  const result = evaluate6_1(intake);
  return { ok: true, result };
}

// ---------------------------------------------------------------------------
// Generate handler — exported for direct testing (no server required)
//
// clientOverride: inject a spy/stub for tests. When provided for GREEN/YELLOW,
//   it replaces the mode-based client. Never called for RED — RED returns early.
//   Pass undefined (or omit) in production.
// ---------------------------------------------------------------------------

export interface GenerateOk {
  ok: true;
  result: OutputSchema6_1;
}

export interface GenerateError {
  ok: false;
  httpStatus: number;
  error: string;
}

export type GenerateOutcome = GenerateOk | GenerateError;

export async function handleGenerate(
  body: unknown,
  clientOverride?: ClaudeJsonClient
): Promise<GenerateOutcome> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, httpStatus: 400, error: 'Request body must be a JSON object' };
  }

  const req = body as Record<string, unknown>;

  if (typeof req['intake'] !== 'object' || req['intake'] === null || Array.isArray(req['intake'])) {
    return { ok: false, httpStatus: 400, error: 'intake must be a JSON object' };
  }

  // mode defaults to 'mock' if missing or unrecognized
  const mode: 'mock' | 'live' = req['mode'] === 'live' ? 'live' : 'mock';
  const confirmLive = req['confirmLive'] === true;

  // Public demo mode is mock-only. Block live before confirmation, key checks, or client creation.
  if (mode === 'live' && isPublicDemoMode()) {
    return {
      ok: false,
      httpStatus: 403,
      error: 'Public demo mode is mock-only. Live Claude generation is disabled on this demo.',
    };
  }

  // Live mode guards — checked in order: confirmation first, then API key
  if (mode === 'live') {
    if (!confirmLive) {
      return {
        ok: false,
        httpStatus: 400,
        error: 'Live generation requires confirmation. Set confirmLive: true to proceed.',
      };
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        ok: false,
        httpStatus: 400,
        error: 'Live generation requires ANTHROPIC_API_KEY to be set in the server environment.',
      };
    }
  }

  const intake = req['intake'] as IntakeFacts6_1;
  const evaluation = evaluate6_1(intake);

  // RED — return immediately. Never build a client. Never call generate6_1.
  if (evaluation.status === 'RED') {
    const result: OutputSchema6_1 = {
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
    return { ok: true, result };
  }

  // GREEN / YELLOW — select client and run the full generation pipeline
  let client: ClaudeJsonClient;
  if (clientOverride !== undefined) {
    client = clientOverride;
  } else if (mode === 'mock') {
    client = makeMockDevClient(evaluation).client;
  } else {
    client = createClaudeClient();
  }

  try {
    const result = await generate6_1(intake, client);
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 500,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// HTTP request handler — exported for testing
// ---------------------------------------------------------------------------

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // GET /api/dr-writer/6-1/config
  if (method === 'GET' && url === '/api/dr-writer/6-1/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      publicDemoMode: isPublicDemoMode(),
      liveEnabled: !isPublicDemoMode(),
    }));
    return;
  }

  // POST /api/dr-writer/6-1/validate
  if (method === 'POST' && url === '/api/dr-writer/6-1/validate') {
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += String(chunk);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      return;
    }
    const outcome = handleValidate(parsed);
    if (!outcome.ok) {
      res.writeHead(outcome.httpStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: outcome.error }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(outcome.result));
    return;
  }

  // POST /api/dr-writer/6-1/generate
  if (method === 'POST' && url === '/api/dr-writer/6-1/generate') {
    let rawBody = '';
    for await (const chunk of req) {
      rawBody += String(chunk);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body' }));
      return;
    }
    const outcome = await handleGenerate(parsed);
    if (!outcome.ok) {
      res.writeHead(outcome.httpStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: outcome.error }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(outcome.result));
    return;
  }

  // GET / or /charge-6-1 → serve the HTML prototype
  if (method === 'GET' && (url === '/' || url === '/charge-6-1')) {
    try {
      const html = readFileSync(resolve(PROTO_DIR, 'charge-6-1-static-form.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: HTML file not found. Ensure the prototypes/ folder is present.');
    }
    return;
  }

  // GET /charge-6-1-static-form.css → serve the CSS
  if (method === 'GET' && url === '/charge-6-1-static-form.css') {
    try {
      const css = readFileSync(resolve(PROTO_DIR, 'charge-6-1-static-form.css'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(css);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: CSS file not found.');
    }
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

export function startServer(port: number = PORT): void {
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err: unknown) => {
      console.error('[devServer6_1] Unhandled request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('  LOCKUPHQ DR Writer — Charge 6-1 Dev Server');
    console.log('  Step 5D — Validate + Generate wired. Mock default.');
    console.log('='.repeat(60));
    console.log('');
    console.log(`  Form:      http://localhost:${port}/charge-6-1`);
    console.log(`  Validate:  POST http://localhost:${port}/api/dr-writer/6-1/validate`);
    console.log(`  Generate:  POST http://localhost:${port}/api/dr-writer/6-1/generate`);
    console.log('');
    console.log('  Default mode: mock (no Claude API calls, no credits spent).');
    if (isPublicDemoMode()) {
      console.log('  Public demo mode: enabled (mock-only; live Claude disabled).');
    }
    console.log('  Live mode requires ANTHROPIC_API_KEY + confirmLive: true in request.');
    console.log('  RED status never calls any client.');
    console.log('  Do not enter real inmate data.');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
  });
}

// Auto-start when run directly; skip when imported by tests
if (resolve(process.argv[1] ?? '') === resolve(__filename)) {
  startServer(PORT);
}
