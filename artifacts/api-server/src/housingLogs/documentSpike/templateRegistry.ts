import path from "node:path";
import { access } from "node:fs/promises";
import { getHousingLogConfig } from "@workspace/housing-log";
import type {
  HousingLogDocumentRecord,
  HousingLogTemplateKey,
  ResolvedHousingLogTemplate,
} from "./types.ts";

function registryKey(key: HousingLogTemplateKey): string {
  return `${key.templateVersion}::${key.sourceSheet}`;
}

export class HousingLogTemplateRegistry {
  private readonly templates = new Map<string, ResolvedHousingLogTemplate>();

  register(template: ResolvedHousingLogTemplate): this {
    this.templates.set(registryKey(template), template);
    return this;
  }

  resolve(key: HousingLogTemplateKey): ResolvedHousingLogTemplate {
    const template = this.templates.get(registryKey(key));
    if (!template)
      throw new Error(
        `No Housing Log document template is registered for ${key.templateVersion} / ${key.sourceSheet}.`,
      );
    return template;
  }

  resolveRecord(record: HousingLogDocumentRecord): ResolvedHousingLogTemplate {
    const sourceSheet = getHousingLogConfig(
      record.housingUnit,
      record.shift,
    ).sourceSheet;
    return this.resolve({
      templateVersion: record.templateVersion,
      sourceSheet,
    });
  }
}

export function registerBUnitSpikeTemplate(
  registry: HousingLogTemplateRegistry,
  assetRoot: string,
  templateVersion = "2026-04-27",
): HousingLogTemplateRegistry {
  const versionRoot = path.resolve(assetRoot, templateVersion);
  return registry.register({
    templateVersion,
    sourceSheet: "1_B",
    pdfPath: path.join(versionRoot, "1_B.pdf"),
    docxBackgroundPaths: [
      path.join(versionRoot, "docx-backgrounds", "1_B-page-1.png"),
      path.join(versionRoot, "docx-backgrounds", "1_B-page-2.png"),
      path.join(versionRoot, "docx-backgrounds", "1_B-page-3.png"),
    ],
  });
}

export async function assertTemplateAssets(
  template: ResolvedHousingLogTemplate,
): Promise<void> {
  await Promise.all([
    access(template.pdfPath),
    ...template.docxBackgroundPaths.map((file) => access(file)),
  ]);
}
