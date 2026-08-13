import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  HousingLogDeliverySettings,
  HousingShift,
} from "@workspace/housing-log";
import type { HousingLogDeliverySettingsRepository } from "./deliverySettings";
import type {
  HousingLogDeliveryAttempt,
  HousingLogDeliveryAttemptRepository,
  StartHousingLogDeliveryAttempt,
} from "./deliveryAttempts";
import {
  HousingLogEmailProviderError,
  type HousingLogEmailPackage,
  type HousingLogEmailProvider,
} from "./emailProvider";
import {
  HousingLogManualEmailError,
  sendHousingLogShiftPackageEmail,
} from "./manualEmailDelivery";
import type { HousingLogShiftPackage } from "./shiftPackage";

const zipBytes = Buffer.from("PK\x03\x04phase-2d-approved-package-bytes");

const packageResult = (
  status: "COMPLETE" | "INCOMPLETE" = "COMPLETE",
): HousingLogShiftPackage => ({
  bytes: zipBytes,
  filename: "Housing-Logs_2026-08-12_Shift-2.zip",
  manifest: {
    manifestVersion: 1,
    packageDate: "2026-08-12",
    shift: "2",
    generatedAt: "2026-08-12T22:00:00.000Z",
    completenessStatus: status,
    expectedHousingUnits: ["A", "B", "C", "D", "E", "F", "G", "Infirmary"],
    includedLogs: [
      {
        recordId: "final-log",
        housingUnit: "B",
        finalizedAt: "2026-08-12T21:00:00.000Z",
        templateVersion: "2026-04-27",
        sourceSheet: "2_B",
        filename: "Housing-Log.xlsx",
        sha256: "a".repeat(64),
      },
    ],
    missingHousingUnits: status === "INCOMPLETE" ? ["C"] : [],
    duplicateHousingUnitSlots:
      status === "INCOMPLETE"
        ? [{ housingUnit: "B", recordCount: 2, recordIds: ["one", "two"] }]
        : [],
  },
});

class SettingsRepository implements HousingLogDeliverySettingsRepository {
  constructor(
    readonly state: Omit<HousingLogDeliverySettings, "deliveryRecipients">,
  ) {}
  async read() {
    return structuredClone(this.state);
  }
  async setPrimary(): Promise<void> {
    throw new Error("not used");
  }
  async addAdditional(): Promise<void> {
    throw new Error("not used");
  }
  async updateAdditional(): Promise<void> {
    throw new Error("not used");
  }
  async removeAdditional(): Promise<boolean> {
    throw new Error("not used");
  }
}

const settingsRepository = (
  primaryEmail: string | null,
  additional: Array<{ email: string; active: boolean }> = [],
) =>
  new SettingsRepository({
    primaryEmail,
    additionalRecipients: additional.map((recipient, index) => ({
      id: `recipient-${index}`,
      ...recipient,
      createdAt: "2026-08-12T12:00:00.000Z",
      updatedAt: "2026-08-12T12:00:00.000Z",
    })),
    createdAt: primaryEmail ? "2026-08-12T12:00:00.000Z" : null,
    updatedAt: primaryEmail ? "2026-08-12T12:00:00.000Z" : null,
  });

class MemoryAttempts implements HousingLogDeliveryAttemptRepository {
  attempts: HousingLogDeliveryAttempt[] = [];
  private nextId = 1;
  async start(input: StartHousingLogDeliveryAttempt) {
    const attempt: HousingLogDeliveryAttempt = {
      id: `attempt-${this.nextId++}`,
      ...input,
      triggerType: "manual",
      completedAt: null,
      providerMessageId: null,
      status: "sending",
      failureCategory: null,
      failureMessage: null,
      initiatedBy: "admin",
    };
    this.attempts.push(attempt);
    return structuredClone(attempt);
  }
  async markSent(id: string, messageId: string, completedAt: Date) {
    const attempt = this.attempts.find((item) => item.id === id)!;
    assert.equal(attempt.status, "sending");
    attempt.status = "sent";
    attempt.providerMessageId = messageId;
    attempt.completedAt = completedAt;
  }
  async markFailed(
    id: string,
    category: string,
    message: string,
    completedAt: Date,
  ) {
    const attempt = this.attempts.find((item) => item.id === id)!;
    assert.equal(attempt.status, "sending");
    attempt.status = "failed";
    attempt.failureCategory = category;
    attempt.failureMessage = message;
    attempt.completedAt = completedAt;
  }
}

