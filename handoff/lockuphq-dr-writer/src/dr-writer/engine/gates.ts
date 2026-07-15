// LOCKUPHQ DR Writer — independent gates and derived display status.
// Blueprint §5.4: gates are separately stored and simultaneously visible.
// §6: the display status is derived; it is never the source of truth
// (invariant 13). Derivation is fail closed: any non-passing gate surfaces
// the most restrictive applicable status.

import type { DisplayStatus, GateName, Gates } from './types.ts';

export const GATE_NAMES: GateName[] = [
  'system_gate',
  'procedural_gate',
  'policy_gate',
  'fact_gate',
  'quality_gate',
  'narrative_gate',
  'certification_gate',
  'audit_gate',
];

export function initialGates(): Gates {
  return {
    system_gate: { state: 'pass', reasons: [] },
    procedural_gate: { state: 'pass', reasons: [] },
    policy_gate: { state: 'pass', reasons: [] },
    fact_gate: { state: 'pending', reasons: ['charge evaluation has not run'] },
    quality_gate: { state: 'pass', reasons: [] },
    narrative_gate: { state: 'pending', reasons: ['no narrative generated'] },
    certification_gate: { state: 'pending', reasons: ['no certification'] },
    audit_gate: { state: 'pending', reasons: ['audit finalization not committed'] },
  };
}

export interface StatusInputs {
  gates: Gates;
  chargeUnsupported: boolean;
  hasNarrative: boolean;
  outputCompleted: boolean;
}

export function deriveDisplayStatus(inputs: StatusInputs): DisplayStatus {
  const { gates, chargeUnsupported, hasNarrative, outputCompleted } = inputs;

  if (gates.system_gate.state !== 'pass') return 'SYSTEM HOLD';
  if (gates.procedural_gate.state !== 'pass') return 'PROCEDURAL REVIEW';
  if (gates.policy_gate.state !== 'pass') return 'POLICY REVIEW';
  if (gates.fact_gate.state !== 'pass') {
    return chargeUnsupported ? 'CHARGE UNSUPPORTED' : 'FACTS INCOMPLETE';
  }
  if (!hasNarrative) {
    if (gates.quality_gate.state !== 'pass') return 'REVIEW REQUIRED';
    return 'READY FOR GENERATION';
  }
  if (gates.narrative_gate.state !== 'pass') return 'VALIDATION HOLD';
  if (gates.certification_gate.state !== 'pass') return 'READY FOR CERTIFICATION';
  if (gates.audit_gate.state === 'pass' && outputCompleted) return 'FINALIZED';
  // Certified but audit finalization/output not yet complete: still awaiting
  // the final ordered steps — surface the certification-ready state.
  return 'READY FOR CERTIFICATION';
}
