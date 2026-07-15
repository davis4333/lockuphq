// LOCKUPHQ DR Writer — officer-facing app server (blueprint §18 Phase 8;
// live-AI serving path added for §18 Phase 9 shadow-pilot prep).
//
// Serves the officer UI and a JSON API over the Phase 7 SecureService. The
// server adds NO authority of its own: every check (session, role, hash,
// version, token) happens in the service/engine. handleApiRequest is a pure
// function so integration tests run without a network socket.
//
// AI modes (server-side config, never client-controlled):
//   stub (default) — deterministic fakes; all test suites run in this mode.
//   live           — frozen model/prompt versions through the mailbox pattern
//                    (liveBridge.ts). Malformed live output follows the
//                    2-retry-then-SYSTEM-HOLD rule. Requires ANTHROPIC_API_KEY.
//
// Synthetic data only — no real inmate data.
//
// Usage: node --experimental-strip-types src/dr-writer/server/appServer.ts [--ai=live]

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecureService } from '../engine/service/secureService.ts';
import type { BootConfig } from '../engine/service/secureService.ts';
import { AuthError } from '../engine/service/authService.ts';
import { EngineError } from '../engine/errors.ts';
import { SYNTHETIC_PACKET_6_1, SYNTHETIC_POLICY_PROFILE } from '../engine/packets.ts';
import { LIVE_MODEL_PROMPT_VERSIONS } from '../engine/ai/promptVersions.ts';
import { createMailboxStubs } from '../engine/ai/mailbox.ts';
import { LiveAdapterError } from '../engine/ai/liveAdapters.ts';
import { LiveAiBridge } from './liveBridge.ts';
import type { LiveAdapters } from './liveBridge.ts';
import { goodRegistries, addStandardPersons } from '../engine/tests/fixtures.ts';
import type { AnswerType } from '../engine/packets.ts';
import type { FactCertainty, OutputChannel, Person } from '../engine/types.ts';

const PORT = Number(process.env['PORT']) || 5177;
// Hosting shim: when mounted behind the shared reverse proxy at a sub-path
// (e.g. "/dr-writer-app"), the proxy does NOT rewrite paths, so this server
// receives the full prefixed URL and the served HTML must know the prefix so
// the browser's fetch() calls hit the right place. Empty/"/" means root mount.
const BASE_PATH = (process.env['BASE_PATH'] ?? '').replace(/\/+$/, '');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const UI_PATH = resolve(__dirname, 'ui/officer-app.html');

// ---------------------------------------------------------------------------
// Service factory (synthetic config; deterministic AI stubs)
// ---------------------------------------------------------------------------

export const DEV_SEED_USERS: NonNullable<BootConfig['seedUsers']> = [
  { username: 'officer.alex', password: 'synthetic-pw-1', role: 'officer', display_name: 'Ofc. Alex Officer', person_id: 'P-OFF' },
  { username: 'sup.morgan', password: 'synthetic-pw-3', role: 'supervisor', display_name: 'Lt. Morgan Supervisor' },
];

// First-boot admin provisioning: no system_admin credential ever lives in
// source or gets printed to stdout. seedUsers only applies when no
// users.json exists yet (see secureService.boot), so this only has an
// effect on a genuinely fresh data dir. Set ADMIN_USERNAME/ADMIN_PASSWORD
// before the first boot to provision the admin account; if unset, no admin
// account exists and one must be provisioned before admin-only routes
// (kill switch, etc.) can be used.
export function resolveSeedUsers(env: NodeJS.ProcessEnv = process.env): NonNullable<BootConfig['seedUsers']> {
  const username = env['ADMIN_USERNAME'];
  const password = env['ADMIN_PASSWORD'];
  if (!username || !password) return DEV_SEED_USERS;
  return [...DEV_SEED_USERS, { username, password, role: 'system_admin', display_name: 'System Admin' }];
}

export function createAppService(opts: { dir: string; clock?: () => Date; seedUsers?: NonNullable<BootConfig['seedUsers']> }): SecureService {
  const { requirements, sources } = goodRegistries();
  const service = SecureService.boot({
    dir: opts.dir,
    engine: {
      requirements,
      sources,
      packet: SYNTHETIC_PACKET_6_1,
      policy: SYNTHETIC_POLICY_PROFILE,
      deployment_check_date: '2026-06-01',
      clock: opts.clock,
    },
    auth: { clock: opts.clock },
    seedUsers: opts.seedUsers ?? resolveSeedUsers(),
  });
  if (service.engine.persons.all().length === 0) {
    addStandardPersons(service.engine);
  }
  return service;
}

