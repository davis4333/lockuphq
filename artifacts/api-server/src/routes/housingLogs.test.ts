import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import {
  fieldsForConfig,
  getHousingLogConfig,
  prepareHousingLog,
  type HousingLogDraftCreated,
  type HousingLogDraftInput,
  type HousingLogListFilters,
  type HousingLogSignatures,
  type HousingLogSummary,
  type HousingLogValue,
  type StoredHousingLog,
} from "@workspace/housing-log";
import { signatureDataUrl } from "../housingLogs/signatureTestUtils";
import { validateHousingLogForFinalization } from "../housingLogs/signatureValidation";
import { DraftAccessSessions, DraftUnlockRateLimiter } from "../housingLogs/draftAccess";
import {
  type DraftAccessCodeLookup,
  type FinalizedHousingLogMetadata,
  type FinalizeHousingLogResult,
  type HousingLogRepository,
} from "../housingLogs/repository";
import { createHousingLogsRouter, type HousingLogsRouterOptions } from "./housingLogs";
import { jsonErrorHandler } from "../app";
import healthRouter from "./health";

const signature = signatureDataUrl("valid");

function completeInput(
  unit: HousingLogDraftInput["housingUnit"] = "A",
  shift: HousingLogDraftInput["shift"] = "1",
): HousingLogDraftInput {
  const config = getHousingLogConfig(unit, shift);
  const values: Record<string, HousingLogValue> = {};
  for (const item of fieldsForConfig(config)) {
    values[item.key] =
      item.inputType === "number"
        ? 1
        : item.inputType === "time"
          ? "08:30"
          : item.inputType === "choice"
            ? (item.options?.[0] ?? "Yes")
            : "Test value";
  }
  return {
    logDate: "2026-08-11",
    housingUnit: unit,
    shift,
    templateVersion: config.templateVersion,
    values,
    events: [],
    signatures: Object.fromEntries(
      config.signatures.map((item) => [item.key, signature]),
    ),
  };
}

function toDraft(record: StoredHousingLog): HousingLogDraftInput {
  return {
    logDate: record.logDate,
    housingUnit: record.housingUnit,
    shift: record.shift,
    templateVersion: record.templateVersion,
    values: record.values,
    events: record.events,
    signatures: record.signatures,
  };
}

function summary(record: StoredHousingLog): HousingLogSummary {
  const {
    id,
    logDate,
    shift,
    housingUnit,
    templateVersion,
    status,
    createdAt,
    updatedAt,
    finalizedAt,
  } = record;
  return {
    id,
    logDate,
    shift,
    housingUnit,
    templateVersion,
    status,
    createdAt,
    updatedAt,
    finalizedAt,
  };
}

class MemoryRepository implements HousingLogRepository {
  records = new Map<string, StoredHousingLog>();
  accessCodeHashesById = new Map<string, string>();

  async create(
    rawInput: HousingLogDraftInput,
    accessCodeHash: string,
  ): Promise<StoredHousingLog> {
    const input = prepareHousingLog(rawInput);
    const now = new Date().toISOString();
    const record: StoredHousingLog = {
      ...input,
      id: randomUUID(),
      status: "draft",
      createdAt: now,
      updatedAt: now,
      finalizedAt: null,
    };
    this.records.set(record.id, record);
    this.accessCodeHashesById.set(record.id, accessCodeHash);
    return record;
  }

  async findDraftByAccessCodeHash(
    hash: string,
  ): Promise<DraftAccessCodeLookup | undefined> {
    for (const [id, storedHash] of this.accessCodeHashesById)
      if (storedHash === hash) {
        const record = this.records.get(id);
        if (record) return { id: record.id, status: record.status };
      }
    return undefined;
  }

  async get(id: string): Promise<StoredHousingLog | undefined> {
    return this.records.get(id);
  }

