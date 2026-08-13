import assert from "node:assert/strict";
import test from "node:test";
import {
  emailHousingLogShiftPackage,
  HousingLogAdminApiError,
} from "./housingLogAdminApi";

test("manual-email client posts only after explicit invocation and returns the sanitized result", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ input: String(input), init });
      return Response.json({
        attemptId: "attempt-1",
        logDate: "2026-08-12",
        shift: "2",
        packageStatus: "INCOMPLETE",
        recipientCount: 2,
        includedLogCount: 7,
        missingHousingUnits: ["C"],
        duplicateHousingUnits: [],
        sentAt: "2026-08-12T22:00:00.000Z",
      });
    };

    assert.equal(calls.length, 0);
    const result = await emailHousingLogShiftPackage("2026-08-12", "2");
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.input,
      "/api/admin/housing-logs/shift-package/2026-08-12/2/send",
    );
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(calls[0]!.init?.credentials, "same-origin");
    assert.equal(result.packageStatus, "INCOMPLETE");
    assert.equal(result.recipientCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual-email client preserves controlled failure status for login and retry UI", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { error: "Housing Log admin login required." },
        { status: 401 },
      );
    await assert.rejects(
      emailHousingLogShiftPackage("2026-08-12", "2"),
      (error: unknown) =>
        error instanceof HousingLogAdminApiError &&
        error.status === 401 &&
        error.message === "Housing Log admin login required.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
