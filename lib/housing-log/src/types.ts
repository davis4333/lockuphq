import { z } from "zod";

export const housingUnits = ["A/H", "B", "C", "D", "E", "F", "G", "Infirmary"] as const;
export const housingShifts = ["1", "2", "3"] as const;

export type HousingUnit = (typeof housingUnits)[number];
export type HousingShift = (typeof housingShifts)[number];
export type HousingLogStatus = "draft" | "finalized";
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
};

export type RequiredActivityDefinition = {
  key: string;
  label: string;
  detailFields: FieldDefinition[];
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

export type HousingLogSignatures = Partial<Record<SignatureDefinition["key"], string>>;

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

export type ValidationIssue = {
  path: string;
  label: string;
  message: string;
};

const valueSchema = z.union([z.string().max(10_000), z.number().finite()]);

export const housingLogEventSchema = z.object({
  id: z.string().trim().min(1).max(100),
  time: z.string().max(20),
  activity: z.string().max(10_000),
  initials: z.string().max(20),
});

export const housingLogDraftInputSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.enum(housingShifts),
  housingUnit: z.enum(housingUnits),
  templateVersion: z.string().max(50),
  values: z.record(z.string(), valueSchema),
  events: z.array(housingLogEventSchema).max(500),
  signatures: z.object({
    housingSupervisor: z.string().max(1_000_000).optional(),
    housingOfficer: z.string().max(1_000_000).optional(),
  }),
});

export const housingLogUpdateSchema = housingLogDraftInputSchema.partial();