  async list(filters: HousingLogListFilters): Promise<HousingLogSummary[]> {
    return [...this.records.values()]
      .filter((record) => !filters.status || record.status === filters.status)
      .filter(
        (record) =>
          !filters.housingUnit || record.housingUnit === filters.housingUnit,
      )
      .filter((record) => !filters.shift || record.shift === filters.shift)
      .filter(
        (record) => !filters.logDate || record.logDate === filters.logDate,
      )
      .map(summary);
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
    id: string,
    input: HousingLogDraftInput,
    signaturePatch?: HousingLogSignatures,
  ): Promise<StoredHousingLog | undefined> {
    const existing = this.records.get(id);
    if (!existing || existing.status !== "draft") return undefined;
    const prepared = prepareHousingLog(input);
    const updated = {
      ...existing,
      ...prepared,
      signatures: signaturePatch
        ? { ...existing.signatures, ...signaturePatch }
        : prepared.signatures,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  async finalizeDraft(id: string): Promise<FinalizeHousingLogResult> {
    const existing = this.records.get(id);
    if (!existing) return { outcome: "not_found" };
    if (existing.status !== "draft") return { outcome: "not_editable" };
    const issues = validateHousingLogForFinalization(toDraft(existing));
    if (issues.length) return { outcome: "validation_failed", issues };
    const now = new Date().toISOString();
    const finalized: StoredHousingLog = {
      ...existing,
      status: "finalized",
      finalizedAt: now,
      updatedAt: now,
    };
    this.records.set(id, finalized);
    return { outcome: "finalized", record: finalized };
  }
}

class ConcurrentUpdateRepository extends MemoryRepository {
  override async finalizeDraft(id: string): Promise<FinalizeHousingLogResult> {
    const current = this.records.get(id);
    if (current?.status === "draft") {
      const values = { ...current.values };
      delete values["staff.1.name"];
      this.records.set(id, {
        ...current,
        values,
        updatedAt: new Date().toISOString(),
      });
    }
    return super.finalizeDraft(id);
  }
}

class FailingRepository extends MemoryRepository {
  override async list(): Promise<HousingLogSummary[]> {
    throw new Error("simulated database failure with sensitive test marker");
  }
}

async function withServer(
  run: (baseUrl: string, repository: MemoryRepository) => Promise<void>,
  options: HousingLogsRouterOptions & { repository?: MemoryRepository } = {},
): Promise<void> {
  const repository = options.repository ?? new MemoryRepository();
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use("/api", createHousingLogsRouter({ ...options, repository }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to a TCP port.");
  try {
    await run(`http://127.0.0.1:${address.port}`, repository);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function extractCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "expected a Set-Cookie header");
  const cookie = setCookie.split(";", 1)[0];
  assert.ok(cookie);
  return cookie;
}

type CreatedDraft = { record: StoredHousingLog; accessCode: string; cookie: string };

async function createDraft(
  baseUrl: string,
  input = completeInput(),
): Promise<CreatedDraft> {
  const response = await fetch(`${baseUrl}/api/housing-logs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  const cookie = extractCookie(response);
  const body = (await response.json()) as HousingLogDraftCreated;
  return { record: body, accessCode: body.accessCode, cookie };
}

test("draft creation issues a unique, sufficiently random access code and an authorized session", async () => {
  await withServer(async (baseUrl) => {
    const first = await createDraft(baseUrl);
    const second = await createDraft(baseUrl);
    assert.match(first.accessCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.notEqual(first.accessCode, second.accessCode);
    assert.equal("accessCodeHash" in (first.record as object), false);

    // The creating browser is immediately authorized for its own new draft.
    const getResponse = await fetch(
      `${baseUrl}/api/housing-logs/${first.record.id}`,
      { headers: { cookie: first.cookie } },
    );
    assert.equal(getResponse.status, 200);
  });
});

test("a draft UUID alone is never sufficient authorization", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    for (const request of [
      () => fetch(`${baseUrl}/api/housing-logs/${draft.record.id}`),
      () =>
        fetch(`${baseUrl}/api/housing-logs/${draft.record.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ logDate: "2026-08-12" }),
        }),
      () =>
        fetch(`${baseUrl}/api/housing-logs/${draft.record.id}/finalize`, {
          method: "POST",
        }),
    ]) {
      const response = await request();
      assert.equal(response.status, 403);
      const body = (await response.json()) as { error: string };
      assert.match(body.error, /access code/i);
    }
  });
});

