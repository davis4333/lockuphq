// LOCKUPHQ DR Writer — report lifecycle (blueprint §5.3).
// Values: DRAFT, ABANDONED, EXPIRED, FINALIZED, VOIDED.
// Transition permissions are policy-configured and audited. Fail closed:
// any transition not explicitly allowed by the policy profile is rejected.

import type { Lifecycle } from './types.ts';
import type { PolicyProfile } from './packets.ts';

export const LIFECYCLE_VALUES: Lifecycle[] = ['DRAFT', 'ABANDONED', 'EXPIRED', 'FINALIZED', 'VOIDED'];

export function isTransitionAllowed(policy: PolicyProfile, from: Lifecycle, to: Lifecycle): boolean {
  return policy.allowed_lifecycle_transitions.some((t) => t.from === from && t.to === to);
}

export function assertTransitionAllowed(policy: PolicyProfile, from: Lifecycle, to: Lifecycle): void {
  if (!isTransitionAllowed(policy, from, to)) {
    throw new Error(`Lifecycle transition not permitted by policy: ${from} -> ${to}`);
  }
}

// Terminal states accept no further mutation of report content.
export function isTerminal(lifecycle: Lifecycle): boolean {
  return lifecycle !== 'DRAFT';
}
