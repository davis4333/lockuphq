// LOCKUPHQ DR Writer — deterministic scorer for the Section 15 extraction
// benchmark. Compares live-model extraction output against gold expectations
// and tags Section 15 critical release failures. One critical failure blocks
// progression (§15).

import type { ExtractionOutput } from '../aiStubs.ts';
import type { CriticalTag, GoldCase } from './goldCases.ts';

export interface CriticalFailure {
  tag: CriticalTag;
  detail: string;
}

export interface CaseScore {
  failures: string[]; // non-critical expectation misses (still fail the case)
  criticals: CriticalFailure[];
}

// Statuses a policy-sensitive case may derive while policy_gate is on hold.
// READY_FOR_GENERATION and REVIEW_REQUIRED are excluded deliberately: both
// unlock a draft, which a policy hold must never permit. PROCEDURAL_REVIEW and
// SYSTEM_HOLD are not currently derivable from evaluateCharge but are blocking
// if the engine ever surfaces them here.
export const BLOCKING_OUTCOMES: ReadonlySet<string> = new Set([
  'POLICY_REVIEW',
  'FACTS_INCOMPLETE',
  'PROCEDURAL_REVIEW',
  'SYSTEM_HOLD',
  'CHARGE_UNSUPPORTED',
]);

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

function matchesAny(value: string, alternatives: string): boolean {
  const v = norm(value);
  return alternatives.split('|').some((alt) => v.includes(norm(alt)));
}

