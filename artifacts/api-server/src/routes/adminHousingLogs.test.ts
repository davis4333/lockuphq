import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import JSZip from "jszip";
import type {
  HousingLogArchiveResponse,
  HousingLogDeliverySettings,
  HousingLogDraftInput,
  HousingLogListFilters,
  HousingLogSignatures,
  HousingLogSummary,
  HousingShift,
  HousingLogPackageCompleteness,
  StoredHousingLog,
} from "@workspace/housing-log";
import { jsonErrorHandler } from "../app";
import {
  HousingLogAdminSessions,
  HOUSING_LOG_ADMIN_COOKIE,
} from "../housingLogs/adminAuth";
import { createHousingLogStressRecord } from "../housingLogs/documentSpike/stressFixture";
import {
  type FinalizedHousingLogMetadata,
  type FinalizeHousingLogResult,
  type HousingLogRepository,
} from "../housingLogs/repository";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "../housingLogs/excelTemplate/workbookRegistry";
import {
  DuplicateHousingLogRecipientError,
  HousingLogAdditionalRecipientNotFoundError,
  HousingLogPrimaryRecipientRequiredError,
  type HousingLogAdditionalRecipientPatch,
  type HousingLogDeliverySettingsRepository,
} from "../housingLogs/deliverySettings";
import type { HousingLogShiftPackage } from "../housingLogs/shiftPackage";
import type {
  HousingLogDeliveryAttempt,
  HousingLogDeliveryAttemptRepository,
  StartHousingLogDeliveryAttempt,
} from "../housingLogs/deliveryAttempts";
import type {
  HousingLogEmailPackage,
  HousingLogEmailProvider,
} from "../housingLogs/emailProvider";
import { createAdminHousingLogsRouter } from "./adminHousingLogs";

class AdminMemoryRepository implements HousingLogRepository {
  readonly records = new Map<string, StoredHousingLog>();

  constructor(records: readonly StoredHousingLog[] = []) {
    for (const record of records) this.records.set(record.id, record);
  }

  async create(_input: HousingLogDraftInput): Promise<StoredHousingLog> {
    throw new Error("not used");
  }

  async get(id: string): Promise<StoredHousingLog | undefined> {
    return this.records.get(id);
  }

  async list(_filters: HousingLogListFilters): Promise<HousingLogSummary[]> {
    throw new Error("not used");
  }

  async listFinalizedArchive(): Promise<FinalizedHousingLogMetadata[]> {
    return [...this.records.values()]
      .filter(
        (record): record is StoredHousingLog & { finalizedAt: string } =>
          record.status === "finalized" && record.finalizedAt !== null,
      )
      .map(
        ({
          id,
          logDate,
          shift,
          housingUnit,
          templateVersion,
          finalizedAt,
        }) => ({
          id,
          logDate,
          shift,
          housingUnit,
          templateVersion,
          finalizedAt,
        }),
      );
  }

  async listFinalizedForShift(
    logDate: string,
    shift: StoredHousingLog["shift"],
  ): Promise<StoredHousingLog[]> {
    return [...this.records.values()].filter(
      (record) =>
        record.status === "finalized" &&
        record.logDate === logDate &&
        record.shift === shift,
    );
  }

  async updateDraft(
    _id: string,
    _input: HousingLogDraftInput,
    _signaturePatch?: HousingLogSignatures,
  ): Promise<StoredHousingLog | undefined> {
    throw new Error("not used");
  }

  async finalizeDraft(_id: string): Promise<FinalizeHousingLogResult> {
    throw new Error("not used");
  }
}

class FailingAdminRepository extends AdminMemoryRepository {
  override async listFinalizedArchive(): Promise<
    FinalizedHousingLogMetadata[]
  > {
    throw new Error("sensitive archive failure marker");
  }
}

class AdminMemoryDeliverySettingsRepository implements HousingLogDeliverySettingsRepository {
  state: Omit<HousingLogDeliverySettings, "deliveryRecipients"> = {
    primaryEmail: null,
    additionalRecipients: [],
    createdAt: null,
    updatedAt: null,
  };
  private nextId = 1;
  private tick = 0;

  private now() {
    this.tick += 1;
    return new Date(Date.UTC(2026, 7, 12, 12, 0, this.tick)).toISOString();
  }

  private isDuplicate(email: string, excludedId?: string) {
    const key = email.toLowerCase();
    return (
      this.state.primaryEmail?.toLowerCase() === key ||
      this.state.additionalRecipients.some(
        (recipient) =>
          recipient.id !== excludedId && recipient.email.toLowerCase() === key,
      )
    );
  }

