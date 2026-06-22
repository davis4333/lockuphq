/**
 * Lock-Up Packet generator.
 *
 * Bundles, for a SINGLE inmate, the Lock-Up Slip narrative plus any selected
 * filled government forms into one downloadable .zip. Each form is produced by
 * filling its ORIGINAL .docx template (never recreated); the narrative is plain
 * text, so it is included as a .txt (no HTML-to-DOCX). Files are flat and clearly
 * named. Any filler failure aborts the whole packet and surfaces loudly.
 */
import PizZip from "pizzip";
import { fillDc6229Docx, type Dc6229FormData } from "@/lib/dc6229/dc6229DocxFiller";
import { fillDc6221Docx, type Dc6221FormData } from "./dc6221CellInspectionFiller";
import {
  fillConfinementRulesDocx,
  type ConfinementRulesFormData,
} from "./confinementRulesFiller";

export class LockUpPacketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockUpPacketError";
  }
}

export interface PacketInclude {
  dc6229: boolean;
  dc6221: boolean;
  rules: boolean;
}

export interface PacketTemplates {
  dc6229Url: string;
  dc6221Url: string;
  rulesUrl: string;
}

export interface LockUpPacketInput {
  /** "Last, First" display name. */
  inmateName: string;
  /** Bare last name, used in filenames. */
  inmateLast: string;
  fdc: string;
  /** Cell number AFTER the form's printed "B" (e.g. "1-106L"). */
  cellNumber: string;
  /**
   * Free-text status code for the DC6-229's Status field (e.g. "A5", "CM1", "C1").
   * Deliberately SEPARATE from the slip's AC/DC confinement category — never derive
   * this from Administrative/Disciplinary Confinement.
   */
  confinementStatus: string;
  /** Date entered / acknowledgment date, formatted for print (e.g. "06/20/26"). */
  date: string;
  officerName: string;
  officerRank: string;
  /** The Lock-Up Slip narrative text. */
  narrative: string;
  /** 7 DC6-229 week dates already in the filler's expected docx format. */
  weekDocxDates: string[];
  include: PacketInclude;
  templates: PacketTemplates;
}

export interface LockUpPacketResult {
  blob: Blob;
  filename: string;
}

/** Strip characters that are unsafe in a download filename. */
function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
}

export async function generateLockUpPacket(
  input: LockUpPacketInput,
): Promise<LockUpPacketResult> {
  const tag = safeName(`${input.inmateName} - ${input.fdc}`) || "Inmate";
  const zip = new PizZip();

  // 1. Lock-Up Slip narrative (always included) as plain text.
  zip.file(`Lock Up Slip - ${tag}.txt`, input.narrative);

  // 2. DC6-229 Daily Record.
  if (input.include.dc6229) {
    if (input.weekDocxDates.length !== 7) {
      throw new LockUpPacketError(
        "The DC6-229 requires exactly 7 week dates; could not build them.",
      );
    }
    const form: Dc6229FormData = {
      inmateName: input.inmateName,
      fdc: input.fdc,
      cellNumber: input.cellNumber,
      status: input.confinementStatus,
      dates: input.weekDocxDates,
    };
    const blob = await fillDc6229Docx(input.templates.dc6229Url, { forms: [form] });
    zip.file(`DC6-229 Daily Record - ${tag}.docx`, await blob.arrayBuffer());
  }

  // 3. DC6-221 Cell Inspection.
  if (input.include.dc6221) {
    const form: Dc6221FormData = {
      inmateName: input.inmateName,
      number: input.fdc,
      cellNumber: input.cellNumber,
      dateEntered: input.date,
    };
    const blob = await fillDc6221Docx(input.templates.dc6221Url, form);
    zip.file(`DC6-221 Cell Inspection - ${tag}.docx`, await blob.arrayBuffer());
  }

  // 4. Confinement Rules acknowledgment.
  if (input.include.rules) {
    const form: ConfinementRulesFormData = {
      inmateName: input.inmateName,
      fdc: input.fdc,
      date: input.date,
      officerName: input.officerName,
      officerRank: input.officerRank,
    };
    const blob = await fillConfinementRulesDocx(input.templates.rulesUrl, form);
    zip.file(`Confinement Rules - ${tag}.docx`, await blob.arrayBuffer());
  }

  const blob = zip.generate({ type: "blob", mimeType: "application/zip" });
  return { blob, filename: `Lock-Up Packet - ${tag}.zip` };
}
