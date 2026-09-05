import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ShieldAlert,
} from "lucide-react";
import {
  formatHousingLogDateForDisplay,
  housingUnitLabels,
  type HousingLogConfig,
  type HousingLogSignatures,
} from "@workspace/housing-log";
import type { TemplateGridSheet } from "@/lib/officialTemplateGrid";

/**
 * The officer's pre-finalization review: the ACTUAL official Housing Unit
 * Log template, filled out — not a summary of question/answer pairs. Every
 * sheet rendered here comes from parsing the SAME .xlsx bytes "Download
 * Current Log" returns (see officialTemplateGrid.ts), so there is no
 * second, independently maintained rendering of the form's content — what
 * the officer sees here is what the downloaded file contains, cell for
 * cell, merge for merge, in the same row order (which is also why entered
 * event order and continuation sheets need no special handling: they're
 * already baked into the parsed rows in the right order).
 */

const SIGNATURE_ROW_MIN_HEIGHT_PX = 34;
// Mirrors the official worksheet's own signature anchor (see pictureAnchor
// in generateExcelHousingLog.ts): start at column C's left edge, a few
// pixels in — well clear of the printed label's own text overflow into
// column B (see the geometry comment there for the underlying reasoning).
const SIGNATURE_LEFT_INSET_PX = 6;
const SIGNATURE_TOP_INSET_PX = 3;
const SIGNATURE_HEIGHT_PX = 26;

function SignatureOverlay({
  columnWidthsPx,
  src,
  label,
}: {
  columnWidthsPx: number[];
  src: string | undefined;
  label: string;
}) {
  if (!src) return null;
  const leftPx =
    (columnWidthsPx[0] ?? 0) + (columnWidthsPx[1] ?? 0) + SIGNATURE_LEFT_INSET_PX;
  return (
    <img
      src={src}
      alt={`${label} — captured signature`}
      style={{
        position: "absolute",
        left: leftPx,
        top: SIGNATURE_TOP_INSET_PX,
        height: SIGNATURE_HEIGHT_PX,
        width: "auto",
        maxWidth: `calc(100% - ${leftPx}px - 8px)`,
        objectFit: "contain",
        pointerEvents: "none",
      }}
    />
  );
}

function TemplateSheetTable({
  sheet,
  signatures,
  supervisorLabel,
  officerLabel,
}: {
  sheet: TemplateGridSheet;
  signatures: HousingLogSignatures;
  supervisorLabel: string;
  officerLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-300 bg-white shadow-sm">
      <table
        className="border-collapse text-[12px] leading-tight text-slate-900"
        style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
      >
        <caption className="sr-only">{sheet.name}</caption>
        <colgroup>
          {sheet.columnWidthsPx.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
        </colgroup>
        <tbody>
          {sheet.rows.map((row, rowIndex) => {
            const isSupervisorRow = rowIndex === sheet.supervisorSignatureRowIndex;
            const isOfficerRow = rowIndex === sheet.officerSignatureRowIndex;
            return (
              <tr
                key={rowIndex}
                className="relative border border-slate-300"
                style={
                  isSupervisorRow || isOfficerRow
                    ? { height: SIGNATURE_ROW_MIN_HEIGHT_PX, position: "relative" }
                    : undefined
                }
              >
                {row.map((cell, colIndex) => {
                  if (cell === null) return null;
                  const isSignatureLabelCell = colIndex === 0 && (isSupervisorRow || isOfficerRow);
                  return (
                    <td
                      key={colIndex}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className="border border-slate-300 px-1.5 py-1 align-top"
                      style={
                        isSignatureLabelCell
                          ? { whiteSpace: "nowrap", overflow: "visible", position: "relative" }
                          : { whiteSpace: "pre-wrap", wordBreak: "break-word" }
                      }
                    >
                      {cell.text}
                      {/* The overlay lives inside the label cell (not as a
                          direct <tr> child — invalid HTML that triggers React
                          hydration errors). The cell starts at the row's left
                          edge and has overflow: visible, so the same absolute
                          pixel offsets position the image identically. */}
                      {isSignatureLabelCell && isSupervisorRow && (
                        <SignatureOverlay
                          columnWidthsPx={sheet.columnWidthsPx}
                          src={signatures.housingSupervisor}
                          label={supervisorLabel}
                        />
                      )}
                      {isSignatureLabelCell && isOfficerRow && (
                        <SignatureOverlay
                          columnWidthsPx={sheet.columnWidthsPx}
                          src={signatures.housingOfficer}
                          label={officerLabel}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type HousingLogPreviewProps = {
  config: HousingLogConfig;
  logDate: string;
  signatures: HousingLogSignatures;
  sheets: TemplateGridSheet[];
  onBackToEdit: () => void;
  onDownload: () => void;
  onFinalize: () => void;
  finalizing: boolean;
  finalizeError?: string;
};

export default function HousingLogPreview({
  config,
  logDate,
  signatures,
  sheets,
  onBackToEdit,
  onDownload,
  onFinalize,
  finalizing,
  finalizeError,
}: HousingLogPreviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const supervisorSignature = config.signatures.find(
    (s) => s.key === "housingSupervisor",
  );
  const officerSignature = config.signatures.find((s) => s.key === "housingOfficer");

  return (
    <div className="relative min-h-screen w-full bg-[#0b1220] text-white">
      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6">
        <button
          type="button"
          onClick={onBackToEdit}
          className="inline-flex items-center gap-2 rounded-md border border-blue-400/30 bg-[rgba(4,11,34,0.7)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-200/80 hover:border-blue-300/60 hover:text-blue-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Edit
        </button>

        <header className="mt-5 mb-4">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-black uppercase tracking-[0.1em] text-white outline-none sm:text-2xl"
          >
            Housing Log Preview
          </h1>
          <p className="mt-1 text-sm text-blue-200/75">
            {housingUnitLabels[config.housingUnit]} • {config.shiftLabel} •{" "}
            {formatHousingLogDateForDisplay(logDate)}
          </p>
          <p
            role="status"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-950/50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-amber-200"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden /> Preview — not yet
            finalized
          </p>
        </header>

        <div className="space-y-4">
          {sheets.map((sheet) => (
            <TemplateSheetTable
              key={sheet.name}
              sheet={sheet}
              signatures={signatures}
              supervisorLabel={supervisorSignature?.label ?? "Housing Supervisor Signature"}
              officerLabel={officerSignature?.label ?? "Housing Officer Signature"}
            />
          ))}
        </div>

        {finalizeError && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-red-400/50 bg-red-950/50 px-3 py-2 text-xs text-red-100"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {finalizeError} Nothing has been lost — this Housing Log remains
            saved on this device. You can retry.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-2 rounded-md border border-blue-400/40 bg-blue-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-blue-100"
          >
            <Download className="h-4 w-4" aria-hidden /> Download Current Log
          </button>
          <button
            type="button"
            onClick={onFinalize}
            disabled={finalizing}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-40"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />{" "}
            {finalizing ? "Finalizing…" : "Finalize Housing Log"}
          </button>
        </div>
      </div>
    </div>
  );
}
