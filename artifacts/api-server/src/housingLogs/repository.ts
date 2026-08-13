import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  prepareHousingLog,
  type HousingLogDraftInput,
  type HousingLogListFilters,
  type HousingLogSignatures,
  type HousingLogStatus,
  type HousingLogSummary,
  type HousingShift,
  type HousingUnit,
  type StoredHousingLog,
  type ValidationIssue,
} from "@workspace/housing-log";
import { getHousingLogDatabase } from "./db";
import { housingLogs } from "./schema";
import { validateHousingLogForFinalization } from "./signatureValidation";

export type FinalizeHousingLogResult =
  | { outcome: "finalized"; record: StoredHousingLog }
  | { outcome: "validation_failed"; issues: ValidationIssue[] }
  | { outcome: "not_found" }
  | { outcome: "not_editable" };

export type FinalizedHousingLogMetadata = Pick<
  StoredHousingLog,
  "id" | "logDate" | "shift" | "housingUnit" | "templateVersion" | "finalizedAt"
> & { finalizedAt: string };

export type DraftAccessCodeLookup = { id: string; status: HousingLogStatus };

export interface HousingLogRepository {
  /**
   * accessCodeHash is required: every new draft must be protected at
   * creation time (see `draftAccess.ts`). Never stores the plaintext code.
   */
  create(
    input: HousingLogDraftInput,
    accessCodeHash: string,
  ): Promise<StoredHousingLog>;
  get(id: string): Promise<StoredHousingLog | undefined>;
  /**
   * Locates the draft matching a hashed access code, across all statuses, so
   * the route layer can give an actionable message for an already-finalized
   * log rather than a bare "not found". Never matches a NULL access-code
   * hash — legacy pre-migration drafts have no code that can ever match.
   */
  findDraftByAccessCodeHash(
    hash: string,
  ): Promise<DraftAccessCodeLookup | undefined>;
  list(filters: HousingLogListFilters): Promise<HousingLogSummary[]>;
  listFinalizedArchive(): Promise<FinalizedHousingLogMetadata[]>;
  listFinalizedForShift(
    logDate: string,
    shift: HousingShift,
  ): Promise<StoredHousingLog[]>;
  updateDraft(
    id: string,
    input: HousingLogDraftInput,
    signaturePatch?: HousingLogSignatures,
  ): Promise<StoredHousingLog | undefined>;
  finalizeDraft(id: string): Promise<FinalizeHousingLogResult>;
}

type HousingLogRow = typeof housingLogs.$inferSelect;

function toStored(row: HousingLogRow): StoredHousingLog {
  return {
    id: row.id,
    logDate: row.logDate,
    shift: row.shift as HousingShift,
    housingUnit: row.housingUnit as HousingUnit,
    templateVersion: row.templateVersion,
    values: row.formValues,
    events: row.events,
    signatures: row.signatures,
    status: row.status as HousingLogStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  };
}

function toDraft(record: StoredHousingLog): HousingLogDraftInput {
  return {
    logDate: record.logDate,
    shift: record.shift,
    housingUnit: record.housingUnit,
    templateVersion: record.templateVersion,
    values: record.values,
    events: record.events,
    signatures: record.signatures,
  };
}

export class PostgresHousingLogRepository implements HousingLogRepository {
  async create(
    rawInput: HousingLogDraftInput,
    accessCodeHash: string,
  ): Promise<StoredHousingLog> {
    const input = prepareHousingLog(rawInput);
    const [row] = await getHousingLogDatabase()
      .insert(housingLogs)
      .values({
        id: randomUUID(),
        logDate: input.logDate,
        shift: input.shift,
        housingUnit: input.housingUnit,
        templateVersion: input.templateVersion,
        formValues: input.values,
        events: input.events,
        signatures: input.signatures,
        accessCodeHash,
      })
      .returning();
    if (!row) throw new Error("Housing Log draft was not created.");
    return toStored(row);
  }

  async get(id: string): Promise<StoredHousingLog | undefined> {
    const [row] = await getHousingLogDatabase()
      .select()
      .from(housingLogs)
      .where(eq(housingLogs.id, id))
      .limit(1);
    return row ? toStored(row) : undefined;
  }

  async findDraftByAccessCodeHash(
    hash: string,
  ): Promise<DraftAccessCodeLookup | undefined> {
    const [row] = await getHousingLogDatabase()
      .select({ id: housingLogs.id, status: housingLogs.status })
      .from(housingLogs)
      .where(eq(housingLogs.accessCodeHash, hash))
      .limit(1);
    return row ? { id: row.id, status: row.status as HousingLogStatus } : undefined;
  }