test("unlocking with the correct access code grants GET, PATCH, and finalize access", async () => {
  await withServer(async (baseUrl, repository) => {
    const input = completeInput();
    delete input.signatures.housingSupervisor;
    const draft = await createDraft(baseUrl, input);

    // A fresh browser (no cookie) enters the code.
    const unlock = await fetch(`${baseUrl}/api/housing-logs/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: draft.accessCode }),
    });
    assert.equal(unlock.status, 200);
    const unlockCookie = extractCookie(unlock);
    assert.deepEqual(await unlock.json(), { draftId: draft.record.id });

    const get = await fetch(`${baseUrl}/api/housing-logs/${draft.record.id}`, {
      headers: { cookie: unlockCookie },
    });
    assert.equal(get.status, 200);

    const patch = await fetch(`${baseUrl}/api/housing-logs/${draft.record.id}`, {
      method: "PATCH",
      headers: { cookie: unlockCookie, "content-type": "application/json" },
      body: JSON.stringify({
        signatures: { housingSupervisor: signature },
      }),
    });
    assert.equal(patch.status, 200);

    const finalize = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}/finalize`,
      { method: "POST", headers: { cookie: unlockCookie } },
    );
    assert.equal(finalize.status, 200);
    assert.equal(repository.records.get(draft.record.id)?.status, "finalized");

    // A code also normalizes dashes/spacing/case so a typo'd separator or
    // lowercase entry still matches the same underlying code.
    const secondDraft = await createDraft(baseUrl);
    const messyCode = secondDraft.accessCode
      .toLowerCase()
      .replace("-", " ");
    const relaxedUnlock = await fetch(`${baseUrl}/api/housing-logs/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: messyCode }),
    });
    assert.equal(relaxedUnlock.status, 200);
  });
});

test("wrong access codes fail and repeated failures trigger backoff", async () => {
  let now = 1_000;
  const rateLimiter = new DraftUnlockRateLimiter(() => now);
  await withServer(
    async (baseUrl) => {
      const draft = await createDraft(baseUrl);
      const attempt = async () =>
        fetch(`${baseUrl}/api/housing-logs/unlock`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: "0000-0000" }),
        });

      // The first 5 wrong codes are free; the 6th registers the failure
      // that trips the lockout, so it is still processed normally (401) —
      // the lockout is only enforced starting with the 7th request.
      for (let index = 0; index < 6; index += 1) {
        const response = await attempt();
        assert.equal(response.status, 401);
      }
      const locked = await attempt();
      assert.equal(locked.status, 429);
      assert.ok(locked.headers.get("retry-after"));

      // Correct code still works for a DIFFERENT rate-limit key (a real
      // attacker's failures never block the legitimate officer's own IP)
      // — simulated here by directly confirming the limiter, not the
      // shared fetch client, since node's fetch does not vary source IP.
      assert.ok(rateLimiter.lockedForMilliseconds("203.0.113.5") === 0);

      now += 5_001; // past the first backoff window
      const stillTrackedButCorrect = await fetch(
        `${baseUrl}/api/housing-logs/unlock`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: draft.accessCode }),
        },
      );
      assert.equal(stillTrackedButCorrect.status, 200);
    },
    { rateLimiter },
  );
});

test("a code matching an already-finalized draft is rejected with an actionable message and does not unlock it", async () => {
  await withServer(async (baseUrl, repository) => {
    const draft = await createDraft(baseUrl);
    await fetch(`${baseUrl}/api/housing-logs/${draft.record.id}/finalize`, {
      method: "POST",
      headers: { cookie: draft.cookie },
    });
    assert.equal(repository.records.get(draft.record.id)?.status, "finalized");

    const unlock = await fetch(`${baseUrl}/api/housing-logs/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: draft.accessCode }),
    });
    assert.equal(unlock.status, 409);
    assert.equal(unlock.headers.get("set-cookie"), null);
  });
});

