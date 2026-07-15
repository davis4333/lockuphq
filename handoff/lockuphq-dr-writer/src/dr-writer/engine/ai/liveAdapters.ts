// LOCKUPHQ DR Writer — live AI adapters (blueprint §18 Phases 4 and 6).
// Each adapter calls the real Anthropic API through the project's existing
// claudeClient and maps the response onto the SAME output types the
// deterministic fakes produce, so the engine's enforcement (schema limits,
// fact-ID checks, retry bounds) applies identically to live output.
//
// Malformed or partial model output receives at most two idempotent retries
// (Stage 6), then the adapter throws — it never fabricates a result.

import { createClaudeClient } from '../../llm/claudeClient.ts';
import type {
  CriticOutput,
  ExtractedFactDraft,
  ExtractedOrderDraft,
  ExtractionOutput,
  GeneratedSentenceDraft,
  ResourcingOutput,
  SemanticValidationOutput,
} from '../aiStubs.ts';
import type { FactCertainty } from '../types.ts';
import {
  CRITIC_SYSTEM_PROMPT,
  EXTRACTOR_SYSTEM_PROMPT,
  FACT_CATEGORIES,
  GENERATOR_SYSTEM_PROMPT,
  INTENT_SELECTOR_SYSTEM_PROMPT,
  LIVE_MODELS,
  RESOURCER_SYSTEM_PROMPT,
  SEMANTIC_SYSTEM_PROMPT,
  criticUserPrompt,
  extractorUserPrompt,
  generatorUserPrompt,
  intentSelectorUserPrompt,
  resourcerUserPrompt,
  semanticUserPrompt,
} from './promptVersions.ts';

const MAX_MALFORMED_RETRIES = 2;

export class LiveAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveAdapterError';
  }
}

function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

async function callJson(
  role: keyof typeof LIVE_MODELS,
  systemPrompt: string,
  userPrompt: string,
  validate: (parsed: unknown) => string | null
): Promise<unknown> {
  const client = createClaudeClient({ model: LIVE_MODELS[role], temperature: 0, maxTokens: 4096 });
  let lastProblem = '';
  for (let attempt = 0; attempt <= MAX_MALFORMED_RETRIES; attempt++) {
    const raw = await client.completeJson({ systemPrompt, userPrompt });
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      lastProblem = 'response was not valid JSON';
      continue;
    }
    const problem = validate(parsed);
    if (problem === null) return parsed;
    lastProblem = problem;
  }
  throw new LiveAdapterError(`[${role}] malformed output after ${MAX_MALFORMED_RETRIES + 1} attempts: ${lastProblem}`);
}

function asCertainty(raw: unknown): FactCertainty {
  return raw === 'exact' || raw === 'approximate' ? raw : 'unknown';
}

function asEnum<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

// ---------------------------------------------------------------------------
// Stage 6 — live extraction
// ---------------------------------------------------------------------------

interface RawExtraction {
  outcome: string;
  injection_suspected?: boolean;
  facts?: {
    category?: string;
    value?: string;
    certainty?: string;
    speaker_name?: string | null;
    subject_name?: string | null;
    source_passage?: string;
  }[];
  orders?: {
    issuer_name?: string;
    specific_command?: string;
    authority?: string;
    applicability?: string;
    compliance?: string;
    timing?: string;
    rescinded_before_conduct?: boolean;
    source_passage?: string;
  }[];
}

