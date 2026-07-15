// LOCKUPHQ DR Writer — synthetic fixtures and a workflow stage-driver for the
// Section 14 tests. All data is synthetic; no real inmate data exists here.

import { Engine } from '../engine.ts';
import { RequirementRegistry, SourceRegistry } from '../registries.ts';
import type { AiStubs } from '../aiStubs.ts';
import type { PolicyProfile } from '../packets.ts';
import { SYNTHETIC_PACKET_6_1, SYNTHETIC_POLICY_PROFILE } from '../packets.ts';
import { hashValue } from '../hash.ts';
import type { FinalizationToken } from '../types.ts';

export const INCIDENT_DATE = '2026-06-01';

export function goodRegistries(): { requirements: RequirementRegistry; sources: SourceRegistry } {
  const sources = new SourceRegistry();
  sources.add({
    source_id: 'SRC-RULEBOOK',
    title: 'Synthetic disciplinary rule book',
    jurisdiction: 'SYNTHETIC',
    citation: 'ch. 6',
    version: '1',
    effective_date: '2025-01-01',
    expiration_date: null,
    approved: true,
    approved_by: 'synthetic-approver',
    approved_at: '2025-01-01T00:00:00Z',
  });
  const requirements = new RequirementRegistry();
  requirements.add({
    requirement_id: 'REQ-T1-ORDER',
    tier: 1,
    title: 'Disobeying an order is a chargeable offense',
    enforcement: 'hard_blocker',
    source_id: 'SRC-RULEBOOK',
    effective_date: '2025-01-01',
    jurisdiction: 'SYNTHETIC',
    version: '1',
    requirement_mapping: 'fact_gate',
    conflict_status: 'none',
    approved: true,
  });
  requirements.add({
    requirement_id: 'REQ-T4-TIME',
    tier: 4,
    title: 'Prefer exact times',
    enforcement: 'quality_safeguard',
    source_id: null, // Tier 4 quality safeguards need no source to deploy
    effective_date: null,
    jurisdiction: null,
    version: '1',
    requirement_mapping: 'quality_gate',
    conflict_status: 'none',
    approved: true,
  });
  return { requirements, sources };
}

export function makeEngine(opts: { stubs?: Partial<AiStubs>; clock?: () => Date; policy?: PolicyProfile } = {}): Engine {
  const { requirements, sources } = goodRegistries();
  const engine = Engine.create({
    requirements,
    sources,
    packet: SYNTHETIC_PACKET_6_1,
    policy: opts.policy ?? SYNTHETIC_POLICY_PROFILE,
    deployment_check_date: INCIDENT_DATE,
    clock: opts.clock,
    stubs: opts.stubs,
  });
  addStandardPersons(engine);
  return engine;
}

export function addStandardPersons(engine: Engine): void {
  const base = { report_id: null, incident_group_id: null, identity_source: 'synthetic-roster', confirmation_status: 'confirmed' as const, ambiguity_status: 'unambiguous' as const };
  engine.addPerson({ ...base, person_id: 'P-OFF', person_type: 'staff', first_name: 'Alex', last_name: 'Officer', initial: 'A', rank_or_role: 'Sergeant', dc_number: null });
  engine.addPerson({ ...base, person_id: 'P-INM', person_type: 'inmate', first_name: 'Sam', last_name: 'Synthetic', initial: 'S', rank_or_role: null, dc_number: 'Z99999' });
  engine.addPerson({ ...base, person_id: 'P-INM2', person_type: 'inmate', first_name: 'Robin', last_name: 'Sibling', initial: 'R', rank_or_role: null, dc_number: 'Y88888' });
  engine.addPerson({ ...base, person_id: 'P-SMITH1', person_type: 'staff', first_name: 'Jordan', last_name: 'Smith', initial: 'J', rank_or_role: 'Officer', dc_number: null });
  engine.addPerson({ ...base, person_id: 'P-SMITH2', person_type: 'staff', first_name: 'Casey', last_name: 'Smith', initial: 'C', rank_or_role: 'Officer', dc_number: null });
}

