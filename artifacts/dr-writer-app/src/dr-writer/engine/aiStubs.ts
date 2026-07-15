// LOCKUPHQ DR Writer — deterministic AI fakes for Phases 2-3.
// Blueprint §18: no real AI integration before Phase 4. Every "model" call in
// the engine goes through this interface, and the default implementations are
// pure deterministic functions over the synthetic incident format below.
//
// Synthetic incident format (Phase 3 — "synthetic incident format"):
// notes are line-oriented; the fake extractor understands:
//
//   FACT|category=<cat>|value=<text>|speaker=<P-id | @LastName | ->|subject=<P-id | @LastName | ->|certainty=<exact|approximate|unknown>
//   ORDER|issuer=<P-id>|command=<text>|authority=<supported|unsupported|unknown>|applicability=<applies|does_not_apply|unknown>|compliance=<complied|did_not_comply|partial|unknown>|timing=<timely|delayed|none|unknown>|rescinded_before_conduct=<yes|no>
//   CANNOT_DETERMINE          -> extractor returns CANNOT_DETERMINE (invariant 12)
//   INJECT|<anything>         -> extractor flags injection_suspected (invariant 17)
//   MALFORMED                 -> extractor emits malformed output (retry/hold path)
//
// Anything else is ignored as free prose. `@LastName` produces a person
// reference that the engine must resolve through the person registry (Stage 8).

import type { FactCertainty, NarrativeSentence, OrderEvent } from './types.ts';

export interface ExtractedFactDraft {
  category: string;
  value: string;
  certainty: FactCertainty;
  speaker_ref: string | null; // 'P-...' direct id or '@Name' unresolved reference
  subject_ref: string | null;
  source_line: string; // exact source passage
}

export interface ExtractedOrderDraft {
  issuer_ref: string;
  specific_command: string;
  authority_status: 'supported' | 'unsupported' | 'unknown';
  subject_applicability: 'applies' | 'does_not_apply' | 'unknown';
  compliance_result: 'complied' | 'did_not_comply' | 'partial' | 'unknown';
  compliance_timing: 'timely' | 'delayed' | 'none' | 'unknown';
  rescinded_before_conduct: boolean;
  source_line: string;
}

export type ExtractionOutput =
  | { outcome: 'facts'; facts: ExtractedFactDraft[]; orders: ExtractedOrderDraft[]; injection_suspected: boolean }
  | { outcome: 'CANNOT_DETERMINE' }
  | { outcome: 'malformed' };

export interface CriticOutput {
  completeness_confirmed: boolean;
  findings: string[];
}

export interface GeneratedSentenceDraft {
  section: string;
  text: string;
  source_fact_ids: string[];
  certainty: FactCertainty;
}

export type ResourcingOutput = { fact_ids: string[] } | 'UNSUPPORTED';

export interface SemanticValidationOutput {
  passed: boolean;
  issues: string[];
}

export interface AiStubs {
  extract(text: string): ExtractionOutput;
  critic(noteText: string, extractedFactCount: number): CriticOutput;
  generate(facts: { fact_id: string; category: string; value: string; certainty: FactCertainty }[]): GeneratedSentenceDraft[];
  resource(
    sentenceText: string,
    confirmedFacts: { fact_id: string; value: string }[]
  ): ResourcingOutput;
  semanticValidate(sentences: NarrativeSentence[]): SemanticValidationOutput;
  // Stage 14 — OPTIONAL intent selection assist. The model may only RANK or
  // SUBSET the approved, applicable intents the engine hands it; the engine
  // discards anything outside that list. AI never authors question text.
  selectIntents?(
    unresolvedSlots: string[],
    approvedIntents: { intent_id: string; ledger_slot: string }[]
  ): string[];
}

function parseFields(line: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of line.split('|').slice(1)) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return fields;
}

function parseCertainty(raw: string | undefined): FactCertainty {
  return raw === 'exact' || raw === 'approximate' ? raw : 'unknown';
}

function parseRef(raw: string | undefined): string | null {
  if (!raw || raw === '-') return null;
  return raw;
}