// Live mode: the engine consumes ONLY the mailbox (fail closed — an unfilled
// slot throws), and the bridge pre-fetches real model output into it. Frozen
// versions are recorded in every snapshot via model_prompt_versions.
export function createLiveApp(opts: { dir: string; clock?: () => Date; adapters?: LiveAdapters; seedUsers?: NonNullable<BootConfig['seedUsers']> }): { service: SecureService; bridge: LiveAiBridge } {
  const { requirements, sources } = goodRegistries();
  const { mailbox, stubs } = createMailboxStubs();
  const service = SecureService.boot({
    dir: opts.dir,
    engine: {
      requirements,
      sources,
      packet: SYNTHETIC_PACKET_6_1,
      policy: { ...SYNTHETIC_POLICY_PROFILE, model_prompt_versions: LIVE_MODEL_PROMPT_VERSIONS },
      deployment_check_date: '2026-06-01',
      clock: opts.clock,
      stubs,
    },
    auth: { clock: opts.clock },
    seedUsers: opts.seedUsers ?? resolveSeedUsers(),
  });
  if (service.engine.persons.all().length === 0) {
    addStandardPersons(service.engine);
  }
  const bridge = new LiveAiBridge(service, mailbox, opts.adapters);
  return { service, bridge };
}

// ---------------------------------------------------------------------------
// API handler — pure and directly testable
// ---------------------------------------------------------------------------

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

function ok(body: Record<string, unknown> = {}): ApiResponse {
  return { status: 200, body: { ok: true, ...body } };
}

function fail(status: number, code: string, message: string): ApiResponse {
  return { status, body: { ok: false, code, error: message } };
}

// Maps service/engine failures to HTTP statuses. The `code` field is stable
// so the UI can react (STALE_WRITE -> reload banner, RAPID_CONFIRMATION ->
// second-confirmation flow, SESSION_LOCKED -> unlock screen, ...).
export function mapError(err: unknown): ApiResponse {
  if (err instanceof AuthError) {
    const status =
      err.code === 'FORBIDDEN' ? 403 :
      err.code === 'SESSION_LOCKED' ? 423 :
      err.code === 'INPUT_REJECTED' ? 400 : 401;
    return fail(status, err.code, err.message);
  }
  if (err instanceof EngineError) {
    const status =
      err.code === 'NOT_FOUND' ? 404 :
      err.code === 'STALE_WRITE' || err.code === 'HASH_MISMATCH' || err.code === 'RAPID_CONFIRMATION' || err.code === 'SESSION_LOCK' || err.code === 'SYSTEM_HOLD' ? 409 :
      err.code === 'FORBIDDEN' || err.code === 'TOKEN_REJECTED' || err.code === 'OUTPUT_REJECTED' ? 403 :
      err.code === 'INPUT_REJECTED' ? 400 : 422;
    return fail(status, err.code, err.message);
  }
  return fail(500, 'INTERNAL', err instanceof Error ? err.message : 'Unexpected error');
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AuthError('INPUT_REJECTED', `Missing or invalid field: ${key}`);
  }
  return value;
}

function num(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AuthError('INPUT_REJECTED', `Missing or invalid field: ${key}`);
  }
  return value;
}