const FACT_LINES = [
  'FACT|category=subject_identity|value=Inmate Synthetic, DC Z99999|speaker=P-OFF|subject=P-INM|certainty=exact',
  'FACT|category=issuer_identity|value=Sergeant Officer issued the order|speaker=P-OFF|subject=-|certainty=exact',
  'FACT|category=authority_basis|value=Post orders authorize dorm officers to direct inmate movement|speaker=P-OFF|subject=-|certainty=exact',
  'FACT|category=specific_order|value=Return to your bunk|speaker=P-OFF|subject=P-INM|certainty=exact',
  'FACT|category=subject_applicability|value=The order was directed to Synthetic individually|speaker=P-OFF|subject=P-INM|certainty=exact',
  'FACT|category=post_order_conduct|value=Synthetic remained at the dayroom table|speaker=P-OFF|subject=P-INM|certainty=exact',
  'FACT|category=supported_noncompliance|value=Synthetic stated "I am not going back"|speaker=P-OFF|subject=P-INM|certainty=exact',
  'FACT|category=immediate_action|value=I notified the dorm supervisor|speaker=P-OFF|subject=-|certainty=exact',
];

export const GOOD_NOTES = [
  ...FACT_LINES,
  'ORDER|issuer=P-OFF|command=Return to your bunk|authority=supported|applicability=applies|compliance=did_not_comply|timing=none|rescinded_before_conduct=no',
].join('\n');

// Complete, confirmable facts that affirmatively defeat the charge (Stage 13):
// the subject complied with the order in a timely manner.
export const TIMELY_COMPLIANCE_NOTES = [
  ...FACT_LINES,
  'ORDER|issuer=P-OFF|command=Return to your bunk|authority=supported|applicability=applies|compliance=complied|timing=timely|rescinded_before_conduct=no',
].join('\n');

export const AMENDMENT_TEXT = 'FACT|category=scene_context|value=The dayroom lights were on|speaker=P-OFF|subject=-|certainty=exact';

export const STAGES = [
  'created',
  'admin',
  'screen',
  'notes',
  'extracted',
  'critic',
  'order_selected',
  'evaluated',
  'confirmed',
  'ready',
  'snapshot',
  'generated',
  'validated',
  'certified',
  'audit_finalized',
  'token_issued',
] as const;

export type Stage = (typeof STAGES)[number];

export interface Ctx {
  engine: Engine;
  rid: string;
  op: { session_id: string; actor: string };
  token: FinalizationToken | null;
  v(): number;
}

export function newReport(
  engine: Engine,
  opts: { session_id?: string; actor?: string; subject?: string; participants?: string[]; incident_group_id?: string } = {}
): Ctx {
  const op = { session_id: opts.session_id ?? 'sess-A', actor: opts.actor ?? 'officer-1' };
  const { report_id } = engine.createWorkspace({
    owner_user_id: op.actor,
    session_id: op.session_id,
    institution_id: 'INST-1',
    subject_person_id: opts.subject ?? 'P-INM',
    charge_code: '6-1',
    incident_group_id: opts.incident_group_id,
    participants: opts.participants ?? ['P-OFF'],
  });
  return { engine, rid: report_id, op, token: null, v: () => engine.getVersion(report_id) };
}

export function adminIntake(subject = 'P-INM', dc = 'Z99999'): Parameters<Engine['setAdministrativeIntake']>[3] {
  return {
    reporting_officer_person_id: 'P-OFF',
    institution_id: 'INST-1',
    assignment: 'Dorm C',
    subject_person_id: subject,
    subject_dc_number: dc,
    incident_start: '2026-06-01T21:15:00Z',
    incident_end: null,
    time_certainty: 'exact',
    general_area: 'Dorm C',
    specific_location: 'Cell 12',
    charge_code: '6-1',
    reference_style: 'last_name',
    incident_group_id: null,
  };
}

