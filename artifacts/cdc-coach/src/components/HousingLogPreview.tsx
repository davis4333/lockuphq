import { useEffect, useRef } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileWarning,
  ShieldAlert,
} from "lucide-react";
import {
  calculateCountTotal,
  formatHousingLogDateForDisplay,
  housingUnitLabels,
  type HousingLogConfig,
  type HousingLogDraftInput,
  type HousingLogValue,
} from "@workspace/housing-log";
import {
  canonicalFieldsWithPrefix,
  isStaffSlotNA,
  shortFieldLabel,
  staffFieldLabel,
  staffSlotsForConfig,
} from "@/lib/housingLogSections";
import { hudPanel } from "./PageShell";

/**
 * Read-only "what will actually be submitted" review, shown before
 * finalization. Every section below iterates the SAME canonical
 * config/field structures (`staffSlotsForConfig`, `config.counts`,
 * `config.activities`, `config.securityCheckCount`, `canonicalFieldsWithPrefix`)
 * that the editable Housing Log form itself uses — there is no second,
 * independently maintained list of fields here, so this cannot silently
 * drift from what the form actually collects or what the official Excel
 * export actually writes. Values are shown exactly as stored (e.g. raw
 * 24-hour "HH:MM" for times) to match the official worksheet's own cells.
 */

function displayValue(value: HousingLogValue | undefined): string {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text === "" ? "—" : text;
}

function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[140px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-blue-300/60">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-blue-50">{value}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-6 text-xs font-black uppercase tracking-[0.14em] text-blue-100 first:mt-0">
      {children}
    </h2>
  );
}

export type HousingLogPreviewProps = {
  config: HousingLogConfig;
  input: HousingLogDraftInput;
  onBackToEdit: () => void;
  onDownload: () => void;
  downloading: boolean;
  downloadError?: string;
  onFinalize: () => void;
  finalizing: boolean;
  finalizeError?: string;
};

