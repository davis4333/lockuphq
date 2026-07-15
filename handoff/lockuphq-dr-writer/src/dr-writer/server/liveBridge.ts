// LOCKUPHQ DR Writer — live-AI bridge for the serving path (blueprint §18
// Phase 9 prep). Connects the Phase 4/6 live adapters to the app server
// through the mailbox pattern: live output is pre-fetched asynchronously,
// placed in the engine's mailbox, and then the SYNCHRONOUS engine stage
// consumes it — so every engine enforcement (source-ID checks, hash binding,
// retry bounds, gates) applies to live output exactly as to the fakes.
//
// Frozen model/prompt versions only (promptVersions.ts). Malformed live
// output already gets two idempotent retries inside the adapters (Stage 6);
// when it is STILL malformed the bridge raises SYSTEM HOLD on the report
// (Trigger C) — it never fabricates a result and never falls back to stubs.
//
// Adapter functions are injectable so integration tests can drive the live
// path without network calls; production uses the real adapters.

import type { Mailbox } from '../engine/ai/mailbox.ts';
import type { GeneratedSentenceDraft } from '../engine/aiStubs.ts';
import {
  liveCritic,
  liveExtract,
  liveGenerate,
  liveResource,
  liveSelectIntents,
  liveSemanticValidate,
  LiveAdapterError,
} from '../engine/ai/liveAdapters.ts';
import type { SecureService } from '../engine/service/secureService.ts';

export interface LiveAdapters {
  extract: typeof liveExtract;
  critic: typeof liveCritic;
  generate: typeof liveGenerate;
  resource: typeof liveResource;
  semantic: typeof liveSemanticValidate;
  selectIntents: typeof liveSelectIntents;
}

export function realLiveAdapters(): LiveAdapters {
  return {
    extract: liveExtract,
    critic: liveCritic,
    generate: liveGenerate,
    resource: liveResource,
    semantic: liveSemanticValidate,
    selectIntents: liveSelectIntents,
  };
}

export class LiveAiBridge {
  private readonly service: SecureService;
  private readonly mailbox: Mailbox;
  private readonly adapters: LiveAdapters;

  constructor(service: SecureService, mailbox: Mailbox, adapters: LiveAdapters = realLiveAdapters()) {
    this.service = service;
    this.mailbox = mailbox;
    this.adapters = adapters;
  }

  private async callAdapter<T>(stage: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (err) {
      if (err instanceof LiveAdapterError) throw err;
      throw new LiveAdapterError(`${stage} call failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Resolves an order issuer's last name to a person_id within the report's
  // participant scope. Fails closed on unknown/ambiguous names.
  private issuerResolver(reportId: string): (lastName: string) => string {
    const participants = this.service.engine.getWorkspaceMeta(reportId).participants;
    return (lastName: string) => {
      const token = lastName.trim().split(/\s+/).pop()!.toLowerCase();
      const matches = participants
        .map((id) => this.service.engine.persons.get(id))
        .filter((p) => p !== null && p.last_name.toLowerCase() === token);
      if (matches.length === 1) return matches[0]!.person_id;
      throw new LiveAdapterError(`cannot uniquely resolve order issuer "${lastName}" among report participants`);
    };
  }

  private officerName(reportId: string): string {
    const admin = this.service.engine.inspect(reportId).admin;
    const person = admin ? this.service.engine.persons.get(admin.reporting_officer_person_id) : null;
    if (!person) return 'the reporting officer';
    return `${person.rank_or_role ?? ''} ${person.last_name}`.trim();
  }

  async prepareExtraction(reportId: string, notesText: string): Promise<void> {
    this.mailbox.extract = await this.callAdapter('extractor', () => this.adapters.extract(notesText, this.issuerResolver(reportId)));
  }

  async prepareCritic(reportId: string, notesText: string): Promise<void> {
    const facts = this.service.engine
      .inspect(reportId)
      .facts.filter((f) => f.extraction_status !== 'superseded')
      .map((f) => ({ category: f.category, value: f.value }));
    this.mailbox.critic = await this.callAdapter('critic', () => this.adapters.critic(notesText, facts));
  }

  private confirmedFacts(reportId: string): { fact_id: string; value: string }[] {
    return this.service.engine
      .inspect(reportId)
      .facts.filter((f) => f.confirmation_status === 'confirmed' && f.extraction_status !== 'superseded')
      .map((f) => ({ fact_id: f.fact_id, value: f.value }));
  }

  async prepareGeneration(reportId: string): Promise<GeneratedSentenceDraft[]> {
    const facts = this.service.engine
      .inspect(reportId)
      .facts.filter(
        (f) =>
          f.confirmation_status === 'confirmed' &&
          f.extraction_status !== 'superseded'
      )
      .map((f) => ({ fact_id: f.fact_id, category: f.category, value: f.value, certainty: f.certainty }));
    const generated = await this.callAdapter('generator', () => this.adapters.generate(facts, this.officerName(reportId)));
    this.mailbox.generate = generated;
    return generated;
  }

  async prepareSemantic(reportId: string): Promise<void> {
    const insp = this.service.engine.inspect(reportId);
    if (!insp.narrative) throw new LiveAdapterError('no narrative to validate');
    this.mailbox.semantic = await this.callAdapter('semantic validator', () => this.adapters.semantic(
      insp.narrative.sentences.map((s) => ({ sentence_id: s.sentence_id, text: s.text, source_fact_ids: s.source_fact_ids })),
      this.confirmedFacts(reportId),
      this.officerName(reportId)
    ));
  }

  async prepareSemanticForDraft(reportId: string, drafts: GeneratedSentenceDraft[]): Promise<void> {
    this.mailbox.semantic = await this.callAdapter('semantic validator', () => this.adapters.semantic(
      drafts.map((draft, index) => ({
        sentence_id: `pending-${index + 1}`,
        text: draft.text,
        source_fact_ids: draft.source_fact_ids,
      })),
      this.confirmedFacts(reportId),
      this.officerName(reportId)
    ));
  }

  async prepareResource(reportId: string, sentenceId: string): Promise<void> {
    const insp = this.service.engine.inspect(reportId);
    const sentence = insp.narrative?.sentences.find((s) => s.sentence_id === sentenceId);
    if (!sentence) throw new LiveAdapterError(`no sentence ${sentenceId} to re-source`);
    this.mailbox.resource = await this.callAdapter('resourcer', () => this.adapters.resource(
      sentence.text,
      this.confirmedFacts(reportId)
    ));
  }

  // Stage 14 stays constrained to approved intents. Malformed output throws;
  // the serving path raises SYSTEM HOLD after the adapter retry bound.
  async prepareIntentSelection(reportId: string): Promise<void> {
    const insp = this.service.engine.inspect(reportId);
    const evaln = insp.chargeEvaluation;
    if (!evaln) return;
    const unresolved = [...evaln.missing_categories, ...evaln.unconfirmed_categories];
    if (unresolved.length === 0) return;
    const approved = this.service.engine.packet.question_intents
      .filter((qi) => unresolved.includes(qi.ledger_slot))
      .map((qi) => ({ intent_id: qi.intent_id, ledger_slot: qi.ledger_slot }));
    if (approved.length === 0) return;
    this.mailbox.selectIntents = await this.callAdapter('intent selector', () => this.adapters.selectIntents(unresolved, approved, 5));
  }
}