export function scoreExtraction(gc: GoldCase, output: ExtractionOutput): CaseScore {
  const failures: string[] = [];
  const criticals: CriticalFailure[] = [];
  const expect = gc.expect;

  if (expect.outcome === 'CANNOT_DETERMINE') {
    // An explicitly empty extraction (zero facts, zero orders) is equivalent:
    // nothing was invented, and the deterministic charge evaluation still
    // blocks the report downstream. Anything extracted from nothing is not.
    const emptyFacts = output.outcome === 'facts' && output.facts.length === 0 && output.orders.length === 0;
    if (output.outcome !== 'CANNOT_DETERMINE' && !emptyFacts) {
      failures.push(`expected CANNOT_DETERMINE, extractor returned ${output.outcome}${output.outcome === 'facts' ? ` with ${output.facts.length} facts / ${output.orders.length} orders` : ''}`);
    }
    return { failures, criticals };
  }
  if (output.outcome !== 'facts') {
    failures.push(`expected facts, extractor returned ${output.outcome}`);
    return { failures, criticals };
  }

  const notesNorm = norm(gc.notes);
  const allValues = [
    ...output.facts.map((f) => f.value),
    ...output.orders.map((o) => o.specific_command),
  ];

  // Global rule 1 — invented material fact: every source passage must exist
  // verbatim (whitespace-normalized) in the notes. A passage may span several
  // sentences copied from different places, so containment is checked per
  // sentence chunk — fabricated text still fails, since its sentences appear
  // nowhere in the notes.
  for (const item of [...output.facts.map((f) => ({ what: `fact "${f.value}"`, src: f.source_line })), ...output.orders.map((o) => ({ what: `order "${o.specific_command}"`, src: o.source_line }))]) {
    const chunks = norm(item.src).split(/(?<=[.;])\s+/).filter((c) => c.length > 0);
    const missing = chunks.filter((chunk) => !notesNorm.includes(chunk));
    if (missing.length > 0) {
      criticals.push({ tag: 'invented_material_fact', detail: `${item.what} cites text not present in the notes: "${missing.join(' … ')}"` });
    }
  }

  // Global rule 2 — summary converted to quote: any quoted span in a value
  // must appear in the notes INSIDE quotation marks.
  for (const value of allValues) {
    for (const match of value.matchAll(/"([^"]+)"/g)) {
      const span = match[1];
      if (!notesNorm.includes(norm(`"${span}"`))) {
        criticals.push({ tag: 'summary_converted_to_quote', detail: `value quotes "${span}" which is not quoted speech in the notes` });
      }
    }
  }

  // Injection flag.
  if (expect.injection_suspected === true && !output.injection_suspected) {
    failures.push('extractor did not flag injection_suspected on injected instructions');
  }

  // Required facts by category.
  for (const req of expect.required_facts ?? []) {
    const candidates = output.facts.filter((f) => f.category === req.category);
    const hit = candidates.find((f) => req.tokens.every((tok) => matchesAny(f.value, tok)));
    if (!hit) {
      failures.push(`missing required fact: category=${req.category} tokens=[${req.tokens.join(', ')}] (found ${candidates.length} facts in category)`);
    }
  }

  // Category-agnostic presence checks.
  for (const req of expect.required_anywhere ?? []) {
    const hit = allValues.some((value) => req.tokens.every((tok) => matchesAny(value, tok)));
    if (!hit) {
      failures.push(`no extracted value contains required tokens [${req.tokens.join(', ')}]`);
    }
  }

  // Certainty checks: some fact matching the token must carry the certainty.
  for (const check of expect.certainty_anywhere ?? []) {
    const matching = output.facts.filter((f) => matchesAny(f.value, check.token));
    if (matching.length === 0) {
      failures.push(`no fact found for certainty check "${check.token}"`);
    } else if (!matching.some((f) => f.certainty === check.certainty)) {
      failures.push(`fact matching "${check.token}" has certainty ${matching.map((f) => f.certainty).join('/')}, expected ${check.certainty}`);
    }
  }

  // Attribution — statements must carry the correct speaker. Several facts may
  // match the token; the check passes if ANY matching fact carries the right
  // speaker. Misattribution to a DIFFERENT person is the §15 critical; a
  // missing attribution is a (non-critical) quality failure.
  for (const att of expect.attributions ?? []) {
    const matching = output.facts.filter((f) => matchesAny(f.value, att.value_includes));
    if (matching.length === 0) {
      failures.push(`no fact found for attribution check "${att.value_includes}"`);
      continue;
    }
    if (matching.some((f) => f.speaker_ref !== null && norm(f.speaker_ref) === norm(att.speaker_ref))) {
      continue; // correctly attributed
    }
    const misattributed = matching.find((f) => f.speaker_ref !== null && norm(f.speaker_ref) !== norm(att.speaker_ref));
    if (misattributed) {
      criticals.push({ tag: att.critical, detail: `fact "${misattributed.value}" attributed to ${misattributed.speaker_ref}, expected ${att.speaker_ref}` });
    } else {
      failures.push(`statement "${att.value_includes}" extracted without speaker attribution (expected ${att.speaker_ref})`);
    }
  }

  // Forbidden content anywhere.
  if (expect.forbidden_anywhere) {
    for (const value of allValues) {
      for (const token of expect.forbidden_anywhere.tokens) {
        if (norm(value).includes(norm(token))) {
          criticals.push({ tag: expect.forbidden_anywhere.critical, detail: `forbidden content "${token}" in value "${value}"` });
        }
      }
    }
  }

  // Negation-style forbidden checks (pattern without its negating context).
  for (const check of expect.forbidden_value_checks ?? []) {
    for (const value of allValues) {
      const v = norm(value);
      const hit = check.pattern.split('|').some((p) => v.includes(norm(p)));
      const excused = check.unless !== undefined && check.unless.split('|').some((u) => v.includes(norm(u)));
      if (hit && !excused) {
        criticals.push({ tag: check.critical, detail: `value asserts "${check.pattern}" without negation: "${value}"` });
      }
    }
  }

  // Orders.
  if (expect.order_count !== undefined && output.orders.length !== expect.order_count) {
    if (output.orders.length < (expect.order_count ?? 0)) {
      // Fewer orders than distinct directives means directives were merged.
      criticals.push({ tag: 'different_orders_combined', detail: `expected ${expect.order_count} distinct order events, got ${output.orders.length}` });
    } else {
      failures.push(`expected ${expect.order_count} orders, got ${output.orders.length}`);
    }
  }
  // Order expectations use ANY-MATCH semantics over the matching order
  // events: when the same directive is given repeatedly, the extractor may
  // legitimately record one event per giving (early ones did_not_comply, the
  // final one complied/delayed). An expectation is satisfied if any matching
  // event satisfies it; polarity criticals fire only when NO matching event
  // records the expected polarity.
  const enumOk = (expected: string | undefined, actual: string): boolean =>
    expected === undefined || expected.split('|').includes(actual);
  for (const oc of expect.orders ?? []) {
    const matching = output.orders.filter((o) => matchesAny(o.specific_command, oc.command_includes));
    if (matching.length === 0) {
      failures.push(`no order found with command matching "${oc.command_includes}"`);
      continue;
    }
    // A single order event containing multiple distinct directives = merged.
    if (expect.order_count !== undefined && expect.order_count > 1) {
      const otherCommands = (expect.orders ?? []).filter((x) => x !== oc);
      for (const other of otherCommands) {
        for (const order of matching) {
          if (matchesAny(order.specific_command, other.command_includes)) {
            criticals.push({ tag: 'different_orders_combined', detail: `one order event contains two directives: "${order.specific_command}"` });
          }
        }
      }
    }
    if (oc.compliance !== undefined && !matching.some((o) => enumOk(oc.compliance, o.compliance_result))) {
      const expectsComplied = oc.compliance.split('|').includes('complied');
      const expectsNot = oc.compliance.split('|').includes('did_not_comply');
      const reversed =
        (expectsNot && matching.every((o) => o.compliance_result === 'complied')) ||
        (expectsComplied && matching.every((o) => o.compliance_result === 'did_not_comply'));
      if (reversed) {
        criticals.push({ tag: 'negation_reversed', detail: `order compliance extracted as ${matching.map((o) => o.compliance_result).join('/')}, notes say ${oc.compliance}` });
      } else {
        failures.push(`order compliance: expected ${oc.compliance}, got ${matching.map((o) => o.compliance_result).join('/')}`);
      }
    }
    // Timing/applicability/rescission are judged over the events that satisfy
    // the compliance expectation (or all matching events when none was set).
    const inScope = oc.compliance !== undefined ? matching.filter((o) => enumOk(oc.compliance, o.compliance_result)) : matching;
    const scope = inScope.length > 0 ? inScope : matching;
    if (oc.timing !== undefined && !scope.some((o) => enumOk(oc.timing, o.compliance_timing))) {
      failures.push(`order timing: expected ${oc.timing}, got ${scope.map((o) => o.compliance_timing).join('/')}`);
    }
    if (oc.applicability !== undefined && !scope.some((o) => enumOk(oc.applicability, o.subject_applicability))) {
      failures.push(`order applicability: expected ${oc.applicability}, got ${scope.map((o) => o.subject_applicability).join('/')}`);
    }
    if (oc.rescinded_before_conduct !== undefined && !scope.some((o) => o.rescinded_before_conduct === oc.rescinded_before_conduct)) {
      failures.push(`order rescission: expected rescinded_before_conduct=${oc.rescinded_before_conduct}, got ${scope.map((o) => o.rescinded_before_conduct).join('/')}`);
    }
    if (oc.issuer_ref !== undefined && !matching.some((o) => o.issuer_ref === oc.issuer_ref)) {
      if (oc.critical_on_wrong_issuer) {
        criticals.push({ tag: 'wrong_issuer', detail: `order issuer resolved to ${matching.map((o) => o.issuer_ref).join('/')}, expected ${oc.issuer_ref}` });
      } else {
        failures.push(`order issuer: expected ${oc.issuer_ref}, got ${matching.map((o) => o.issuer_ref).join('/')}`);
      }
    }
  }

  // Subject / DC binding.
  if (expect.subject_dc) {
    // Multi-inmate notes may correctly produce one identity fact per person.
    // Judge DC binding only on the intended report subject; otherwise a
    // correctly attributed witness identity becomes a false wrong-subject
    // critical merely because it uses the same fact category.
    const intendedSubject = expect.subject_dc.subject_ref ?? '@Synthetic';
    const idFacts = output.facts.filter(
      (f) => f.category === 'subject_identity' && norm(f.subject_ref ?? '') === norm(intendedSubject)
    );
    if (idFacts.length === 0) {
      failures.push(`no subject_identity fact extracted for ${intendedSubject}`);
    } else {
      const good = idFacts.some((f) => f.value.includes(expect.subject_dc!.must_include));
      const bad = idFacts.some((f) => f.value.includes(expect.subject_dc!.must_not_include));
      if (!good) {
        criticals.push({ tag: expect.subject_dc.wrong_dc_critical, detail: `subject_identity lacks DC ${expect.subject_dc.must_include}: ${idFacts.map((f) => f.value).join(' | ')}` });
      }
      if (bad) {
        criticals.push({ tag: 'wrong_subject', detail: `subject_identity carries the WITNESS's DC ${expect.subject_dc.must_not_include}` });
      }
    }
  }

  return { failures, criticals };
}
