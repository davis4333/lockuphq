import { fieldsForConfig, getHousingLogConfig } from "./configs";
import type {
  HousingLogConfig,
  HousingLogDraftInput,
  HousingLogEvent,
  HousingLogValue,
  ValidationIssue,
} from "./types";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(value: HousingLogValue | undefined): boolean {
  return value === undefined || (typeof value === "string" && value.trim() === "");
}

export function calculateCountTotal(
  config: HousingLogConfig,
  countKey: string,
  values: Record<string, HousingLogValue>,
): number | undefined {
  const count = config.counts.find((candidate) => candidate.key === countKey);
  if (!count) return undefined;
  const numbers = count.components.map((component) => values[`counts.${count.key}.components.${component}`]);
  if (numbers.some((value) => isBlank(value) || Number.isNaN(Number(value)))) return undefined;
  return numbers.reduce<number>((sum, value) => sum + Number(value), 0);
}

export function withCalculatedTotals(
  config: HousingLogConfig,
  values: Record<string, HousingLogValue>,
): Record<string, HousingLogValue> {
  const next = { ...values };
  for (const count of config.counts) {
    const total = calculateCountTotal(config, count.key, next);
    if (total !== undefined) next[`counts.${count.key}.total`] = total;
  }
  return next;
}

export function sortEventsChronologically(events: HousingLogEvent[]): HousingLogEvent[] {
  return [...events].sort((left, right) => {
    if (!left.time.trim() && !right.time.trim()) return 0;
    if (!left.time.trim()) return 1;
    if (!right.time.trim()) return -1;
    return left.time.localeCompare(right.time);
  });
}

export function validateHousingLog(input: HousingLogDraftInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let config: HousingLogConfig;
  try {
    config = getHousingLogConfig(input.housingUnit, input.shift);
  } catch {
    return [{ path: "selection", label: "Housing unit and shift", message: "Select a supported housing unit and shift." }];
  }

  if (!datePattern.test(input.logDate)) {
    issues.push({ path: "logDate", label: "Log date", message: "Enter the log date." });
  }
  if (input.templateVersion !== config.templateVersion) {
    issues.push({ path: "templateVersion", label: "Template version", message: "Reload the current official-form configuration." });
  }

  for (const definition of fieldsForConfig(config)) {
    const value = input.values[definition.key];
    if (definition.required && isBlank(value)) {
      issues.push({ path: `values.${definition.key}`, label: definition.label, message: `${definition.label} is required.` });
      continue;
    }
    if (isBlank(value)) continue;
    if (definition.inputType === "number" && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
      issues.push({ path: `values.${definition.key}`, label: definition.label, message: `${definition.label} must be a whole number of zero or more.` });
    }
    if (definition.inputType === "time" && !timePattern.test(String(value))) {
      issues.push({ path: `values.${definition.key}`, label: definition.label, message: `${definition.label} must be a valid time.` });
    }
    if (definition.inputType === "choice" && definition.options && !definition.options.includes(String(value))) {
      issues.push({ path: `values.${definition.key}`, label: definition.label, message: `Choose a valid value for ${definition.label}.` });
    }
  }

  input.events.forEach((event, index) => {
    const hasAny = Boolean(event.time.trim() || event.activity.trim() || event.initials.trim());
    if (!hasAny) return;
    const prefix = `events.${event.id}`;
    if (!event.time.trim()) issues.push({ path: `${prefix}.time`, label: `Event ${index + 1} time`, message: `Event ${index + 1} needs a time.` });
    else if (!timePattern.test(event.time)) issues.push({ path: `${prefix}.time`, label: `Event ${index + 1} time`, message: `Event ${index + 1} has an invalid time.` });
    if (!event.activity.trim()) issues.push({ path: `${prefix}.activity`, label: `Event ${index + 1} activity`, message: `Event ${index + 1} needs an event or activity.` });
    if (!event.initials.trim()) issues.push({ path: `${prefix}.initials`, label: `Event ${index + 1} initials`, message: `Event ${index + 1} needs initials.` });
  });

  for (const signature of config.signatures) {
    const value = input.signatures[signature.key];
    if (!value?.startsWith("data:image/png;base64,")) {
      issues.push({ path: `signatures.${signature.key}`, label: signature.label, message: `${signature.label} is required.` });
    }
  }
  return issues;
}

export function prepareHousingLog(input: HousingLogDraftInput): HousingLogDraftInput {
  const config = getHousingLogConfig(input.housingUnit, input.shift);
  return {
    ...input,
    values: withCalculatedTotals(config, input.values),
    events: sortEventsChronologically(input.events).filter((event) =>
      Boolean(event.time.trim() || event.activity.trim() || event.initials.trim()),
    ),
  };
}
