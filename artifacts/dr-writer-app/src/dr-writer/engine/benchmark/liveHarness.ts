// LOCKUPHQ DR Writer — shared harness for driving LIVE model output through
// the engine (used by the Phase 4 extraction benchmark and the Phase 6
// narrative benchmark). Synthetic data only.

import { Engine } from '../engine.ts';
import { SYNTHETIC_PACKET_6_1, SYNTHETIC_POLICY_PROFILE } from '../packets.ts';
import { LIVE_MODEL_PROMPT_VERSIONS } from '../ai/promptVersions.ts';
import { createMailboxStubs, type Mailbox } from '../ai/mailbox.ts';
import { INCIDENT_DATE, addStandardPersons, adminIntake, goodRegistries, newReport, type Ctx } from '../tests/fixtures.ts';
import type { ExtractionOutput } from '../aiStubs.ts';
import type { GoldCase } from './goldCases.ts';

export function buildLiveEngine(): { engine: Engine; mailbox: Mailbox } {
  const { requirements, sources } = goodRegistries();
  const { mailbox, stubs } = createMailboxStubs();
  const engine = Engine.create({
    requirements,
    sources,
    packet: SYNTHETIC_PACKET_6_1,
    policy: { ...SYNTHETIC_POLICY_PROFILE, model_prompt_versions: LIVE_MODEL_PROMPT_VERSIONS },
    deployment_check_date: INCIDENT_DATE,
    stubs,
  });
  addStandardPersons(engine);
  engine.addPerson({
    person_id: 'P-NURSE',
    report_id: null,
    incident_group_id: null,
    person_type: 'medical_staff',
    first_name: 'Riley',
    last_name: 'Adams',
    initial: 'R',
    rank_or_role: 'Nurse',
    dc_number: null,
    identity_source: 'synthetic-roster',
    confirmation_status: 'confirmed',
    ambiguity_status: 'unambiguous',
  });
  return { engine, mailbox };
}

export function makeIssuerResolver(engine: Engine, participants: string[]): (lastName: string) => string {
  return (lastName: string) => {
    const token = lastName.trim().split(/\s+/).pop()!.toLowerCase();
    const matches = participants
      .map((id) => engine.persons.get(id))
      .filter((p) => p !== null && p.last_name.toLowerCase() === token);
    if (matches.length === 1) return matches[0]!.person_id;
    throw new Error(`cannot uniquely resolve order issuer "${lastName}" among participants`);
  };
}

export function confirmUnambiguousFacts(engine: Engine, c: Ctx): void {
  const facts = engine
    .inspect(c.rid)
    .facts.filter((f) => f.extraction_status !== 'superseded' && f.ambiguous_reference_id === null);
  engine.confirmFacts(c.rid, c.v(), c.op, {
    ledger_hash_shown: engine.currentLedgerHash(c.rid),
    displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
    decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
    started_at: '2026-06-01T22:00:00Z',
    submitted_at: '2026-06-01T22:30:00Z',
  });
}

// Drives a live-extracted case into the engine: admin intake, procedural
// screen, notes commit, extraction ingest. Returns the report context.
export function ingestIntoEngine(engine: Engine, mailbox: Mailbox, gc: GoldCase, output: ExtractionOutput): Ctx {
  const c = newReport(engine, { participants: gc.participants });
  engine.setAdministrativeIntake(c.rid, c.v(), c.op, adminIntake());
  engine.submitProceduralScreen(c.rid, c.v(), c.op, { force_used: 'no' });
  engine.commitOriginalNotes(c.rid, c.v(), c.op, { text: gc.notes, request_id: `bench-${gc.id}` });
  mailbox.extract = output;
  engine.runExtraction(c.rid, c.v(), c.op);
  return c;
}

// The exact fact list the engine's generator stub will receive (Stage 17):
// confirmed, non-superseded facts in the packet's required categories, in
// ledger order.
export function generatorFacts(engine: Engine, reportId: string): { fact_id: string; category: string; value: string; certainty: 'exact' | 'approximate' | 'unknown' }[] {
  return engine
    .inspect(reportId)
    .facts.filter(
      (f) =>
        f.confirmation_status === 'confirmed' &&
        f.extraction_status !== 'superseded' &&
        SYNTHETIC_PACKET_6_1.required_fact_categories.includes(f.category)
    )
    .map((f) => ({ fact_id: f.fact_id, category: f.category, value: f.value, certainty: f.certainty }));
}

export function confirmedFactValues(engine: Engine, reportId: string): { fact_id: string; value: string }[] {
  return engine
    .inspect(reportId)
    .facts.filter((f) => f.confirmation_status === 'confirmed' && f.extraction_status !== 'superseded')
    .map((f) => ({ fact_id: f.fact_id, value: f.value }));
}