export async function liveExtract(
  notes: string,
  // Resolves an order issuer's last name to a registered person_id. Fails
  // closed by throwing when the name is unknown or ambiguous.
  resolveIssuer: (lastName: string) => string
): Promise<ExtractionOutput> {
  const parsed = (await callJson('extractor', EXTRACTOR_SYSTEM_PROMPT, extractorUserPrompt(notes), (p) => {
    const r = p as RawExtraction;
    if (!r || typeof r !== 'object') return 'not an object';
    if (r.outcome !== 'facts' && r.outcome !== 'CANNOT_DETERMINE') return `bad outcome: ${String(r.outcome)}`;
    if (r.outcome === 'facts') {
      if (!Array.isArray(r.facts)) return 'facts is not an array';
      for (const f of r.facts) {
        if (!f.category || !f.value || !f.source_passage) return 'fact missing category/value/source_passage';
      }
      if (!Array.isArray(r.orders)) return 'orders is not an array';
      for (const o of r.orders) {
        if (!o.issuer_name || !o.specific_command || !o.source_passage) return 'order missing issuer/command/source_passage';
      }
      // Cross-field consistency: an order entry without any specific_order
      // fact is partial output (the fact ledger would be missing the
      // directive the charge rests on) — retried, never repaired here.
      if (r.orders.length > 0 && !r.facts.some((f) => f.category === 'specific_order')) {
        return 'orders present but no specific_order fact extracted';
      }
    }
    return null;
  })) as RawExtraction;

  if (parsed.outcome === 'CANNOT_DETERMINE') {
    return { outcome: 'CANNOT_DETERMINE' };
  }

  const facts: ExtractedFactDraft[] = (parsed.facts ?? []).map((f) => ({
    category: asEnum(f.category, FACT_CATEGORIES, 'other'),
    value: String(f.value),
    certainty: asCertainty(f.certainty),
    // Names go through the person registry as '@Name' references — the engine
    // resolves them and creates ambiguous_person_reference records when two
    // registered people share the last name (Stage 8).
    speaker_ref: f.speaker_name ? `@${String(f.speaker_name)}` : null,
    subject_ref: f.subject_name ? `@${String(f.subject_name)}` : null,
    source_line: String(f.source_passage),
  }));

  const orders: ExtractedOrderDraft[] = (parsed.orders ?? []).map((o) => ({
    issuer_ref: resolveIssuer(String(o.issuer_name)),
    specific_command: String(o.specific_command),
    authority_status: asEnum(o.authority, ['supported', 'unsupported', 'unknown'] as const, 'unknown'),
    subject_applicability: asEnum(o.applicability, ['applies', 'does_not_apply', 'unknown'] as const, 'unknown'),
    compliance_result: asEnum(o.compliance, ['complied', 'did_not_comply', 'partial', 'unknown'] as const, 'unknown'),
    compliance_timing: asEnum(o.timing, ['timely', 'delayed', 'none', 'unknown'] as const, 'unknown'),
    rescinded_before_conduct: o.rescinded_before_conduct === true,
    source_line: String(o.source_passage),
  }));

  return { outcome: 'facts', facts, orders, injection_suspected: parsed.injection_suspected === true };
}

// ---------------------------------------------------------------------------
// Stage 7 — live critic (different model, separately configured prompt)
// ---------------------------------------------------------------------------

export async function liveCritic(notes: string, extractedFacts: { category: string; value: string }[]): Promise<CriticOutput> {
  const parsed = (await callJson(
    'critic',
    CRITIC_SYSTEM_PROMPT,
    criticUserPrompt(notes, JSON.stringify(extractedFacts, null, 2)),
    (p) => {
      const r = p as { completeness_confirmed?: unknown; findings?: unknown };
      if (!r || typeof r !== 'object') return 'not an object';
      if (typeof r.completeness_confirmed !== 'boolean') return 'completeness_confirmed missing';
      if (!Array.isArray(r.findings)) return 'findings is not an array';
      return null;
    }
  )) as { completeness_confirmed: boolean; findings: unknown[] };
  return {
    completeness_confirmed: parsed.completeness_confirmed,
    findings: parsed.findings.map((f) => String(f)),
  };
}

// ---------------------------------------------------------------------------
// Stage 14 — live intent selection (approved intents only; the engine
// independently discards anything outside the approved applicable list)
// ---------------------------------------------------------------------------

