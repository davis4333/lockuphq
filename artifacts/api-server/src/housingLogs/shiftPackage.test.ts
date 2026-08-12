import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import JSZip from "jszip";
import {
  housingUnits,
  type HousingLogDraftInput,
  type HousingLogListFilters,
  type HousingLogSignatures,
  type HousingLogSummary,
  type HousingShift,
  type HousingUnit,
  type StoredHousingLog,
} from "@workspace/housing-log";
import { createHousingLogStressRecord } from "./documentSpike/stressFixture";
import type {
  FinalizedHousingLogMetadata,
  FinalizeHousingLogResult,
  HousingLogRepository,
} from "./repository";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "./excelTemplate/workbookRegistry";
import {
  buildHousingLogShiftPackage,
  type HousingLogShiftPackageManifest,
} from "./shiftPackage";

const PACKAGE_DATE = "2026-08-12";
const PACKAGE_SHIFT: HousingShift = "2";
const FIXED_GENERATED_AT = new Date("2026-08-13T01:02:03.000Z");

class PackageMemoryRepository implements HousingLogRepository {
  readonly records: StoredHousingLog[];

  constructor(records: readonly StoredHousingLog[]) {
    this.records = records.map((record) => structuredClone(record));
  }

  async create(_input: HousingLogDraftInput): Promise<StoredHousingLog> {
    throw new Error("not used");
  }

  async get(id: string): Promise<StoredHousingLog | undefined> {
    return this.records.find((record) => record.id === id);
  }

  async list(_filters: HousingLogListFilters): Promise<HousingLogSummary[]> {
    throw new Error("not used");
  }

  async listFinalizedArchive(): Promise<FinalizedHousingLogMetadata[]> {
    throw new Error("not used");
  }

  async listFinalizedForShift(
    logDate: string,
    shift: HousingShift,
  ): Promise<StoredHousingLog[]> {
    return this.records
      .filter(
        (record) =>
          record.status === "finalized" &&
          record.logDate === logDate &&
          record.shift === shift,
      )
      .map((record) => structuredClone(record));
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

const record = (
  housingUnit: HousingUnit,
  id: string,
  overrides: Partial<StoredHousingLog> = {},
): StoredHousingLog => ({
  ...createHousingLogStressRecord(housingUnit, PACKAGE_SHIFT, 4),
  id,
  logDate: PACKAGE_DATE,
  finalizedAt: "2026-08-12T23:00:00.000Z",
  ...overrides,
});

const onePerExpectedUnit = () =>
  housingUnits.map((housingUnit, index) =>
    record(housingUnit, `record-${index + 1}`),
  );

const registry = () =>
  registerOfficialHousingLogWorkbook(new HousingLogWorkbookRegistry());

const fakeWorkbookGenerator = async (
  input: StoredHousingLog,
  template: { sourceSheet: string },
) => ({
  bytes: Buffer.from(
    `fake-editable-workbook:${input.id}:${input.templateVersion}:${template.sourceSheet}`,
  ),
});

async function loadPackage(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const manifest = JSON.parse(
    await zip.file("manifest.json")!.async("string"),
  ) as HousingLogShiftPackageManifest;
  return { zip, manifest };
}

test("complete shift package contains one deterministic workbook per expected unit", async () => {
  const generated = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    {
      repository: new PackageMemoryRepository(onePerExpectedUnit().reverse()),
      workbookRegistry: registry(),
      generateWorkbook: fakeWorkbookGenerator,
      now: () => FIXED_GENERATED_AT,
    },
  );
  const { zip, manifest } = await loadPackage(generated.bytes);
  assert.equal(manifest.completenessStatus, "COMPLETE");
  assert.deepEqual(manifest.missingHousingUnits, []);
  assert.deepEqual(manifest.duplicateHousingUnitSlots, []);
  assert.deepEqual(
    manifest.includedLogs.map((item) => item.housingUnit),
    [...housingUnits],
  );
  assert.equal(
    Object.keys(zip.files).filter((name) => name.endsWith(".xlsx")).length,
    housingUnits.length,
  );
  assert.equal(generated.filename, "Housing-Logs_2026-08-12_Shift-2.zip");
  for (const included of manifest.includedLogs) {
    assert.match(
      included.filename,
      /^Housing-Log_2026-08-12_Shift-2_[A-Za-z0-9-]+\.xlsx$/,
    );
    const bytes = await zip.file(included.filename)!.async("uint8array");
    assert.equal(
      included.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
  }
});

test("missing logs are manifest-only and do not create fake workbooks", async () => {
  const generated = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    {
      repository: new PackageMemoryRepository([record("A/H", "only-log")]),
      workbookRegistry: registry(),
      generateWorkbook: fakeWorkbookGenerator,
      now: () => FIXED_GENERATED_AT,
    },
  );
  const { zip, manifest } = await loadPackage(generated.bytes);
  assert.equal(manifest.completenessStatus, "INCOMPLETE");
  assert.deepEqual(manifest.missingHousingUnits, housingUnits.slice(1));
  assert.equal(manifest.includedLogs.length, 1);
  assert.deepEqual(
    Object.keys(zip.files).filter((name) => name.endsWith(".xlsx")),
    [manifest.includedLogs[0]!.filename],
  );
});

test("duplicate package includes every record with stable unique names and flags both problems", async () => {
  const records = [
    record("A/H", "later", {
      finalizedAt: "2026-08-12T23:30:00.000Z",
    }),
    record("A/H", "earlier", {
      finalizedAt: "2026-08-12T22:30:00.000Z",
    }),
    record("B", "b-record"),
  ];
  const generated = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    {
      repository: new PackageMemoryRepository(records),
      workbookRegistry: registry(),
      generateWorkbook: fakeWorkbookGenerator,
      now: () => FIXED_GENERATED_AT,
    },
  );
  const { manifest } = await loadPackage(generated.bytes);
  assert.equal(manifest.completenessStatus, "INCOMPLETE");
  assert.ok(manifest.missingHousingUnits.length > 0);
  assert.deepEqual(manifest.duplicateHousingUnitSlots, [
    {
      housingUnit: "A/H",
      recordCount: 2,
      recordIds: ["earlier", "later"],
    },
  ]);
  assert.deepEqual(
    manifest.includedLogs.slice(0, 2).map((item) => item.filename),
    [
      "Housing-Log_2026-08-12_Shift-2_A-H_DUPLICATE-1.xlsx",
      "Housing-Log_2026-08-12_Shift-2_A-H_DUPLICATE-2.xlsx",
    ],
  );
});

