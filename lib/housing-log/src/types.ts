import { z } from "zod";

export const housingUnits = [
  "A",
  "H",
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

/**
 * Officer-facing display names for each physical housing unit. A Dorm and H
 * Dorm are separate physical units that both use the shared AH official
 * template family; the label map is purely presentational and never affects
 * how a unit resolves to its Excel template (see `configs.ts`'s `familyFor`).
 */
export const housingUnitLabels: Record<HousingUnit, string> = {
  A: "A Dorm",
  H: "H Dorm",
  B: "B Dorm",
  C: "C Dorm",
  D: "D Dorm",
  E: "E Dorm",
  F: "F Dorm",
  G: "G Dorm",
  Infirmary: "Infirmary",
};

export type FieldDefinition = {
  key: string;
  label: string;
  inputType: "text" | "textarea" | "number" | "time" | "choice";
  required: boolean;
  options?: readonly string[];
  help?: string;
  /**
   * Accepts the literal value "N/A" even when the input type would otherwise
   * reject it (e.g. time fields). Used for staff-slot fields so an
   * intentionally absent staff position can be marked N/A on the official log.
   */
  allowNa?: boolean;
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

/**
 * The pre-split combined physical-unit value used before A Dorm and H Dorm
 * were separated into independent physical units sharing the AH template
 * family (see `configs.ts`'s `familyFor`). No longer selectable by officers
 * and never produced by new writes — retained only so pre-existing
 * finalized rows can still be displayed/exported safely by admin instead of
 * crashing archive/package code that only knows the current unit list.
 * Never automatically migrated to "A" or "H" — that identity is genuinely
 * ambiguous and must not be guessed.
 */
export const legacyHousingUnits = ["A/H"] as const;
export type LegacyHousingUnit = (typeof legacyHousingUnits)[number];

export const legacyHousingUnitLabels: Record<LegacyHousingUnit, string> = {
  "A/H": "Legacy A/H",
};

export function isKnownHousingUnit(value: string): value is HousingUnit {
  return (housingUnits as readonly string[]).includes(value);
}

export function isLegacyHousingUnit(
  value: string,
): value is LegacyHousingUnit {
  return (legacyHousingUnits as readonly string[]).includes(value);
}

export type HousingLogArchiveRecord = Pick<
  StoredHousingLog,
  "id" | "logDate" | "shift" | "templateVersion" | "finalizedAt"
> & {
  /**
   * Usually a canonical `HousingUnit`. May be a `LegacyHousingUnit` for rows
   * finalized before the A/H split — see `isLegacyHousingUnit`.
   */
  housingUnit: HousingUnit | LegacyHousingUnit;
  sourceSheet: string;
  finalizedAt: string;
};

export type HousingLogArchiveResponse = {
  records: HousingLogArchiveRecord[];
  expectedHousingUnits: HousingUnit[];
};

export type HousingLogAdditionalRecipient = {
  id: string;
  email: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HousingLogDeliverySettings = {
  primaryEmail: string | null;
  additionalRecipients: HousingLogAdditionalRecipient[];
  deliveryRecipients: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type HousingLogPackageCompleteness = "COMPLETE" | "INCOMPLETE";

export type HousingLogManualEmailResult = {
  attemptId: string;
  logDate: string;
  shift: HousingShift;
  packageStatus: HousingLogPackageCompleteness;
  recipientCount: number;
  includedLogCount: number;
  missingHousingUnits: HousingUnit[];
  duplicateHousingUnits: HousingUnit[];
  sentAt: string;
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

/**
 * A client-generated idempotency key, one per local unfinished Housing Log.
 * The server uses it to guarantee that a retried finalize submission (after
 * a network failure, timeout, or duplicate click) can never create a second
 * finalized record — see api-server `repository.ts`'s `finalizeSubmission`.
 */
export const housingLogSubmissionIdSchema = z.string().trim().min(8).max(100);

export const housingLogFinalizeInputSchema = housingLogDraftInputSchema.extend(
  { submissionId: housingLogSubmissionIdSchema },
);

export type HousingLogFinalizeInput = HousingLogDraftInput & {
  submissionId: string;
};

/** Minimal confirmation returned after a successful finalize — the officer
 * page has no further use for the record's contents, so nothing beyond an
 * id and timestamp is echoed back. */
export type HousingLogFinalizeConfirmation = {
  id: string;
  finalizedAt: string;
};