  async read() {
    return structuredClone(this.state);
  }

  async setPrimary(email: string) {
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

  async addAdditional(email: string) {
    if (!this.state.primaryEmail)
      throw new HousingLogPrimaryRecipientRequiredError();
    if (this.isDuplicate(email)) throw new DuplicateHousingLogRecipientError();
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
  ) {
    const recipient = this.state.additionalRecipients.find(
      (item) => item.id === id,
    );
    if (!recipient) throw new HousingLogAdditionalRecipientNotFoundError();
    const email = patch.email ?? recipient.email;
    if (this.isDuplicate(email, id))
      throw new DuplicateHousingLogRecipientError();
    recipient.email = email;
    recipient.active = patch.active ?? recipient.active;
    recipient.updatedAt = this.now();
    this.state.updatedAt = recipient.updatedAt;
  }

  async removeAdditional(id: string) {
    const index = this.state.additionalRecipients.findIndex(
      (recipient) => recipient.id === id,
    );
    if (index < 0) return false;
    this.state.additionalRecipients.splice(index, 1);
    this.state.updatedAt = this.now();
    return true;
  }
}

class FailingDeliverySettingsRepository extends AdminMemoryDeliverySettingsRepository {
  override async read(): Promise<never> {
    throw new Error("sensitive recipient failure marker");
  }
}

class AdminMemoryDeliveryAttempts implements HousingLogDeliveryAttemptRepository {
  attempts: HousingLogDeliveryAttempt[] = [];
  async start(input: StartHousingLogDeliveryAttempt) {
    const attempt: HousingLogDeliveryAttempt = {
      id: `attempt-${this.attempts.length + 1}`,
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
    attempt.status = "failed";
    attempt.failureCategory = category;
    attempt.failureMessage = message;
    attempt.completedAt = completedAt;
  }
}

class AdminCapturingEmailProvider implements HousingLogEmailProvider {
  messages: HousingLogEmailPackage[] = [];
  async sendHousingLogPackage(message: HousingLogEmailPackage) {
    this.messages.push(message);
    return { messageId: "provider-message" };
  }
}

type TestServerOptions = Parameters<typeof createAdminHousingLogsRouter>[0];

async function withServer(
  options: TestServerOptions,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use("/api", createAdminHousingLogsRouter(options));
  app.use(jsonErrorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind.");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function login(
  baseUrl: string,
  password = "correct horse",
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 204);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const cookie = setCookie.split(";", 1)[0]!;
  assert.ok(cookie.startsWith(`${HOUSING_LOG_ADMIN_COOKIE}=`));
  return cookie;
}

const finalizedRecord = (
  id: string,
  unit: StoredHousingLog["housingUnit"] = "B",
  shift: StoredHousingLog["shift"] = "1",
): StoredHousingLog => ({
  ...createHousingLogStressRecord(unit, shift, 4),
  id,
});

test("admin login rejects bad credentials and issues the required production cookie", async () => {
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => "correct horse",
      secureCookies: true,
    },
    async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/api/admin/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(missing.status, 400);

      const denied = await fetch(`${baseUrl}/api/admin/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "wrong" }),
      });
      assert.equal(denied.status, 403);
      assert.equal(denied.headers.get("set-cookie"), null);

      const response = await fetch(`${baseUrl}/api/admin/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "correct horse" }),
      });
      assert.equal(response.status, 204);
      const cookie = response.headers.get("set-cookie") ?? "";
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.match(cookie, /Path=\/api\/admin/i);
    },
  );
});

test("unconfigured admin password returns a controlled 503", async () => {
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => undefined,
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/admin/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      });
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /not configured/i);
    },
  );
});

test("admin logout revokes the authenticated session", async () => {
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const authenticated = await fetch(`${baseUrl}/api/admin/session`, {
        headers: { cookie },
      });
      assert.equal(authenticated.status, 200);

      const logout = await fetch(`${baseUrl}/api/admin/session`, {
        method: "DELETE",
        headers: { cookie },
      });
      assert.equal(logout.status, 204);
      assert.match(
        logout.headers.get("set-cookie") ?? "",
        /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i,
      );

      const revoked = await fetch(`${baseUrl}/api/admin/session`, {
        headers: { cookie },
      });
      assert.equal(revoked.status, 401);
    },
  );
});

