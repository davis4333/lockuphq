import { z } from "zod";

export const housingUnits = [
  "A/H",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "Infirmary",
] as const;
export const housingShifts = ["1", "2", "3"] as const;
export const housingLogStatuses = ["draft", "finalized"] as const;

export type HousingUnit = (typeof housingUnits)[number];
export type HousingShift = (typeof housingShifts)[number];
export type HousingLogStatus = (typeof housingLogStatuses)[number];
export type HousingLogValue = string | number;

export type FieldDefinition = {
  key: string;
  label: string;
  inputType: "text" | "textarea" | "number" | "time" | "choice";
  required: boolean;
  options?: readonly string[];
  help?: string;
};

export type FormSection = {
  key: string;
  title: string;
  description?: string;
  fields: FieldDefinition[];
};

export type CountDefinition = {
  key: string;
  label: string;
  components: string[];
  isBeginning?: boolean;
  requiresConductedBy: boolean;
  conductedByLabel?: string;
  officialAttestation?: string;
};

export type RequiredActivityDefinition = {
  key: string;
  label: string;
  detailFields: FieldDefinition[];
  sourceNote?: string;
};

export type SignatureDefinition = {
  key: "housingSupervisor" | "housingOfficer";
  label: string;
};

export type HousingLogConfig = {
  key: string;
  sourceSheet: string;
  templateVersion: "2026-04-27";
  housingUnit: HousingUnit;
  shift: HousingShift;
  shiftLabel: string;
  sections: FormSection[];
  counts: CountDefinition[];
  activities: RequiredActivityDefinition[];
  securityCheckCount: number;
  securityCheckLabel: string;
  signatures: SignatureDefinition[];
};

export type HousingLogEvent = {
  id: string;
  time: string;
  activity: string;
  initials: string;
};

export type HousingLogSignatures = Partial<
  Record<SignatureDefinition["key"], string>
>;

export type HousingLogDraftInput = {
  logDate: string;
  shift: HousingShift;
  housingUnit: HousingUnit;
  templateVersion: string;
  values: Record<string, HousingLogValue>;
  events: HousingLogEvent[];
  signatures: HousingLogSignatures;
};

export type StoredHousingLog = HousingLogDraftInput & {
  id: string;
  status: HousingLogStatus;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};

export type HousingLogSummary = Pick<
  StoredHousingLog,
  | "id"
  | "logDate"
  | "shift"
  | "housingUnit"
  | "templateVersion"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "finalizedAt"
>;

export type HousingLogListFilters = {
  status?: HousingLogStatus;
  housingUnit?: HousingUnit;
  shift?: HousingShift;
  logDate?: string;
};

export type ValidationIssue = {
  path: string;
  label: string;
  message: string;
};

export function isValidHousingLogDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getEasternCalendarDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

const housingLogDateSchema = z
  .string()
  .refine(
    isValidHousingLogDate,
    "Enter a real calendar date in YYYY-MM-DD format.",
  );
const valueSchema = z.union([z.string().max(10_000), z.number().finite()]);

export const housingLogEventSchema = z.object({
  id: z.string().trim().min(1).max(100),
  time: z.string().max(20),
  activity: z.string().max(10_000),
  initials: z.string().max(20),
});

const housingLogEventsSchema = z
  .array(housingLogEventSchema)
  .max(500)
  .superRefine((events, context) => {
    const seen = new Set<string>();
    events.forEach((event, index) => {
      if (seen.has(event.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: "Event IDs must be unique.",
        });
      }
      seen.add(event.id);
    });
  });

export const housingLogDraftInputSchema = z.object({
  logDate: housingLogDateSchema,
  shift: z.enum(housingShifts),
  housingUnit: z.enum(housingUnits),
  templateVersion: z.string().max(50),
  values: z.record(z.string(), valueSchema),
  events: housingLogEventsSchema,
  signatures: z.object({
    housingSupervisor: z.string().max(1_000_000).optional(),
    housingOfficer: z.string().max(1_000_000).optional(),
  }),
});

export const housingLogUpdateSchema = housingLogDraftInputSchema.partial();

export const housingLogListFiltersSchema = z
  .object({
    status: z.enum(housingLogStatuses).optional(),
    housingUnit: z.enum(housingUnits).optional(),
    shift: z.enum(housingShifts).optional(),
    logDate: housingLogDateSchema.optional(),
  })
  .strict();
