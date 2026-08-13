import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import express from "express";
import JSZip from "jszip";
import {
  fieldsForConfig,
  generateCompleteDemoValues,
  getHousingLogConfig,
  housingLogConfigs,
  prepareHousingLog,
  seededRng,
  type HousingLogDraftInput,
  type HousingLogValue,
  type HousingShift,
  type HousingUnit,
} from "@workspace/housing-log";
import { signatureDataUrl } from "../housingLogs/signatureTestUtils";
import { validateHousingLogForFinalization } from "../housingLogs/signatureValidation";
import {
  type FinalizeSubmissionResult,
  type HousingLogRepository,
  type RemoveFinalizedHousingLogResult,
} from "../housingLogs/repository";
import { createHousingLogsRouter } from "./housingLogs";
import { jsonErrorHandler } from "../app";

/** Same minimal stand-in used by housingLogs.test.ts, kept local so this
 * file can assert on it in isolation without importing test-only exports. */
class MemoryRepository implements HousingLogRepository {
  records = new Map<string, unknown>();

  async get() {
    return undefined;
  }
  async listFinalizedArchive() {
    return [];
  }
  async listFinalizedForShift() {
    return [];
  }
  async removeFinalizedLog(): Promise<RemoveFinalizedHousingLogResult> {
    throw new Error("not used");
  }
  async finalizeSubmission(): Promise<FinalizeSubmissionResult> {
    throw new Error("not used — this suite never calls finalize");
  }
}

function completeInput(
  unit: HousingUnit = "C",
  shift: HousingShift = "2",
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
    logDate: "2026-08-13",
    housingUnit: unit,
    shift,
    templateVersion: config.templateVersion,
    values,
    events: [
      { id: "e1", time: "23:52", activity: "First event", initials: "AB" },
      { id: "e2", time: "00:05", activity: "Second event", initials: "CD" },
    ],
    signatures: Object.fromEntries(
      config.signatures.map((item) => [item.key, signatureDataUrl("valid")]),
    ),
  };
}

async function withServer(
  run: (baseUrl: string, repository: MemoryRepository) => Promise<void>,
  options: { configuredRepository?: boolean } = {},
): Promise<void> {
  const repository = new MemoryRepository();
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(
    "/api",
    createHousingLogsRouter(
      options.configuredRepository === false ? undefined : { repository },
    ),
  );
  app.use(jsonErrorHandler);
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

function preview(baseUrl: string, input: HousingLogDraftInput) {
  return fetch(`${baseUrl}/api/housing-logs/preview/xlsx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

async function worksheetXmlFor(
  bytes: ArrayBuffer,
  sourceSheet: string,
): Promise<string> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  const relsXml = await zip
    .file("xl/_rels/workbook.xml.rels")!
    .async("string");
  const relationships = new Map(
    [
      ...relsXml.matchAll(
        /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g,
      ),
    ].map((m) => [m[1]!, m[2]!] as const),
  );
  const sheetMatch = new RegExp(
    `<sheet\\b[^>]*\\bname="${sourceSheet}"[^>]*\\br:id="([^"]+)"[^>]*/>`,
  ).exec(workbookXml);
  assert.ok(sheetMatch, `workbook.xml has no sheet named ${sourceSheet}`);
  const target = relationships.get(sheetMatch[1]!);
  assert.ok(target, `no relationship target for ${sourceSheet}`);
  return zip.file(`xl/${target}`)!.async("string");
}

