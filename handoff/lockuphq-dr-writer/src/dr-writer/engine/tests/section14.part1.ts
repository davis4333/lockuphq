// Section 14 tests 1-8 (blueprint §14). Synthetic data only.

import type { Section14Test } from './harness.ts';
import {
  AMENDMENT_TEXT,
  GOOD_NOTES,
  STAGES,
  TIMELY_COMPLIANCE_NOTES,
  type Stage,
  certRequest,
  confirmAllFacts,
  driveTo,
  makeEngine,
  newReport,
} from './fixtures.ts';

export const part1: Section14Test[] = [
  {
    id: 1,
    name: 'Amendment-triggered rollback at every workflow stage',
    run: (t) => {
      const stagesToTest: Stage[] = [
        'extracted', 'critic', 'order_selected', 'evaluated', 'confirmed',
        'ready', 'snapshot', 'generated', 'validated', 'certified',
        'audit_finalized', 'token_issued',
      ];
      for (const stage of stagesToTest) {
        const engine = makeEngine();
        const c = newReport(engine);
        driveTo(c, stage);
        const factsBefore = engine.inspect(c.rid).factCount;
        const amendmentId = engine.addAmendment(c.rid, c.v(), c.op, { text: AMENDMENT_TEXT, reason: 'late detail' });
        const insp = engine.inspect(c.rid);

        t.check(insp.amendments.length === 1 && insp.amendments[0].amendment_id === amendmentId, `[${stage}] amendment stored as separate record`);
        t.check(insp.amendments[0].rollback_triggered_at !== null, `[${stage}] amendment records rollback trigger`);
        t.check(insp.factCount === factsBefore + 1, `[${stage}] amendment was re-extracted and reconciled into the ledger`);
        t.check(insp.critic === null, `[${stage}] critic completeness judgment invalidated`);
        t.check(insp.chargeEvaluation === null, `[${stage}] charge evaluation invalidated`);
        t.check(insp.confirmationEvent === null, `[${stage}] confirmation event invalidated`);
        t.check(insp.snapshot === null, `[${stage}] snapshot invalidated`);
        t.check(insp.narrative === null, `[${stage}] narrative invalidated`);
        t.check(insp.deterministicValidation === null && insp.semanticValidation === null, `[${stage}] both validations invalidated`);
        t.check(insp.certification === null, `[${stage}] certification invalidated`);
        t.check(insp.auditFinalizationCommitted === false, `[${stage}] audit finalization invalidated`);
        t.equal(engine.getDisplayStatus(c.rid), 'FACTS INCOMPLETE', `[${stage}] status after amendment`);
        if (stage === 'token_issued') {
          const token = engine.getToken(c.token!.token_id);
          t.check(token !== null && token.revoked_at !== null, `[${stage}] finalization token revoked`);
        }
        // Downstream stages are genuinely blocked until re-evaluation.
        t.throws(() => engine.createSnapshot(c.rid, c.v(), c.op), 'GATE_BLOCKED', `[${stage}] snapshot blocked after rollback`);
      }
      t.check(stagesToTest.length === STAGES.length - 4, 'covered every post-extraction workflow stage');
    },
  },

  {
    id: 2,
    name: 'Narrative re-sourcing to existing facts only',
    run: (t) => {
      // Positive: an edited sentence re-sources only to existing confirmed facts.
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'validated');
      const confirmedIds = new Set(
        engine.inspect(c.rid).facts.filter((f) => f.confirmation_status === 'confirmed').map((f) => f.fact_id)
      );
      const sentence = engine.inspect(c.rid).narrative!.sentences[0];
      engine.editSentence(c.rid, c.v(), c.op, {
        sentence_id: sentence.sentence_id,
        new_text: 'After the order, Synthetic remained at the dayroom table.',
      });
      const result = engine.resourceSentence(c.rid, c.v(), c.op, sentence.sentence_id);
      t.equal(result.outcome, 'sourced', 're-sourcing outcome');
      t.check(result.fact_ids.length > 0, 're-sourcing returned fact IDs');
      t.check(result.fact_ids.every((id) => confirmedIds.has(id)), 'every returned ID is an existing confirmed fact');

      // Fail closed: a model that fabricates fact IDs is rejected by the engine.
      const malicious = makeEngine({ stubs: { resource: () => ({ fact_ids: ['fact-FABRICATED-999'] }) } });
      const m = newReport(malicious);
      driveTo(m, 'validated');
      const mSentence = malicious.inspect(m.rid).narrative!.sentences[0];
      malicious.editSentence(m.rid, m.v(), m.op, { sentence_id: mSentence.sentence_id, new_text: 'Edited sentence text.' });
      const rejected = malicious.resourceSentence(m.rid, m.v(), m.op, mSentence.sentence_id);
      t.equal(rejected.outcome, 'rejected_unknown_fact_ids', 'fabricated fact IDs rejected');
      const after = malicious.inspect(m.rid).narrative!.sentences.find((s) => s.sentence_id === mSentence.sentence_id)!;
      t.check(after.resourcing_status !== 'sourced', 'sentence remains unsourced after rejected output');
      t.check(after.source_fact_ids.length === 0, 'no fabricated IDs were attached');
    },
  },

  {
    id: 3,
    name: 'UNSUPPORTED edited sentence handling',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'validated');
      const sentence = engine.inspect(c.rid).narrative!.sentences[0];
      const originalText = sentence.text;
      engine.editSentence(c.rid, c.v(), c.op, {
        sentence_id: sentence.sentence_id,
        new_text: 'The inmate slammed the door violently.',
      });
      const result = engine.resourceSentence(c.rid, c.v(), c.op, sentence.sentence_id);
      t.equal(result.outcome, 'UNSUPPORTED', 'unsupported sentence detected');
      t.equal(engine.getDisplayStatus(c.rid), 'VALIDATION HOLD', 'status while unsupported');
      // Certification is blocked while the sentence is unresolved.
      t.throws(() => engine.certify(c.rid, c.v(), c.op, certRequest(c)), 'GATE_BLOCKED', 'certification blocked with unsupported sentence');

      // Officer option 1 — revert the sentence.
      engine.revertSentence(c.rid, c.v(), c.op, sentence.sentence_id);
      const reverted = engine.inspect(c.rid).narrative!.sentences.find((s) => s.sentence_id === sentence.sentence_id)!;
      t.equal(reverted.text, originalText, 'revert restored the original sentence');
      t.equal(reverted.resourcing_status, 'sourced', 'reverted sentence is sourced again');
      const revalidated = engine.validateNarrative(c.rid, c.v(), c.op);
      t.check(revalidated.passed, 'revalidation passes after revert');
      const certId = engine.certify(c.rid, c.v(), c.op, certRequest(c));
      t.check(certId.length > 0, 'certification possible after resolution');

      // Officer option 2 — restate, then re-source successfully.
      const e2 = makeEngine();
      const c2 = newReport(e2);
      driveTo(c2, 'validated');
      const s2 = e2.inspect(c2.rid).narrative!.sentences[0];
      e2.editSentence(c2.rid, c2.v(), c2.op, { sentence_id: s2.sentence_id, new_text: 'Nothing supported here.' });
      t.equal(e2.resourceSentence(c2.rid, c2.v(), c2.op, s2.sentence_id).outcome, 'UNSUPPORTED', 'restate scenario starts unsupported');
      e2.restateSentence(c2.rid, c2.v(), c2.op, { sentence_id: s2.sentence_id, new_text: 'Synthetic remained at the dayroom table.' });
      t.equal(e2.resourceSentence(c2.rid, c2.v(), c2.op, s2.sentence_id).outcome, 'sourced', 'restated sentence re-sources');

      // Officer option 3 — the factual-edit path triggers Trigger A.
      const e3 = makeEngine();
      const c3 = newReport(e3);
      driveTo(c3, 'validated');
      const fact = e3.inspect(c3.rid).facts[0];
      e3.correctFact(c3.rid, c3.v(), c3.op, { fact_id: fact.fact_id, value: 'Corrected value', certainty: 'exact' });
      t.check(e3.inspect(c3.rid).narrative === null, 'factual edit invalidates the narrative (Trigger A)');
    },
  },

  {
    id: 4,
    name: 'Two-attempt re-sourcing limit',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'validated');
      const sentence = engine.inspect(c.rid).narrative!.sentences[0];
      engine.editSentence(c.rid, c.v(), c.op, { sentence_id: sentence.sentence_id, new_text: 'Unsupported claim one.' });

      const first = engine.resourceSentence(c.rid, c.v(), c.op, sentence.sentence_id);
      t.equal(first.outcome, 'UNSUPPORTED', 'first failed attempt');
      engine.restateSentence(c.rid, c.v(), c.op, { sentence_id: sentence.sentence_id, new_text: 'Unsupported claim two.' });
      const second = engine.resourceSentence(c.rid, c.v(), c.op, sentence.sentence_id);
      t.equal(second.outcome, 'manual_fact_review', 'second failed attempt forces manual fact review');
      t.check(engine.inspect(c.rid).manualFactReview.includes(sentence.sentence_id), 'sentence recorded for manual fact review');
      // A third automated attempt is refused outright.
      t.throws(() => engine.resourceSentence(c.rid, c.v(), c.op, sentence.sentence_id), 'RETRY_LIMIT', 'third automated attempt rejected');
      t.throws(
        () => engine.editSentence(c.rid, c.v(), c.op, { sentence_id: sentence.sentence_id, new_text: 'try again' }),
        'RETRY_LIMIT',
        'automated editing path closed in manual fact review'
      );
    },
  },

  {
    id: 5,
    name: 'CHARGE UNSUPPORTED terminal behavior',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'confirmed', { notes: TIMELY_COMPLIANCE_NOTES });
      const evaln = engine.evaluateCharge(c.rid, c.v(), c.op);
      t.equal(evaln.outcome, 'CHARGE_UNSUPPORTED', 'complete defeating facts produce CHARGE_UNSUPPORTED');
      t.equal(evaln.failed_unsupported_rule?.rule_id, 'timely_compliance', 'explains which grounding rule failed');
      t.check(!JSON.stringify(evaln).toLowerCase().includes('recommend'), 'never recommends another charge');
      t.equal(engine.getDisplayStatus(c.rid), 'CHARGE UNSUPPORTED', 'display status');
      t.check(engine.auditEvents(c.rid).some((e) => e.event_type === 'charge_unsupported'), 'audited');

      // Narrative generation is blocked; clarification does not restart.
      t.throws(() => engine.createSnapshot(c.rid, c.v(), c.op), 'GATE_BLOCKED', 'generation path blocked');
      t.throws(() => engine.requestClarification(c.rid, c.v(), c.op), 'CHARGE_UNSUPPORTED_TERMINAL', 'no new question loop');
      t.throws(() => engine.evaluateCharge(c.rid, c.v(), c.op), 'CHARGE_UNSUPPORTED_TERMINAL', 'terminal without a fact change');

      // A factual amendment lifts the terminal state and permits re-evaluation.
      engine.addAmendment(c.rid, c.v(), c.op, {
        text: 'ORDER|issuer=P-OFF|command=Return to your bunk now|authority=supported|applicability=applies|compliance=did_not_comply|timing=none|rescinded_before_conduct=no',
        reason: 'the compliance detail was wrong',
      });
      t.check(engine.inspect(c.rid).chargeUnsupported === null, 'fact change clears the terminal state');
      // Re-evaluation with the old order still selected legitimately fails the
      // same rule again — the facts of THAT order did not change.
      const sameOrder = engine.evaluateCharge(c.rid, c.v(), c.op);
      t.equal(sameOrder.outcome, 'CHARGE_UNSUPPORTED', 'unchanged selected order still evaluates as unsupported');
      // Selecting the corrected order event is itself a Trigger A fact change
      // (Stage 21: "selected-order change") and lifts the terminal state.
      const newOrder = engine.inspect(c.rid).orderEvents.find((o) => o.specific_command === 'Return to your bunk now')!;
      engine.selectOrderForCharge(c.rid, c.v(), c.op, newOrder.order_event_id);
      t.check(engine.inspect(c.rid).chargeUnsupported === null, 'selected-order change clears the terminal state (Trigger A)');
      const reEval = engine.evaluateCharge(c.rid, c.v(), c.op);
      t.check(reEval.outcome !== 'CHARGE_UNSUPPORTED', 're-evaluation with the corrected order is no longer unsupported');

      // Workspace closure is permitted from the terminal state.
      const e2 = makeEngine();
      const c2 = newReport(e2);
      driveTo(c2, 'confirmed', { notes: TIMELY_COMPLIANCE_NOTES });
      e2.evaluateCharge(c2.rid, c2.v(), c2.op);
      e2.transitionLifecycle(c2.rid, c2.v(), c2.op, 'VOIDED');
      t.equal(e2.getLifecycle(c2.rid), 'VOIDED', 'workspace closure permitted');
    },
  },

  {
    id: 6,
    name: 'Person ambiguity with same last names',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine, { participants: ['P-OFF', 'P-SMITH1', 'P-SMITH2'] });
      const notes = [
        GOOD_NOTES,
        'FACT|category=scene_context|value=Officer Smith observed the refusal|speaker=@Smith|subject=P-INM|certainty=exact',
      ].join('\n');
      driveTo(c, 'order_selected', { notes });

      const ambiguousFact = engine.inspect(c.rid).facts.find((f) => f.ambiguous_reference_id !== null);
      t.check(ambiguousFact !== undefined, 'bare "Smith" with two Smiths creates an ambiguous_person_reference');
      t.check(ambiguousFact!.speaker_person_id === null, 'no person silently attached to the bare string');

      // Confirmation cannot proceed over the ambiguity (fail closed).
      const facts = engine.inspect(c.rid).facts;
      t.throws(
        () =>
          engine.confirmFacts(c.rid, c.v(), c.op, {
            ledger_hash_shown: engine.currentLedgerHash(c.rid),
            displayed: facts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
            decisions: facts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
            started_at: '2026-06-01T22:00:00Z',
            submitted_at: '2026-06-01T22:05:00Z',
          }),
        'AMBIGUOUS_PERSON',
        'confirmation rejected while a person reference is unresolved'
      );
      const evaln = engine.evaluateCharge(c.rid, c.v(), c.op);
      t.check(evaln.reasons.some((r) => r.includes('ambiguous person reference')), 'evaluation reports the ambiguity');

      // The officer selects the correct registry entry (Stage 8), then confirms.
      engine.disambiguatePerson(c.rid, c.v(), c.op, { reference_id: ambiguousFact!.ambiguous_reference_id!, person_id: 'P-SMITH1' });
      const resolved = engine.inspect(c.rid).facts.find((f) => f.fact_id === ambiguousFact!.fact_id)!;
      t.equal(resolved.speaker_person_id, 'P-SMITH1', 'reference resolved to a person_id, not a string');
      t.check(resolved.ambiguous_reference_id === null, 'ambiguity cleared');
      confirmAllFacts(c);
      t.check(engine.inspect(c.rid).confirmationEvent !== null, 'confirmation succeeds after disambiguation');
    },
  },

  {
    id: 7,
    name: 'Incident-group sibling behavior',
    run: (t) => {
      const engine = makeEngine();
      const group = engine.createIncidentGroup({ created_by: 'officer-1', creation_source: 'multi-inmate incident' });
      const a = newReport(engine, { subject: 'P-INM', incident_group_id: group.incident_group_id });
      const b = newReport(engine, { subject: 'P-INM2', incident_group_id: group.incident_group_id });
      t.equal(engine.getIncidentGroup(group.incident_group_id).sibling_report_ids.length, 2, 'both siblings linked to the group');

      const sceneNotes = [GOOD_NOTES, 'FACT|category=scene_location|value=Dayroom of Dorm C|speaker=P-OFF|subject=-|certainty=exact'].join('\n');
      driveTo(a, 'extracted', { notes: sceneNotes });
      const sceneFact = engine.inspect(a.rid).facts.find((f) => f.category === 'scene_location')!;

      // Shared scene facts may be reused through the incident group.
      engine.shareFactToGroup(a.rid, a.v(), a.op, sceneFact.fact_id);
      t.equal(engine.getIncidentGroup(group.incident_group_id).shared_scene_facts.length, 1, 'scene fact shared to the group');
      const imported = engine.importSharedFacts(b.rid, b.v(), b.op);
      t.equal(imported, 1, 'sibling imported the shared scene fact');
      const bFacts = engine.inspect(b.rid).facts;
      t.check(bFacts.some((f) => f.category === 'scene_location' && f.value === 'Dayroom of Dorm C'), 'shared fact present in sibling ledger');
      t.check(bFacts.every((f) => f.confirmation_status === 'unconfirmed'), 'imported facts still require this report\'s own confirmation');

      // Subject-specific facts did not leak between siblings.
      t.check(!bFacts.some((f) => f.category === 'post_order_conduct'), 'sibling B has no subject-specific facts from A');
      t.equal(engine.inspect(b.rid).facts.length, 1, 'sibling B ledger contains only the shared scene fact');
    },
  },

  {
    id: 8,
    name: 'Subject-specific paste checks',
    run: (t) => {
      const engine = makeEngine();
      const group = engine.createIncidentGroup({ created_by: 'officer-1', creation_source: 'multi-inmate incident' });
      const a = newReport(engine, { subject: 'P-INM', incident_group_id: group.incident_group_id });
      const b = newReport(engine, { subject: 'P-INM2', incident_group_id: group.incident_group_id });
      const outsider = newReport(engine, { subject: 'P-INM2' }); // not in the group

      const sceneNotes = [GOOD_NOTES, 'FACT|category=scene_location|value=Dayroom of Dorm C|speaker=P-OFF|subject=-|certainty=exact'].join('\n');
      driveTo(a, 'extracted', { notes: sceneNotes });
      const facts = engine.inspect(a.rid).facts;
      const subjectFact = facts.find((f) => f.category === 'post_order_conduct')!;
      const sceneFact = facts.find((f) => f.category === 'scene_location')!;

      // Subject-specific facts may not be shared or pasted anywhere.
      t.throws(() => engine.shareFactToGroup(a.rid, a.v(), a.op, subjectFact.fact_id), 'SUBJECT_SPECIFIC_FACT', 'subject fact rejected from group sharing');
      t.throws(() => engine.pasteFact(a.rid, b.rid, b.v(), b.op, subjectFact.fact_id), 'SUBJECT_SPECIFIC_FACT', 'subject fact rejected from direct paste');
      // A scene fact tied to a sibling subject is also treated as subject-specific.
      const notesWithTiedScene = [GOOD_NOTES, 'FACT|category=scene_context|value=Synthetic stood near the door|speaker=P-OFF|subject=P-INM|certainty=exact'].join('\n');
      const a2 = newReport(engine, { subject: 'P-INM', incident_group_id: group.incident_group_id });
      driveTo(a2, 'extracted', { notes: notesWithTiedScene });
      const tiedScene = engine.inspect(a2.rid).facts.find((f) => f.category === 'scene_context')!;
      t.throws(() => engine.shareFactToGroup(a2.rid, a2.v(), a2.op, tiedScene.fact_id), 'SUBJECT_SPECIFIC_FACT', 'scene fact tied to a subject inmate rejected (fail closed)');

      // Scene facts may move between siblings, but never outside the group.
      engine.pasteFact(a.rid, b.rid, b.v(), b.op, sceneFact.fact_id);
      t.check(engine.inspect(b.rid).facts.some((f) => f.category === 'scene_location'), 'scene fact pasted between siblings');
      t.throws(() => engine.pasteFact(a.rid, outsider.rid, outsider.v(), outsider.op, sceneFact.fact_id), 'FORBIDDEN', 'cross-group paste rejected');
    },
  },
];