export function handleApiRequest(
  service: SecureService,
  method: string,
  path: string,
  rawBody: unknown,
  sessionId: string | null
): ApiResponse {
  const body = asObject(rawBody) ?? {};
  const sid = sessionId ?? '';
  try {
    // ---- sessions -----------------------------------------------------
    if (method === 'POST' && path === '/api/login') {
      const b = asObject(rawBody);
      if (!b) return fail(400, 'INPUT_REJECTED', 'Request body must be a JSON object');
      return ok({ session: service.login(str(b, 'username'), str(b, 'password')) });
    }
    if (method === 'POST' && path === '/api/logout') {
      service.logout(sid);
      return ok();
    }
    if (method === 'POST' && path === '/api/lock') {
      service.lockScreen(sid);
      return ok();
    }
    if (method === 'POST' && path === '/api/unlock') {
      service.unlockScreen(sid, str(body, 'password'));
      return ok();
    }
    if (method === 'GET' && path === '/api/me') {
      return ok({ me: service.whoAmI(sid) });
    }

    // ---- persons ------------------------------------------------------
    if (method === 'GET' && path === '/api/persons') {
      return ok({ persons: service.listPersons(sid) });
    }
    if (method === 'POST' && path === '/api/persons') {
      service.addPerson(sid, body as unknown as Person);
      return ok();
    }

    // ---- output (central authorization; token-gated) -------------------
    if (method === 'POST' && path === '/api/output') {
      const channel = str(body, 'channel') as OutputChannel;
      const result = service.redeemOutput(sid, str(body, 'token_id'), channel);
      return ok({ output: result.output, channel });
    }

    // ---- audit and kill switch ----------------------------------------
    if (method === 'GET' && path.startsWith('/api/audit')) {
      const reportId = new URLSearchParams(path.split('?')[1] ?? '').get('report_id') ?? undefined;
      return ok({ events: service.readAudit(sid, reportId) });
    }
    if (method === 'POST' && path === '/api/kill-switch') {
      if (body['engage'] === true) service.engageKillSwitch(sid, str(body, 'reason'));
      else service.releaseKillSwitch(sid);
      return ok();
    }

    // ---- reports --------------------------------------------------------
    if (method === 'GET' && path === '/api/reports') {
      return ok({ reports: service.listMyReports(sid) });
    }
    if (method === 'POST' && path === '/api/reports') {
      const created = service.createReport(sid, {
        institution_id: str(body, 'institution_id'),
        subject_person_id: str(body, 'subject_person_id'),
        charge_code: str(body, 'charge_code'),
        participants: Array.isArray(body['participants']) ? (body['participants'] as string[]) : undefined,
      });
      return ok({ report: created });
    }

    const reportMatch = /^\/api\/reports\/([^/]+)(?:\/([a-z-]+))?$/.exec(path);
    if (reportMatch) {
      const rid = reportMatch[1];
      const action = reportMatch[2] ?? null;

      if (method === 'GET' && action === null) {
        return ok({ view: service.getReportView(sid, rid) });
      }
      if (method === 'GET' && action === 'review-draft') {
        return ok({ draft: service.getReviewDraft(sid, rid) });
      }
      if (method !== 'POST') return fail(404, 'NOT_FOUND', 'Unknown route');

      const version = (): number => num(body, 'version');
      switch (action) {
        case 'claim':
          service.claimReport(sid, rid);
          return ok();
        case 'admin':
          service.setAdminIntake(sid, rid, version(), body['admin'] as Parameters<SecureService['setAdminIntake']>[3]);
          return ok();
        case 'screen':
          service.submitProceduralScreen(sid, rid, version(), (asObject(body['answers']) ?? {}) as Record<string, string>);
          return ok();
        case 'analyze': {
          // "Analyze Incident" — never "Generate Report". Commits the notes
          // immutably, extracts facts, runs the critic, auto-selects the order
          // when exactly one exists, and evaluates the charge. Each step is an
          // atomic engine commit; the version is re-read between steps.
          service.commitNotes(sid, rid, version(), { text: str(body, 'text'), request_id: str(body, 'request_id') });
          const v2 = service.engine.getVersion(rid);
          service.runExtraction(sid, rid, v2);
          const critic = service.runCritic(sid, rid, service.engine.getVersion(rid));
          const orders = service.engine.inspect(rid).orderEvents;
          if (orders.length === 1) {
            service.selectOrder(sid, rid, service.engine.getVersion(rid), orders[0].order_event_id);
          }
          const evaluation = service.evaluateCharge(sid, rid, service.engine.getVersion(rid));
          return ok({ critic, evaluation });
        }
        case 'amendment':
          return ok({ amendment_id: service.addAmendment(sid, rid, version(), { text: str(body, 'text'), reason: str(body, 'reason') }) });
        case 'correct-fact':
          return ok({
            fact_id: service.correctFact(sid, rid, version(), {
              fact_id: str(body, 'fact_id'),
              value: str(body, 'value'),
              certainty: str(body, 'certainty') as FactCertainty,
            }),
          });
        case 'disambiguate':
          service.disambiguatePerson(sid, rid, version(), { reference_id: str(body, 'reference_id'), person_id: str(body, 'person_id') });
          return ok();
        case 'select-order':
          service.selectOrder(sid, rid, version(), str(body, 'order_event_id'));
          return ok();
        case 'evaluate':
          return ok({ evaluation: service.evaluateCharge(sid, rid, version()) });
        case 'clarify':
          return ok({ clarification: service.requestClarification(sid, rid, version()) });
        case 'answer':
          return ok({
            result: service.answerQuestion(sid, rid, version(), {
              intent_id: str(body, 'intent_id'),
              answer_type: str(body, 'answer_type') as AnswerType,
              value: typeof body['value'] === 'string' ? body['value'] : undefined,
            }),
          });
        case 'confirm-facts':
          return ok({
            confirmation_event_id: service.confirmFacts(sid, rid, version(), body['request'] as Parameters<SecureService['confirmFacts']>[3]),
          });
        case 'acknowledge-quality':
          service.acknowledgeQualityWarnings(sid, rid, version());
          return ok();
        case 'resolve-policy':
          service.resolvePolicyReview(sid, rid, version(), { category: str(body, 'category'), resolution: str(body, 'resolution') });
          return ok();
        case 'resolve-procedural':
          service.resolveProceduralConflict(sid, rid, version(), str(body, 'key'));
          return ok();
        case 'draft': {
          // Composite: snapshot -> generate -> validate. Each an atomic commit.
          service.createSnapshot(sid, rid, version());
          service.generateNarrative(sid, rid, service.engine.getVersion(rid));
          const validation = service.validateNarrative(sid, rid, service.engine.getVersion(rid));
          return ok({ validation });
        }
        case 'snapshot':
          return ok({ snapshot_id: service.createSnapshot(sid, rid, version()) });
        case 'generate':
          return ok({ narrative_id: service.generateNarrative(sid, rid, version()) });
        case 'validate':
          return ok({ validation: service.validateNarrative(sid, rid, version()) });
        case 'regenerate':
          return ok({ result: service.regenerateNarrative(sid, rid, version()) });
        case 'edit-sentence':
          service.editSentence(sid, rid, version(), { sentence_id: str(body, 'sentence_id'), new_text: str(body, 'new_text') });
          return ok();
        case 'resource-sentence':
          return ok({ result: service.resourceSentence(sid, rid, version(), str(body, 'sentence_id')) });
        case 'revert-sentence':
          service.revertSentence(sid, rid, version(), str(body, 'sentence_id'));
          return ok();
        case 'restate-sentence':
          service.restateSentence(sid, rid, version(), { sentence_id: str(body, 'sentence_id'), new_text: str(body, 'new_text') });
          return ok();
        case 'certify':
          return ok({
            certification_id: service.certify(sid, rid, version(), body['request'] as Parameters<SecureService['certify']>[3]),
          });
        case 'finalize-audit':
          service.commitAuditFinalization(sid, rid, version());
          return ok();
        case 'token':
          return ok({ token: service.issueOutputToken(sid, rid, str(body, 'channel') as OutputChannel) });
        case 'lifecycle':
          service.transitionLifecycle(sid, rid, version(), str(body, 'to') as 'ABANDONED' | 'VOIDED');
          return ok();
        default:
          return fail(404, 'NOT_FOUND', 'Unknown route');
      }
    }

    return fail(404, 'NOT_FOUND', 'Unknown route');
  } catch (err) {
    return mapError(err);
  }
}

