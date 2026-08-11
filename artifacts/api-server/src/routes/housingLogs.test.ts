import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import {
  fieldsForConfig,
  getHousingLogConfig,
  type HousingLogDraftInput,
  type HousingLogValue,
  type StoredHousingLog,
} from "@workspace/housing-log";
import { createHousingLogsRouter } from "./housingLogs";
import type { HousingLogListFilters, HousingLogRepository } from "../housingLogs/repository";

const signature = "data:image/png;base64,dGVzdA==";

function completeInput(): HousingLogDraftInput {
  const config = getHousingLogConfig("A/H", "1");
  const values: Record<string, HousingLogValue> = {};
  for (const item of fieldsForConfig(config)) {
    values[item.key] = item.inputType === "number" ? 1
      : item.inputType === "time" ? "08:30"
      : item.inputType === "choice" ? (item.options?.[0] ?? "Yes")
      : "Test value";
  }
  return {
    logDate: "2026-08-11",
    housingUnit: "A/H",
    shift: "1",
    templateVersion: config.templateVersion,
    values,
    events: [],
    signatures: { housingSupervisor: signature, housingOfficer: signature },
  };
}

class MemoryRepository implements HousingLogRepository {
  records = new Map<string, StoredHousingLog>();

  async create(input: HousingLogDraftInput): Promise<StoredHousingLog> {
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

  async list(_filters: HousingLogListFilters): Promise<StoredHousingLog[]> {
    return [...this.records.values()];
  }

  async updateDraft(id: string, input: HousingLogDraftInput): Promise<StoredHousingLog | undefined> {
    const existing = this.records.get(id);
    if (!existing || existing.status !== "draft") return undefined;
    const updated = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.records.set(id, updated);
    return updated;
  }

  async finalizeDraft(id: string): Promise<StoredHousingLog | undefined> {
    const existing = this.records.get(id);
    if (!existing || existing.status !== "draft") return undefined;
    const now = new Date().toISOString();
    const finalized: StoredHousingLog = { ...existing, status: "finalized", finalizedAt: now, updatedAt: now };
    this.records.set(id, finalized);
    return finalized;
  }
}

async function withServer(run: (baseUrl: string, repository: MemoryRepository) => Promise<void>): Promise<void> {
  const repository = new MemoryRepository();
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createHousingLogsRouter(repository));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
  try {
    await run(`http://127.0.0.1:${address.port}`, repository);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("server rejects incomplete finalization even when the frontend is bypassed", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    delete input.values["staff.1.name"];
    delete input.signatures.housingOfficer;
    const created = await fetch(`${baseUrl}/api/housing-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(created.status, 201);
    const draft = await created.json() as StoredHousingLog;
    const finalized = await fetch(`${baseUrl}/api/housing-logs/${draft.id}/finalize`, { method: "POST" });
    assert.equal(finalized.status, 422);
    const body = await finalized.json() as { issues: Array<{ path: string }> };
    assert.ok(body.issues.some((issue) => issue.path === "values.staff.1.name"));
    assert.ok(body.issues.some((issue) => issue.path === "signatures.housingOfficer"));
  });
});

test("complete draft finalizes and a finalized record cannot become a draft", async () => {
  await withServer(async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/housing-logs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completeInput()),
    });
    const draft = await created.json() as StoredHousingLog;
    const finalizedResponse = await fetch(`${baseUrl}/api/housing-logs/${draft.id}/finalize`, { method: "POST" });
    assert.equal(finalizedResponse.status, 200);
    const finalized = await finalizedResponse.json() as StoredHousingLog;
    assert.equal(finalized.status, "finalized");
    assert.ok(finalized.finalizedAt);

    const updateResponse = await fetch(`${baseUrl}/api/housing-logs/${draft.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logDate: "2026-08-12" }),
    });
    assert.equal(updateResponse.status, 409);
    const fetched = await fetch(`${baseUrl}/api/housing-logs/${draft.id}`);
    assert.equal(((await fetched.json()) as StoredHousingLog).status, "finalized");
  });
});
