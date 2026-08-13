import { fieldsForConfig, getHousingLogConfig } from "./configs";
import { isValidHousingLogDate } from "./types";
import type {
  HousingLogConfig,
  HousingLogDraftInput,
  HousingLogEvent,
  HousingLogValue,
  ValidationIssue,
} from "./types";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isBlankHousingLogValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

export function calculateCountTotal(
  config: HousingLogConfig,
  countKey: string,
  values: Record<string, HousingLogValue>,
): number | undefined {
  const count = config.counts.find((candidate) => candidate.key === countKey);
  if (!count) return undefined;
  const numbers = count.components.map(
    (component) => values[`counts.${count.key}.components.${component}`],
  );
  if (
    numbers.some(
      (value) => isBlankHousingLogValue(value) || Number.isNaN(Number(value)),
    )
  )
    return undefined;
  return numbers.reduce<number>((sum, value) => sum + Number(value), 0);
}

export function withCalculatedTotals(
  config: HousingLogConfig,
  values: Record<string, HousingLogValue>,
): Record<string, HousingLogValue> {
  const next = { ...values };
  for (const count of config.counts) {
    delete next[`counts.${count.key}.total`];
    const total = calculateCountTotal(config, count.key, next);
    if (total !== undefined) next[`counts.${count.key}.total`] = total;
  }
  return next;
}

export function sortEventsChronologically(
  events: HousingLogEvent[],
): HousingLogEvent[] {
  // Time-only sorting cannot represent an overnight shift correctly. Preserve
  // the officer-entered sequence until events carry a date/day offset.
  return [...events];
}

export function validateHousingLog(
  input: HousingLogDraftInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let config: HousingLogConfig;
  try {
    config = getHousingLogConfig(input.housingUnit, input.shift);
  } catch {
    return [
      {
        path: "selection",
        label: "Housing unit and shift",
        message: "Select a supported housing unit and shift.",
      },
    ];
  }

  if (!isValidHousingLogDate(input.logDate)) {
    issues.push({
      path: "logDate",
      label: "Log date",
      message: "Enter a real calendar date.",
    });
  }
  if (input.templateVersion !== config.templateVersion) {
    issues.push({
      path: "templateVersion",
      label: "Template version",
      message: "Reload the current official-form configuration.",
    });
  }

  // An "N/A" time is only acceptable as part of an intentionally absent staff
  // slot — i.e. when EVERY canonical field in that slot is the literal "N/A".
  // A present staff member with a real name but an N/A time is still invalid.
  const naStaffPrefixes = new Set<string>();
  {
    const slotFields = new Map<string, string[]>();
    for (const definition of fieldsForConfig(config)) {
      const match = /^(staff\.\d+)\./.exec(definition.key);
      if (!match) continue;
      const list = slotFields.get(match[1]) ?? [];
      list.push(definition.key);
      slotFields.set(match[1], list);
    }
    for (const [prefix, keys] of slotFields) {
      if (
        keys.every(
          (key) => String(input.values[key] ?? "").trim() === "N/A",
        )
      ) {
        naStaffPrefixes.add(prefix);
      }
    }
  }
  const inNaStaffSlot = (key: string): boolean => {
    const match = /^(staff\.\d+)\./.exec(key);
    return match !== null && naStaffPrefixes.has(match[1]);
  };

  for (const definition of fieldsForConfig(config)) {
    const value = input.values[definition.key];
    if (definition.required && isBlankHousingLogValue(value)) {
      issues.push({
        path: `values.${definition.key}`,
        label: definition.label,
        message: `${definition.label} is required.`,
      });
      continue;
    }
    if (isBlankHousingLogValue(value)) continue;
    if (
      definition.inputType === "number" &&
      (!Number.isInteger(Number(value)) || Number(value) < 0)
    ) {
      issues.push({
        path: `values.${definition.key}`,
        label: definition.label,
        message: `${definition.label} must be a whole number of zero or more.`,
      });
    }
    if (
      definition.inputType === "time" &&
      !(
        definition.allowNa &&
        String(value).trim() === "N/A" &&
        inNaStaffSlot(definition.key)
      ) &&
      !timePattern.test(String(value))
    ) {
      issues.push({
        path: `values.${definition.key}`,
        label: definition.label,
        message: `${definition.label} must be a valid time.`,
      });
    }
    if (
      definition.inputType === "choice" &&
      definition.options &&
      !definition.options.includes(String(value))
    ) {
      issues.push({
        path: `values.${definition.key}`,
        label: definition.label,
        message: `Choose a valid value for ${definition.label}.`,
      });
    }
  }

  const eventIds = new Set<string>();
  input.events.forEach((event, index) => {
    if (eventIds.has(event.id)) {
      issues.push({
        path: `events.${event.id}.id`,
        label: `Event ${index + 1} ID`,
        message: "Event rows must have unique IDs.",
      });
    }
    eventIds.add(event.id);
    const hasAny = Boolean(
      event.time.trim() || event.activity.trim() || event.initials.trim(),
    );
    if (!hasAny) return;
    const prefix = `events.${event.id}`;
    if (!event.time.trim())
      issues.push({
        path: `${prefix}.time`,
        label: `Event ${index + 1} time`,
        message: `Event ${index + 1} needs a time.`,
      });
    else if (!timePattern.test(event.time))
      issues.push({
        path: `${prefix}.time`,
        label: `Event ${index + 1} time`,
        message: `Event ${index + 1} has an invalid time.`,
      });
    if (!event.activity.trim())
      issues.push({
        path: `${prefix}.activity`,
        label: `Event ${index + 1} activity`,
        message: `Event ${index + 1} needs an event or activity.`,
      });
    if (!event.initials.trim())
      issues.push({
        path: `${prefix}.initials`,
        label: `Event ${index + 1} initials`,
        message: `Event ${index + 1} needs initials.`,
      });
  });

  for (const signature of config.signatures) {
    const value = input.signatures[signature.key];
    if (!value?.startsWith("data:image/png;base64,")) {
      issues.push({
        path: `signatures.${signature.key}`,
        label: signature.label,
        message: `${signature.label} is required.`,
      });
    }
  }
  return issues;
}

export function prepareHousingLog(
  input: HousingLogDraftInput,
): HousingLogDraftInput {
  const config = getHousingLogConfig(input.housingUnit, input.shift);
  return {
    ...input,
    values: withCalculatedTotals(config, input.values),
    events: input.events.filter((event) =>
      Boolean(
        event.time.trim() || event.activity.trim() || event.initials.trim(),
      ),
    ),
  };
}

export function hasMeaningfulHousingLogContent(
  input: Pick<HousingLogDraftInput, "values" | "events" | "signatures">,
): boolean {
  return (
    Object.values(input.values).some(
      (value) => !isBlankHousingLogValue(value),
    ) ||
    input.events.some((event) =>
      Boolean(
        event.time.trim() || event.activity.trim() || event.initials.trim(),
      ),
    ) ||
    Object.values(input.signatures).some(
      (value) => typeof value === "string" && value.trim() !== "",
    )
  );
}