test("every Housing Log admin archive route rejects unauthorized sessions", async () => {
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      for (const path of [
        "/api/admin/housing-logs/archive",
        "/api/admin/housing-logs/unknown/excel",
        "/api/admin/housing-logs/shift-package/2026-08-12/2",
        "/api/admin/housing-logs/shift-package/2026-08-12/2/send",
        "/api/admin/housing-logs/delivery-settings",
      ]) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 401);
        assert.deepEqual(await response.json(), {
          error: "Housing Log admin login required.",
        });
      }
    },
  );
});

test("shift package endpoint validates inputs and returns a protected no-store ZIP", async () => {
  const calls: Array<{ logDate: string; shift: HousingShift }> = [];
  const packageResult: HousingLogShiftPackage = {
    bytes: Buffer.from("synthetic zip bytes"),
    filename: "Housing-Logs_2026-08-12_Shift-2.zip",
    manifest: {
      manifestVersion: 1,
      packageDate: "2026-08-12",
      shift: "2",
      generatedAt: "2026-08-13T00:00:00.000Z",
      completenessStatus: "INCOMPLETE",
      expectedHousingUnits: ["A/H", "B", "C", "D", "E", "F", "G", "Infirmary"],
      includedLogs: [],
      missingHousingUnits: ["A/H", "B", "C", "D", "E", "F", "G", "Infirmary"],
      duplicateHousingUnitSlots: [],
    },
  };
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => "correct horse",
      shiftPackageBuilder: async (logDate, shift) => {
        calls.push({ logDate, shift });
        return packageResult;
      },
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      for (const path of [
        "/api/admin/housing-logs/shift-package/2026-02-30/2",
        "/api/admin/housing-logs/shift-package/2026-08-12/4",
      ]) {
        const invalid = await fetch(`${baseUrl}${path}`, {
          headers: { cookie },
        });
        assert.equal(invalid.status, 400);
      }
      assert.deepEqual(calls, []);

      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-12/2`,
        { headers: { cookie } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /zip/);
      assert.match(
        response.headers.get("content-disposition") ?? "",
        /attachment.*Housing-Logs_2026-08-12_Shift-2\.zip/i,
      );
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        packageResult.bytes,
      );
      assert.deepEqual(calls, [{ logDate: "2026-08-12", shift: "2" }]);
    },
  );
});

test("shift package generation failures receive controlled JSON", async () => {
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => "correct horse",
      shiftPackageBuilder: async () => {
        throw new Error("sensitive Excel generation failure");
      },
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-12/2`,
        { headers: { cookie } },
      );
      assert.equal(response.status, 500);
      const body = (await response.json()) as { error: string };
      assert.equal(
        body.error,
        "The request could not be completed. Try again.",
      );
      assert.equal(JSON.stringify(body).includes("sensitive"), false);
    },
  );
});

