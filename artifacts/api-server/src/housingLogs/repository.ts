import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  prepareHousingLog,
  type HousingLogDraftInput,
  type HousingShift,
  type HousingUnit,
  type LegacyHousingUnit,
  type StoredHousingLog,
  type ValidationIssue,
} from "@workspace/housing-log";
import { getHousingLogDatabase } from "./db";
import { housingLogs } from "./schema";
import { HOUSING_LOG_SUBMISSION_ID_UNIQUE_INDEX } from "./schemaMigrations";
import { validateHousingLogForFinalization } from "./signatureValidation";

export type FinalizeSubmissionResult =
  | { outcome: "finalized"; record: StoredHousingLog }
  | { outcome: "validation_failed"; issues: ValidationIssue[] };

export type FinalizedHousingLogMetadata = Pick<
  StoredHousingLog,
  "id" | "logDate" | "shift" | "templateVersion" | "finalizedAt"
> & {
  /** May be a `LegacyHousingUnit` for rows finalized before the A/H split. */
  housingUnit: HousingUnit | LegacyHousingUnit;
  finalizedAt: string;
};

export interface HousingLogRepository {
  /** Admin-only lookup (individual archive Excel download). */
  get(id: string): Promise<StoredHousingLog | undefined>;
  listFinalizedArchive(): Promise<FinalizedHousingLogMetadata[]>;
  listFinalizedForShift(
    logDate: string,
    shift: HousingShift,
  ): Promise<StoredHousingLog[]>;
  /**
   * The only officer-facing write path: validates and, on success, persists
   * a new finalized record in one atomic step — there is no server-side
   * draft concept for officers to create, browse, or resume. `submissionId`
   * is a client-generated idempotency key; a retried call with the same id
   * returns the original result instead of creating a duplicate record, even
   * under concurrent retries (enforced by a database unique constraint, not
   * merely an application-level check).
   */
  finalizeSubmission(
    input: HousingLogDraftInput,
    submissionId: string,
  ): Promise<FinalizeSubmissionResult>;
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
    status: row.status as StoredHousingLog["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
  };
}

/** True when a `pg` error is the unique-constraint violation for `constraintName`. */
function isUniqueConstraintViolation(
  error: unknown,
  constraintName: string,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505" &&
    "constraint" in error &&
    (error as { constraint?: unknown }).constraint === constraintName
  );
}

export class PostgresHousingLogRepository implements HousingLogRepository {
  async get(id: string): Promise<StoredHousingLog | undefined> {
    const [row] = await getHousingLogDatabase()
      .select()
      .from(housingLogs)
      .where(eq(housingLogs.id, id))
      .limit(1);
    return row ? toStored(row) : undefined;
  }

  async finalizeSubmission(
    rawInput: HousingLogDraftInput,
    submissionId: string,
  ): Promise<FinalizeSubmissionResult> {
    const existing = await this.findBySubmissionId(submissionId);
    if (existing) return { outcome: "finalized", record: existing };

    const input = prepareHousingLog(rawInput);
    const issues = validateHousingLogForFinalization(input);
    if (issues.length) return { outcome: "validation_failed", issues };

    const now = new Date();
    try {
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
          status: "finalized",
          finalizedAt: now,
          updatedAt: now,
          submissionId,
        })
        .returning();
      if (!row) throw new Error("Housing Log was not created.");
      return { outcome: "finalized", record: toStored(row) };
    } catch (error) {
      // A genuine concurrent retry (two in-flight requests for the same
      // submissionId) can lose the pre-check race above; the unique index
      // is the real guarantee against a duplicate finalized record.
      if (
        isUniqueConstraintViolation(
          error,
          HOUSING_LOG_SUBMISSION_ID_UNIQUE_INDEX,
        )
      ) {
        const winner = await this.findBySubmissionId(submissionId);
        if (winner) return { outcome: "finalized", record: winner };
      }
      throw error;
    }
  }

  private async findBySubmissionId(
    submissionId: string,
  ): Promise<StoredHousingLog | undefined> {
    const [row] = await getHousingLogDatabase()
      .select()
      .from(housingLogs)
      .where(eq(housingLogs.submissionId, submissionId))
      .limit(1);
    return row ? toStored(row) : undefined;
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
        // May be a legacy value (e.g. "A/H") outside the current HousingUnit
        // union for rows finalized before the A/H split — never force-cast
        // here; callers must check `isKnownHousingUnit`/`isLegacyHousingUnit`.
        housingUnit: row.housingUnit as HousingUnit | LegacyHousingUnit,
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
}

let repository: HousingLogRepository | undefined;

export function getHousingLogRepository(): HousingLogRepository {
  repository ??= new PostgresHousingLogRepository();
  return repository;
}
