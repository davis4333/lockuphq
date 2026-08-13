import { fieldsForConfig } from "./configs";
import type {
  FieldDefinition,
  HousingLogConfig,
  HousingLogEvent,
  HousingLogValue,
  HousingShift,
  HousingUnit,
  RequiredActivityDefinition,
  SignatureDefinition,
} from "./types";

/**
 * Fake-data generator for Housing Log demo seeding. Every value produced
 * here still has to pass the SAME real client/server validation as manual
 * entry — this module only picks plausible field values, it does not touch
 * or bypass validateHousingLog / signature validation in any way.
 *
 * Values are generated from ONE coherent shift scenario (a fixed staff
 * roster, a separate shift-supervisor identity, a shift-aware time
 * schedule, and unit-aware equipment codes) rather than as independent
 * per-field randomization, so that related canonical fields — a person's
 * name and their initials, a count's recall/count/clear sequence, a
 * housing unit's key-ring codes — always agree with each other.
 *
 * Lives in this shared domain package (rather than in the officer-facing
 * app) so it can also be exercised by the Excel-export test suite, which
 * needs to generate and inspect the actual official worksheet a Complete
 * Demo produces — not just whether it satisfies canonical validation.
 */

export type DemoRng = () => number;

/** Real, unpredictable randomness for production use. */
export function cryptoRng(): DemoRng {
  return () => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] / 0x1_0000_0000;
  };
}

/** Deterministic PRNG (mulberry32) so tests can inject a fixed, repeatable seed. */
export function seededRng(seed: number): DemoRng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(rng: DemoRng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("Cannot pick from an empty list.");
  return item;
}

function randInt(rng: DemoRng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffledIndexSample(
  rng: DemoRng,
  length: number,
  count: number,
): number[] {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j]!, indexes[i]!];
  }
  return indexes.slice(0, Math.min(count, indexes.length));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Scenario identities: a fixed roster of the officers actually assigned to
// this housing unit for this shift, plus a separate shift-supervisor
// identity for the handful of fields that specifically call for one. Every
// field that needs "who did this" draws from exactly one of these two pools
// — never an independent random pick — so a name and its initials, and an
// actor's role, can never drift apart within one generated log.
// ---------------------------------------------------------------------------

const LAST_NAMES = [
  "Rutherford",
  "Montgomery",
  "Beaumont",
  "Fitzgerald",
  "Washington",
  "Delacroix",
  "Whitfield",
  "Okafor",
  "Sandoval",
  "Kowalski",
];
const FIRST_INITIALS = "ABCDEFGHJKMNPRSTW".split("");

type DemoPerson = { name: string; initials: string };

function makePerson(rng: DemoRng, usedLastNames: Set<string>): DemoPerson {
  let lastName = pick(rng, LAST_NAMES);
  while (
    usedLastNames.has(lastName) &&
    usedLastNames.size < LAST_NAMES.length
  ) {
    lastName = pick(rng, LAST_NAMES);
  }
  usedLastNames.add(lastName);
  const firstInitial = pick(rng, FIRST_INITIALS);
  return {
    name: `${firstInitial}. ${lastName}`,
    initials: `${firstInitial}${lastName[0]}`,
  };
}

function makeRoster(rng: DemoRng, size: number, usedLastNames: Set<string>): DemoPerson[] {
  return Array.from({ length: size }, () => makePerson(rng, usedLastNames));
}

// ---------------------------------------------------------------------------
// Shift-aware time scheduling. All three shifts run 8 hours; shift 1 is the
// overnight shift and rolls past midnight, which is why every generated
// time is derived from a shift-relative minute offset (0 = shift start) and
// converted to a wall-clock HH:MM with a single modulo — the wraparound is
// handled once, here, instead of by each caller.
// ---------------------------------------------------------------------------

const SHIFT_WINDOWS: Record<HousingShift, { startMinutes: number; lengthMinutes: number }> = {
  "1": { startMinutes: 23 * 60, lengthMinutes: 8 * 60 }, // 23:00 -> 07:00
  "2": { startMinutes: 7 * 60, lengthMinutes: 8 * 60 }, // 07:00 -> 15:00
  "3": { startMinutes: 15 * 60, lengthMinutes: 8 * 60 }, // 15:00 -> 23:00
};

