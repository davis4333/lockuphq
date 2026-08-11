import { randomUUID } from "node:crypto";
import { and, desc, eq, type SQL } from "drizzle-orm";
import {
  prepareHousingLog,
  type HousingLogDraftInput,
  type HousingLogStatus,
  type HousingShift,
  type HousingUnit,
  type StoredHousingLog,
} from "@workspace/housing-log";
import { getHousingLogDatabase } from "./db";
import { housingLogs } from "./schema";

export type HousingLogListFilters = {
  status?: HousingLogStatus;
  housingUnit?: HousingUnit;
  shift?: HousingShift;
  logDate?: string;
};

export interface HousingLogRepository {
  create(input: HousingLogDraftInput): Promise<StoredHousingLog>;
  get(id: string): Promise<StoredHousingLog | undefined>;
  list(filters: HousingLogListFilters): Promise<StoredHousingLog[]>;
  updateDraft(id: string, input: HousingLogDraftInput): Promise<StoredHousingLog | undefined>;
  finalizeDraft(id: string): Promise<StoredHousingLog | undefined>;
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

export class PostgresHousingLogRepository implements HousingLogRepository {
  async create(rawInput: HousingLogDraftInput): Promise<StoredHousingLog> {
    const input = prepareHousingLog(rawInput);
    const [row] = await getHousingLogDatabase().insert(housingLogs).values({
      id: randomUUID(),
      logDate: input.logDate,
      shift: input.shift,
      housingUnit: input.housingUnit,
      templateVersion: input.templateVersion,
      formValues: input.values,
      events: input.events,
      signatures: input.signatures,
    }).returning();
    if (!row) throw new Error("Housing Log draft was not created.");
    return toStored(row);
  }

  async get(id: string): Promise<StoredHousingLog | undefined> {
    const [row] = await getHousingLogDatabase().select().from(housingLogs).where(eq(housingLogs.id, id)).limit(1);
    return row ? toStored(row) : undefined;
  }

  async list(filters: HousingLogListFilters): Promise<StoredHousingLog[]> {
    const conditions: SQL[] = [];
    if (filters.status) conditions.push(eq(housingLogs.status, filters.status));
    if (filters.housingUnit) conditions.push(eq(housingLogs.housingUnit, filters.housingUnit));
    if (filters.shift) conditions.push(eq(housingLogs.shift, filters.shift));
    if (filters.logDate) conditions.push(eq(housingLogs.logDate, filters.logDate));
    const rows = await getHousingLogDatabase().select().from(housingLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(housingLogs.updatedAt))
      .limit(200);
    return rows.map(toStored);
  }

  async updateDraft(id: string, rawInput: HousingLogDraftInput): Promise<StoredHousingLog | undefined> {
    const input = prepareHousingLog(rawInput);
    const [row] = await getHousingLogDatabase().update(housingLogs).set({
      logDate: input.logDate,
      shift: input.shift,
      housingUnit: input.housingUnit,
      templateVersion: input.templateVersion,
      formValues: input.values,
      events: input.events,
      signatures: input.signatures,
      updatedAt: new Date(),
    }).where(and(eq(housingLogs.id, id), eq(housingLogs.status, "draft"))).returning();
    return row ? toStored(row) : undefined;
  }

  async finalizeDraft(id: string): Promise<StoredHousingLog | undefined> {
    const now = new Date();
    const [row] = await getHousingLogDatabase().update(housingLogs).set({
      status: "finalized",
      finalizedAt: now,
      updatedAt: now,
    }).where(and(eq(housingLogs.id, id), eq(housingLogs.status, "draft"))).returning();
    return row ? toStored(row) : undefined;
  }
}

let repository: HousingLogRepository | undefined;

export function getHousingLogRepository(): HousingLogRepository {
  repository ??= new PostgresHousingLogRepository();
  return repository;
}
