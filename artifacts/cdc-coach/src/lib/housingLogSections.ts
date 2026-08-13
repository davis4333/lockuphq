import {
  fieldsForConfig,
  isBlankHousingLogValue,
  validateHousingLog,
  type FieldDefinition,
  type HousingLogConfig,
  type HousingLogDraftInput,
  type HousingLogValue,
  type HousingUnit,
  type ValidationIssue,
} from "@workspace/housing-log";

/**
 * Task-based navigation for the officer-facing Housing Log workspace.
 *
 * All completion/missing information is derived from the canonical
 * configuration (`HousingLogConfig`) and the existing `validateHousingLog`
 * validator. No required-field lists are duplicated here — this module only
 * classifies canonical validation issues into UI task sections.
 */

export const housingLogTaskIds = [
  "setup",
  "staff",
  "counts",
  "checks",
  "events",
  "review",
] as const;

export type HousingLogTaskId = (typeof housingLogTaskIds)[number];

export const housingLogTaskLabels: Record<HousingLogTaskId, string> = {
  setup: "Shift Setup",
  staff: "Staff & Equipment",
  counts: "Counts & Activities",
  checks: "Security Checks",
  events: "Event Log",
  review: "Review & Signatures",
};

export type SectionIndex = {
  /** field key (values.*) → owning task section */
  valueKeyToTask: Map<string, HousingLogTaskId>;
};

/** Build a field-key → section map straight from the canonical config. */
export function buildSectionIndex(config: HousingLogConfig): SectionIndex {
  const valueKeyToTask = new Map<string, HousingLogTaskId>();
  for (const section of config.sections) {
    for (const field of section.fields) {
      valueKeyToTask.set(field.key, "staff");
    }
  }
  for (const activity of config.activities) {
    for (const field of activity.detailFields) {
      valueKeyToTask.set(field.key, "counts");
    }
  }
  // Count and security-check field keys are prefix-derived (see
  // fieldsForConfig); classified by prefix in taskForPath below.
  return { valueKeyToTask };
}

/** Classify a canonical validation-issue path into a task section. */
export function taskForPath(
  path: string,
  index: SectionIndex,
): HousingLogTaskId {
  if (
    path === "logDate" ||
    path === "selection" ||
    path === "templateVersion"
  ) {
    return "setup";
  }
  if (path.startsWith("events.")) return "events";
  if (path.startsWith("signatures.")) return "review";
  if (path.startsWith("values.")) {
    const key = path.slice("values.".length);
    if (key.startsWith("counts.")) return "counts";
    if (key.startsWith("securityChecks.")) return "checks";
    return index.valueKeyToTask.get(key) ?? "staff";
  }
  return "setup";
}

/**
 * Canonical fields for a key prefix (e.g. `counts.master.` or
 * `securityChecks.3.`), straight from `fieldsForConfig`. The trailing dot in
 * the prefix matters: it prevents `securityChecks.1.` from matching
 * `securityChecks.10.*` keys.
 */
export function canonicalFieldsWithPrefix(
  config: HousingLogConfig,
  prefix: string,
): FieldDefinition[] {
  return fieldsForConfig(config).filter((field) =>
    field.key.startsWith(prefix),
  );
}

/**
 * Display-only shortening of a canonical field label: canonical count and
 * security-check labels are `<group> — <detail>`; inside a group card only
 * the detail is shown. Requiredness/type/key remain canonical.
 */
