import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import {
  housingLogCanonicalFingerprint,
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
  | { outcome: "validation_failed"; issues: ValidationIssue[] }
  /**
   * The same submissionId was already finalized, but with different
   * canonical content — this is NOT a safe idempotent replay (the officer
   * edited the form after a lost response). `existing` is the original
   * finalized record for the route layer's message; it is never overwritten
   * or replaced.
   */
  | { outcome: "submission_conflict"; existing: StoredHousingLog };

export type FinalizedHousingLogMetadata = Pick<
  StoredHousingLog,
  "id" | "logDate" | "shift" | "templateVersion" | "finalizedAt"
> & {
  /** May be a `LegacyHousingUnit` for rows finalized before the A/H split. */
  housingUnit: HousingUnit | LegacyHousingUnit;
  finalizedAt: string;
};

export type RemoveFinalizedHousingLogResult =
  | "removed"
  | "not_found"
  | "not_finalized"
  | "already_removed";

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
  /**
   * Admin-only soft delete for an accidentally finalized duplicate. The row
   * is never overwritten or hard-deleted — only marked removed — so it
   * stays available for direct-id lookup (`get`) and audit, but drops out
   * of `listFinalizedArchive` / `listFinalizedForShift` and therefore out
   * of missing/duplicate calculations, shift packages, and manual email.
   */
  removeFinalizedLog(id: string): Promise<RemoveFinalizedHousingLogResult>;
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

/**
 * A submissionId that already matches a finalized row is only a safe
 * idempotent replay if the incoming content is identical to what was
 * actually persisted — otherwise the officer changed the form after a lost
 * response, and returning "finalized" would make the client silently
 * discard those changes.
 */
function resolveAgainstExisting(
  existing: StoredHousingLog,
  incoming: HousingLogDraftInput,
): FinalizeSubmissionResult {
  const same =
    housingLogCanonicalFingerprint(existing) ===
    housingLogCanonicalFingerprint(incoming);
  return same
    ? { outcome: "finalized", record: existing }
    : { outcome: "submission_conflict", existing };
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
    const input = prepareHousingLog(rawInput);

    const existing = await this.findBySubmissionId(submissionId);
    if (existing) return resolveAgainstExisting(existing, input);

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
      // is the real guarantee against a duplicate finalized record. Whoever
      // won the race is resolved the same way a sequential retry would be.
      if (
        isUniqueConstraintViolation(
          error,
          HOUSING_LOG_SUBMISSION_ID_UNIQUE_INDEX,
        )
      ) {
        const winner = await this.findBySubmissionId(submissionId);
        if (winner) return resolveAgainstExisting(winner, input);
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

  async removeFinalizedLog(
    id: string,
  ): Promise<RemoveFinalizedHousingLogResult> {
    const [row] = await getHousingLogDatabase()
      .select({
        status: housingLogs.status,
        removedAt: housingLogs.removedAt,
      })
      .from(housingLogs)
      .where(eq(housingLogs.id, id))
      .limit(1);
    if (!row) return "not_found";
    if (row.status !== "finalized") return "not_finalized";
    if (row.removedAt) return "already_removed";
    await getHousingLogDatabase()
      .update(housingLogs)
      .set({ removedAt: new Date(), updatedAt: new Date() })
      .where(eq(housingLogs.id, id));
    return "removed";
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
      .where(
        and(eq(housingLogs.status, "finalized"), isNull(housingLogs.removedAt)),
      )
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
          isNull(housingLogs.removedAt),
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