export function deterministicExtract(text: string): ExtractionOutput {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.some((l) => l === 'MALFORMED')) return { outcome: 'malformed' };
  if (lines.some((l) => l === 'CANNOT_DETERMINE')) return { outcome: 'CANNOT_DETERMINE' };

  const facts: ExtractedFactDraft[] = [];
  const orders: ExtractedOrderDraft[] = [];
  let injection = false;

  for (const line of lines) {
    if (line.startsWith('INJECT|')) {
      injection = true;
      continue;
    }
    if (line.startsWith('FACT|')) {
      const f = parseFields(line);
      if (!f.category || !f.value) return { outcome: 'malformed' };
      facts.push({
        category: f.category,
        value: f.value,
        certainty: parseCertainty(f.certainty),
        speaker_ref: parseRef(f.speaker),
        subject_ref: parseRef(f.subject),
        source_line: line,
      });
      continue;
    }
    if (line.startsWith('ORDER|')) {
      const f = parseFields(line);
      if (!f.issuer || !f.command) return { outcome: 'malformed' };
      orders.push({
        issuer_ref: f.issuer,
        specific_command: f.command,
        authority_status: (f.authority as ExtractedOrderDraft['authority_status']) ?? 'unknown',
        subject_applicability: (f.applicability as ExtractedOrderDraft['subject_applicability']) ?? 'unknown',
        compliance_result: (f.compliance as ExtractedOrderDraft['compliance_result']) ?? 'unknown',
        compliance_timing: (f.timing as ExtractedOrderDraft['compliance_timing']) ?? 'unknown',
        rescinded_before_conduct: f.rescinded_before_conduct === 'yes',
        source_line: line,
      });
    }
    // Free prose lines are ignored; the extractor never invents facts.
  }

  return { outcome: 'facts', facts, orders, injection_suspected: injection };
}

export function deterministicCritic(noteText: string, extractedFactCount: number): CriticOutput {
  const expected = noteText
    .split('\n')
    .filter((l) => l.trim().startsWith('FACT|')).length;
  const findings: string[] = [];
  if (extractedFactCount < expected) findings.push('possible omitted facts');
  if (extractedFactCount > expected) findings.push('possible added facts');
  return { completeness_confirmed: findings.length === 0, findings };
}

export function deterministicGenerate(
  facts: { fact_id: string; category: string; value: string; certainty: FactCertainty }[]
): GeneratedSentenceDraft[] {
  // One sentence per confirmed fact, in ledger order. The generator copies the
  // fact value verbatim so quoted passages remain contained in their source.
  return facts.map((fact) => ({
    section: fact.category,
    text:
      fact.certainty === 'approximate'
        ? `At approximately the stated time, the following was documented: ${fact.value}.`
        : `The following was documented: ${fact.value}.`,
    source_fact_ids: [fact.fact_id],
    certainty: fact.certainty,
  }));
}

export function deterministicResource(
  sentenceText: string,
  confirmedFacts: { fact_id: string; value: string }[]
): ResourcingOutput {
  // The only allowed outputs are existing confirmed fact IDs or UNSUPPORTED
  // (Stage 20). Match: the fact value appears verbatim in the sentence.
  const matches = confirmedFacts.filter((f) => sentenceText.includes(f.value));
  if (matches.length === 0) return 'UNSUPPORTED';
  return { fact_ids: matches.map((f) => f.fact_id) };
}

const SEMANTIC_FORBIDDEN = [
  'intended to',
  'guilty',
  'deserves punishment',
  'was lying',
  'malingering',
  'psychotic',
];

export function deterministicSemanticValidate(sentences: NarrativeSentence[]): SemanticValidationOutput {
  const issues: string[] = [];
  for (const s of sentences) {
    for (const phrase of SEMANTIC_FORBIDDEN) {
      if (s.text.toLowerCase().includes(phrase)) {
        issues.push(`sentence ${s.sentence_id}: unsupported conclusion phrase "${phrase}"`);
      }
    }
  }
  return { passed: issues.length === 0, issues };
}

export function defaultAiStubs(): AiStubs {
  return {
    extract: deterministicExtract,
    critic: deterministicCritic,
    generate: deterministicGenerate,
    resource: deterministicResource,
    semanticValidate: deterministicSemanticValidate,
  };
}
