// LOCKUPHQ DR Writer — Requirement registry, source registry, deployment check.
// Source of truth: blueprint §4 (requirement hierarchy), §11 (policy traceability).
// Deployment must fail when a hard blocker is unsourced, unapproved, not effective
// for the incident date, conflicted, or overridden by an unapproved local rule.

// ---------------------------------------------------------------------------
// Source registry — approved sources backing Tier 1/2 requirements
// ---------------------------------------------------------------------------

export interface SourceRecord {
  source_id: string;
  title: string;
  jurisdiction: string;
  citation: string;
  version: string;
  effective_date: string; // ISO date the source takes effect
  expiration_date: string | null;
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
}

export class SourceRegistry {
  private sources = new Map<string, SourceRecord>();

  add(record: SourceRecord): void {
    if (this.sources.has(record.source_id)) {
      throw new Error(`Duplicate source_id: ${record.source_id}`);
    }
    this.sources.set(record.source_id, record);
  }

  get(sourceId: string): SourceRecord | null {
    return this.sources.get(sourceId) ?? null;
  }

  all(): SourceRecord[] {
    return [...this.sources.values()];
  }
}

// ---------------------------------------------------------------------------
// Requirement registry — every enforced rule belongs to one tier (§4)
// ---------------------------------------------------------------------------

export type RequirementTier = 1 | 2 | 3 | 4 | 5 | 6;

export type RequirementEnforcement = 'hard_blocker' | 'review_trigger' | 'quality_safeguard' | 'style' | 'technical';

export type ConflictStatus = 'none' | 'conflicted' | 'overridden_unapproved' | 'overridden_approved';

export interface RequirementRecord {
  requirement_id: string;
  tier: RequirementTier;
  title: string;
  enforcement: RequirementEnforcement;
  source_id: string | null; // Tier 1/2 must reference the source registry
  effective_date: string | null;
  jurisdiction: string | null;
  version: string;
  requirement_mapping: string; // which control/gate this maps to
  conflict_status: ConflictStatus;
  approved: boolean;
}

export class RequirementRegistry {
  private requirements = new Map<string, RequirementRecord>();

  add(record: RequirementRecord): void {
    if (this.requirements.has(record.requirement_id)) {
      throw new Error(`Duplicate requirement_id: ${record.requirement_id}`);
    }
    this.requirements.set(record.requirement_id, record);
  }

  get(requirementId: string): RequirementRecord | null {
    return this.requirements.get(requirementId) ?? null;
  }

  all(): RequirementRecord[] {
    return [...this.requirements.values()];
  }
}

// ---------------------------------------------------------------------------
// Deployment check (§11) — fail closed. Tier 1 and Tier 2 hard blockers must be
// sourced, approved, effective for the incident date, unconflicted, and not
// overridden by an unapproved local rule. Any failure blocks deployment.
// ---------------------------------------------------------------------------

export interface DeploymentFailure {
  requirement_id: string;
  reason:
    | 'unsourced'
    | 'source_not_found'
    | 'unapproved_requirement'
    | 'unapproved_source'
    | 'not_effective_for_incident_date'
    | 'source_expired_for_incident_date'
    | 'conflicted'
    | 'overridden_by_unapproved_local_rule';
}

export interface DeploymentCheckResult {
  ok: boolean;
  failures: DeploymentFailure[];
}

export function runDeploymentCheck(
  requirements: RequirementRegistry,
  sources: SourceRegistry,
  incidentDate: string
): DeploymentCheckResult {
  const failures: DeploymentFailure[] = [];

  for (const req of requirements.all()) {
    // Only Tier 1/2 hard blockers can block deployment (§11). Until verified,
    // policy questions remain review triggers or quality safeguards.
    const isHardBlocker = (req.tier === 1 || req.tier === 2) && req.enforcement === 'hard_blocker';
    if (!isHardBlocker) continue;

    if (req.conflict_status === 'conflicted') {
      failures.push({ requirement_id: req.requirement_id, reason: 'conflicted' });
    }
    if (req.conflict_status === 'overridden_unapproved') {
      failures.push({ requirement_id: req.requirement_id, reason: 'overridden_by_unapproved_local_rule' });
    }
    if (!req.approved) {
      failures.push({ requirement_id: req.requirement_id, reason: 'unapproved_requirement' });
    }
    if (req.source_id === null) {
      failures.push({ requirement_id: req.requirement_id, reason: 'unsourced' });
      continue; // no source to check further
    }
    const source = sources.get(req.source_id);
    if (source === null) {
      failures.push({ requirement_id: req.requirement_id, reason: 'source_not_found' });
      continue;
    }
    if (!source.approved) {
      failures.push({ requirement_id: req.requirement_id, reason: 'unapproved_source' });
    }
    if (source.effective_date > incidentDate) {
      failures.push({ requirement_id: req.requirement_id, reason: 'not_effective_for_incident_date' });
    }
    if (source.expiration_date !== null && source.expiration_date < incidentDate) {
      failures.push({ requirement_id: req.requirement_id, reason: 'source_expired_for_incident_date' });
    }
  }

  return { ok: failures.length === 0, failures };
}
