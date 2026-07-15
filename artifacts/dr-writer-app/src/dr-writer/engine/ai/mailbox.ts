// LOCKUPHQ DR Writer — mailbox stubs: feed pre-fetched LIVE model output
// through the synchronous engine so every engine enforcement (source-ID
// checks, hash binding, retry bounds, gates) applies to real model output
// exactly as it does to the deterministic fakes.
//
// Fail closed: if an engine stage consumes a stub whose mailbox slot was not
// pre-filled, the stub throws — live runs never silently fall back to fakes.

import type {
  AiStubs,
  CriticOutput,
  ExtractionOutput,
  GeneratedSentenceDraft,
  ResourcingOutput,
  SemanticValidationOutput,
} from '../aiStubs.ts';

export interface Mailbox {
  extract: ExtractionOutput | null;
  critic: CriticOutput | null;
  generate: GeneratedSentenceDraft[] | null;
  resource: ResourcingOutput | null;
  semantic: SemanticValidationOutput | null;
  selectIntents: string[] | null;
}

export function createMailboxStubs(): { mailbox: Mailbox; stubs: Partial<AiStubs> } {
  const mailbox: Mailbox = { extract: null, critic: null, generate: null, resource: null, semantic: null, selectIntents: null };

  const take = <K extends keyof Mailbox>(slot: K): NonNullable<Mailbox[K]> => {
    const value = mailbox[slot];
    if (value === null) {
      throw new Error(`Mailbox slot "${slot}" is empty — live output was not pre-fetched (fail closed)`);
    }
    mailbox[slot] = null; // single use
    return value as NonNullable<Mailbox[K]>;
  };

  const stubs: Partial<AiStubs> = {
    extract: () => take('extract'),
    critic: () => take('critic'),
    generate: () => take('generate'),
    resource: () => take('resource'),
    semanticValidate: () => take('semantic'),
    // Intent selection is optional assist: an empty mailbox means "no AI
    // proposal this round" and the engine's deterministic approved list runs.
    selectIntents: () => (mailbox.selectIntents === null ? [] : take('selectIntents')),
  };

  return { mailbox, stubs };
}