class CapturingProvider implements HousingLogEmailProvider {
  messages: HousingLogEmailPackage[] = [];
  failure?: Error;
  async sendHousingLogPackage(message: HousingLogEmailPackage) {
    this.messages.push(message);
    if (this.failure) throw this.failure;
    return { messageId: "provider-message-1" };
  }
}

function dependencies(options: {
  settings?: SettingsRepository;
  attempts?: MemoryAttempts;
  provider?: CapturingProvider;
  package?: HousingLogShiftPackage;
  packageCalls?: { count: number };
}) {
  const attempts = options.attempts ?? new MemoryAttempts();
  const provider = options.provider ?? new CapturingProvider();
  const packageCalls = options.packageCalls ?? { count: 0 };
  let tick = 0;
  return {
    attempts,
    provider,
    packageCalls,
    value: {
      deliverySettingsRepository:
        options.settings ?? settingsRepository("primary@example.com"),
      attemptRepository: attempts,
      emailProviderFactory: () => provider,
      packageBuilder: async (_date: string, _shift: HousingShift) => {
        packageCalls.count += 1;
        return options.package ?? packageResult();
      },
      now: () => new Date(Date.UTC(2026, 7, 12, 20, 0, tick++)),
    },
  };
}

test("manual delivery uses only the approved resolved recipients and builds the package once", async () => {
  const setup = dependencies({
    settings: settingsRepository("Primary@Example.com", [
      { email: "active-one@example.com", active: true },
      { email: "INACTIVE@example.com", active: false },
      { email: "primary@example.com", active: true },
      { email: "active-two@example.com", active: true },
    ]),
  });
  const result = await sendHousingLogShiftPackageEmail(
    "2026-08-12",
    "2",
    setup.value,
  );

  assert.equal(setup.packageCalls.count, 1);
  assert.equal(setup.provider.messages.length, 1);
  const sent = setup.provider.messages[0]!;
  assert.deepEqual(sent.recipients, [
    "Primary@Example.com",
    "active-one@example.com",
    "active-two@example.com",
  ]);
  assert.equal(sent.subject, "Housing Unit Logs — 2026-08-12 — Second Shift");
  assert.match(sent.text, /Package status: COMPLETE/);
  assert.match(sent.text, /Housing Logs included: 1/);
  assert.doesNotMatch(sent.text, /signature|officer notes|inmate/i);
  assert.equal(sent.attachment.filename, packageResult().filename);
  assert.strictEqual(sent.attachment.bytes, zipBytes);
  assert.equal(sent.idempotencyKey, "attempt-1");
  assert.equal(result.recipientCount, 3);
  assert.equal(result.packageStatus, "COMPLETE");
  assert.equal(setup.attempts.attempts[0]!.status, "sent");
  assert.equal(
    setup.attempts.attempts[0]!.packageSha256,
    createHash("sha256").update(zipBytes).digest("hex"),
  );
});

test("primary-only and every active additional recipient are supported", async () => {
  for (const [additional, expectedCount] of [
    [[], 1],
    [[{ email: "one@example.com", active: true }], 2],
    [
      [
        { email: "one@example.com", active: true },
        { email: "two@example.com", active: true },
      ],
      3,
    ],
  ] as const) {
    const setup = dependencies({
      settings: settingsRepository("primary@example.com", [...additional]),
    });
    const result = await sendHousingLogShiftPackageEmail(
      "2026-08-12",
      "2",
      setup.value,
    );
    assert.equal(result.recipientCount, expectedCount);
  }
});

test("incomplete package is sent with explicit missing and duplicate details", async () => {
  const setup = dependencies({ package: packageResult("INCOMPLETE") });
  const result = await sendHousingLogShiftPackageEmail(
    "2026-08-12",
    "2",
    setup.value,
  );
  assert.equal(result.packageStatus, "INCOMPLETE");
  assert.deepEqual(result.missingHousingUnits, ["C"]);
  assert.deepEqual(result.duplicateHousingUnits, ["B"]);
  assert.match(setup.provider.messages[0]!.text, /Package status: INCOMPLETE/);
  assert.match(setup.provider.messages[0]!.text, /Missing housing units: C/);
  assert.match(setup.provider.messages[0]!.text, /Duplicate housing units: B/);
  assert.equal(setup.attempts.attempts[0]!.packageCompleteness, "INCOMPLETE");
});