export function confirmAllFacts(c: Ctx): void {
  const facts = c.engine.inspect(c.rid).facts.filter((f) => f.extraction_status !== 'superseded');
  c.engine.confirmFacts(c.rid, c.v(), c.op, {
    ledger_hash_shown: c.engine.currentLedgerHash(c.rid),
    displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
    decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
    started_at: '2026-06-01T22:00:00Z',
    submitted_at: '2026-06-01T22:05:00Z',
  });
}

// Builds a certification request from the officer's current view. Falls back
// to sentinel values when artifacts are invalidated so tests can assert that
// the server (not the fixture) rejects the request.
export function certRequest(c: Ctx): Parameters<Engine['certify']>[3] {
  const insp = c.engine.inspect(c.rid);
  return {
    report_version: c.v(),
    fact_snapshot_hash: hashValue(insp.snapshot),
    narrative_hash: insp.narrative?.narrative_hash ?? 'invalidated',
    deterministic_validation_id: insp.deterministicValidation?.validation_id ?? 'invalidated',
    semantic_validation_id: insp.semanticValidation?.validation_id ?? 'invalidated',
  };
}

// Drive a report forward to the target workflow stage using the synthetic
// happy path. Throws if an intermediate stage does not land where expected.
export function driveTo(c: Ctx, target: Stage, opts: { notes?: string } = {}): void {
  const targetIdx = STAGES.indexOf(target);
  const e = c.engine;
  const step = (stage: Stage, fn: () => void): void => {
    if (STAGES.indexOf(stage) <= targetIdx) fn();
  };

  step('admin', () => e.setAdministrativeIntake(c.rid, c.v(), c.op, adminIntake()));
  step('screen', () => e.submitProceduralScreen(c.rid, c.v(), c.op, { force_used: 'no', medical_involvement: 'no' }));
  step('notes', () => e.commitOriginalNotes(c.rid, c.v(), c.op, { text: opts.notes ?? GOOD_NOTES, request_id: `req-${c.rid}` }));
  step('extracted', () => e.runExtraction(c.rid, c.v(), c.op));
  step('critic', () => e.runCritic(c.rid, c.v(), c.op));
  step('order_selected', () => {
    const order = e.inspect(c.rid).orderEvents[0];
    if (!order) throw new Error('fixture: no order event extracted');
    e.selectOrderForCharge(c.rid, c.v(), c.op, order.order_event_id);
  });
  step('evaluated', () => {
    const evaln = e.evaluateCharge(c.rid, c.v(), c.op);
    if (evaln.outcome !== 'FACTS_INCOMPLETE') throw new Error(`fixture: expected FACTS_INCOMPLETE, got ${evaln.outcome}`);
  });
  step('confirmed', () => confirmAllFacts(c));
  step('ready', () => {
    e.acknowledgeQualityWarnings(c.rid, c.v(), c.op);
    const evaln = e.evaluateCharge(c.rid, c.v(), c.op);
    if (evaln.outcome !== 'READY_FOR_GENERATION') throw new Error(`fixture: expected READY_FOR_GENERATION, got ${evaln.outcome}: ${evaln.reasons.join('; ')}`);
  });
  step('snapshot', () => e.createSnapshot(c.rid, c.v(), c.op));
  step('generated', () => e.generateNarrative(c.rid, c.v(), c.op));
  step('validated', () => {
    const result = e.validateNarrative(c.rid, c.v(), c.op);
    if (!result.passed) throw new Error(`fixture: validation failed: ${result.issues.map((i) => i.message).join('; ')}`);
  });
  step('certified', () => e.certify(c.rid, c.v(), c.op, certRequest(c)));
  step('audit_finalized', () => e.commitAuditFinalization(c.rid, c.v(), c.op));
  step('token_issued', () => {
    c.token = e.issueToken(c.rid, { ...c.op, role: 'officer' }, 'print');
  });
}
