import {
  fieldsForConfig,
  type FieldDefinition,
  type HousingLogConfig,
  type HousingLogEvent,
  type HousingLogValue,
  type SignatureDefinition,
} from "@workspace/housing-log";

/**
 * Fake-data generator for Housing Log demo seeding. Every value produced
 * here still has to pass the SAME real client/server validation as manual
 * entry — this module only picks plausible field values, it does not touch
 * or bypass validateHousingLog / signature validation in any way.
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

type DemoOfficer = { name: string; initials: string };

function makeRoster(rng: DemoRng, size: number): DemoOfficer[] {
  const usedLastNames = new Set<string>();
  return Array.from({ length: size }, () => {
    let lastName = pick(rng, LAST_NAMES);
    while (usedLastNames.has(lastName) && usedLastNames.size < LAST_NAMES.length) {
      lastName = pick(rng, LAST_NAMES);
    }
    usedLastNames.add(lastName);
    const firstInitial = pick(rng, FIRST_INITIALS);
    return {
      name: `${firstInitial}. ${lastName}`,
      initials: `${firstInitial}${lastName[0]}`,
    };
  });
}

function equipmentCode(rng: DemoRng, options: { letterSuffix?: boolean } = {}): string {
  const number = randInt(rng, 1, 199);
  const suffix =
    options.letterSuffix && rng() < 0.3 ? pick(rng, ["A", "B", "C"]) : "";
  return `${number}${suffix}`;
}

function randomTimeInRange(
  rng: DemoRng,
  startMinutes: number,
  endMinutes: number,
): string {
  const total = randInt(rng, startMinutes, endMinutes) % 1440;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const ACTIVITY_NARRATIVES = [
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

function fieldValue(
  field: FieldDefinition,
  rng: DemoRng,
  roster: DemoOfficer[],
): HousingLogValue {
  if (field.inputType === "time") return randomTimeInRange(rng, 0, 1439);
  if (field.inputType === "number") return randInt(rng, 0, 4);
  if (field.inputType === "choice") return pick(rng, field.options ?? ["Yes"]);

  const key = field.key;
  if (/\.name$/.test(key)) return pick(rng, roster).name;
  if (/initials$/i.test(key)) return pick(rng, roster).initials;
  if (
    /(performedBy|conductedBy|supervisor|escort|reportedBy|inventoriedBy|distributedBy|issuedBy|verifiedBy|completedBy|announcementMadeBy)$/i.test(
      key,
    )
  )
    return pick(rng, roster).name;
  if (/keyRing|acceptedKeyRings/i.test(key)) return `K${equipmentCode(rng)}`;
  if (/radio/i.test(key)) return `R${randInt(rng, 10, 99)}`;
  if (/cuffCases?|cuffsCase/i.test(key)) return `CC${randInt(rng, 1, 30)}`;
  if (/\bcuffs?\b/i.test(key)) return equipmentCode(rng, { letterSuffix: true });
  if (/bodyAlarm/i.test(key)) return `BA-${randInt(rng, 1, 60)}`;
  if (/seal/i.test(key)) return `S-${randInt(rng, 100, 999)}`;
  if (/chemicalAgent$/i.test(key)) return `CAP-${randInt(rng, 1, 20)}`;
  if (field.inputType === "textarea")
    return pick(rng, ACTIVITY_NARRATIVES);
  return "OK";
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

/** A complete, internally consistent, fully valid random dataset. */
export function generateCompleteDemoValues(
  config: HousingLogConfig,
  rng: DemoRng,
): DemoSeedValues {
  const staffCount =
    config.sections.find((section) => section.key === "staff")?.fields.filter(
      (field) => field.key.endsWith(".name"),
    ).length ?? 1;
  const roster = makeRoster(rng, Math.max(staffCount, 3));

  const values: Record<string, HousingLogValue> = {};
  for (const field of fieldsForConfig(config))
    values[field.key] = fieldValue(field, rng, roster);

  const eventCount = randInt(rng, 6, 14);
  let minutesCursor = randInt(rng, 60, 300); // start sometime after 01:00
  const events: HousingLogEvent[] = Array.from(
    { length: eventCount },
    () => {
      minutesCursor += randInt(rng, 5, 45);
      const hours = Math.floor(minutesCursor / 60) % 24;
      const minutes = minutesCursor % 60;
      return {
        id: crypto.randomUUID(),
        time: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
        activity: pick(rng, ACTIVITY_NARRATIVES),
        initials: pick(rng, roster).initials,
      };
    },
  );

  return { values, events };
}

/**
 * A plausible cursive-like path within the signature pad's logical
 * coordinate space (see signatureInk.ts), guaranteed to clear the same
 * isPlausibleSignatureInk thresholds a real hand-drawn stroke must clear
 * (total distance, point count, and bounding-box spread). SignaturePad
 * draws these points through its normal stroke/finish code path — this
 * function only picks the geometry, it never touches validation itself.
 */
export function generateSignatureStrokePoints(
  rng: DemoRng,
): { x: number; y: number }[] {
  const baseline = randInt(rng, 100, 140);
  const amplitude = randInt(rng, 25, 45);
  const startX = randInt(rng, 60, 120);
  const endX = randInt(rng, 620, 760);
  const points: { x: number; y: number }[] = [];
  const steps = randInt(rng, 24, 40);
  for (let i = 0; i <= steps; i += 1) {
    const progress = i / steps;
    const x = startX + (endX - startX) * progress;
    const wave =
      Math.sin(progress * Math.PI * randInt(rng, 3, 5)) * amplitude +
      (rng() - 0.5) * 8;
    points.push({ x, y: baseline + wave });
  }
  return points;
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