export async function liveSelectIntents(
  unresolvedSlots: string[],
  approvedIntents: { intent_id: string; ledger_slot: string }[],
  maxCount: number
): Promise<string[]> {
  const parsed = (await callJson(
    'intent_selector',
    INTENT_SELECTOR_SYSTEM_PROMPT,
    intentSelectorUserPrompt(unresolvedSlots, approvedIntents, maxCount),
    (p) => {
      const r = p as { intent_ids?: unknown };
      if (!r || typeof r !== 'object' || !Array.isArray(r.intent_ids)) return 'intent_ids is not an array';
      return null;
    }
  )) as { intent_ids: unknown[] };
  // Adapter-level constraint: only approved ids survive.
  const approved = new Set(approvedIntents.map((i) => i.intent_id));
  return parsed.intent_ids.map((id) => String(id)).filter((id) => approved.has(id));
}

// ---------------------------------------------------------------------------
// Stage 17 — live narrative generation
// ---------------------------------------------------------------------------

export async function liveGenerate(
  facts: { fact_id: string; category: string; value: string; certainty: FactCertainty }[],
  reportingOfficer: string
): Promise<GeneratedSentenceDraft[]> {
  const parsed = (await callJson(
    'generator',
    GENERATOR_SYSTEM_PROMPT,
    generatorUserPrompt(JSON.stringify(facts, null, 2), reportingOfficer),
    (p) => {
      const r = p as { sentences?: unknown };
      if (!r || typeof r !== 'object' || !Array.isArray(r.sentences)) return 'sentences is not an array';
      for (const s of r.sentences as { text?: unknown; source_fact_ids?: unknown }[]) {
        if (typeof s.text !== 'string' || !Array.isArray(s.source_fact_ids)) return 'sentence missing text/source_fact_ids';
      }
      return null;
    }
  )) as { sentences: { section?: string; text: string; source_fact_ids: unknown[]; certainty?: string }[] };

  return parsed.sentences.map((s) => ({
    section: String(s.section ?? 'narrative'),
    text: s.text,
    source_fact_ids: s.source_fact_ids.map((id) => String(id)),
    certainty: asCertainty(s.certainty),
  }));
}

// ---------------------------------------------------------------------------
// Stage 20 — live constrained re-sourcing (existing fact IDs or UNSUPPORTED)
// ---------------------------------------------------------------------------

export async function liveResource(
  sentenceText: string,
  confirmedFacts: { fact_id: string; value: string }[]
): Promise<ResourcingOutput> {
  const parsed = (await callJson(
    'resourcer',
    RESOURCER_SYSTEM_PROMPT,
    resourcerUserPrompt(sentenceText, JSON.stringify(confirmedFacts, null, 2)),
    (p) => {
      const r = p as { supported?: unknown; fact_ids?: unknown };
      if (!r || typeof r !== 'object') return 'not an object';
      if (typeof r.supported !== 'boolean' || !Array.isArray(r.fact_ids)) return 'missing supported/fact_ids';
      return null;
    }
  )) as { supported: boolean; fact_ids: unknown[] };

  if (!parsed.supported || parsed.fact_ids.length === 0) return 'UNSUPPORTED';
  // The engine independently rejects IDs outside the confirmed ledger; this is
  // just the adapter-level mapping.
  return { fact_ids: parsed.fact_ids.map((id) => String(id)) };
}

// ---------------------------------------------------------------------------
// Stage 19 — live semantic validation (reports issues; cannot repair)
// ---------------------------------------------------------------------------

export async function liveSemanticValidate(
  sentences: { sentence_id: string; text: string; source_fact_ids: string[] }[],
  confirmedFacts: { fact_id: string; value: string }[],
  reportingOfficer: string
): Promise<SemanticValidationOutput> {
  const parsed = (await callJson(
    'semantic_validator',
    SEMANTIC_SYSTEM_PROMPT,
    semanticUserPrompt(JSON.stringify(sentences, null, 2), JSON.stringify(confirmedFacts, null, 2), reportingOfficer),
    (p) => {
      const r = p as { passed?: unknown; issues?: unknown };
      if (!r || typeof r !== 'object') return 'not an object';
      if (typeof r.passed !== 'boolean' || !Array.isArray(r.issues)) return 'missing passed/issues';
      return null;
    }
  )) as { passed: boolean; issues: unknown[] };
  return { passed: parsed.passed, issues: parsed.issues.map((i) => String(i)) };
}
