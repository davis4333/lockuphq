import assert from "node:assert/strict";
import test from "node:test";
import type {
  HousingLogAdditionalRecipient,
  HousingLogDeliverySettings,
} from "@workspace/housing-log";
import {
  addHousingLogAdditionalRecipient,
  DuplicateHousingLogRecipientError,
  getHousingLogDeliverySettings,
  HousingLogAdditionalRecipientNotFoundError,
  HousingLogPrimaryRecipientRequiredError,
  InvalidHousingLogRecipientEmailError,
  normalizeHousingLogRecipientEmail,
  removeHousingLogAdditionalRecipient,
  setHousingLogPrimaryRecipient,
  type HousingLogAdditionalRecipientPatch,
  type HousingLogDeliverySettingsRepository,
  updateHousingLogAdditionalRecipient,
} from "./deliverySettings";

type SettingsState = Omit<HousingLogDeliverySettings, "deliveryRecipients">;

class MemoryDeliverySettingsRepository implements HousingLogDeliverySettingsRepository {
  state: SettingsState = {
    primaryEmail: null,
    additionalRecipients: [],
    createdAt: null,
    updatedAt: null,
  };
  private nextId = 1;
  private clock = 0;

  private now() {
    this.clock += 1;
    return new Date(Date.UTC(2026, 7, 12, 12, 0, this.clock)).toISOString();
  }

  private duplicate(email: string, excludedId?: string) {
    const key = email.toLowerCase();
    return (
      this.state.primaryEmail?.toLowerCase() === key ||
      this.state.additionalRecipients.some(
        (recipient) =>
          recipient.id !== excludedId && recipient.email.toLowerCase() === key,
      )
    );
  }

  async read(): Promise<SettingsState> {
    return structuredClone(this.state);
  }

  async setPrimary(email: string): Promise<void> {
    if (
      this.state.additionalRecipients.some(
        (recipient) => recipient.email.toLowerCase() === email.toLowerCase(),
      )
    )
      throw new DuplicateHousingLogRecipientError();
    const now = this.now();
    this.state.primaryEmail = email;
    this.state.createdAt ??= now;
    this.state.updatedAt = now;
  }