// ---------------------------------------------------------------------------
// Live-mode request handling. AI-stage routes are re-orchestrated so live
// output is pre-fetched into the mailbox before each synchronous engine stage
// consumes it; every other route delegates to the sync handler unchanged.
// A LiveAdapterError (malformed output after the retry bound) raises SYSTEM
// HOLD on the report — Trigger C, fail closed.
// ---------------------------------------------------------------------------

const LIVE_ACTIONS = new Set(['analyze', 'draft', 'generate', 'validate', 'regenerate', 'resource-sentence', 'clarify']);

export async function handleApiRequestLive(
  service: SecureService,
  bridge: LiveAiBridge,
  method: string,
  path: string,
  rawBody: unknown,
  sessionId: string | null
): Promise<ApiResponse> {
  const match = /^\/api\/reports\/([^/]+)\/([a-z-]+)$/.exec(path);
  if (method !== 'POST' || !match || !LIVE_ACTIONS.has(match[2])) {
    return handleApiRequest(service, method, path, rawBody, sessionId);
  }
  const rid = match[1];
  const action = match[2];
  const body = asObject(rawBody) ?? {};
  const sid = sessionId ?? '';
  try {
    // The session must be valid before any model call is made on its behalf.
    service.whoAmI(sid);
    switch (action) {
      case 'analyze': {
        // commitNotes is the auth/lock/version gate for the composite.
        service.commitNotes(sid, rid, num(body, 'version'), { text: str(body, 'text'), request_id: str(body, 'request_id') });
        const extractionVersion = service.engine.getVersion(rid);
        await bridge.prepareExtraction(rid, str(body, 'text'));
        service.runExtraction(sid, rid, extractionVersion);
        const criticVersion = service.engine.getVersion(rid);
        await bridge.prepareCritic(rid, str(body, 'text'));
        const critic = service.runCritic(sid, rid, criticVersion);
        const orders = service.engine.inspect(rid).orderEvents;
        if (orders.length === 1) {
          service.selectOrder(sid, rid, service.engine.getVersion(rid), orders[0].order_event_id);
        }
        const evaluation = service.evaluateCharge(sid, rid, service.engine.getVersion(rid));
        return ok({ critic, evaluation });
      }
      case 'draft': {
        service.createSnapshot(sid, rid, num(body, 'version'));
        const generationVersion = service.engine.getVersion(rid);
        await bridge.prepareGeneration(rid);
        service.generateNarrative(sid, rid, generationVersion);
        const validationVersion = service.engine.getVersion(rid);
        await bridge.prepareSemantic(rid);
        const validation = service.validateNarrative(sid, rid, validationVersion);
        return ok({ validation });
      }
      case 'generate': {
        const version = num(body, 'version');
        service.preflightLiveWorkflow(sid, rid, version);
        await bridge.prepareGeneration(rid);
        return ok({ narrative_id: service.generateNarrative(sid, rid, version) });
      }
      case 'validate': {
        const version = num(body, 'version');
        service.preflightLiveWorkflow(sid, rid, version);
        await bridge.prepareSemantic(rid);
        return ok({ validation: service.validateNarrative(sid, rid, version) });
      }
      case 'regenerate': {
        const version = num(body, 'version');
        service.preflightLiveRegeneration(sid, rid, version);
        const drafts = await bridge.prepareGeneration(rid);
        await bridge.prepareSemanticForDraft(rid, drafts);
        return ok({ result: service.regenerateNarrative(sid, rid, version) });
      }
      case 'resource-sentence': {
        const version = num(body, 'version');
        const sentenceId = str(body, 'sentence_id');
        service.preflightLiveWorkflow(sid, rid, version);
        await bridge.prepareResource(rid, sentenceId);
        return ok({ result: service.resourceSentence(sid, rid, version, sentenceId) });
      }
      case 'clarify': {
        const version = num(body, 'version');
        service.preflightLiveWorkflow(sid, rid, version);
        await bridge.prepareIntentSelection(rid);
        return ok({ clarification: service.requestClarification(sid, rid, version) });
      }
      default:
        return handleApiRequest(service, method, path, rawBody, sessionId);
    }
  } catch (err) {
    if (err instanceof LiveAdapterError) {
      // Stage 6 / Trigger C: malformed output and provider failures hold.
      try {
        service.raiseSystemHold(sid, rid, `live AI stage failed closed: ${err.message}`);
      } catch {
        // hold could not be raised (e.g. session died mid-flight); the error
        // response below still fails the request closed.
      }
      return fail(409, 'SYSTEM_HOLD', `Live AI processing failed; the report is in SYSTEM HOLD. (${err.message})`);
    }
    return mapError(err);
  }
}