test("manual-send API validates input and delivers the existing package through the protected boundary", async () => {
  const records = new AdminMemoryRepository([
    finalizedRecord("immutable-manual-email-log", "B", "2"),
  ]);
  const settings = new AdminMemoryDeliverySettingsRepository();
  await settings.setPrimary("primary@example.com");
  await settings.addAdditional("active@example.com");
  await settings.addAdditional("inactive@example.com");
  await settings.updateAdditional("recipient-2", { active: false });
  const attempts = new AdminMemoryDeliveryAttempts();
  const provider = new AdminCapturingEmailProvider();
  let packageCalls = 0;
  const packageBytes = Buffer.from("exact Phase 2D package bytes");
  const packageCompleteness: HousingLogPackageCompleteness = "INCOMPLETE";
  const recordsBefore = JSON.stringify([...records.records]);
  const settingsBefore = JSON.stringify(settings.state);

  await withServer(
    {
      repository: records,
      passwordProvider: () => "correct horse",
      deliverySettingsRepository: settings,
      deliveryAttemptRepository: attempts,
      emailProviderFactory: () => provider,
      shiftPackageBuilder: async (logDate, shift) => {
        packageCalls += 1;
        return {
          bytes: packageBytes,
          filename: `Housing-Logs_${logDate}_Shift-${shift}.zip`,
          manifest: {
            manifestVersion: 1,
            packageDate: logDate,
            shift,
            generatedAt: "2026-08-12T22:00:00.000Z",
            completenessStatus: packageCompleteness,
            expectedHousingUnits: [
              "A/H",
              "B",
              "C",
              "D",
              "E",
              "F",
              "G",
              "Infirmary",
            ],
            includedLogs: [],
            missingHousingUnits: ["C"],
            duplicateHousingUnitSlots: [],
          },
        };
      },
    },
    async (baseUrl) => {
      const unauthorized = await fetch(
        `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-12/2/send`,
        { method: "POST" },
      );
      assert.equal(unauthorized.status, 401);

      const cookie = await login(baseUrl);
      for (const path of [
        "/api/admin/housing-logs/shift-package/2026-02-30/2/send",
        "/api/admin/housing-logs/shift-package/2026-08-12/4/send",
      ]) {
        const invalid = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { cookie },
        });
        assert.equal(invalid.status, 400);
      }
      assert.equal(packageCalls, 0);

      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-12/2/send`,
        { method: "POST", headers: { cookie } },
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      const body = (await response.json()) as {
        packageStatus: string;
        recipientCount: number;
        missingHousingUnits: string[];
      };
      assert.equal(body.packageStatus, "INCOMPLETE");
      assert.equal(body.recipientCount, 2);
      assert.deepEqual(body.missingHousingUnits, ["C"]);
      assert.equal(packageCalls, 1);
      assert.deepEqual(provider.messages[0]!.recipients, [
        "primary@example.com",
        "active@example.com",
      ]);
      assert.strictEqual(provider.messages[0]!.attachment.bytes, packageBytes);
      assert.equal(attempts.attempts[0]!.status, "sent");
      assert.equal(JSON.stringify([...records.records]), recordsBefore);
      assert.equal(JSON.stringify(settings.state), settingsBefore);
    },
  );
});

test("manual-send API reports no recipients and expired sessions without generating a package", async () => {
  let packageCalls = 0;
  const sessions = new HousingLogAdminSessions();
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      passwordProvider: () => "correct horse",
      sessions,
      deliverySettingsRepository: new AdminMemoryDeliverySettingsRepository(),
      deliveryAttemptRepository: new AdminMemoryDeliveryAttempts(),
      emailProviderFactory: () => new AdminCapturingEmailProvider(),
      shiftPackageBuilder: async () => {
        packageCalls += 1;
        throw new Error("must not run");
      },
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const noRecipients = await fetch(
        `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-12/2/send`,
        { method: "POST", headers: { cookie } },
      );
      assert.equal(noRecipients.status, 409);
      assert.deepEqual(await noRecipients.json(), {
        error: "No Housing Log delivery recipients are configured.",
      });
      assert.equal(packageCalls, 0);

      sessions.revoke(cookie.split("=", 2)[1]);
      const expired = await fetch(
        `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-12/2/send`,
        { method: "POST", headers: { cookie } },
      );
      assert.equal(expired.status, 401);
      assert.equal(packageCalls, 0);
    },
  );
});

test("recipient settings API persists primary and additional recipient lifecycle without changing logs", async () => {
  const logRepository = new AdminMemoryRepository([
    finalizedRecord("immutable-log", "B", "1"),
  ]);
  const deliverySettingsRepository =
    new AdminMemoryDeliverySettingsRepository();
  const before = JSON.stringify(logRepository.records);
  await withServer(
    {
      repository: logRepository,
      deliverySettingsRepository,
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const request = (path: string, init?: RequestInit) =>
        fetch(`${baseUrl}${path}`, {
          ...init,
          headers: {
            cookie,
            ...(init?.body ? { "content-type": "application/json" } : {}),
            ...init?.headers,
          },
        });
      const root = "/api/admin/housing-logs/delivery-settings";

      let response = await request(root);
      assert.equal(response.status, 200);
      let settings = (await response.json()) as HousingLogDeliverySettings;
      assert.equal(settings.primaryEmail, null);
      assert.deepEqual(settings.deliveryRecipients, []);
      assert.equal(response.headers.get("cache-control"), "no-store");

      response = await request(`${root}/primary`, {
        method: "PUT",
        body: JSON.stringify({ email: "  Sergeant@Example.com " }),
      });
      assert.equal(response.status, 200);
      settings = (await response.json()) as HousingLogDeliverySettings;
      assert.equal(settings.primaryEmail, "Sergeant@Example.com");
      assert.deepEqual(settings.deliveryRecipients, ["Sergeant@Example.com"]);

      response = await request(`${root}/primary`, {
        method: "PUT",
        body: JSON.stringify({ email: "captain@example.com" }),
      });
      assert.equal(response.status, 200);
      settings = (await response.json()) as HousingLogDeliverySettings;
      assert.equal(settings.primaryEmail, "captain@example.com");

      response = await request(`${root}/additional`, {
        method: "POST",
        body: JSON.stringify({ email: "backup@example.com" }),
      });
      assert.equal(response.status, 201);
      settings = (await response.json()) as HousingLogDeliverySettings;
      const recipientId = settings.additionalRecipients[0]!.id;
      assert.deepEqual(settings.deliveryRecipients, [
        "captain@example.com",
        "backup@example.com",
      ]);

      response = await request(`${root}/additional/${recipientId}`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      assert.equal(response.status, 200);
      settings = (await response.json()) as HousingLogDeliverySettings;
      assert.equal(settings.additionalRecipients[0]!.active, false);
      assert.deepEqual(settings.deliveryRecipients, ["captain@example.com"]);

      response = await request(`${root}/additional/${recipientId}`, {
        method: "PATCH",
        body: JSON.stringify({
          email: "watchcommander@example.org",
          active: true,
        }),
      });
      assert.equal(response.status, 200);
      settings = (await response.json()) as HousingLogDeliverySettings;
      assert.deepEqual(settings.deliveryRecipients, [
        "captain@example.com",
        "watchcommander@example.org",
      ]);

      response = await request(`${root}/additional/${recipientId}`, {
        method: "DELETE",
      });
      assert.equal(response.status, 200);
      settings = (await response.json()) as HousingLogDeliverySettings;
      assert.deepEqual(settings.additionalRecipients, []);
      assert.deepEqual(settings.deliveryRecipients, ["captain@example.com"]);
      assert.equal(JSON.stringify(logRepository.records), before);
    },
  );
});

test("recipient settings API validates malformed, duplicate, and unknown mutations", async () => {
  const deliverySettingsRepository =
    new AdminMemoryDeliverySettingsRepository();
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      deliverySettingsRepository,
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const root = `${baseUrl}/api/admin/housing-logs/delivery-settings`;
      const mutate = (path: string, method: string, body: unknown) =>
        fetch(`${root}${path}`, {
          method,
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify(body),
        });

      let response = await mutate("/additional", "POST", {
        email: "backup@example.com",
      });
      assert.equal(response.status, 409);
      response = await mutate("/primary", "PUT", { email: "not-an-email" });
      assert.equal(response.status, 400);
      response = await mutate("/primary", "PUT", {
        email: "primary@example.com",
        unexpected: true,
      });
      assert.equal(response.status, 400);
      response = await mutate("/primary", "PUT", {
        email: "primary@example.com",
      });
      assert.equal(response.status, 200);
      response = await mutate("/additional", "POST", {
        email: "PRIMARY@EXAMPLE.COM",
      });
      assert.equal(response.status, 409);
      response = await mutate("/additional/missing", "PATCH", {
        active: "yes",
      });
      assert.equal(response.status, 400);
      response = await mutate("/additional/missing", "DELETE", undefined);
      assert.equal(response.status, 404);
    },
  );
});

test("expired sessions cannot read recipient settings", async () => {
  let now = 1_000;
  const sessions = new HousingLogAdminSessions(() => now, 100);
  const token = sessions.issue();
  now += 101;
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      deliverySettingsRepository: new AdminMemoryDeliverySettingsRepository(),
      passwordProvider: () => "correct horse",
      sessions,
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/delivery-settings`,
        {
          headers: {
            cookie: `${HOUSING_LOG_ADMIN_COOKIE}=${encodeURIComponent(token)}`,
          },
        },
      );
      assert.equal(response.status, 401);
    },
  );
});