function formatShiftMinute(shift: HousingShift, relativeMinute: number): string {
  const window = SHIFT_WINDOWS[shift];
  const absolute = (((window.startMinutes + relativeMinute) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/**
 * Inverse of formatShiftMinute: how many minutes after this shift's start a
 * wall-clock HH:MM value falls, correctly unwrapping the midnight rollover
 * for the overnight shift. A plain string/lexicographic comparison of two
 * HH:MM values cannot express "chronologically later" across a rollover
 * (validateHousingLog's sortEventsChronologically deliberately does not
 * attempt it) — callers that need to check ordering across a generated
 * shift timeline should compare this instead.
 */
export function shiftRelativeMinutes(shift: HousingShift, time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new Error(`Not a canonical HH:MM time: ${time}`);
  const absolute = Number(match[1]) * 60 + Number(match[2]);
  const start = SHIFT_WINDOWS[shift].startMinutes;
  return ((absolute - start) % 1440 + 1440) % 1440;
}

/** Evenly-sized, non-overlapping, chronologically ordered slots across the shift. */
function shiftSlots(shift: HousingShift, count: number): { start: number; size: number }[] {
  if (count <= 0) return [];
  const { lengthMinutes } = SHIFT_WINDOWS[shift];
  const size = Math.max(1, Math.floor(lengthMinutes / count));
  return Array.from({ length: count }, (_, index) => ({
    start: index * size,
    size,
  }));
}

function timeWithinSlot(rng: DemoRng, shift: HousingShift, slot: { start: number; size: number }): string {
  const offset = randInt(rng, 1, Math.max(1, slot.size - 1));
  return formatShiftMinute(shift, slot.start + offset);
}

// ---------------------------------------------------------------------------
// Field-semantic value generators: each generator matches what the field is
// actually FOR, not just its input datatype.
// ---------------------------------------------------------------------------

function assetCode(rng: DemoRng, options: { letterSuffix?: boolean } = {}): string {
  const number = randInt(rng, 1, 199);
  const suffix =
    options.letterSuffix !== false && rng() < 0.3 ? pick(rng, ["A", "B", "C"]) : "";
  return `${number}${suffix}`;
}

/** D Dorm -> "D", "D1", "D2", ...; Infirmary -> "INF", "INF1", "INF2", ... */
function makeKeyRingSequencer(unit: HousingUnit): () => string {
  const prefix = unit === "Infirmary" ? "INF" : unit;
  let issued = 0;
  return () => {
    const code = issued === 0 ? prefix : `${prefix}${issued}`;
    issued += 1;
    return code;
  };
}

const RADIO_STATUS_OPTIONS = [
  "Operational",
  "Fully charged",
  "In service",
  "Charging normally",
];

const HEALTH_COMFORT_ITEMS = [
  "soap",
  "toothpaste",
  "toilet paper",
  "razors",
  "combs",
  "deodorant",
  "toothbrushes",
  "shampoo",
];

function itemsDistributedText(rng: DemoRng): string {
  const count = randInt(rng, 3, 5);
  const items = shuffledIndexSample(rng, HEALTH_COMFORT_ITEMS.length, count).map(
    (index) => HEALTH_COMFORT_ITEMS[index]!,
  );
  const [first, ...rest] = items;
  const capitalized = `${first![0]!.toUpperCase()}${first!.slice(1)}`;
  if (rest.length === 0) return `${capitalized}.`;
  const last = rest.pop()!;
  return rest.length > 0
    ? `${capitalized}, ${rest.join(", ")}, and ${last}.`
    : `${capitalized} and ${last}.`;
}

/** Free-form Event Log narrative pool — not used for any structured field. */
const EVENT_NARRATIVES = [
  "Routine walk-through, no unusual activity observed.",
  "Inmate requested medical attention; escorted to Infirmary.",
  "Housing unit temperature checked and logged.",
  "Recreation yard access opened for scheduled group.",
  "Visitor escort completed without incident.",
  "Cell search conducted per weekly schedule.",
  "Meal service completed for all inmates in housing unit.",
  "Maintenance notified of a flickering light in Wing Two.",
  "Inmate grievance form collected and forwarded.",
  "Phone access period began for the housing unit.",
];

// Field keys whose "who" is the roving shift supervisor rather than one of
// the housing unit's own assigned officers.
const SUPERVISOR_ACTIVITY_KEYS = new Set([
  "unannouncedInspection",
  "adminRecStart",
  "disciplinaryRecStart",
]);

const PERSON_FIELD_SUFFIX =
  /(performedBy|conductedBy|supervisor|escort|reportedBy|inventoriedBy|distributedBy|issuedBy|verifiedBy|completedBy|announcementMadeBy)$/i;

// Fields whose "who" a person is recorded in, but whose key doesn't end in
// one of the standard suffixes above.
const EXTRA_PERSON_FIELD_KEYS = new Set(["equipment.cellExtraction"]);

/** Fallback for any field the structured scenario builder below doesn't
 * explicitly cover — kept intentionally small; a growing fallback list is a
 * sign a field needs a real semantic generator instead. */
function fallbackFieldValue(
  field: FieldDefinition,
  rng: DemoRng,
  roster: DemoPerson[],
  shift: HousingShift,
): HousingLogValue {
  if (field.inputType === "time")
    return formatShiftMinute(shift, randInt(rng, 0, SHIFT_WINDOWS[shift].lengthMinutes - 1));
  if (field.inputType === "number") return randInt(rng, 0, 4);
  if (field.inputType === "choice") return pick(rng, field.options ?? ["Yes"]);
  const key = field.key;
  if (/\.name$/.test(key)) return pick(rng, roster).name;
  if (/initials$/i.test(key)) return pick(rng, roster).initials;
  if (PERSON_FIELD_SUFFIX.test(key) || EXTRA_PERSON_FIELD_KEYS.has(key))
    return pick(rng, roster).name;
  if (field.inputType === "textarea") return itemsDistributedText(rng);
  return "N/A";
}

export type DemoFieldGroup =
  | "staff"
  | "equipment"
  | "counts"
  | "activities"
  | "securityChecks"
  | "other";

export function groupForFieldKey(key: string): DemoFieldGroup {
  if (key.startsWith("staff.")) return "staff";
  if (key.startsWith("equipment.") || key.startsWith("medication."))
    return "equipment";
  if (key.startsWith("counts.")) return "counts";
  if (key.startsWith("activities.")) return "activities";
  if (key.startsWith("securityChecks.")) return "securityChecks";
  return "other";
}

export type DemoSeedValues = {
  values: Record<string, HousingLogValue>;
  events: HousingLogEvent[];
};

/** A complete, internally consistent, fully valid random dataset built from
 * one coherent shift scenario. */
export function generateCompleteDemoValues(
  config: HousingLogConfig,
  rng: DemoRng,
): DemoSeedValues {
  const values: Record<string, HousingLogValue> = {};
  const set = (key: string, value: HousingLogValue) => {
    values[key] = value;
  };

  const usedLastNames = new Set<string>();
  const staffPositions =
    config.sections.find((section) => section.key === "staff")?.fields.filter(
      (candidate) => candidate.key.endsWith(".name"),
    ).length ?? 1;
  const roster = makeRoster(rng, staffPositions, usedLastNames);
  const supervisor = makePerson(rng, usedLastNames);
  const nextKeyRing = makeKeyRingSequencer(config.housingUnit);
  const shift = config.shift;

  // --- Staff section -------------------------------------------------
  roster.forEach((person, index) => {
    const prefix = `staff.${index + 1}`;
    set(`${prefix}.name`, person.name);
    set(`${prefix}.assumedAt`, formatShiftMinute(shift, -randInt(rng, 0, 10)));
    set(`${prefix}.initials`, person.initials);
    set(`${prefix}.keyRing`, nextKeyRing());
    set(`${prefix}.radio`, `R${randInt(rng, 10, 99)}`);
    set(`${prefix}.chemicalAgent`, `CAP-${randInt(rng, 1, 20)}`);
    set(`${prefix}.chemicalAgentSeal`, `S-${randInt(rng, 100, 999)}`);
    set(`${prefix}.bodyAlarm`, `BA-${randInt(rng, 1, 60)}`);
    set(`${prefix}.cuffsCase`, assetCode(rng));
  });

  // --- Equipment section ----------------------------------------------
  const equipmentFields =
    config.sections.find((section) => section.key === "equipment")?.fields ?? [];
  const equipmentKeys = new Set(equipmentFields.map((item) => item.key));
  const hasKey = (key: string) => equipmentKeys.has(key);

  // Equipment accountability actions (accepting keys, radios, first aid,
  // etc.) happen near shift start as staff take over the unit. Each gets
  // its own completion time/initials, scheduled in a short early-shift
  // sequence rather than scattered across the whole shift.
  const completionOrder = [
    "keysAccepted",
    "radiosAccountedFor",
    ...(hasKey("equipment.radioChargingStationTime")
      ? ["radioChargingStation"]
      : []),
    "firstAidInventory",
    "equipmentInventory",
    ...(hasKey("equipment.medicationInventoryTime")
      ? ["medicationInventory"]
      : []),
  ];
  const completionSlots = shiftSlots(shift, completionOrder.length);
  completionOrder.forEach((name, index) => {
    const slot = completionSlots[index]!;
    const actor = pick(rng, roster);
    set(`equipment.${name}Time`, timeWithinSlot(rng, shift, slot));
    set(`equipment.${name}Initials`, actor.initials);
  });

  if (config.housingUnit === "Infirmary") {
    set("equipment.infirmaryKeyRing", nextKeyRing());
    set("equipment.infirmaryBodyAlarm", `BA-${randInt(rng, 1, 60)}`);
    set("equipment.infirmaryCuff", assetCode(rng));
    set("equipment.infirmaryCuffCase", assetCode(rng));
    set("equipment.infirmaryRadio", `R${randInt(rng, 10, 99)}`);
    set("equipment.radioStatusReportedBy", pick(rng, roster).name);
  } else {
    for (let index = 1; index <= 8; index += 1) {
      if (hasKey(`equipment.acceptedKeyRings.${index}`))
        set(`equipment.acceptedKeyRings.${index}`, nextKeyRing());
    }
    for (let index = 1; index <= 3; index += 1) {
      if (hasKey(`equipment.radios.${index}`))
        set(`equipment.radios.${index}`, `R${randInt(rng, 10, 99)}`);
      if (hasKey(`equipment.bodyAlarms.${index}`))
        set(`equipment.bodyAlarms.${index}`, `BA-${randInt(rng, 1, 60)}`);
      if (hasKey(`equipment.cuffs.${index}`))
        set(`equipment.cuffs.${index}`, assetCode(rng));
      if (hasKey(`equipment.cuffCases.${index}`))
        set(`equipment.cuffCases.${index}`, assetCode(rng));
    }
    set("equipment.radioStatusReportedBy", pick(rng, roster).name);
    if (hasKey("equipment.cellExtraction"))
      set("equipment.cellExtraction", pick(rng, roster).name);
    set("equipment.radioChargingStation", pick(rng, RADIO_STATUS_OPTIONS));
    set("equipment.extraBatteries", randInt(rng, 2, 8));
    set("equipment.inspectionMirror", assetCode(rng));
    set("equipment.cellUnlockingBars", randInt(rng, 1, 4));
    set("equipment.ligatureCutterSeal", `S-${randInt(rng, 100, 999)}`);
    set("equipment.legRestraints", assetCode(rng));
    set("equipment.backboards", randInt(rng, 1, 3));
    set("equipment.passesAccounted", "Yes");
    set("equipment.unaccountedPasses", "N/A");
    set("equipment.incidentReport", "No");
    set("medication.inventoriedBy", pick(rng, roster).name);
    set("medication.acetaminophen", randInt(rng, 0, 8));
    set("medication.alamag", randInt(rng, 0, 8));
    set("medication.ibuprofen", randInt(rng, 0, 8));
  }
  set("equipment.firstAidSeal", `S-${randInt(rng, 100, 999)}`);
  set("equipment.ppeKit", "Yes");
  set("equipment.breathingMask", "Yes");
  set("equipment.fireExtinguishers", "Yes");
  set("equipment.fireAlarm", "Yes");
  set("equipment.inventoryComplete", "Yes");
  set("equipment.postOrders", "Yes");

  // --- Counts -----------------------------------------------------------
  const countSlots = shiftSlots(shift, config.counts.length);
  const componentBaseline = new Map<string, number>();
  for (const component of config.counts[0]?.components ?? [])
    componentBaseline.set(component, randInt(rng, 4, 28));

  config.counts.forEach((count, index) => {
    const prefix = `counts.${count.key}`;
    const slot = countSlots[index]!;
    const actor = pick(rng, roster);

    if (count.isBeginning) {
      set(`${prefix}.countTime`, timeWithinSlot(rng, shift, slot));
    } else {
      const usable = Math.max(9, slot.size - 2);
      const step = Math.max(2, Math.floor(usable / 3));
      const recallRel = slot.start + randInt(rng, 2, step);
      const countRel = recallRel + randInt(rng, 2, step);
      const clearRel = countRel + randInt(rng, 2, step);
      set(`${prefix}.recallTime`, formatShiftMinute(shift, recallRel));
      set(`${prefix}.countTime`, formatShiftMinute(shift, countRel));
      set(`${prefix}.clearTime`, formatShiftMinute(shift, clearRel));
      set(`${prefix}.conductedByRole`, pick(rng, count.conductorOptions));
      set(`${prefix}.conductedBy`, actor.name);
    }
    set(`${prefix}.initials`, actor.initials);
    for (const component of count.components) {
      const baseline = componentBaseline.get(component) ?? randInt(rng, 4, 28);
      set(
        `${prefix}.components.${component}`,
        Math.max(0, baseline + randInt(rng, -1, 1)),
      );
    }
  });

  // --- Security checks ----------------------------------------------------
  const checkSlots = shiftSlots(shift, config.securityCheckCount);
  checkSlots.forEach((slot, index) => {
    const prefix = `securityChecks.${index + 1}`;
    const actor = pick(rng, roster);
    set(`${prefix}.time`, timeWithinSlot(rng, shift, slot));
    set(
      `${prefix}.performedByRole`,
      pick(rng, config.securityCheckRoleOptions),
    );
    set(`${prefix}.performedBy`, actor.name);
    set(`${prefix}.initials`, actor.initials);
  });

  // --- Activities -----------------------------------------------------
  const activitySlots = shiftSlots(shift, config.activities.length);
  config.activities.forEach((activityDef: RequiredActivityDefinition, index) => {
    const slot = activitySlots[index]!;
    const actorPool = SUPERVISOR_ACTIVITY_KEYS.has(activityDef.key)
      ? [supervisor]
      : roster;
    const actor = pick(rng, actorPool);
    const time = timeWithinSlot(rng, shift, slot);
    for (const detail of activityDef.detailFields) {
      if (detail.inputType === "time") {
        set(detail.key, time);
      } else if (/\.initials$/.test(detail.key)) {
        set(detail.key, actor.initials);
      } else if (detail.inputType === "textarea") {
        set(detail.key, itemsDistributedText(rng));
      } else if (detail.inputType === "choice") {
        // e.g. the shift-supervisor rank select — a role, not a name.
        set(detail.key, pick(rng, detail.options ?? ["Yes"]));
      } else {
        set(detail.key, actor.name);
      }
    }
  });

  // --- Safety net: fill anything the scenario above didn't cover ---------
  for (const field of fieldsForConfig(config)) {
    if (!(field.key in values))
      set(field.key, fallbackFieldValue(field, rng, roster, shift));
  }

  // --- Event log --------------------------------------------------------
  const eventCount = randInt(rng, 6, 14);
  const eventSlots = shiftSlots(shift, eventCount);
  const events: HousingLogEvent[] = eventSlots.map((slot) => ({
    id: crypto.randomUUID(),
    time: timeWithinSlot(rng, shift, slot),
    activity: pick(rng, EVENT_NARRATIVES),
    initials: pick(rng, roster).initials,
  }));

  return { values, events };
}

export type DemoIncompleteSeed = DemoSeedValues & {
  omittedValueKeys: string[];
  omitSignatureKeys: SignatureDefinition["key"][];
};

/**
 * A complete dataset with a randomized, meaningfully large subset of
 * required fields removed, spread across sections. Every invocation with a
 * different rng state omits a different combination.
 */
export function generateIncompleteDemoValues(
  config: HousingLogConfig,
  rng: DemoRng,
): DemoIncompleteSeed {
  const { values, events } = generateCompleteDemoValues(config, rng);
  const requiredKeys = fieldsForConfig(config)
    .filter((field) => field.required)
    .map((field) => field.key);

  const byGroup = new Map<DemoFieldGroup, string[]>();
  for (const key of requiredKeys) {
    const group = groupForFieldKey(key);
    const list = byGroup.get(group) ?? [];
    list.push(key);
    byGroup.set(group, list);
  }

  const omittedValueKeys: string[] = [];
  for (const [, keys] of byGroup) {
    if (keys.length === 0) continue;
    const omitCount = Math.max(1, Math.round(keys.length * 0.15));
    omittedValueKeys.push(
      ...shuffledIndexSample(rng, keys.length, omitCount).map(
        (index) => keys[index]!,
      ),
    );
  }

  const nextValues = { ...values };
  for (const key of omittedValueKeys) delete nextValues[key];

  // Randomly withhold 0-1 required signatures too, so the demo can surface
  // a signature validation failure as well as field omissions.
  const omitSignatureKeys: SignatureDefinition["key"][] =
    config.signatures.length > 0 && rng() < 0.6
      ? [pick(rng, config.signatures).key]
      : [];

  return {
    values: nextValues,
    events,
    omittedValueKeys,
    omitSignatureKeys,
  };
}