test("all expected units plus duplicates preserve historical templates and valid XLSX files", async () => {
  const records = onePerExpectedUnit();
  const historicalVersion = "historical-package-v1";
  records[0] = record("A/H", "historical-record", {
    templateVersion: historicalVersion,
  });
  records.push(
    record("A/H", "duplicate-record", {
      finalizedAt: "2026-08-13T00:00:00.000Z",
    }),
  );
  const workbookRegistry = registry();
  const officialPath = workbookRegistry.resolveRecord(records[1]!).workbookPath;
  workbookRegistry.register(historicalVersion, officialPath);
  const repository = new PackageMemoryRepository(records);
  const before = JSON.stringify(repository.records);

  const generated = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    {
      repository,
      workbookRegistry,
      now: () => FIXED_GENERATED_AT,
    },
  );
  const { zip, manifest } = await loadPackage(generated.bytes);
  assert.equal(manifest.completenessStatus, "INCOMPLETE");
  assert.deepEqual(manifest.missingHousingUnits, []);
  assert.equal(manifest.duplicateHousingUnitSlots.length, 1);
  assert.equal(manifest.includedLogs.length, housingUnits.length + 1);
  assert.equal(
    manifest.includedLogs.find((item) => item.recordId === "historical-record")!
      .templateVersion,
    historicalVersion,
  );
  for (const included of manifest.includedLogs) {
    const workbookBytes = await zip
      .file(included.filename)!
      .async("uint8array");
    const workbook = await JSZip.loadAsync(workbookBytes, { checkCRC32: true });
    assert.ok(workbook.file("xl/workbook.xml"));
    assert.equal(
      included.sha256,
      createHash("sha256").update(workbookBytes).digest("hex"),
    );
  }
  assert.equal(JSON.stringify(repository.records), before);
});

test("a package with no finalized logs remains downloadable and explicitly incomplete", async () => {
  const generated = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    {
      repository: new PackageMemoryRepository([]),
      workbookRegistry: registry(),
      generateWorkbook: fakeWorkbookGenerator,
      now: () => FIXED_GENERATED_AT,
    },
  );
  const { zip, manifest } = await loadPackage(generated.bytes);
  assert.equal(manifest.completenessStatus, "INCOMPLETE");
  assert.deepEqual(manifest.missingHousingUnits, [...housingUnits]);
  assert.deepEqual(manifest.includedLogs, []);
  assert.deepEqual(Object.keys(zip.files), ["manifest.json"]);
});

test("repeated generation has equivalent deterministic bytes with a fixed package timestamp", async () => {
  const dependencies = {
    repository: new PackageMemoryRepository(onePerExpectedUnit()),
    workbookRegistry: registry(),
    generateWorkbook: fakeWorkbookGenerator,
    now: () => FIXED_GENERATED_AT,
  };
  const first = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    dependencies,
  );
  const second = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    dependencies,
  );
  assert.deepEqual(first.manifest, second.manifest);
  assert.deepEqual(first.bytes, second.bytes);
});

test("repeated generation at different times changes only the manifest timestamp", async () => {
  const common = {
    repository: new PackageMemoryRepository(onePerExpectedUnit()),
    workbookRegistry: registry(),
    generateWorkbook: fakeWorkbookGenerator,
  };
  const first = await buildHousingLogShiftPackage(PACKAGE_DATE, PACKAGE_SHIFT, {
    ...common,
    now: () => FIXED_GENERATED_AT,
  });
  const second = await buildHousingLogShiftPackage(
    PACKAGE_DATE,
    PACKAGE_SHIFT,
    { ...common, now: () => new Date("2026-08-13T02:02:03.000Z") },
  );
  const firstLoaded = await loadPackage(first.bytes);
  const secondLoaded = await loadPackage(second.bytes);
  const { generatedAt: firstGeneratedAt, ...firstManifest } =
    firstLoaded.manifest;
  const { generatedAt: secondGeneratedAt, ...secondManifest } =
    secondLoaded.manifest;
  assert.notEqual(firstGeneratedAt, secondGeneratedAt);
  assert.deepEqual(firstManifest, secondManifest);
  for (const included of firstManifest.includedLogs) {
    assert.deepEqual(
      await firstLoaded.zip.file(included.filename)!.async("uint8array"),
      await secondLoaded.zip.file(included.filename)!.async("uint8array"),
    );
  }
});

test("Excel generation failure aborts package creation", async () => {
  await assert.rejects(
    buildHousingLogShiftPackage(PACKAGE_DATE, PACKAGE_SHIFT, {
      repository: new PackageMemoryRepository([record("A/H", "failure")]),
      workbookRegistry: registry(),
      generateWorkbook: async () => {
        throw new Error("synthetic generation failure");
      },
      now: () => FIXED_GENERATED_AT,
    }),
    /synthetic generation failure/,
  );
});
