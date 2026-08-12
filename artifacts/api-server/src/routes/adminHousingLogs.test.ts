import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import JSZip from "jszip";
import type {
  HousingLogArchiveResponse,
  HousingLogDraftInput,
  HousingLogListFilters,
  HousingLogSignatures,
  HousingLogSummary,
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

test("authenticated archive reports database unavailability without affecting session auth", async () => {
  const sessions = new HousingLogAdminSessions();
  const token = sessions.issue();
  await withServer(
    {
      sessions,
      passwordProvider: () => "correct horse",
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/admin/housing-logs/archive`,
        {
          headers: {
            cookie: `${HOUSING_LOG_ADMIN_COOKIE}=${encodeURIComponent(token)}`,
          },
        },
      );
      assert.equal(response.status, 503);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /temporarily unavailable/i);
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