test("no recipients fails before provider creation, package generation, or ledger creation", async () => {
  const packageCalls = { count: 0 };
  let providerCalls = 0;
  const attempts = new MemoryAttempts();
  await assert.rejects(
    sendHousingLogShiftPackageEmail("2026-08-12", "2", {
      deliverySettingsRepository: settingsRepository(null),
      attemptRepository: attempts,
      emailProviderFactory: () => {
        providerCalls += 1;
        return new CapturingProvider();
      },
      packageBuilder: async () => {
        packageCalls.count += 1;
        return packageResult();
      },
    }),
    (error: unknown) =>
      error instanceof HousingLogManualEmailError &&
      error.category === "no_recipients" &&
      error.httpStatus === 409,
  );
  assert.equal(providerCalls, 0);
  assert.equal(packageCalls.count, 0);
  assert.equal(attempts.attempts.length, 0);
});

test("missing provider configuration and package failure are controlled before an attempt starts", async () => {
  const attempts = new MemoryAttempts();
  await assert.rejects(
    sendHousingLogShiftPackageEmail("2026-08-12", "2", {
      deliverySettingsRepository: settingsRepository("primary@example.com"),
      attemptRepository: attempts,
      emailProviderFactory: () => {
        throw new HousingLogEmailProviderError("provider_not_configured");
      },
    }),
    (error: unknown) =>
      error instanceof HousingLogManualEmailError &&
      error.category === "provider_not_configured" &&
      error.httpStatus === 503,
  );
  assert.equal(attempts.attempts.length, 0);

  const setup = dependencies({ attempts });
  setup.value.packageBuilder = async () => {
    throw new Error("sensitive workbook failure");
  };
  await assert.rejects(
    sendHousingLogShiftPackageEmail("2026-08-12", "2", setup.value),
    (error: unknown) =>
      error instanceof HousingLogManualEmailError &&
      error.category === "package_generation_failed" &&
      !error.message.includes("sensitive"),
  );
  assert.equal(attempts.attempts.length, 0);
});

test("provider rejection, timeout, and network failures close a sanitized failed attempt", async () => {
  for (const category of [
    "provider_rejected",
    "provider_timeout",
    "provider_network",
  ] as const) {
    const attempts = new MemoryAttempts();
    const provider = new CapturingProvider();
    provider.failure = new HousingLogEmailProviderError(category);
    const setup = dependencies({ attempts, provider });
    await assert.rejects(
      sendHousingLogShiftPackageEmail("2026-08-12", "2", setup.value),
      (error: unknown) =>
        error instanceof HousingLogManualEmailError &&
        error.category === category,
    );
    assert.equal(attempts.attempts[0]!.status, "failed");
    assert.equal(attempts.attempts[0]!.failureCategory, category);
    assert.ok(attempts.attempts[0]!.completedAt);
    assert.equal(attempts.attempts[0]!.providerMessageId, null);
  }
});

test("retry after failure creates a separate attempt and preserves the failed attempt", async () => {
  const attempts = new MemoryAttempts();
  const failing = new CapturingProvider();
  failing.failure = new HousingLogEmailProviderError("provider_rejected");
  const failedSetup = dependencies({ attempts, provider: failing });
  await assert.rejects(
    sendHousingLogShiftPackageEmail("2026-08-12", "2", failedSetup.value),
  );
  const original = structuredClone(attempts.attempts[0]);

  const retrySetup = dependencies({ attempts });
  const result = await sendHousingLogShiftPackageEmail(
    "2026-08-12",
    "2",
    retrySetup.value,
  );
  assert.equal(result.attemptId, "attempt-2");
  assert.equal(attempts.attempts.length, 2);
  assert.deepEqual(attempts.attempts[0], original);
  assert.equal(attempts.attempts[1]!.status, "sent");
});

test("recipient settings are not mutated by delivery", async () => {
  const settings = settingsRepository("primary@example.com", [
    { email: "other@example.com", active: true },
  ]);
  const before = structuredClone(settings.state);
  const setup = dependencies({ settings });
  await sendHousingLogShiftPackageEmail("2026-08-12", "2", setup.value);
  assert.deepEqual(settings.state, before);
});