export function shortFieldLabel(definition: FieldDefinition): string {
  const separator = definition.label.lastIndexOf(" — ");
  const short =
    separator >= 0
      ? definition.label.slice(separator + " — ".length)
      : definition.label;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** N/A marker written into every field of an intentionally absent staff slot. */
export const STAFF_NA_VALUE = "N/A";

export type StaffSlotKind = "sergeant" | "officer" | "combined";

export type StaffSlot = {
  /** canonical key prefix, e.g. `staff.1` */
  prefix: string;
  /** position label from the canonical config, e.g. "Sergeant", "Officer 1" */
  position: string;
  kind: StaffSlotKind;
  /** canonical fields belonging to this slot, straight from the config */
  fields: FieldDefinition[];
};

/**
 * Group the canonical staff-section fields into per-person slots. The slot
 * list, ordering, positions, and fields all come from the config — nothing is
 * hardcoded here.
 */
export function staffSlotsForConfig(config: HousingLogConfig): StaffSlot[] {
  const staffSection = config.sections.find(
    (section) => section.key === "staff",
  );
  if (!staffSection) return [];
  const byPrefix = new Map<string, FieldDefinition[]>();
  for (const field of staffSection.fields) {
    const match = /^(staff\.\d+)\./.exec(field.key);
    if (!match) continue;
    const list = byPrefix.get(match[1]) ?? [];
    list.push(field);
    byPrefix.set(match[1], list);
  }
  return Array.from(byPrefix.entries()).map(([prefix, fields]) => {
    const nameField = fields.find((field) => field.key === `${prefix}.name`);
    const position = nameField
      ? nameField.label.replace(/ name$/i, "")
      : prefix;
    const kind: StaffSlotKind =
      position === "Sergeant"
        ? "sergeant"
        : /^Officer\b/.test(position)
          ? "officer"
          : "combined";
    return { prefix, position, kind, fields };
  });
}

/**
 * A slot is intentionally absent when EVERY one of its canonical fields holds
 * the literal N/A marker. Anything else (blank or partial) is a present slot
 * with possibly missing information — the canonical validator handles that.
 */
export function isStaffSlotNA(
  slot: StaffSlot,
  values: Record<string, HousingLogValue>,
): boolean {
  return slot.fields.every(
    (field) => String(values[field.key] ?? "").trim() === STAFF_NA_VALUE,
  );
}

/** Display-only label inside a person card: strip the position prefix. */
export function staffFieldLabel(
  slot: StaffSlot,
  definition: FieldDefinition,
): string {
  const prefix = `${slot.position} `;
  const short = definition.label.startsWith(prefix)
    ? definition.label.slice(prefix.length)
    : definition.label;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export type TaskStatus = {
  /** required items (canonical validation issues) remaining in this section */
  remaining: number;
  /** officer has entered at least one value belonging to this section */
  started: boolean;
  /** section currently satisfies the canonical validator */
  ready: boolean;
};

export type WorkspaceStatus = {
  tasks: Record<HousingLogTaskId, TaskStatus>;
  /** total canonical required/invalid items outstanding */
  totalRemaining: number;
  /** number of sections currently ready */
  readySections: number;
  issues: ValidationIssue[];
};

/**
 * Compute live task statuses from the canonical validator. The same
 * `validateHousingLog` used by finalization is the single source of truth.
 */
export function computeWorkspaceStatus(
  config: HousingLogConfig,
  input: HousingLogDraftInput,
): WorkspaceStatus {
  const index = buildSectionIndex(config);
  const issues = validateHousingLog(input);
  const remaining: Record<HousingLogTaskId, number> = {
    setup: 0,
    staff: 0,
    counts: 0,
    checks: 0,
    events: 0,
    review: 0,
  };
  for (const issue of issues) {
    remaining[taskForPath(issue.path, index)] += 1;
  }

  const started: Record<HousingLogTaskId, boolean> = {
    setup: Boolean(input.housingUnit && input.shift && input.logDate),
    staff: false,
    counts: false,
    checks: false,
    events: input.events.some(
      (event) =>
        event.time.trim() || event.activity.trim() || event.initials.trim(),
    ),
    review: Object.values(input.signatures).some(
      (value) => typeof value === "string" && value.trim() !== "",
    ),
  };
  for (const [key, value] of Object.entries(input.values)) {
    if (isBlankHousingLogValue(value)) continue;
    const task = taskForPath(`values.${key}`, index);
    if (task === "staff" || task === "counts" || task === "checks") {
      started[task] = true;
    }
  }

  const tasks = Object.fromEntries(
    housingLogTaskIds.map((id) => [
      id,
      {
        remaining: remaining[id],
        started: started[id],
        ready: remaining[id] === 0,
      },
    ]),
  ) as Record<HousingLogTaskId, TaskStatus>;

  const readySections = housingLogTaskIds.filter(
    (id) => tasks[id].ready,
  ).length;

  return {
    tasks,
    totalRemaining: issues.length,
    readySections,
    issues,
  };
}

/**
 * Optional, editable suggestions for short known key-ring style codes (e.g.
 * a unit's key ring commonly runs {UNIT}, {UNIT}1 … {UNIT}6). These are
 * hints only — rendered via <datalist> so any legitimate value that doesn't
 * match the pattern remains freely enterable.
 */
export function keyRingSuggestions(
  definition: FieldDefinition,
  housingUnit: HousingUnit | "",
): string[] | undefined {
  if (!housingUnit) return undefined;
  if (!/keyring|acceptedkeyrings/i.test(definition.key)) return undefined;
  // N/A is a legitimate answer for a key-ring slot the official form prints
  // but this dorm doesn't actually use — not a validation bypass, since the
  // officer still has to choose it deliberately for that specific slot.
  return [
    housingUnit,
    ...Array.from({ length: 6 }, (_, i) => `${housingUnit}${i + 1}`),
    "N/A",
  ];
}
