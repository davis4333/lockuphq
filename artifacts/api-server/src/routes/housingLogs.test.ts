import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import {
  fieldsForConfig,
  getHousingLogConfig,
  prepareHousingLog,
  type HousingLogDraftInput,
  type HousingLogListFilters,
  type HousingLogSignatures,
  type HousingLogSummary,
  type HousingLogValue,
  type StoredHousingLog,
} from "@workspace/housing-log";
import { signatureDataUrl } from "../housingLogs/signatureTestUtils";
import { validateHousingLogForFinalization } from "../housingLogs/signatureValidation";
import {
  type FinalizeHousingLogResult,
  type HousingLogRepository,
} from "../housingLogs/repository";
import { createHousingLogsRouter } from "./housingLogs";
import { jsonErrorHandler } from "../app";
import healthRouter from "./health";

const signature = signatureDataUrl("valid");

function completeInput(
  unit: HousingLogDraftInput["housingUnit"] = "A/H",
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

  async create(rawInput: HousingLogDraftInput): Promise<StoredHousingLog> {
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
    return record;
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
  repository: MemoryRepository = new MemoryRepository(),
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use("/api", createHousingLogsRouter(repository));
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

async function createDraft(
  baseUrl: string,
  input = completeInput(),
): Promise<StoredHousingLog> {
  const response = await fetch(`${baseUrl}/api/housing-logs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  return response.json() as Promise<StoredHousingLog>;
}

test("server rejects incomplete finalization even when the frontend is bypassed", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    delete input.values["staff.1.name"];
    delete input.signatures.housingOfficer;
    const draft = await createDraft(baseUrl, input);
    const response = await fetch(
      `${baseUrl}/api/housing-logs/${draft.id}/finalize`,
      { method: "POST" },
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
      `${baseUrl}/api/housing-logs/${draft.id}/finalize`,
      { method: "POST" },
    );
    assert.equal(response.status, 422);
  });
});

test("complete draft finalizes and remains immutable", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const finalizedResponse = await fetch(
      `${baseUrl}/api/housing-logs/${draft.id}/finalize`,
      { method: "POST" },
    );
    assert.equal(finalizedResponse.status, 200);
    const finalized = (await finalizedResponse.json()) as StoredHousingLog;
    assert.equal(finalized.status, "finalized");
    assert.ok(finalized.finalizedAt);

    const updateResponse = await fetch(
      `${baseUrl}/api/housing-logs/${draft.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logDate: "2026-08-12" }),
      },
    );
    assert.equal(updateResponse.status, 409);
  });
});

test("finalization validates the locked/current version rather than a stale route snapshot", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const response = await fetch(
      `${baseUrl}/api/housing-logs/${draft.id}/finalize`,
      { method: "POST" },
    );
    assert.equal(response.status, 422);
    const stored = (await fetch(`${baseUrl}/api/housing-logs/${draft.id}`).then(
      (item) => item.json(),
    )) as StoredHousingLog;
    assert.equal(stored.status, "draft");
  }, new ConcurrentUpdateRepository());
});

test("meaningful drafts reject housing unit or shift changes", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const response = await fetch(`${baseUrl}/api/housing-logs/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ housingUnit: "D" }),
    });
    assert.equal(response.status, 409);
  });
});

test("partial signature PATCH preserves the other signature", async () => {
  await withServer(async (baseUrl) => {
    const draft = await createDraft(baseUrl);
    const response = await fetch(`${baseUrl}/api/housing-logs/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signatures: { housingOfficer: signature } }),
    });
    assert.equal(response.status, 200);
    const updated = (await response.json()) as StoredHousingLog;
    assert.equal(updated.signatures.housingSupervisor, signature);
  });
});

test("signature patches merge against the current record instead of a stale snapshot", async () => {
  const repository = new MemoryRepository();
  const input = completeInput();
  input.signatures = {};
  const draft = await repository.create(input);
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

test("list endpoint returns lightweight metadata and rejects invalid filters", async () => {
  await withServer(async (baseUrl) => {
    await createDraft(baseUrl);
    const valid = await fetch(`${baseUrl}/api/housing-logs?status=draft`);
    assert.equal(valid.status, 200);
    const body = (await valid.json()) as Array<Record<string, unknown>>;
    assert.equal(body.length, 1);
    assert.equal("values" in (body[0] ?? {}), false);
    assert.equal("signatures" in (body[0] ?? {}), false);

    const invalid = await fetch(`${baseUrl}/api/housing-logs?status=anything`);
    assert.equal(invalid.status, 400);
    const unknown = await fetch(`${baseUrl}/api/housing-logs?unexpected=value`);
    assert.equal(unknown.status, 400);
  });
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
  app.use("/api", createHousingLogsRouter(new FailingRepository()));
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

    const unavailable = await fetch(`${baseUrl}/api/housing-logs`);
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
