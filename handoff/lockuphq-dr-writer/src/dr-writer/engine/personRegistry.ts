// LOCKUPHQ DR Writer — Person registry (blueprint §5.1, Stage 8).
// All fact speakers, subjects, witnesses, and order issuers reference person_id,
// not free-text names. Ambiguous references create ambiguous_person_reference
// records; same-last-name cases cannot continue with a bare string.

import type { AmbiguousPersonReference, Person } from './types.ts';
import { hashValue } from './hash.ts';

export class PersonRegistry {
  private persons = new Map<string, Person>();
  private references = new Map<string, AmbiguousPersonReference>();
  private refCounter = 0;

  add(person: Person): void {
    if (this.persons.has(person.person_id)) {
      throw new Error(`Duplicate person_id: ${person.person_id}`);
    }
    this.persons.set(person.person_id, person);
  }

  get(personId: string): Person | null {
    return this.persons.get(personId) ?? null;
  }

  all(): Person[] {
    return [...this.persons.values()];
  }

  // Resolve a free-text last-name reference within a report's scope.
  // Exactly one candidate -> that person_id. Zero or multiple candidates ->
  // an ambiguous_person_reference that must be resolved by the officer.
  resolveReference(
    reportId: string,
    rawText: string,
    scopePersonIds: string[]
  ): { person_id: string } | { reference: AmbiguousPersonReference } {
    const needle = rawText.trim().toLowerCase();
    const candidates = scopePersonIds
      .map((id) => this.persons.get(id))
      .filter((p): p is Person => p !== undefined)
      .filter((p) => p.last_name.toLowerCase() === needle);

    if (candidates.length === 1) {
      return { person_id: candidates[0].person_id };
    }
    this.refCounter += 1;
    const reference: AmbiguousPersonReference = {
      reference_id: `ref-${this.refCounter}`,
      report_id: reportId,
      raw_text: rawText,
      candidate_person_ids: candidates.map((p) => p.person_id),
      resolved_person_id: null,
    };
    this.references.set(reference.reference_id, reference);
    return { reference };
  }

  getReference(referenceId: string): AmbiguousPersonReference | null {
    return this.references.get(referenceId) ?? null;
  }

  // Stage 8 — the officer selects or creates the correct registry entry.
  resolveAmbiguity(referenceId: string, personId: string): AmbiguousPersonReference {
    const reference = this.references.get(referenceId);
    if (!reference) throw new Error(`Unknown ambiguous reference: ${referenceId}`);
    const person = this.persons.get(personId);
    if (!person) throw new Error(`Cannot resolve reference to unknown person: ${personId}`);
    if (reference.candidate_person_ids.length > 0 && !reference.candidate_person_ids.includes(personId)) {
      throw new Error(`Person ${personId} is not a candidate for reference ${referenceId}`);
    }
    reference.resolved_person_id = personId;
    return reference;
  }

  registryHash(): string {
    return hashValue(this.all().sort((a, b) => (a.person_id < b.person_id ? -1 : 1)));
  }

  // Phase 7 — plain-data snapshot for atomic persistence and crash recovery.
  serialize(): PersonRegistryState {
    return {
      persons: [...this.persons.values()].map((p) => ({ ...p })),
      references: [...this.references.values()].map((r) => ({ ...r, candidate_person_ids: [...r.candidate_person_ids] })),
      refCounter: this.refCounter,
    };
  }

  restore(state: PersonRegistryState): void {
    this.persons = new Map(state.persons.map((p) => [p.person_id, { ...p }]));
    this.references = new Map(state.references.map((r) => [r.reference_id, { ...r, candidate_person_ids: [...r.candidate_person_ids] }]));
    this.refCounter = state.refCounter;
  }
}

export interface PersonRegistryState {
  persons: Person[];
  references: AmbiguousPersonReference[];
  refCounter: number;
}