  async list(filters: HousingLogListFilters): Promise<HousingLogSummary[]> {
    const conditions: SQL[] = [];
    if (filters.status) conditions.push(eq(housingLogs.status, filters.status));
    if (filters.housingUnit)
      conditions.push(eq(housingLogs.housingUnit, filters.housingUnit));
    if (filters.shift) conditions.push(eq(housingLogs.shift, filters.shift));
    if (filters.logDate)
      conditions.push(eq(housingLogs.logDate, filters.logDate));
    const rows = await getHousingLogDatabase()
      .select({
        id: housingLogs.id,
        logDate: housingLogs.logDate,
        shift: housingLogs.shift,
        housingUnit: housingLogs.housingUnit,
        templateVersion: housingLogs.templateVersion,
        status: housingLogs.status,
        createdAt: housingLogs.createdAt,
        updatedAt: housingLogs.updatedAt,
        finalizedAt: housingLogs.finalizedAt,
      })
      .from(housingLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(housingLogs.updatedAt))
      .limit(200);
    return rows.map((row) => ({
      id: row.id,
      logDate: row.logDate,
      shift: row.shift as HousingShift,
      housingUnit: row.housingUnit as HousingUnit,
      templateVersion: row.templateVersion,
      status: row.status as HousingLogStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
    }));
  }

  async listFinalizedArchive(): Promise<FinalizedHousingLogMetadata[]> {
    const rows = await getHousingLogDatabase()
      .select({
        id: housingLogs.id,
        logDate: housingLogs.logDate,
        shift: housingLogs.shift,
        housingUnit: housingLogs.housingUnit,
        templateVersion: housingLogs.templateVersion,
        finalizedAt: housingLogs.finalizedAt,
      })
      .from(housingLogs)
      .where(eq(housingLogs.status, "finalized"))
      .orderBy(
        desc(housingLogs.logDate),
        desc(housingLogs.shift),
        desc(housingLogs.housingUnit),
        desc(housingLogs.finalizedAt),
      );
    return rows.map((row) => {
      if (!row.finalizedAt)
        throw new Error("Finalized Housing Log is missing finalized_at.");
      return {
        id: row.id,
        logDate: row.logDate,
        shift: row.shift as HousingShift,
        housingUnit: row.housingUnit as HousingUnit,
        templateVersion: row.templateVersion,
        finalizedAt: row.finalizedAt.toISOString(),
      };
    });
  }

  async listFinalizedForShift(
    logDate: string,
    shift: HousingShift,
  ): Promise<StoredHousingLog[]> {
    const rows = await getHousingLogDatabase()
      .select()
      .from(housingLogs)
      .where(
        and(
          eq(housingLogs.status, "finalized"),
          eq(housingLogs.logDate, logDate),
          eq(housingLogs.shift, shift),
        ),
      )
      .orderBy(
        asc(housingLogs.housingUnit),
        asc(housingLogs.finalizedAt),
        asc(housingLogs.id),
      );
    return rows.map(toStored);
  }

  async updateDraft(
    id: string,
    rawInput: HousingLogDraftInput,
    signaturePatch?: HousingLogSignatures,
  ): Promise<StoredHousingLog | undefined> {
    const input = prepareHousingLog(rawInput);
    const [row] = await getHousingLogDatabase()
      .update(housingLogs)
      .set({
        logDate: input.logDate,
        shift: input.shift,
        housingUnit: input.housingUnit,
        templateVersion: input.templateVersion,
        formValues: input.values,
        events: input.events,
        signatures: signaturePatch
          ? sql`${housingLogs.signatures} || ${JSON.stringify(signaturePatch)}::jsonb`
          : input.signatures,
        updatedAt: new Date(),
      })
      .where(and(eq(housingLogs.id, id), eq(housingLogs.status, "draft")))
      .returning();
    return row ? toStored(row) : undefined;
  }

  async finalizeDraft(id: string): Promise<FinalizeHousingLogResult> {
    return getHousingLogDatabase().transaction(async (transaction) => {
      const [lockedRow] = await transaction
        .select()
        .from(housingLogs)
        .where(eq(housingLogs.id, id))
        .limit(1)
        .for("update");
      if (!lockedRow) return { outcome: "not_found" } as const;
      if (lockedRow.status !== "draft")
        return { outcome: "not_editable" } as const;

      const existing = toStored(lockedRow);
      const issues = validateHousingLogForFinalization(toDraft(existing));
      if (issues.length)
        return { outcome: "validation_failed", issues } as const;

      const now = new Date();
      const [row] = await transaction
        .update(housingLogs)
        .set({
          status: "finalized",
          finalizedAt: now,
          updatedAt: now,
        })
        .where(and(eq(housingLogs.id, id), eq(housingLogs.status, "draft")))
        .returning();
      if (!row) return { outcome: "not_editable" } as const;
      return { outcome: "finalized", record: toStored(row) } as const;
    });
  }
}

let repository: HousingLogRepository | undefined;

export function getHousingLogRepository(): HousingLogRepository {
  repository ??= new PostgresHousingLogRepository();
  return repository;
}