test("recipient settings failures return generic controlled JSON", async () => {
  await withServer(
    {
      repository: new AdminMemoryRepository(),
      deliverySettingsRepository: new FailingDeliverySettingsRepository(),
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/delivery-settings`,
        { headers: { cookie } },
      );
      assert.equal(response.status, 500);
      const body = (await response.json()) as { error: string };
      assert.equal(
        body.error,
        "The request could not be completed. Try again.",
      );
      assert.equal(JSON.stringify(body).includes("sensitive"), false);
    },
  );
});

test("archive returns finalized-only lightweight metadata and preserves duplicate slots", async () => {
  const first = finalizedRecord("duplicate-one", "A/H", "2");
  const second = {
    ...finalizedRecord("duplicate-two", "A/H", "2"),
    finalizedAt: "2026-08-12T13:00:00.000Z",
  };
  const draft = {
    ...finalizedRecord("draft-record", "B", "2"),
    status: "draft" as const,
    finalizedAt: null,
  };
  await withServer(
    {
      repository: new AdminMemoryRepository([first, second, draft]),
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/archive`,
        { headers: { cookie } },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = (await response.json()) as HousingLogArchiveResponse;
      assert.equal(body.records.length, 2);
      assert.deepEqual(
        body.records.map((record: { id: string }) => record.id).sort(),
        ["duplicate-one", "duplicate-two"],
      );
      assert.ok(body.expectedHousingUnits.includes("Infirmary"));
      assert.equal(body.records[0].sourceSheet, "2_AH");
      for (const record of body.records) {
        assert.deepEqual(Object.keys(record).sort(), [
          "finalizedAt",
          "housingUnit",
          "id",
          "logDate",
          "shift",
          "sourceSheet",
          "templateVersion",
        ]);
        assert.equal("values" in record, false);
        assert.equal("signatures" in record, false);
        assert.equal("events" in record, false);
      }
    },
  );
});