  async addAdditional(email: string): Promise<void> {
    if (!this.state.primaryEmail)
      throw new HousingLogPrimaryRecipientRequiredError();
    if (this.duplicate(email)) throw new DuplicateHousingLogRecipientError();
    const now = this.now();
    this.state.additionalRecipients.push({
      id: `recipient-${this.nextId++}`,
      email,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    this.state.updatedAt = now;
  }

  async updateAdditional(
    id: string,
    patch: HousingLogAdditionalRecipientPatch,
  ): Promise<void> {
    const recipient = this.state.additionalRecipients.find(
      (item) => item.id === id,
    );
    if (!recipient) throw new HousingLogAdditionalRecipientNotFoundError();
    const email = patch.email ?? recipient.email;
    if (this.duplicate(email, id))
      throw new DuplicateHousingLogRecipientError();
    recipient.email = email;
    recipient.active = patch.active ?? recipient.active;
    recipient.updatedAt = this.now();
    this.state.updatedAt = recipient.updatedAt;
  }

  async removeAdditional(id: string): Promise<boolean> {
    const index = this.state.additionalRecipients.findIndex(
      (recipient) => recipient.id === id,
    );
    if (index < 0) return false;
    this.state.additionalRecipients.splice(index, 1);
    this.state.updatedAt = this.now();
    return true;
  }
}

const additional = (
  id: string,
  email: string,
  active: boolean,
): HousingLogAdditionalRecipient => ({
  id,
  email,
  active,
  createdAt: "2026-08-12T12:00:00.000Z",
  updatedAt: "2026-08-12T12:00:00.000Z",
});

test("unconfigured settings expose no invented primary or delivery recipients", async () => {
  const settings = await getHousingLogDeliverySettings(
    new MemoryDeliverySettingsRepository(),
  );
  assert.deepEqual(settings, {
    primaryEmail: null,
    additionalRecipients: [],
    deliveryRecipients: [],
    createdAt: null,
    updatedAt: null,
  });
});

test("primary recipient is trimmed, persisted, updated, and always delivered", async () => {
  const repository = new MemoryDeliverySettingsRepository();
  let settings = await setHousingLogPrimaryRecipient(
    "  Sergeant@example.com  ",
    repository,
  );
  assert.equal(settings.primaryEmail, "Sergeant@example.com");
  assert.deepEqual(settings.deliveryRecipients, ["Sergeant@example.com"]);
  const createdAt = settings.createdAt;

  settings = await setHousingLogPrimaryRecipient(
    "captain@example.org",
    repository,
  );
  assert.equal(settings.primaryEmail, "captain@example.org");
  assert.equal(settings.createdAt, createdAt);
  assert.deepEqual(settings.deliveryRecipients, ["captain@example.org"]);
});

test("additional recipients persist, edit, activate, deactivate, and remove", async () => {
  const repository = new MemoryDeliverySettingsRepository();
  await setHousingLogPrimaryRecipient("primary@example.com", repository);
  let settings = await addHousingLogAdditionalRecipient(
    " backup@example.com ",
    repository,
  );
  const id = settings.additionalRecipients[0]!.id;
  assert.equal(settings.additionalRecipients[0]!.email, "backup@example.com");
  assert.equal(settings.additionalRecipients[0]!.active, true);
  assert.deepEqual(settings.deliveryRecipients, [
    "primary@example.com",
    "backup@example.com",
  ]);

  settings = await updateHousingLogAdditionalRecipient(
    id,
    { email: "nightwatch@example.com", active: false },
    repository,
  );
  assert.equal(
    settings.additionalRecipients[0]!.email,
    "nightwatch@example.com",
  );
  assert.equal(settings.additionalRecipients[0]!.active, false);
  assert.deepEqual(settings.deliveryRecipients, ["primary@example.com"]);

  settings = await updateHousingLogAdditionalRecipient(
    id,
    { active: true },
    repository,
  );
  assert.deepEqual(settings.deliveryRecipients, [
    "primary@example.com",
    "nightwatch@example.com",
  ]);

  settings = await removeHousingLogAdditionalRecipient(id, repository);
  assert.deepEqual(settings.additionalRecipients, []);
  assert.deepEqual(settings.deliveryRecipients, ["primary@example.com"]);
});

test("all active additional recipients are included and inactive recipients are excluded", async () => {
  const repository = new MemoryDeliverySettingsRepository();
  repository.state = {
    primaryEmail: "primary@example.com",
    additionalRecipients: [
      additional("one", "one@example.com", true),
      additional("two", "two@example.com", false),
      additional("three", "three@example.com", true),
      additional("duplicate", "PRIMARY@example.com", true),
    ],
    createdAt: "2026-08-12T12:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
  };
  const settings = await getHousingLogDeliverySettings(repository);
  assert.deepEqual(settings.deliveryRecipients, [
    "primary@example.com",
    "one@example.com",
    "three@example.com",
  ]);
});

test("strict business-email validation rejects malformed and blank values", () => {
  for (const value of [
    "",
    "   ",
    "not-an-email",
    "a@localhost",
    ".start@example.com",
    "end.@example.com",
    "two..dots@example.com",
    "space @example.com",
    "a@example..com",
  ])
    assert.throws(
      () => normalizeHousingLogRecipientEmail(value),
      InvalidHousingLogRecipientEmailError,
    );
  assert.equal(
    normalizeHousingLogRecipientEmail(" Officer.Name+logs@Example.COM "),
    "Officer.Name+logs@Example.COM",
  );
});

test("case-insensitive duplicates are rejected across primary and additional recipients", async () => {
  const repository = new MemoryDeliverySettingsRepository();
  await setHousingLogPrimaryRecipient("primary@example.com", repository);
  await assert.rejects(
    addHousingLogAdditionalRecipient("PRIMARY@EXAMPLE.COM", repository),
    DuplicateHousingLogRecipientError,
  );
  const first = await addHousingLogAdditionalRecipient(
    "backup@example.com",
    repository,
  );
  await assert.rejects(
    addHousingLogAdditionalRecipient("BACKUP@example.com", repository),
    DuplicateHousingLogRecipientError,
  );
  await assert.rejects(
    setHousingLogPrimaryRecipient("backup@EXAMPLE.com", repository),
    DuplicateHousingLogRecipientError,
  );
  await assert.rejects(
    updateHousingLogAdditionalRecipient(
      first.additionalRecipients[0]!.id,
      { email: "PRIMARY@example.com" },
      repository,
    ),
    DuplicateHousingLogRecipientError,
  );
});

test("additional recipient requires a configured primary and unknown removal is controlled", async () => {
  const repository = new MemoryDeliverySettingsRepository();
  await assert.rejects(
    addHousingLogAdditionalRecipient("backup@example.com", repository),
    HousingLogPrimaryRecipientRequiredError,
  );
  await assert.rejects(
    removeHousingLogAdditionalRecipient("missing", repository),
    HousingLogAdditionalRecipientNotFoundError,
  );
});