export default function HousingLogPreview({
  config,
  input,
  onBackToEdit,
  onDownload,
  downloading,
  downloadError,
  onFinalize,
  finalizing,
  finalizeError,
}: HousingLogPreviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const { values, events, signatures } = input;
  const staffSlots = staffSlotsForConfig(config);
  const equipmentSection = config.sections.find((s) => s.key === "equipment");

  return (
    <div className="relative min-h-screen w-full text-white">
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-10 pt-6 sm:px-6">
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
            {formatHousingLogDateForDisplay(input.logDate)}
          </p>
          <p
            role="status"
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-amber-400/60 bg-amber-950/50 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-amber-200"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden /> Preview — not yet
            finalized
          </p>
        </header>

        <div className={`${hudPanel} p-4 sm:p-5`}>
          <SectionHeading>Staff &amp; equipment</SectionHeading>
          <div className="mt-3 space-y-3">
            {staffSlots.map((slot) => {
              const absent = isStaffSlotNA(slot, values);
              const heading =
                slot.kind === "sergeant" ? "Sergeant / Supervisor" : slot.position;
              if (absent)
                return (
                  <p
                    key={slot.prefix}
                    className="rounded-lg border border-blue-400/15 bg-blue-950/30 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-blue-200/60"
                  >
                    {heading}{" "}
                    <span className="font-bold normal-case tracking-normal">
                      — N/A (not assigned this shift)
                    </span>
                  </p>
                );
              return (
                <div
                  key={slot.prefix}
                  className="rounded-lg border border-blue-400/20 p-3"
                >
                  <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                    {heading}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                    {slot.fields.map((field) => (
                      <LabelValue
                        key={field.key}
                        label={staffFieldLabel(slot, field)}
                        value={displayValue(values[field.key])}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {equipmentSection && (
            <div className="mt-4 rounded-lg border border-blue-400/20 p-3">
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                Equipment and shift acceptance
              </h3>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                {equipmentSection.fields.map((field) => (
                  <LabelValue
                    key={field.key}
                    label={field.label}
                    value={displayValue(values[field.key])}
                  />
                ))}
              </div>
            </div>
          )}

          <SectionHeading>Inmate counts</SectionHeading>
          <div className="mt-3 space-y-3">
            {config.counts.map((count) => {
              const prefix = `counts.${count.key}`;
              const total = calculateCountTotal(config, count.key, values);
              const fields = canonicalFieldsWithPrefix(config, `${prefix}.`);
              return (
                <div
                  key={count.key}
                  className="rounded-lg border border-blue-400/20 p-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                      {count.label}
                    </h3>
                    <span className="rounded-md border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-100">
                      Total: {total ?? "—"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                    {fields.map((field) => (
                      <LabelValue
                        key={field.key}
                        label={shortFieldLabel(field)}
                        value={displayValue(values[field.key])}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <SectionHeading>Required inspections and activities</SectionHeading>
          <div className="mt-3 space-y-3">
            {config.activities.map((activity, index) => (
              <div
                key={activity.key}
                className="rounded-lg border border-blue-400/20 p-3"
              >
                <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                  {index + 1}. {activity.label}
                </h3>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3">
                  {activity.detailFields.map((field) => (
                    <LabelValue
                      key={field.key}
                      label={shortFieldLabel(field)}
                      value={displayValue(values[field.key])}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <SectionHeading>
            {config.securityCheckLabel.startsWith("Sanitation")
              ? "Sanitation checks"
              : "Security checks"}
          </SectionHeading>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <caption className="sr-only">
                {config.securityCheckCount} required{" "}
                {config.securityCheckLabel.startsWith("Sanitation")
                  ? "sanitation"
                  : "security"}{" "}
                checks with time, role, name, and initials
              </caption>
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-[0.1em] text-blue-300/60">
                  <th scope="col" className="py-1.5 pr-3">
                    Check
                  </th>
                  {/* Column headers derive from the first check row's own
                      canonical fields — the same fields (and the same
                      order) the officer form itself renders for every row —
                      so this can never label a column with the wrong data. */}
                  {canonicalFieldsWithPrefix(config, "securityChecks.1.").map(
                    (field) => (
                      <th key={field.key} scope="col" className="py-1.5 pr-3">
                        {shortFieldLabel(field)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: config.securityCheckCount }, (_, index) => {
                  const prefix = `securityChecks.${index + 1}`;
                  const fields = canonicalFieldsWithPrefix(config, `${prefix}.`);
                  return (
                    <tr
                      key={prefix}
                      className="border-t border-blue-400/10 align-top"
                    >
                      <td className="py-1.5 pr-3 font-bold text-blue-100">
                        #{index + 1}
                      </td>
                      {fields.map((field) => (
                        <td key={field.key} className="py-1.5 pr-3 text-blue-50">
                          {displayValue(values[field.key])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <SectionHeading>Event log</SectionHeading>
          <p className="mt-1 text-xs text-blue-200/60">
            Shown in the exact order entered — never re-sorted by time.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <caption className="sr-only">
                {events.length} logged events in entered order
              </caption>
              <thead>
                <tr className="text-left text-[10px] font-black uppercase tracking-[0.1em] text-blue-300/60">
                  <th scope="col" className="py-1.5 pr-3 w-20">
                    Time
                  </th>
                  <th scope="col" className="py-1.5 pr-3">
                    Event / activity
                  </th>
                  <th scope="col" className="py-1.5 w-20">
                    Initials
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 text-blue-300/60">
                      No events logged.
                    </td>
                  </tr>
                ) : (
                  events.map((event, index) => (
                    <tr
                      key={event.id}
                      className="border-t border-blue-400/10 align-top"
                    >
                      <td className="py-1.5 pr-3 text-blue-50">
                        {index + 1}. {displayValue(event.time)}
                      </td>
                      <td className="whitespace-pre-wrap break-words py-1.5 pr-3 text-blue-50">
                        {event.activity || "—"}
                      </td>
                      <td className="py-1.5 text-blue-50">
                        {displayValue(event.initials)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <SectionHeading>Signatures</SectionHeading>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {config.signatures.map((signature) => {
              const value = signatures[signature.key];
              return (
                <div
                  key={signature.key}
                  className="rounded-lg border border-blue-400/20 p-3"
                >
                  <h3 className="mb-2 text-xs font-bold text-blue-100">
                    {signature.label}
                  </h3>
                  {value ? (
                    <img
                      src={value}
                      alt={`${signature.label} — captured signature`}
                      className="h-24 w-full rounded-md border border-blue-400/20 bg-white object-contain"
                    />
                  ) : (
                    <p className="text-xs text-red-200">Not signed.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {downloadError && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-md border border-red-400/50 bg-red-950/50 px-3 py-2 text-xs text-red-100"
          >
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {downloadError} Nothing has changed — this Housing Log is
            unaffected. You can retry.
          </p>
        )}
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
            disabled={downloading || finalizing}
            className="inline-flex items-center gap-2 rounded-md border border-blue-400/40 bg-blue-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-blue-100 disabled:opacity-40"
          >
            <Download className="h-4 w-4" aria-hidden />{" "}
            {downloading ? "Preparing…" : "Download Current Log"}
          </button>
          <button
            type="button"
            onClick={onFinalize}
            disabled={finalizing || downloading}
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
