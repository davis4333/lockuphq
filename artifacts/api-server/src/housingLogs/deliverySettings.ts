import { randomUUID } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type {
  HousingLogAdditionalRecipient,
  HousingLogDeliverySettings,
} from "@workspace/housing-log";
import { getHousingLogDatabase } from "./db";
import {
  housingLogDeliveryRecipients,
  housingLogDeliverySettings,
} from "./schema";

const DELIVERY_SETTINGS_ID = "default";
const BUSINESS_EMAIL_PATTERN =
  /^(?!.*\.\.)[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;

type HousingLogDeliverySettingsState = Omit<
  HousingLogDeliverySettings,
  "deliveryRecipients"
>;

export type HousingLogAdditionalRecipientPatch = {
  email?: string;
  active?: boolean;
};

export interface HousingLogDeliverySettingsRepository {
  read(): Promise<HousingLogDeliverySettingsState>;
  setPrimary(email: string): Promise<void>;
  addAdditional(email: string): Promise<void>;
  updateAdditional(
    id: string,
    patch: HousingLogAdditionalRecipientPatch,
  ): Promise<void>;
  removeAdditional(id: string): Promise<boolean>;
}

export class InvalidHousingLogRecipientEmailError extends Error {
  constructor() {
    super("Enter a valid recipient email address.");
    this.name = "InvalidHousingLogRecipientEmailError";
  }
}

export class InvalidHousingLogDeliverySettingsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHousingLogDeliverySettingsInputError";
  }
}

export class DuplicateHousingLogRecipientError extends Error {
  constructor(
    message = "That email address is already configured as a recipient.",
  ) {
    super(message);
    this.name = "DuplicateHousingLogRecipientError";
  }
}

export class HousingLogPrimaryRecipientRequiredError extends Error {
  constructor() {
    super("Configure the primary recipient before adding recipients.");
    this.name = "HousingLogPrimaryRecipientRequiredError";
  }
}

export class HousingLogAdditionalRecipientNotFoundError extends Error {
  constructor() {
    super("Additional recipient not found.");
    this.name = "HousingLogAdditionalRecipientNotFoundError";
  }
}

export function normalizeHousingLogRecipientEmail(value: unknown): string {
  if (typeof value !== "string")
    throw new InvalidHousingLogRecipientEmailError();
  const email = value.trim();
  const [localPart = "", domain = ""] = email.split("@");
  if (
    email.length > 254 ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    domain.length > 253 ||
    !BUSINESS_EMAIL_PATTERN.test(email)
  )
    throw new InvalidHousingLogRecipientEmailError();
  return email;
}

function toAdditionalRecipient(row: {
  id: string;
  email: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): HousingLogAdditionalRecipient {
  return {
    id: row.id,
    email: row.email,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sameEmail = (left: string, right: string) =>
  left.toLowerCase() === right.toLowerCase();

export class PostgresHousingLogDeliverySettingsRepository implements HousingLogDeliverySettingsRepository {
  async read(): Promise<HousingLogDeliverySettingsState> {
    return getHousingLogDatabase().transaction(async (transaction) => {
      const [settings] = await transaction
        .select()
        .from(housingLogDeliverySettings)
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID))
        .limit(1);
      if (!settings)
        return {
          primaryEmail: null,
          additionalRecipients: [],
          createdAt: null,
          updatedAt: null,
        };
      const additional = await transaction
        .select()
        .from(housingLogDeliveryRecipients)
        .where(
          eq(housingLogDeliveryRecipients.settingsId, DELIVERY_SETTINGS_ID),
        )
        .orderBy(
          asc(housingLogDeliveryRecipients.createdAt),
          asc(housingLogDeliveryRecipients.id),
        );
      return {
        primaryEmail: settings.primaryEmail,
        additionalRecipients: additional.map(toAdditionalRecipient),
        createdAt: settings.createdAt.toISOString(),
        updatedAt: settings.updatedAt.toISOString(),
      };
    });
  }

  async setPrimary(email: string): Promise<void> {
    await getHousingLogDatabase().transaction(async (transaction) => {
      await transaction
        .insert(housingLogDeliverySettings)
        .values({ id: DELIVERY_SETTINGS_ID, primaryEmail: email })
        .onConflictDoNothing();
      await transaction
        .select({ id: housingLogDeliverySettings.id })
        .from(housingLogDeliverySettings)
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID))
        .for("update");
      const [duplicate] = await transaction
        .select({ id: housingLogDeliveryRecipients.id })
        .from(housingLogDeliveryRecipients)
        .where(
          sql`lower(${housingLogDeliveryRecipients.email}) = ${email.toLowerCase()}`,
        )
        .limit(1);
      if (duplicate)
        throw new DuplicateHousingLogRecipientError(
          "That address is already an Additional Recipient. Remove it there before making it the Primary Recipient.",
        );
      await transaction
        .update(housingLogDeliverySettings)
        .set({ primaryEmail: email, updatedAt: new Date() })
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID));
    });
  }

  async addAdditional(email: string): Promise<void> {
    await getHousingLogDatabase().transaction(async (transaction) => {
      const [settings] = await transaction
        .select()
        .from(housingLogDeliverySettings)
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID))
        .for("update");
      if (!settings?.primaryEmail)
        throw new HousingLogPrimaryRecipientRequiredError();
      if (sameEmail(settings.primaryEmail, email))
        throw new DuplicateHousingLogRecipientError();
      const [duplicate] = await transaction
        .select({ id: housingLogDeliveryRecipients.id })
        .from(housingLogDeliveryRecipients)
        .where(
          sql`lower(${housingLogDeliveryRecipients.email}) = ${email.toLowerCase()}`,
        )
        .limit(1);
      if (duplicate) throw new DuplicateHousingLogRecipientError();
      const now = new Date();
      await transaction.insert(housingLogDeliveryRecipients).values({
        id: randomUUID(),
        settingsId: DELIVERY_SETTINGS_ID,
        email,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await transaction
        .update(housingLogDeliverySettings)
        .set({ updatedAt: now })
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID));
    });
  }

  async updateAdditional(
    id: string,
    patch: HousingLogAdditionalRecipientPatch,
  ): Promise<void> {
    await getHousingLogDatabase().transaction(async (transaction) => {
      const [settings] = await transaction
        .select()
        .from(housingLogDeliverySettings)
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID))
        .for("update");
      const [existing] = await transaction
        .select()
        .from(housingLogDeliveryRecipients)
        .where(eq(housingLogDeliveryRecipients.id, id))
        .limit(1);
      if (!existing) throw new HousingLogAdditionalRecipientNotFoundError();
      const email = patch.email ?? existing.email;
      if (settings?.primaryEmail && sameEmail(settings.primaryEmail, email))
        throw new DuplicateHousingLogRecipientError();
      const [duplicate] = await transaction
        .select({ id: housingLogDeliveryRecipients.id })
        .from(housingLogDeliveryRecipients)
        .where(
          and(
            sql`lower(${housingLogDeliveryRecipients.email}) = ${email.toLowerCase()}`,
            ne(housingLogDeliveryRecipients.id, id),
          ),
        )
        .limit(1);
      if (duplicate) throw new DuplicateHousingLogRecipientError();
      const now = new Date();
      await transaction
        .update(housingLogDeliveryRecipients)
        .set({
          email,
          active: patch.active ?? existing.active,
          updatedAt: now,
        })
        .where(eq(housingLogDeliveryRecipients.id, id));
      await transaction
        .update(housingLogDeliverySettings)
        .set({ updatedAt: now })
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID));
    });
  }

  async removeAdditional(id: string): Promise<boolean> {
    return getHousingLogDatabase().transaction(async (transaction) => {
      const [settings] = await transaction
        .select({ id: housingLogDeliverySettings.id })
        .from(housingLogDeliverySettings)
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID))
        .for("update");
      if (!settings) return false;
      const removed = await transaction
        .delete(housingLogDeliveryRecipients)
        .where(eq(housingLogDeliveryRecipients.id, id))
        .returning({ id: housingLogDeliveryRecipients.id });
      if (!removed.length) return false;
      await transaction
        .update(housingLogDeliverySettings)
        .set({ updatedAt: new Date() })
        .where(eq(housingLogDeliverySettings.id, DELIVERY_SETTINGS_ID));
      return true;
    });
  }
}