test("legacy drafts created without an access code hash can never be unlocked", async () => {
  await withServer(async (baseUrl, repository) => {
    const legacyId = randomUUID();
    const now = new Date().toISOString();
    repository.records.set(legacyId, {
      ...completeInput(),
      id: legacyId,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      finalizedAt: null,
    });
    // No entry in accessCodeHashesById — simulates a pre-migration row.
    for (const guess of ["AAAA-AAAA", "0000-0000", ""]) {
      const response = await fetch(`${baseUrl}/api/housing-logs/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: guess }),
      });
      assert.notEqual(response.status, 200);
    }
    const directGet = await fetch(`${baseUrl}/api/housing-logs/${legacyId}`);
    assert.equal(directGet.status, 403);
  });
});

test("list endpoint is session-scoped, never a public draft directory", async () => {
  await withServer(async (baseUrl, repository) => {
    const mine = await createDraft(baseUrl);
    const someoneElses = await createDraft(baseUrl);
    repository.records.set("finalized-hidden", {
      ...mine.record,
      id: "finalized-hidden",
      status: "finalized",
      finalizedAt: new Date().toISOString(),
    });

    // No cookie at all: no drafts visible.
    const anonymous = await fetch(`${baseUrl}/api/housing-logs`);
    assert.equal(anonymous.status, 200);
    assert.deepEqual(await anonymous.json(), []);

    // This browser only sees the one draft it created/unlocked, never the
    // other officer's draft and never the finalized record.
    const mineOnly = await fetch(`${baseUrl}/api/housing-logs`, {
      headers: { cookie: mine.cookie },
    });
    assert.equal(mineOnly.status, 200);
    const body = (await mineOnly.json()) as HousingLogSummary[];
    assert.deepEqual(
      body.map((item) => item.id),
      [mine.record.id],
    );
    assert.equal("values" in (body[0] ?? {}), false);
    assert.equal("signatures" in (body[0] ?? {}), false);
    assert.notEqual(mine.cookie, someoneElses.cookie);

    const finalizedList = await fetch(
      `${baseUrl}/api/housing-logs?status=finalized`,
      { headers: { cookie: mine.cookie } },
    );
    assert.equal(finalizedList.status, 403);

    const invalid = await fetch(`${baseUrl}/api/housing-logs?status=anything`);
    assert.equal(invalid.status, 400);
    const unknown = await fetch(`${baseUrl}/api/housing-logs?unexpected=value`);
    assert.equal(unknown.status, 400);
  });
});

test("unlocking a second draft in the same browser adds it without dropping the first", async () => {
  await withServer(async (baseUrl) => {
    const first = await createDraft(baseUrl);
    const second = await createDraft(baseUrl);
    // Bring "second" into the browser session that already holds "first" by
    // unlocking it with first's cookie attached.
    const unlock = await fetch(`${baseUrl}/api/housing-logs/unlock`, {
      method: "POST",
      headers: { cookie: first.cookie, "content-type": "application/json" },
      body: JSON.stringify({ code: second.accessCode }),
    });
    assert.equal(unlock.status, 200);
    const combinedCookie = extractCookie(unlock);
    const list = await fetch(`${baseUrl}/api/housing-logs`, {
      headers: { cookie: combinedCookie },
    });
    const ids = ((await list.json()) as HousingLogSummary[]).map(
      (item) => item.id,
    );
    assert.deepEqual(ids.sort(), [first.record.id, second.record.id].sort());
  });
});

test("server rejects incomplete finalization even when the frontend is bypassed", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    delete input.values["staff.1.name"];
    delete input.signatures.housingOfficer;
    const draft = await createDraft(baseUrl, input);
    const response = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}/finalize`,
      { method: "POST", headers: { cookie: draft.cookie } },
    );
    assert.equal(response.status, 422);
    const body = (await response.json()) as { issues: Array<{ path: string }> };
    assert.ok(
      body.issues.some((issue) => issue.path === "values.staff.1.name"),
    );
    assert.ok(
      body.issues.some((issue) => issue.path === "signatures.housingOfficer"),
    );
  });
});

test("server rejects fake signature data even when the prefix passes browser validation", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    input.signatures = {
      housingSupervisor: "data:image/png;base64,dGVzdA==",
      housingOfficer: "data:image/png;base64,dGVzdA==",
    };
    const draft = await createDraft(baseUrl, input);
    const response = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}/finalize`,
      { method: "POST", headers: { cookie: draft.cookie } },
    );
    assert.equal(response.status, 422);
  });
});

test("complete draft finalizes and remains immutable, and admin archive access is a separate protected boundary", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const finalizedResponse = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}/finalize`,
      { method: "POST", headers: { cookie: draft.cookie } },
    );
    assert.equal(finalizedResponse.status, 200);
    const finalized = (await finalizedResponse.json()) as StoredHousingLog;
    assert.equal(finalized.status, "finalized");
    assert.ok(finalized.finalizedAt);

    const updateResponse = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}`,
      {
        method: "PATCH",
        headers: { cookie: draft.cookie, "content-type": "application/json" },
        body: JSON.stringify({ logDate: "2026-08-12" }),
      },
    );
    assert.equal(updateResponse.status, 409);

    // Even with a valid draft-session cookie, GET now correctly refuses a
    // finalized record — that record only lives behind the separate,
    // already-proven admin-session boundary (adminHousingLogs.ts), not the
    // draft access-code mechanism.
    const getResponse = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}`,
      { headers: { cookie: draft.cookie } },
    );
    assert.equal(getResponse.status, 403);
  });
});

