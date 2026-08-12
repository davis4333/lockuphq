import { createHash } from "node:crypto";
import JSZip from "jszip";
import {
  housingUnits,
  type HousingShift,
  type HousingUnit,
  type StoredHousingLog,
} from "@workspace/housing-log";
import {
  getHousingLogRepository,
  type HousingLogRepository,
} from "./repository";
import { generateExcelHousingLog } from "./excelTemplate/generateExcelHousingLog";
import {
  HousingLogWorkbookRegistry,
  type HousingLogWorkbookTemplate,
  registerOfficialHousingLogWorkbook,
} from "./excelTemplate/workbookRegistry";
import type { HousingLogDocumentRecord } from "./documentSpike/types";

const PACKAGE_ZIP_DATE = new Date("2026-04-27T00:00:00.000Z");

export type HousingLogShiftPackageIncludedLog = {
  recordId: string;
  housingUnit: HousingUnit;
  finalizedAt: string;
  templateVersion: string;
  sourceSheet: string;
  filename: string;
  sha256: string;
};

export type HousingLogShiftPackageManifest = {
  manifestVersion: 1;
  packageDate: string;
  shift: HousingShift;
  generatedAt: string;
  completenessStatus: "COMPLETE" | "INCOMPLETE";
  expectedHousingUnits: HousingUnit[];
  includedLogs: HousingLogShiftPackageIncludedLog[];
  missingHousingUnits: HousingUnit[];
  duplicateHousingUnitSlots: Array<{
    housingUnit: HousingUnit;
    recordCount: number;
    recordIds: string[];
  }>;
};

export type HousingLogShiftPackage = {
  bytes: Buffer;
  filename: string;
  manifest: HousingLogShiftPackageManifest;
};

type GenerateWorkbook = (
  record: HousingLogDocumentRecord,
  template: HousingLogWorkbookTemplate,
) => Promise<{ bytes: Buffer }>;

export type HousingLogShiftPackageDependencies = {
  repository?: HousingLogRepository;
  workbookRegistry?: HousingLogWorkbookRegistry;
  generateWorkbook?: GenerateWorkbook;
  now?: () => Date;
};

const safeFilePart = (value: string) =>
  value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

const checksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function compareRecords(left: StoredHousingLog, right: StoredHousingLog) {
  const unitDifference =
    housingUnits.indexOf(left.housingUnit) -
    housingUnits.indexOf(right.housingUnit);
  if (unitDifference) return unitDifference;
  const finalizedDifference = (left.finalizedAt ?? "").localeCompare(
    right.finalizedAt ?? "",
  );
  return finalizedDifference || left.id.localeCompare(right.id);
}

function workbookFilename(
  logDate: string,
  shift: HousingShift,
  housingUnit: HousingUnit,
  duplicateIndex: number | undefined,
): string {
  const duplicate = duplicateIndex ? `_DUPLICATE-${duplicateIndex}` : "";
  return `Housing-Log_${logDate}_Shift-${shift}_${safeFilePart(housingUnit)}${duplicate}.xlsx`;
}

export async function buildHousingLogShiftPackage(
  logDate: string,
  shift: HousingShift,
  dependencies: HousingLogShiftPackageDependencies = {},
): Promise<HousingLogShiftPackage> {
  const repository = dependencies.repository ?? getHousingLogRepository();
  const registry =
    dependencies.workbookRegistry ??
    registerOfficialHousingLogWorkbook(new HousingLogWorkbookRegistry());
  const generateWorkbook =
    dependencies.generateWorkbook ?? generateExcelHousingLog;
  const now = dependencies.now ?? (() => new Date());
  const records = (await repository.listFinalizedForShift(logDate, shift)).sort(
    compareRecords,
  );

  for (const record of records) {
    if (
      record.status !== "finalized" ||
      !record.finalizedAt ||
      record.logDate !== logDate ||
      record.shift !== shift
    )
      throw new Error(
        "Housing Log package query returned a record outside the requested finalized date and shift.",
      );
  }

  const recordsByUnit = new Map<HousingUnit, StoredHousingLog[]>(
    housingUnits.map((unit) => [unit, []]),
  );
  for (const record of records)
    recordsByUnit.get(record.housingUnit)!.push(record);

  const missingHousingUnits = housingUnits.filter(
    (unit) => recordsByUnit.get(unit)!.length === 0,
  );
  const duplicateHousingUnitSlots = housingUnits.flatMap((housingUnit) => {
    const slotRecords = recordsByUnit.get(housingUnit)!;
    return slotRecords.length > 1
      ? [
          {
            housingUnit,
            recordCount: slotRecords.length,
            recordIds: slotRecords.map((record) => record.id),
          },
        ]
      : [];
  });

  const zip = new JSZip();
  const includedLogs: HousingLogShiftPackageIncludedLog[] = [];
  for (const housingUnit of housingUnits) {
    const slotRecords = recordsByUnit.get(housingUnit)!;
    for (const [index, record] of slotRecords.entries()) {
      const template = registry.resolveRecord(record);
      const generated = await generateWorkbook(record, template);
      const filename = workbookFilename(
        logDate,
        shift,
        housingUnit,
        slotRecords.length > 1 ? index + 1 : undefined,
      );
      zip.file(filename, generated.bytes, {
        date: PACKAGE_ZIP_DATE,
        createFolders: false,
      });
      includedLogs.push({
        recordId: record.id,
        housingUnit,
        finalizedAt: record.finalizedAt!,
        templateVersion: record.templateVersion,
        sourceSheet: template.sourceSheet,
        filename,
        sha256: checksum(generated.bytes),
      });
    }
  }

  const manifest: HousingLogShiftPackageManifest = {
    manifestVersion: 1,
    packageDate: logDate,
    shift,
    generatedAt: now().toISOString(),
    completenessStatus:
      missingHousingUnits.length || duplicateHousingUnitSlots.length
        ? "INCOMPLETE"
        : "COMPLETE",
    expectedHousingUnits: [...housingUnits],
    includedLogs,
    missingHousingUnits,
    duplicateHousingUnitSlots,
  };
  zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`, {
    date: PACKAGE_ZIP_DATE,
    createFolders: false,
  });
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "DOS",
    mimeType: "application/zip",
  });

  return {
    bytes,
    filename: `Housing-Logs_${logDate}_Shift-${shift}.zip`,
    manifest,
  };
}