// ---------------------------------------------------------------------------
// HTTP wiring
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 1_000_000) rejectPromise(new Error('Request body too large'));
    });
    req.on('end', () => {
      if (data.length === 0) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(data));
      } catch {
        rejectPromise(new Error('Invalid JSON body'));
      }
    });
    req.on('error', rejectPromise);
  });
}

export function startServer(dataDir: string): void {
  const aiMode = resolveAiMode(process.env.AI_MODE, process.argv);
  if (aiMode === 'live' && !process.env.ANTHROPIC_API_KEY) {
    console.error('AI_MODE=live requires ANTHROPIC_API_KEY (run with --env-file=.env). Refusing to start.');
    process.exit(1);
  }
  let service: SecureService;
  let bridge: LiveAiBridge | null = null;
  if (aiMode === 'live') {
    const live = createLiveApp({ dir: dataDir });
    service = live.service;
    bridge = live.bridge;
  } else {
    service = createAppService({ dir: dataDir });
  }
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const rawUrl = req.url ?? '/';
      // Strip the reverse-proxy base prefix before routing so the rest of the
      // handler continues to see root-relative paths ("/", "/api/...").
      let url = rawUrl;
      if (BASE_PATH && (url === BASE_PATH || url.startsWith(BASE_PATH + '/'))) {
        url = url.slice(BASE_PATH.length) || '/';
      }
      if (req.method === 'GET' && (url === '/' || url === '/officer-app')) {
        const html = readFileSync(UI_PATH, 'utf8').split('__BASE_PATH__').join(BASE_PATH);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      if (!url.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, code: 'NOT_FOUND', error: 'Unknown route' }));
        return;
      }
      let bodyJson: unknown = {};
      try {
        bodyJson = await readBody(req);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, code: 'INPUT_REJECTED', error: err instanceof Error ? err.message : 'Bad request' }));
        return;
      }
      const authHeader = req.headers.authorization ?? '';
      const sessionId = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const outcome = bridge
        ? await handleApiRequestLive(service, bridge, req.method ?? 'GET', url, bodyJson, sessionId)
        : handleApiRequest(service, req.method ?? 'GET', url, bodyJson, sessionId);
      res.writeHead(outcome.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(outcome.body));
    })().catch((err: unknown) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, code: 'INTERNAL', error: err instanceof Error ? err.message : 'Unexpected error' }));
    });
  });
  server.listen(PORT, () => {
    console.log(`LOCKUPHQ DR Writer officer app: http://localhost:${PORT}/`);
    console.log(`AI mode: ${aiMode}${aiMode === 'live' ? `   versions: ${JSON.stringify(LIVE_MODEL_PROMPT_VERSIONS)}` : ' (deterministic fakes)'}`);
    console.log('Synthetic demo users: officer.alex / synthetic-pw-1, sup.morgan / synthetic-pw-3');
    console.log(
      process.env['ADMIN_USERNAME'] && process.env['ADMIN_PASSWORD']
        ? `System admin account provisioned from ADMIN_USERNAME on this boot (first boot only).`
        : 'No system_admin account provisioned. Set ADMIN_USERNAME/ADMIN_PASSWORD before first boot to create one.'
    );
    console.log('DEMO ONLY — synthetic data, no real inmate data.');
  });
}

