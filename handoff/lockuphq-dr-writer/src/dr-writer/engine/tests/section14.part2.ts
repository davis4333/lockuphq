// Section 14 tests 9-17 (blueprint §14). Synthetic data only.

import type { Section14Test } from './harness.ts';
import { GOOD_NOTES, certRequest, confirmAllFacts, driveTo, makeEngine, newReport } from './fixtures.ts';

export const part2: Section14Test[] = [
  {
    id: 9,
    name: 'Hash-bound fact confirmation',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'evaluated');
      const staleHash = engine.currentLedgerHash(c.rid);
      const staleFacts = engine.inspect(c.rid).facts;

      // The ledger changes between display and submission.
      engine.correctFact(c.rid, c.v(), c.op, { fact_id: staleFacts[0].fact_id, value: 'Changed value', certainty: 'exact' });
      t.check(engine.currentLedgerHash(c.rid) !== staleHash, 'ledger hash changed after correction');
      t.throws(
        () =>
          engine.confirmFacts(c.rid, c.v(), c.op, {
            ledger_hash_shown: staleHash,
            displayed: staleFacts.map((f) => ({ fact_id: f.fact_id, version: f.modified_version })),
            decisions: staleFacts.map((f) => ({ fact_id: f.fact_id, decision: 'confirm' as const })),
            started_at: '2026-06-01T22:00:00Z',
            submitted_at: '2026-06-01T22:05:00Z',
          }),
        'HASH_MISMATCH',
        'confirmation against a stale ledger hash rejected'
      );
      t.check(engine.inspect(c.rid).confirmationEvent === null, 'no confirmation event was created');

      // Correct hash but stale displayed fact version is also rejected.
      const current = engine.inspect(c.rid).facts.filter((f) => f.extraction_status !== 'superseded');
      t.throws(
        () =>
          engine.confirmFacts(c.rid, c.v(), c.op, {
            ledger_hash_shown: engine.currentLedgerHash(c.rid),
            displayed: [{ fact_id: current[0].fact_id, version: current[0].modified_version + 5 }],
            decisions: [{ fact_id: current[0].fact_id, decision: 'confirm' }],
            started_at: '2026-06-01T22:00:00Z',
            submitted_at: '2026-06-01T22:05:00Z',
          }),
        'HASH_MISMATCH',
        'stale displayed fact version rejected'
      );

      // A fresh view confirms cleanly.
      confirmAllFacts(c);
      t.check(engine.inspect(c.rid).confirmationEvent !== null, 'confirmation succeeds with current hash and versions');
    },
  },

  {
    id: 10,
    name: 'Hash-bound certification rejection on stale views',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'validated');
      const staleRequest = certRequest(c); // captured before the narrative changes

      // The narrative changes after the officer's view was captured.
      const sentence = engine.inspect(c.rid).narrative!.sentences[0];
      engine.editSentence(c.rid, c.v(), c.op, { sentence_id: sentence.sentence_id, new_text: 'After the order, Synthetic remained at the dayroom table.' });
      engine.resourceSentence(c.rid, c.v(), c.op, sentence.sentence_id);
      const revalidated = engine.validateNarrative(c.rid, c.v(), c.op);
      t.check(revalidated.passed, 'narrative revalidated after edit');

      t.throws(() => engine.certify(c.rid, c.v(), c.op, staleRequest), 'CERTIFICATION_REJECTED', 'stale certification request rejected');
      t.check(engine.inspect(c.rid).certification === null, 'no certification record was created');
      t.check(engine.auditEvents(c.rid).some((e) => e.event_type === 'certification_rejected'), 'rejection audited');

      const certId = engine.certify(c.rid, c.v(), c.op, certRequest(c));
      t.check(certId.length > 0, 'certification succeeds against current hashes');
    },
  },

  {
    id: 11,
    name: 'Quote-containment checks',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'validated');
      // Positive: the generated narrative contains a quoted statement that
      // exists verbatim in its source passage, and validation passed.
      const narrative = engine.inspect(c.rid).narrative!;
      const quoted = narrative.sentences.find((s) => s.text.includes('"I am not going back"'));
      t.check(quoted !== undefined, 'narrative contains the verbatim source quote');
      t.check(engine.inspect(c.rid).deterministicValidation!.passed, 'contained quote passes deterministic validation');

      // Negative: an edited sentence introduces a quotation that does not
      // appear in any cited source passage.
      const target = narrative.sentences.find((s) => s.text.includes('Synthetic remained at the dayroom table'))!;
      engine.editSentence(c.rid, c.v(), c.op, {
        sentence_id: target.sentence_id,
        new_text: 'Synthetic remained at the dayroom table and said "let me out right now".',
      });
      const resourced = engine.resourceSentence(c.rid, c.v(), c.op, target.sentence_id);
      t.equal(resourced.outcome, 'sourced', 'sentence re-sources to the underlying fact');
      const result = engine.validateNarrative(c.rid, c.v(), c.op);
      t.check(!result.passed, 'fabricated quote fails validation');
      t.check(result.issues.some((i) => i.category === 'quote_containment' && i.message.includes('let me out right now')), 'failure names the uncontained quote');
      t.equal(engine.getDisplayStatus(c.rid), 'VALIDATION HOLD', 'report held on quote violation');
    },
  },

  {
    id: 12,
    name: 'Procedural-screen versus notes conflicts',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      const notes = [GOOD_NOTES, 'FACT|category=force_used|value=I used hand controls to redirect Synthetic|speaker=P-OFF|subject=P-INM|certainty=exact'].join('\n');
      driveTo(c, 'order_selected', { notes }); // screen answered force_used=no

      engine.evaluateCharge(c.rid, c.v(), c.op);
      const gates = engine.getGates(c.rid);
      t.equal(gates.procedural_gate.state, 'hold', 'procedural gate holds on screen/notes conflict');
      t.check(gates.procedural_gate.reasons.includes('screen_conflict:force_used'), 'conflict identifies the field');
      t.equal(engine.getDisplayStatus(c.rid), 'PROCEDURAL REVIEW', 'display status routes to procedural review');
      t.equal(gates.policy_gate.state, 'hold', 'unverified force branch also routes to policy review');

      // Resolution clears the gates in order.
      engine.resolveProceduralConflict(c.rid, c.v(), c.op, 'force_used');
      engine.evaluateCharge(c.rid, c.v(), c.op);
      t.equal(engine.getDisplayStatus(c.rid), 'POLICY REVIEW', 'policy review remains after procedural resolution');
      engine.resolvePolicyReview(c.rid, c.v(), c.op, { category: 'force_used', resolution: 'supervisor approved use-of-force addendum' });
      engine.evaluateCharge(c.rid, c.v(), c.op);
      t.equal(engine.getGates(c.rid).procedural_gate.state, 'pass', 'procedural gate passes after resolution');
      t.equal(engine.getGates(c.rid).policy_gate.state, 'pass', 'policy gate passes after attributable resolution');
      t.check(engine.auditEvents(c.rid).filter((e) => e.event_type === 'policy_review_resolved').length >= 2, 'resolutions audited');
    },
  },

  {
    id: 13,
    name: 'Audit-before-token ordering',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'certified');
      // Token issuance before the audit finalization row is rejected.
      const err = t.throws(() => engine.issueToken(c.rid, { ...c.op, role: 'officer' }, 'print'), 'TOKEN_REJECTED', 'token before audit commit rejected');
      t.check(err !== null && err.message.toLowerCase().includes('audit'), 'rejection cites missing audit finalization');
      t.check(!engine.auditEvents(c.rid).some((e) => e.event_type === 'token_issued'), 'no token_issued audit row exists');

      engine.commitAuditFinalization(c.rid, c.v(), c.op);
      const token = engine.issueToken(c.rid, { ...c.op, role: 'officer' }, 'print');
      t.check(token.token_id.length > 0, 'token issued after audit commit');
      const events = engine.auditEvents(c.rid);
      const auditSeq = events.find((e) => e.event_type === 'audit_finalization_committed')!.audit_seq;
      const tokenSeq = events.find((e) => e.event_type === 'token_issued')!.audit_seq;
      t.check(auditSeq < tokenSeq, 'audit commit strictly precedes token issuance in the log');

      // Redemption is audited after issuance (audit -> issue -> redeem order).
      engine.authorizeOutput(token.token_id, c.op, 'print');
      const redeemSeq = engine.auditEvents(c.rid).find((e) => e.event_type === 'token_redeemed')!.audit_seq;
      t.check(tokenSeq < redeemSeq, 'issuance precedes redemption in the log');
    },
  },

  {
    id: 14,
    name: 'Session-bound token',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'token_issued');
      const token = c.token!;
      t.equal(token.session_id, 'sess-A', 'token bound to the issuing session');
      t.throws(
        () => engine.authorizeOutput(token.token_id, { session_id: 'sess-B', actor: 'officer-1' }, 'print'),
        'TOKEN_REJECTED',
        'redemption from a different session rejected'
      );
      t.check(engine.getToken(token.token_id)!.redeemed_at === null, 'token not consumed by the rejected attempt');
      engine.authorizeOutput(token.token_id, c.op, 'print');
      t.check(engine.getToken(token.token_id)!.redeemed_at !== null, 'redemption from the bound session succeeds');
    },
  },

  {
    id: 15,
    name: 'Single-use token',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'token_issued');
      const token = c.token!;
      t.check(token.single_use, 'token is marked single-use');
      const first = engine.authorizeOutput(token.token_id, c.op, 'print');
      t.check(first.output.length > 0, 'first redemption produces output');
      t.throws(() => engine.authorizeOutput(token.token_id, c.op, 'print'), 'TOKEN_REJECTED', 'second redemption rejected');
      t.equal(engine.auditEvents(c.rid).filter((e) => e.event_type === 'token_redeemed').length, 1, 'exactly one redemption audited');
    },
  },

  {
    id: 16,
    name: 'Token expiry and revocation',
    run: (t) => {
      // Expiry: default 5 minutes; the clock is injectable and deterministic.
      const now = { t: Date.parse('2026-06-02T00:00:00Z') };
      const engine = makeEngine({ clock: () => new Date(now.t) });
      const c = newReport(engine);
      driveTo(c, 'token_issued');
      const token = c.token!;
      t.equal(token.expires_at, '2026-06-02T00:05:00.000Z', 'expiry is issued_at + 5 minutes');
      now.t += 6 * 60 * 1000; // advance past expiry
      t.throws(() => engine.authorizeOutput(token.token_id, c.op, 'print'), 'TOKEN_REJECTED', 'expired token rejected');
      t.check(engine.getToken(token.token_id)!.redeemed_at === null, 'expired token was not redeemed');

      // Revocation: an unredeemed token can be explicitly revoked.
      const token2 = engine.issueToken(c.rid, { ...c.op, role: 'officer' }, 'print');
      engine.revokeToken(token2.token_id, c.op);
      t.check(engine.getToken(token2.token_id)!.revoked_at !== null, 'token revoked');
      t.throws(() => engine.authorizeOutput(token2.token_id, c.op, 'print'), 'TOKEN_REJECTED', 'revoked token rejected');
      t.check(engine.auditEvents(c.rid).some((e) => e.event_type === 'token_revoked'), 'revocation audited');
    },
  },

  {
    id: 17,
    name: 'Output-channel binding',
    run: (t) => {
      const engine = makeEngine();
      const c = newReport(engine);
      driveTo(c, 'token_issued'); // token bound to channel 'print'
      const token = c.token!;
      t.equal(token.output_channel, 'print', 'token carries its output channel');
      t.throws(() => engine.authorizeOutput(token.token_id, c.op, 'pdf'), 'TOKEN_REJECTED', 'redemption on a different channel rejected');
      t.throws(() => engine.authorizeOutput(token.token_id, c.op, 'copy'), 'TOKEN_REJECTED', 'redemption on copy channel rejected');
      t.check(engine.getToken(token.token_id)!.redeemed_at === null, 'token survives channel-mismatch attempts');
      engine.authorizeOutput(token.token_id, c.op, 'print');
      t.equal(engine.getLifecycle(c.rid), 'FINALIZED', 'bound channel succeeds and finalizes');

      // A failed output never marks output complete (§9).
      const e2 = makeEngine();
      const c2 = newReport(e2);
      driveTo(c2, 'token_issued');
      t.throws(() => e2.authorizeOutput(c2.token!.token_id, c2.op, 'print', { simulate_failure: true }), 'OUTPUT_REJECTED', 'channel failure surfaces');
      t.check(e2.auditEvents(c2.rid).some((e) => e.event_type === 'output_failed'), 'failure audited');
      t.check(!e2.inspect(c2.rid).outputCompleted, 'output not marked complete after failure');
      t.equal(e2.getLifecycle(c2.rid), 'DRAFT', 'report not finalized after failed output');
    },
  },
];