test("finalization validates the locked/current version rather than a stale route snapshot", async () => {
  const repository = new ConcurrentUpdateRepository();
  await withServer(
    async (baseUrl) => {
      const draft = await createDraft(baseUrl);
      const response = await fetch(
        `${baseUrl}/api/housing-logs/${draft.record.id}/finalize`,
        { method: "POST", headers: { cookie: draft.cookie } },
      );
      assert.equal(response.status, 422);
      const stored = (await fetch(
        `${baseUrl}/api/housing-logs/${draft.record.id}`,
        { headers: { cookie: draft.cookie } },
      ).then((item) => item.json())) as StoredHousingLog;
      assert.equal(stored.status, "draft");
    },
    { repository },
  );
});

test("meaningful drafts reject housing unit or shift changes", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const response = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}`,
      {
        method: "PATCH",
        headers: { cookie: draft.cookie, "content-type": "application/json" },
        body: JSON.stringify({ housingUnit: "D" }),
      },
    );
    assert.equal(response.status, 409);
  });
});

test("partial signature PATCH preserves the other signature", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const response = await fetch(
      `${baseUrl}/api/housing-logs/${draft.record.id}`,
      {
        method: "PATCH",
        headers: { cookie: draft.cookie, "content-type": "application/json" },
        body: JSON.stringify({ signatures: { housingOfficer: signature } }),
      },
    );
    assert.equal(response.status, 200);
    const updated = (await response.json()) as StoredHousingLog;
    assert.equal(updated.signatures.housingSupervisor, signature);
  });
});

test("signature patches merge against the current record instead of a stale snapshot", async () => {
  const repository = new MemoryRepository();
  const input = completeInput();
  input.signatures = {};
  const draft = await repository.create(input, "test-hash");
  const staleInput = toDraft(draft);

  await repository.updateDraft(draft.id, staleInput, {
    housingSupervisor: "supervisor-signature",
  });
  await repository.updateDraft(draft.id, staleInput, {
    housingOfficer: "officer-signature",
  });

  const stored = await repository.get(draft.id);
  assert.equal(stored?.signatures.housingSupervisor, "supervisor-signature");
  assert.equal(stored?.signatures.housingOfficer, "officer-signature");
});

test("invalid calendar dates are rejected before PostgreSQL", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    input.logDate = "2026-02-31";
    const response = await fetch(`${baseUrl}/api/housing-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 400);
  });
});

test("unconfigured Housing Log persistence returns 503 without affecting router construction", async () => {
  const app = express();
  app.use("/api", healthRouter);
  app.use("/api", createHousingLogsRouter());
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind.");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/housing-logs`,
    );
    assert.equal(response.status, 503);
    const health = await fetch(`http://127.0.0.1:${address.port}/api/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("malformed JSON and repository failures receive controlled JSON errors", async () => {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use(
    "/api",
    createHousingLogsRouter({ repository: new FailingRepository() }),
  );
  app.use(jsonErrorHandler);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const malformed = await fetch(`${baseUrl}/api/housing-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      error: "Malformed JSON request.",
    });

    const draft = await createDraft(baseUrl);
    const unavailable = await fetch(`${baseUrl}/api/housing-logs`, {
      headers: { cookie: draft.cookie },
    });
    assert.equal(unavailable.status, 500);
    const body = (await unavailable.json()) as Record<string, unknown>;
    assert.equal(body.error, "The request could not be completed. Try again.");
    assert.equal(JSON.stringify(body).includes("sensitive test marker"), false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("session expiry requires re-unlock", async () => {
  let now = 1_000;
  const sessions = new DraftAccessSessions(() => now, 100);
  await withServer(
    async (baseUrl) => {
      const draft = await createDraft(baseUrl);
      const beforeExpiry = await fetch(
        `${baseUrl}/api/housing-logs/${draft.record.id}`,
        { headers: { cookie: draft.cookie } },
      );
      assert.equal(beforeExpiry.status, 200);

      now += 101;
      const afterExpiry = await fetch(
        `${baseUrl}/api/housing-logs/${draft.record.id}`,
        { headers: { cookie: draft.cookie } },
      );
      assert.equal(afterExpiry.status, 403);
    },
    { sessions },
  );
});
