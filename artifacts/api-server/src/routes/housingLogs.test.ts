import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import {
  fieldsForConfig,
  getHousingLogConfig,
  type HousingLogDraftInput,
  type HousingLogFinalizeInput,
  type HousingLogValue,
  type StoredHousingLog,
  type ValidationIssue,
} from "@workspace/housing-log";
import { signatureDataUrl } from "../housingLogs/signatureTestUtils";
import {
  type FinalizeSubmissionResult,
  type HousingLogRepository,
} from "../housingLogs/repository";
import { validateHousingLogForFinalization } from "../housingLogs/signatureValidation";
import { createHousingLogsRouter } from "./housingLogs";
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

function finalizeInput(
  input: HousingLogDraftInput = completeInput(),
  submissionId: string = randomUUID(),
): HousingLogFinalizeInput {
  return { ...input, submissionId };
}

/**
 * A minimal in-memory stand-in exercising the same "check submissionId
 * first, then validate, then persist" contract as the real
 * `PostgresHousingLogRepository.finalizeSubmission` — a retried call with
 * the same submissionId returns the original result rather than creating a
 * second record, but two different submissionIds always create two records
 * even with identical content (duplicates are an admin-visible fact, not
 * something silently collapsed).
 */
class MemoryRepository implements HousingLogRepository {
  records = new Map<string, StoredHousingLog>();
  bySubmissionId = new Map<string, string>();
  validate: (input: HousingLogDraftInput) => ValidationIssue[] =
    validateHousingLogForFinalization;

  async get(id: string): Promise<StoredHousingLog | undefined> {
    return this.records.get(id);
  }

  async listFinalizedArchive() {
    return [];
  }

  async listFinalizedForShift(): Promise<StoredHousingLog[]> {
    return [];
  }

  async finalizeSubmission(
    input: HousingLogDraftInput,
    submissionId: string,
  ): Promise<FinalizeSubmissionResult> {
    const existingId = this.bySubmissionId.get(submissionId);
    if (existingId) {
      const existing = this.records.get(existingId);
      if (existing) return { outcome: "finalized", record: existing };
    }
    const issues = this.validate(input);
    if (issues.length) return { outcome: "validation_failed", issues };
    const now = new Date().toISOString();
    const record: StoredHousingLog = {
      ...input,
      id: randomUUID(),
      status: "finalized",
      createdAt: now,
      updatedAt: now,
      finalizedAt: now,
    };
    this.records.set(record.id, record);
    this.bySubmissionId.set(submissionId, record.id);
    return { outcome: "finalized", record };
  }
}

class FailingRepository extends MemoryRepository {
  override async finalizeSubmission(): Promise<FinalizeSubmissionResult> {
    throw new Error("simulated database failure with sensitive test marker");
  }
}

async function withServer(
  run: (baseUrl: string, repository: MemoryRepository) => Promise<void>,
  repository: MemoryRepository = new MemoryRepository(),
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use("/api", createHousingLogsRouter({ repository }));
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

function finalize(baseUrl: string, input: HousingLogFinalizeInput) {
  return fetch(`${baseUrl}/api/housing-logs/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

test("a complete submission finalizes directly — no draft is ever created", async () => {
  await withServer(async (baseUrl, repository) => {
    const response = await finalize(baseUrl, finalizeInput());
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      id: string;
      finalizedAt: string;
    };
    assert.ok(body.id);
    assert.ok(body.finalizedAt);
    assert.equal(repository.records.size, 1);
    const stored = repository.records.get(body.id);
    assert.equal(stored?.status, "finalized");
  });
});

test("server rejects incomplete finalization even when the frontend is bypassed", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    delete input.values["staff.1.name"];
    delete input.signatures.housingOfficer;
    const response = await finalize(baseUrl, finalizeInput(input));
    assert.equal(response.status, 422);
    const body = (await response.json()) as {
      issues: Array<{ path: string }>;
    };
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
    const response = await finalize(baseUrl, finalizeInput(input));
    assert.equal(response.status, 422);
  });
});

test("a missing or too-short submissionId is rejected before any persistence", async () => {
  await withServer(async (baseUrl, repository) => {
    const withoutId = await fetch(`${baseUrl}/api/housing-logs/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(completeInput()),
    });
    assert.equal(withoutId.status, 400);

    const tooShort = await finalize(baseUrl, finalizeInput(undefined, "abc"));
    assert.equal(tooShort.status, 400);
    assert.equal(repository.records.size, 0);
  });
});

test("retrying the same submissionId is idempotent — no duplicate finalized record", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const input = finalizeInput(completeInput(), submissionId);

    const first = await finalize(baseUrl, input);
    assert.equal(first.status, 200);
    const firstBody = (await first.json()) as { id: string };

    // Simulates a browser retry after a network failure/timeout: the exact
    // same submissionId is sent again.
    const retry = await finalize(baseUrl, input);
    assert.equal(retry.status, 200);
    const retryBody = (await retry.json()) as { id: string };

    assert.equal(retryBody.id, firstBody.id);
    assert.equal(repository.records.size, 1);
  });
});

test("two different submissionIds with identical content create two separate records", async () => {
  await withServer(async (baseUrl, repository) => {
    const input = completeInput();
    const first = await finalize(baseUrl, finalizeInput(input));
    const second = await finalize(baseUrl, finalizeInput(input));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstId = ((await first.json()) as { id: string }).id;
    const secondId = ((await second.json()) as { id: string }).id;
    assert.notEqual(firstId, secondId);
    // Legitimate duplicates are preserved for admin to see, never silently
    // collapsed by content alone.
    assert.equal(repository.records.size, 2);
  });
});

test("there is no officer-facing draft GET, list, or unlock endpoint", async () => {
  await withServer(async (baseUrl) => {
    const someId = randomUUID();
    const get = await fetch(`${baseUrl}/api/housing-logs/${someId}`);
    assert.equal(get.status, 404);

    const list = await fetch(`${baseUrl}/api/housing-logs`);
    assert.equal(list.status, 404);

    const unlock = await fetch(`${baseUrl}/api/housing-logs/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "AAAA-AAAA" }),
    });
    assert.equal(unlock.status, 404);

    const patch = await fetch(`${baseUrl}/api/housing-logs/${someId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(patch.status, 404);
  });
});

test("invalid calendar dates are rejected before persistence", async () => {
  await withServer(async (baseUrl, repository) => {
    const input = completeInput();
    input.logDate = "2026-02-31";
    const response = await finalize(baseUrl, finalizeInput(input));
    assert.equal(response.status, 400);
    assert.equal(repository.records.size, 0);
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
      `http://127.0.0.1:${address.port}/api/housing-logs/finalize`,
      { method: "POST" },
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
    const malformed = await fetch(`${baseUrl}/api/housing-logs/finalize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), {
      error: "Malformed JSON request.",
    });

    const failure = await finalize(baseUrl, finalizeInput());
    assert.equal(failure.status, 500);
    const body = (await failure.json()) as Record<string, unknown>;
    assert.equal(body.error, "The request could not be completed. Try again.");
    assert.equal(JSON.stringify(body).includes("sensitive test marker"), false);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