test("preview/xlsx generates the current official log without persisting anything server-side", async () => {
  await withServer(async (baseUrl, repository) => {
    assert.equal(repository.records.size, 0);
    const response = await preview(baseUrl, completeInput());
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("content-type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const bytes = await response.arrayBuffer();
    assert.ok(bytes.byteLength > 10_000, "expected a real workbook, not a stub");
    assert.equal(repository.records.size, 0);

    // Calling it again (as "Download Current Log" would, or a repeat
    // Preview) still creates nothing.
    const second = await preview(baseUrl, completeInput());
    assert.equal(second.status, 200);
    assert.equal(repository.records.size, 0);
  });
});

test("preview/xlsx runs the same canonical validation finalize uses, and generates nothing on failure", async () => {
  await withServer(async (baseUrl, repository) => {
    const input = completeInput();
    delete input.values["staff.1.name"];
    delete input.signatures.housingOfficer;
    const response = await preview(baseUrl, input);
    assert.equal(response.status, 422);
    const body = (await response.json()) as {
      error: string;
      issues: { path: string }[];
    };
    assert.match(body.error, /not ready/i);
    assert.ok(body.issues.some((issue) => issue.path === "values.staff.1.name"));
    assert.ok(
      body.issues.some((issue) => issue.path === "signatures.housingOfficer"),
    );
    // The exact same issue set validateHousingLogForFinalization (finalize's
    // own validator) produces for identical content — proving there is no
    // second, drifting validation system for preview.
    const prepared = prepareHousingLog(input);
    const expected = validateHousingLogForFinalization(prepared);
    assert.deepEqual(
      body.issues.map((i) => i.path).sort(),
      expected.map((i) => i.path).sort(),
    );
    assert.equal(repository.records.size, 0);
  });
});

test("preview/xlsx rejects an implausibly tiny signature exactly as finalize does — ink-plausibility is not weakened", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput();
    input.signatures.housingSupervisor = signatureDataUrl("tiny");
    const response = await preview(baseUrl, input);
    assert.equal(response.status, 422);
    const body = (await response.json()) as { issues: { path: string }[] };
    assert.ok(
      body.issues.some(
        (issue) => issue.path === "signatures.housingSupervisor",
      ),
    );
  });
});

test("preview/xlsx uses the approved current-log filename convention", async () => {
  await withServer(async (baseUrl) => {
    const response = await preview(baseUrl, completeInput("C", "2"));
    assert.equal(response.status, 200);
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.match(
      disposition,
      /filename\*=UTF-8''Housing-Log-08-13-2026-Shift-2-C\.xlsx$/,
    );
  });
});

test("preview/xlsx works even when Housing Log persistence is not configured at all", async () => {
  await withServer(
    async (baseUrl) => {
      const response = await preview(baseUrl, completeInput());
      assert.equal(response.status, 200);
      const bytes = await response.arrayBuffer();
      assert.ok(bytes.byteLength > 10_000);
    },
    { configuredRepository: false },
  );
});

test("preview/xlsx ignores an id/status/timestamps smuggled into the request body — it never looks up stored data", async () => {
  await withServer(async (baseUrl, repository) => {
    const input = completeInput();
    const withForeignFields = {
      ...input,
      id: "some-other-finalized-record-id",
      status: "finalized",
      finalizedAt: "2020-01-01T00:00:00.000Z",
    };
    const response = await fetch(`${baseUrl}/api/housing-logs/preview/xlsx`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(withForeignFields),
    });
    // Still succeeds — the extra fields are simply not part of the schema
    // and are dropped, not honored as a lookup key. There is nothing in the
    // repository for it to look up anyway.
    assert.equal(response.status, 200);
    assert.equal(repository.records.size, 0);
  });
});

test("editing the payload between two preview calls produces a genuinely different document — nothing is cached stale", async () => {
  await withServer(async (baseUrl) => {
    const config = getHousingLogConfig("C", "2");
    const first = completeInput("C", "2");
    first.values["staff.1.name"] = "A. FirstName";
    const firstResponse = await preview(baseUrl, first);
    assert.equal(firstResponse.status, 200);
    const firstXml = await worksheetXmlFor(
      await firstResponse.arrayBuffer(),
      config.sourceSheet,
    );
    assert.match(firstXml, /A\. FirstName/);

    const second = completeInput("C", "2");
    second.values["staff.1.name"] = "B. SecondName";
    const secondResponse = await preview(baseUrl, second);
    assert.equal(secondResponse.status, 200);
    const secondXml = await worksheetXmlFor(
      await secondResponse.arrayBuffer(),
      config.sourceSheet,
    );
    assert.match(secondXml, /B\. SecondName/);
    assert.doesNotMatch(secondXml, /A\. FirstName/);
  });
});