export function resolveAiMode(envMode: string | undefined, argv: string[]): 'stub' | 'live' {
  const arg = argv.find((value) => value.startsWith('--ai='));
  const requested = arg ? arg.slice('--ai='.length) : envMode ?? 'stub';
  if (requested !== 'stub' && requested !== 'live') {
    throw new Error(`Invalid AI mode "${requested}"; expected AI_MODE=stub or AI_MODE=live`);
  }
  return requested;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);
if (isMain) {
  // ===========================================================================
  // ⚠️  PERSISTENCE ENABLED — TESTING PHASE ONLY (synthetic fixtures only)  ⚠️
  // ===========================================================================
  // The boot-time data-dir WIPE HAS BEEN INTENTIONALLY REMOVED so that reports
  // and the append-only, hash-chained audit log SURVIVE restarts and redeploys
  // during the trusted-tester phase. This lets us review completed reports and
  // the audit trail after several days of testing instead of losing everything
  // on every ship.
  //
  // This is ONLY safe because the app can currently reference nothing but
  // SYNTHETIC FIXTURE inmates (e.g. "Sam Synthetic", "Robin Sibling"). No real
  // inmate PII can be entered, so nothing sensitive is written to disk. It also
  // assumes a Reserved VM (single instance) with a durable, NON-tmpfs
  // DR_WRITER_DATA_DIR — autoscale or a /dev/shm data dir would erase or split
  // the data regardless of this flag.
  //
  // 🚨🚨🚨  DO NOT SHIP REAL INMATE DATA WITHOUT RESTORING THE WIPE  🚨🚨🚨
  // Before ANY real-PII capability is enabled (a real add-inmate flow, a roster
  // import, live subject data, etc.), this MUST be reverted so real inmate data
  // never persists on local disk. Restore the boot wipe here:
  //
  //     import { rmSync } from 'node:fs';
  //     rmSync(dataDir, { recursive: true, force: true });
  //
  // (or migrate to encrypted/managed storage with a retention policy). Leaving
  // persistence on with real PII is a data-handling violation, not just a bug.
  // ===========================================================================
  const dataDir = process.env['DR_WRITER_DATA_DIR'] || resolve(__dirname, '../../../data/app-server');
  startServer(dataDir);
}