test("individual download uses the historical template, returns valid editable XLSX, and never mutates the record", async () => {
  const original = finalizedRecord("historical-record", "B", "1");
  const officialRegistry = registerOfficialHousingLogWorkbook(
    new HousingLogWorkbookRegistry(),
  );
  const officialTemplate = officialRegistry.resolveRecord(original);
  const historical = { ...original, templateVersion: "historical-test-v1" };
  const historicalRegistry = new HousingLogWorkbookRegistry().register(
    historical.templateVersion,
    officialTemplate.workbookPath,
  );
  const repository = new AdminMemoryRepository([historical]);
  const before = JSON.stringify(await repository.get(historical.id));

  await withServer(
    {
      repository,
      passwordProvider: () => "correct horse",
      workbookRegistry: historicalRegistry,
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/${historical.id}/excel`,
        { headers: { cookie } },
      );
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type") ?? "",
        /spreadsheetml\.sheet/,
      );
      assert.match(
        response.headers.get("content-disposition") ?? "",
        /attachment.*\.xlsx/i,
      );
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
      const bytes = Buffer.from(await response.arrayBuffer());
      const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
      assert.ok(zip.file("xl/workbook.xml"));
      assert.ok(zip.file("xl/media/housing-log-supervisor.png"));
      const worksheetXml = await zip
        .file("xl/worksheets/sheet2.xml")!
        .async("string");
      assert.match(worksheetXml, /Alexandra Montgomery/);
      assert.equal(JSON.stringify(await repository.get(historical.id)), before);
    },
  );
});

test("draft and unknown records cannot be downloaded", async () => {
  const draft = {
    ...finalizedRecord("draft-only"),
    status: "draft" as const,
    finalizedAt: null,
  };
  await withServer(
    {
      repository: new AdminMemoryRepository([draft]),
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const draftResponse = await fetch(
        `${baseUrl}/api/admin/housing-logs/${draft.id}/excel`,
        { headers: { cookie } },
      );
      assert.equal(draftResponse.status, 409);
      const unknownResponse = await fetch(
        `${baseUrl}/api/admin/housing-logs/missing/excel`,
        { headers: { cookie } },
      );
      assert.equal(unknownResponse.status, 404);
    },
  );
});

test("authenticated archive and package routes report database unavailability without affecting session auth", async () => {
  const sessions = new HousingLogAdminSessions();
  const token = sessions.issue();
  await withServer(
    {
      sessions,
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      for (const [path, method] of [
        ["/api/admin/housing-logs/archive", "GET"],
        ["/api/admin/housing-logs/shift-package/2026-08-12/2", "GET"],
        ["/api/admin/housing-logs/shift-package/2026-08-12/2/send", "POST"],
        ["/api/admin/housing-logs/delivery-settings", "GET"],
      ]) {
        const response = await fetch(`${baseUrl}${path}`, {
          method,
          headers: {
            cookie: `${HOUSING_LOG_ADMIN_COOKIE}=${encodeURIComponent(token)}`,
          },
        });
        assert.equal(response.status, 503);
        const body = (await response.json()) as { error: string };
        assert.match(body.error, /temporarily unavailable/i);
      }
    },
  );
});

test("archive database failures receive controlled JSON without sensitive data", async () => {
  await withServer(
    {
      repository: new FailingAdminRepository(),
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const cookie = await login(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/archive`,
        { headers: { cookie } },
      );
      assert.equal(response.status, 500);
      const body = (await response.json()) as { error: string };
      assert.equal(
        body.error,
        "The request could not be completed. Try again.",
      );
      assert.equal(JSON.stringify(body).includes("sensitive"), false);
    },
  );
});