let repository: HousingLogDeliverySettingsRepository | undefined;

export function getHousingLogDeliverySettingsRepository(): HousingLogDeliverySettingsRepository {
  repository ??= new PostgresHousingLogDeliverySettingsRepository();
  return repository;
}

function withDeliveryRecipients(
  settings: HousingLogDeliverySettingsState,
): HousingLogDeliverySettings {
  const candidates = [
    ...(settings.primaryEmail ? [settings.primaryEmail] : []),
    ...settings.additionalRecipients
      .filter((recipient) => recipient.active)
      .map((recipient) => recipient.email),
  ];
  const seen = new Set<string>();
  const deliveryRecipients = candidates.filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...settings, deliveryRecipients };
}

export async function getHousingLogDeliverySettings(
  recipientRepository = getHousingLogDeliverySettingsRepository(),
): Promise<HousingLogDeliverySettings> {
  return withDeliveryRecipients(await recipientRepository.read());
}

export async function setHousingLogPrimaryRecipient(
  value: unknown,
  recipientRepository = getHousingLogDeliverySettingsRepository(),
): Promise<HousingLogDeliverySettings> {
  await recipientRepository.setPrimary(
    normalizeHousingLogRecipientEmail(value),
  );
  return getHousingLogDeliverySettings(recipientRepository);
}

export async function addHousingLogAdditionalRecipient(
  value: unknown,
  recipientRepository = getHousingLogDeliverySettingsRepository(),
): Promise<HousingLogDeliverySettings> {
  await recipientRepository.addAdditional(
    normalizeHousingLogRecipientEmail(value),
  );
  return getHousingLogDeliverySettings(recipientRepository);
}

export async function updateHousingLogAdditionalRecipient(
  id: string,
  patch: { email?: unknown; active?: unknown },
  recipientRepository = getHousingLogDeliverySettingsRepository(),
): Promise<HousingLogDeliverySettings> {
  const hasEmail = Object.prototype.hasOwnProperty.call(patch, "email");
  const hasActive = Object.prototype.hasOwnProperty.call(patch, "active");
  if (!hasEmail && !hasActive)
    throw new InvalidHousingLogDeliverySettingsInputError(
      "Provide an email or active state to update.",
    );
  if (hasActive && typeof patch.active !== "boolean")
    throw new InvalidHousingLogDeliverySettingsInputError(
      "Recipient active state must be true or false.",
    );
  await recipientRepository.updateAdditional(id, {
    ...(hasEmail
      ? { email: normalizeHousingLogRecipientEmail(patch.email) }
      : {}),
    ...(hasActive ? { active: patch.active as boolean } : {}),
  });
  return getHousingLogDeliverySettings(recipientRepository);
}

export async function removeHousingLogAdditionalRecipient(
  id: string,
  recipientRepository = getHousingLogDeliverySettingsRepository(),
): Promise<HousingLogDeliverySettings> {
  if (!(await recipientRepository.removeAdditional(id)))
    throw new HousingLogAdditionalRecipientNotFoundError();
  return getHousingLogDeliverySettings(recipientRepository);
}
