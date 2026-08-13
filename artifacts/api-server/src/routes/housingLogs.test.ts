import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import {
  fieldsForConfig,
  getHousingLogConfig,
  housingLogCanonicalFingerprint,
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
import { createAdminHousingLogsRouter } from "./adminHousingLogs";
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
 * first, compare canonical content, then validate, then persist" contract
 * as the real `PostgresHousingLogRepository.finalizeSubmission`:
 * - same submissionId + identical canonical content -> the original record
 * - same submissionId + different canonical content -> a conflict, never a
 *   silent overwrite or a fabricated second record
 * - two different submissionIds always create two records even with
 *   identical content (duplicates are an admin-visible fact, not something
 *   silently collapsed)
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
      if (existing) {
        const same =
          housingLogCanonicalFingerprint(existing) ===
          housingLogCanonicalFingerprint(input);
        return same
          ? { outcome: "finalized", record: existing }
          : { outcome: "submission_conflict", existing };
      }
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

test("same submissionId with a changed field value returns a 409 conflict, not the stale record", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const input = completeInput();
    const first = await finalize(baseUrl, finalizeInput(input, submissionId));
    assert.equal(first.status, 200);
    const firstId = ((await first.json()) as { id: string }).id;

    const edited = { ...input, values: { ...input.values, "staff.1.name": "A changed name" } };
    const retry = await finalize(baseUrl, finalizeInput(edited, submissionId));
    assert.equal(retry.status, 409);
    const body = (await retry.json()) as { error: string };
    assert.match(body.error, /already finalized/i);
    assert.match(body.error, /changed since/i);
    assert.match(body.error, /nothing on this device was cleared/i);

    // The original record is untouched — no overwrite, no second record.
    assert.equal(repository.records.size, 1);
    assert.equal(repository.records.get(firstId)?.values["staff.1.name"], input.values["staff.1.name"]);
  });
});

test("same submissionId with an added event returns a 409 conflict", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const input = completeInput();
    await finalize(baseUrl, finalizeInput(input, submissionId));

    const withExtraEvent = {
      ...input,
      events: [
        ...input.events,
        { id: randomUUID(), time: "22:15", activity: "Late addition", initials: "AB" },
      ],
    };
    const retry = await finalize(baseUrl, finalizeInput(withExtraEvent, submissionId));
    assert.equal(retry.status, 409);
    assert.equal(repository.records.size, 1);
  });
});

test("same submissionId with reordered events returns a 409 conflict — entered order is part of the fingerprint", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const withEvents = {
      ...completeInput(),
      events: [
        { id: "e1", time: "20:00", activity: "First", initials: "AB" },
        { id: "e2", time: "20:05", activity: "Second", initials: "AB" },
      ],
    };
    await finalize(baseUrl, finalizeInput(withEvents, submissionId));

    const reordered = { ...withEvents, events: [...withEvents.events].reverse() };
    const retry = await finalize(baseUrl, finalizeInput(reordered, submissionId));
    assert.equal(retry.status, 409);
    assert.equal(repository.records.size, 1);
  });
});

test("same submissionId with a changed signature returns a 409 conflict", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const input = completeInput();
    await finalize(baseUrl, finalizeInput(input, submissionId));

    const resigned = {
      ...input,
      signatures: {
        ...input.signatures,
        // A different (still well-formed) signature image — genuinely
        // different bytes, not a re-validation concern for this test.
        housingSupervisor: signatureDataUrl("valid", 2),
      },
    };
    const retry = await finalize(baseUrl, finalizeInput(resigned, submissionId));
    assert.equal(retry.status, 409);
    assert.equal(repository.records.size, 1);
  });
});

test("same submissionId with genuinely identical content (different key order) is still a safe idempotent replay", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const input = completeInput();
    const first = await finalize(baseUrl, finalizeInput(input, submissionId));
    assert.equal(first.status, 200);

    // Same values, reconstructed with different key insertion order — must
    // still fingerprint as identical.
    const reorderedValues = Object.fromEntries(
      Object.entries(input.values).reverse(),
    );
    const retry = await finalize(
      baseUrl,
      finalizeInput({ ...input, values: reorderedValues }, submissionId),
    );
    assert.equal(retry.status, 200);
    assert.equal(repository.records.size, 1);
  });
});

test("a concurrent identical retry still produces exactly one finalized row", async () => {
  await withServer(async (baseUrl, repository) => {
    const submissionId = randomUUID();
    const input = finalizeInput(completeInput(), submissionId);
    const [first, second] = await Promise.all([
      finalize(baseUrl, input),
      finalize(baseUrl, input),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const firstId = ((await first.json()) as { id: string }).id;
    const secondId = ((await second.json()) as { id: string }).id;
    assert.equal(firstId, secondId);
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

test("an officer with no admin session cannot reach any admin-only Housing Log route", async () => {
  const repository = new MemoryRepository();
  const finalized = await repository.finalizeSubmission(
    completeInput(),
    randomUUID(),
  );
  assert.equal(finalized.outcome, "finalized");
  const finalizedId =
    finalized.outcome === "finalized" ? finalized.record.id : "";

  const app = express();
  app.use(express.json({ limit: "3mb" }));
  // The full mounted surface, exactly as production wires it: both the
  // officer router (one route) and the admin router (archive/downloads/
  // packages), sharing the same repository.
  app.use("/api", createHousingLogsRouter({ repository }));
  app.use(
    "/api",
    createAdminHousingLogsRouter({ repository, passwordProvider: () => "admin-secret" }),
  );
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to a TCP port.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const archive = await fetch(`${baseUrl}/api/admin/housing-logs/archive`);
    assert.equal(archive.status, 401);

    const excel = await fetch(
      `${baseUrl}/api/admin/housing-logs/${finalizedId}/excel`,
    );
    assert.equal(excel.status, 401);

    const zip = await fetch(
      `${baseUrl}/api/admin/housing-logs/shift-package/2026-08-11/1`,
    );
    assert.equal(zip.status, 401);

    const deliverySettings = await fetch(
      `${baseUrl}/api/admin/housing-logs/delivery-settings`,
    );
    assert.equal(deliverySettings.status, 401);

    // The officer-facing finalized record itself is never reachable by id.
    const officerGet = await fetch(`${baseUrl}/api/housing-logs/${finalizedId}`);
    assert.equal(officerGet.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
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