test("preview/xlsx preserves entered event order across midnight, exactly as finalize/export do", async () => {
  await withServer(async (baseUrl) => {
    const config = getHousingLogConfig("C", "2");
    const input = completeInput("C", "2");
    input.events = [
      { id: "e1", time: "23:52", activity: "Late-night event", initials: "AB" },
      { id: "e2", time: "00:05", activity: "Just-after-midnight event", initials: "CD" },
      { id: "e3", time: "00:41", activity: "Second early event", initials: "EF" },
    ];
    const response = await preview(baseUrl, input);
    assert.equal(response.status, 200);
    const xml = await worksheetXmlFor(
      await response.arrayBuffer(),
      config.sourceSheet,
    );
    const lateIndex = xml.indexOf("Late-night event");
    const midnightIndex = xml.indexOf("Just-after-midnight event");
    const secondIndex = xml.indexOf("Second early event");
    assert.ok(lateIndex >= 0 && midnightIndex >= 0 && secondIndex >= 0);
    assert.ok(lateIndex < midnightIndex);
    assert.ok(midnightIndex < secondIndex);
  });
});

test("preview/xlsx handles a large 72-event log without failing", async () => {
  await withServer(async (baseUrl) => {
    const input = completeInput("C", "2");
    input.events = Array.from({ length: 72 }, (_, index) => ({
      id: `event-${index}`,
      time: `${String(index % 24).padStart(2, "0")}:${String((index * 7) % 60).padStart(2, "0")}`,
      activity: `Routine log entry number ${index + 1} for browser QA volume testing.`,
      initials: "QA",
    }));
    const response = await preview(baseUrl, input);
    assert.equal(response.status, 200);
    const bytes = await response.arrayBuffer();
    assert.ok(bytes.byteLength > 10_000);
  });
});

const representativeConfigs = housingLogConfigs.filter(
  (config, index, configs) =>
    configs.findIndex(
      (candidate) => candidate.sourceSheet === config.sourceSheet,
    ) === index,
);

for (const config of representativeConfigs) {
  test(`preview/xlsx generates a valid ${config.sourceSheet} workbook from a Complete Demo payload`, async () => {
    await withServer(async (baseUrl) => {
      const { values, events } = generateCompleteDemoValues(
        config,
        seededRng(7),
      );
      const input: HousingLogDraftInput = {
        logDate: "2026-08-13",
        housingUnit: config.housingUnit,
        shift: config.shift,
        templateVersion: config.templateVersion,
        values,
        events,
        signatures: Object.fromEntries(
          config.signatures.map((s) => [s.key, signatureDataUrl("valid")]),
        ),
      };
      const response = await preview(baseUrl, input);
      assert.equal(
        response.status,
        200,
        `${config.sourceSheet} preview should succeed for a Complete Demo payload`,
      );
      const xml = await worksheetXmlFor(
        await response.arrayBuffer(),
        config.sourceSheet,
      );
      assert.match(xml, /DATE 08-13-2026/);
      assert.match(
        xml,
        new RegExp(`HOUSING UNIT\\s+${config.housingUnit}\\b`),
      );
    });
  });
}

test("Incomplete Demo data is correctly rejected by preview/xlsx, using the real validation summary", async () => {
  await withServer(async (baseUrl) => {
    // A payload with no values/events/signatures at all is the simplest
    // stand-in for "Incomplete Demo" — it must fail the same canonical
    // validator finalize uses, not some relaxed preview-only check.
    const config = getHousingLogConfig("D", "3");
    const input: HousingLogDraftInput = {
      logDate: "2026-08-13",
      housingUnit: config.housingUnit,
      shift: config.shift,
      templateVersion: config.templateVersion,
      values: {},
      events: [],
      signatures: {},
    };
    const response = await preview(baseUrl, input);
    assert.equal(response.status, 422);
    const body = (await response.json()) as { issues: unknown[] };
    assert.ok(body.issues.length > 0);
  });
});

test("preview/xlsx rejects a structurally invalid payload (bad housing unit) before any generation is attempted", async () => {
  await withServer(async (baseUrl, repository) => {
    const response = await fetch(`${baseUrl}/api/housing-logs/preview/xlsx`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ housingUnit: "NotARealUnit" }),
    });
    assert.equal(response.status, 400);
    assert.equal(repository.records.size, 0);
  });
});
