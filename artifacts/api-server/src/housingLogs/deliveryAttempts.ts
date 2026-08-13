import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  HousingLogPackageCompleteness,
  HousingShift,
} from "@workspace/housing-log";
import { getHousingLogDatabase } from "./db";
import { housingLogDeliveryAttempts } from "./schema";

export type HousingLogDeliveryAttemptStatus = "sending" | "sent" | "failed";

export type HousingLogDeliveryAttempt = {
  id: string;
  logDate: string;
  shift: HousingShift;
  triggerType: "manual";
  startedAt: Date;
  completedAt: Date | null;
  packageCompleteness: HousingLogPackageCompleteness;
  packageSha256: string;
  recipients: string[];
  providerMessageId: string | null;
  status: HousingLogDeliveryAttemptStatus;
  failureCategory: string | null;
  failureMessage: string | null;
  initiatedBy: "admin";
};

export type StartHousingLogDeliveryAttempt = Pick<
  HousingLogDeliveryAttempt,
  "logDate" | "shift" | "packageCompleteness" | "packageSha256" | "recipients"
> & { startedAt: Date };

export interface HousingLogDeliveryAttemptRepository {
  start(
    input: StartHousingLogDeliveryAttempt,
  ): Promise<HousingLogDeliveryAttempt>;
  markSent(id: string, messageId: string, completedAt: Date): Promise<void>;
  markFailed(
    id: string,
    category: string,
    message: string,
    completedAt: Date,
  ): Promise<void>;
}

export class HousingLogDeliveryAttemptTransitionError extends Error {
  constructor() {
    super("Housing Log delivery attempt is no longer in the sending state.");
    this.name = "HousingLogDeliveryAttemptTransitionError";
  }
}

export class PostgresHousingLogDeliveryAttemptRepository implements HousingLogDeliveryAttemptRepository {
  async start(
    input: StartHousingLogDeliveryAttempt,
  ): Promise<HousingLogDeliveryAttempt> {
    const [created] = await getHousingLogDatabase()
      .insert(housingLogDeliveryAttempts)
      .values({
        id: randomUUID(),
        logDate: input.logDate,
        shift: input.shift,
        triggerType: "manual",
        startedAt: input.startedAt,
        completedAt: null,
        packageCompleteness: input.packageCompleteness,
        packageSha256: input.packageSha256,
        recipients: [...input.recipients],
        providerMessageId: null,
        status: "sending",
        failureCategory: null,
        failureMessage: null,
        initiatedBy: "admin",
      })
      .returning();
    if (!created) throw new Error("Delivery attempt was not created.");
    return {
      ...created,
      shift: created.shift as HousingShift,
      triggerType: "manual",
      packageCompleteness:
        created.packageCompleteness as HousingLogPackageCompleteness,
      recipients: [...created.recipients],
      status: "sending",
      initiatedBy: "admin",
    };
  }

  async markSent(
    id: string,
    messageId: string,
    completedAt: Date,
  ): Promise<void> {
    const updated = await getHousingLogDatabase()
      .update(housingLogDeliveryAttempts)
      .set({
        status: "sent",
        completedAt,
        providerMessageId: messageId,
        failureCategory: null,
        failureMessage: null,
      })
      .where(
        and(
          eq(housingLogDeliveryAttempts.id, id),
          eq(housingLogDeliveryAttempts.status, "sending"),
        ),
      )
      .returning({ id: housingLogDeliveryAttempts.id });
    if (!updated.length) throw new HousingLogDeliveryAttemptTransitionError();
  }

  async markFailed(
    id: string,
    category: string,
    message: string,
    completedAt: Date,
  ): Promise<void> {
    const updated = await getHousingLogDatabase()
      .update(housingLogDeliveryAttempts)
      .set({
        status: "failed",
        completedAt,
        providerMessageId: null,
        failureCategory: category,
        failureMessage: message,
      })
      .where(
        and(
          eq(housingLogDeliveryAttempts.id, id),
          eq(housingLogDeliveryAttempts.status, "sending"),
        ),
      )
      .returning({ id: housingLogDeliveryAttempts.id });
    if (!updated.length) throw new HousingLogDeliveryAttemptTransitionError();
  }
}

let repository: HousingLogDeliveryAttemptRepository | undefined;

export function getHousingLogDeliveryAttemptRepository(): HousingLogDeliveryAttemptRepository {
  repository ??= new PostgresHousingLogDeliveryAttemptRepository();
  return repository;
}
