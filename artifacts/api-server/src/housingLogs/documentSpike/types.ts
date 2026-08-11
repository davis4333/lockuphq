import type { StoredHousingLog } from "@workspace/housing-log";

export type HousingLogDocumentRecord = StoredHousingLog;

export type HousingLogTemplateKey = {
  templateVersion: string;
  sourceSheet: string;
};

export type ResolvedHousingLogTemplate = HousingLogTemplateKey & {
  pdfPath: string;
  docxBackgroundPaths: readonly [string, string, string];
};

export type TextOverflow = {
  key: string;
  value: string;
  minimumFontSize: number;
  availableWidth: number;
};

export class HousingLogDocumentOverflowError extends Error {
  constructor(public readonly overflow: TextOverflow) {
    super(
      `Housing Log value "${overflow.key}" does not fit its official blank at ${overflow.minimumFontSize} pt.`,
    );
    this.name = "HousingLogDocumentOverflowError";
  }
}

export type EventLine = {
  eventId: string;
  time: string;
  activity: string;
  initials: string;
  continuation: boolean;
};

export type EventPage = {
  kind: "official" | "continuation";
  pageIndex: number;
  lines: EventLine[];
};

export type SignaturePlacementDiagnostic = {
  pageIndex: number;
  signatureKey: "housingSupervisor" | "housingOfficer";
  sourceAspectRatio: number;
  renderedAspectRatio: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type HousingLogDocumentDiagnostics = {
  strategy: "pdf-overlay" | "docx-first";
  template: HousingLogTemplateKey;
  officialPageCount: number;
  continuationPageCount: number;
  totalPageCount: number;
  eventIdsInRenderedOrder: string[];
  signaturePlacements: SignaturePlacementDiagnostic[];
  renderedFieldKeys?: string[];
  layoutViolations?: string[];
  generationMilliseconds: number;
};
