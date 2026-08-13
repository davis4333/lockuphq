import assert from "node:assert/strict";
import test from "node:test";
import type { HousingLogDraftInput } from "@workspace/housing-log";
import { HousingLogApiError, previewHousingLogXlsx } from "./housingLogApi";

const samplePayload: HousingLogDraftInput = {
  logDate: "2026-08-13",
  housingUnit: "C",
  shift: "2",
  templateVersion: "2026-04-27",
  values: { "staff.1.name": "E. Delacroix" },
  events: [],
  signatures: {},
};

test("previewHousingLogXlsx posts the current payload and returns the file as a Blob with the server's filename", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      calls.push({ input: String(input), init });
      const bytes = new Uint8Array([1, 2, 3, 4]);
      return new Response(bytes, {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition":
            "attachment; filename*=UTF-8''Housing-Log-08-13-2026-Shift-2-C.xlsx",
        },
      });
    };

    const result = await previewHousingLogXlsx(samplePayload);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.input, "/api/housing-logs/preview/xlsx");
    assert.equal(calls[0]!.init?.method, "POST");
    assert.equal(calls[0]!.init?.credentials, "same-origin");
    assert.deepEqual(
      JSON.parse(String(calls[0]!.init?.body)),
      samplePayload,
    );
    assert.equal(result.fileName, "Housing-Log-08-13-2026-Shift-2-C.xlsx");
    assert.equal(result.blob.size, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("previewHousingLogXlsx falls back to a generic filename when the server omits Content-Disposition", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(new Uint8Array([1]), { status: 200 });
    const result = await previewHousingLogXlsx(samplePayload);
    assert.equal(result.fileName, "Housing-Log.xlsx");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("previewHousingLogXlsx surfaces validation issues from a 422 exactly as finalize does", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        {
          error: "Housing Log is not ready to preview or download.",
          issues: [
            {
              path: "signatures.housingOfficer",
              label: "Housing Officer Signature",
              message: "Housing Officer Signature is required.",
            },
          ],
        },
        { status: 422 },
      );
    await assert.rejects(
      previewHousingLogXlsx(samplePayload),
      (error: unknown) =>
        error instanceof HousingLogApiError &&
        error.status === 422 &&
        error.issues.length === 1 &&
        error.issues[0]!.path === "signatures.housingOfficer",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("previewHousingLogXlsx surfaces a controlled error for a non-JSON server failure", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response("upstream proxy error", { status: 502 });
    await assert.rejects(
      previewHousingLogXlsx(samplePayload),
      (error: unknown) =>
        error instanceof HousingLogApiError && error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
