import path from "node:path";
import { access } from "node:fs/promises";
import { getHousingLogConfig } from "@workspace/housing-log";
import { resolveHousingLogAssetRoot } from "../documentSpike/templateRegistry.ts";
import type { HousingLogDocumentRecord } from "../documentSpike/types.ts";

export type HousingLogWorkbookTemplate = {
  templateVersion: string;
  sourceSheet: string;
  workbookPath: string;
};

export class HousingLogWorkbookRegistry {
  private readonly templates = new Map<string, string>();

  register(templateVersion: string, workbookPath: string): this {
    this.templates.set(templateVersion, workbookPath);
    return this;
  }

  resolveRecord(record: HousingLogDocumentRecord): HousingLogWorkbookTemplate {
    const sourceSheet = getHousingLogConfig(
      record.housingUnit,
      record.shift,
    ).sourceSheet;
    const workbookPath = this.templates.get(record.templateVersion);
    if (!workbookPath)
      throw new Error(
        `No Housing Log workbook is registered for template version ${record.templateVersion}.`,
      );
    return {
      templateVersion: record.templateVersion,
      sourceSheet,
      workbookPath,
    };
  }
}

export function registerOfficialHousingLogWorkbook(
  registry: HousingLogWorkbookRegistry,
  assetRoot = resolveHousingLogAssetRoot(),
  templateVersion = "2026-04-27",
): HousingLogWorkbookRegistry {
  return registry.register(
    templateVersion,
    path.join(
      assetRoot,
      templateVersion,
      "Housing Unit Logs (REVISED 4.27.26).xlsx",
    ),
  );
}

export async function assertWorkbookTemplateAsset(
  template: HousingLogWorkbookTemplate,
): Promise<void> {
  await access(template.workbookPath);
}
