import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Plus, Save, Trash2 } from "lucide-react";
import {
  calculateCountTotal,
  getHousingLogConfig,
  housingShifts,
  housingUnits,
  prepareHousingLog,
  validateHousingLog,
  type FieldDefinition,
  type HousingLogDraftInput,
  type HousingLogEvent,
  type HousingLogSignatures,
  type HousingLogValue,
  type HousingShift,
  type HousingUnit,
  type ValidationIssue,
} from "@workspace/housing-log";
import PageShell, { hudInput, hudLabel, hudPanel } from "@/components/PageShell";
import SignaturePad from "@/components/SignaturePad";
import {
  createHousingLogDraft,
  finalizeHousingLog,
  HousingLogApiError,
  updateHousingLogDraft,
} from "@/lib/housingLogApi";

const today = new Date().toISOString().slice(0, 10);

function targetId(path: string): string {
  return `housing-log-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

type FieldControlProps = {
  definition: FieldDefinition;
  value: HousingLogValue | undefined;
  disabled: boolean;
  error: boolean;
  onChange: (value: HousingLogValue) => void;
};

function FieldControl({ definition, value, disabled, error, onChange }: FieldControlProps) {
  const className = `${hudInput} ${error ? "border-red-400 ring-2 ring-red-400/25" : ""}`;
  const common = {
    id: targetId(`values.${definition.key}`),
    disabled,
    "aria-invalid": error,
    value: value ?? "",
    className,
  };
  return (
    <div className={definition.inputType === "textarea" ? "sm:col-span-2" : ""}>
      <label className={hudLabel} htmlFor={common.id}>{definition.label}</label>
      {definition.inputType === "textarea" ? (
        <textarea {...common} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : definition.inputType === "choice" ? (
        <select {...common} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select…</option>
          {definition.options?.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          {...common}
          type={definition.inputType}
          min={definition.inputType === "number" ? 0 : undefined}
          step={definition.inputType === "number" ? 1 : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export default function HousingLog() {
  const [housingUnit, setHousingUnit] = useState<HousingUnit | "">("");
  const [shift, setShift] = useState<HousingShift | "">("");
  const [logDate, setLogDate] = useState(today);
  const [values, setValues] = useState<Record<string, HousingLogValue>>({});
  const [events, setEvents] = useState<HousingLogEvent[]>([]);
  const [signatures, setSignatures] = useState<HousingLogSignatures>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [draftId, setDraftId] = useState<string>();
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);

  const config = useMemo(
    () => housingUnit && shift ? getHousingLogConfig(housingUnit, shift) : undefined,
    [housingUnit, shift],
  );
  const errorPaths = useMemo(() => new Set(issues.map((issue) => issue.path)), [issues]);
  const disabled = busy || status === "finalized";

  const resetForm = () => {
    setValues({});
    setEvents([]);
    setSignatures({});
    setIssues([]);
    setDraftId(undefined);
    setStatus("draft");
    setNotice(undefined);
  };

  const setValue = (key: string, value: HousingLogValue) => {
    setValues((current) => ({ ...current, [key]: value }));
    setIssues((current) => current.filter((issue) => issue.path !== `values.${key}`));
  };

  const buildInput = (): HousingLogDraftInput => {
    if (!config || !housingUnit || !shift) throw new Error("Select a housing unit and shift.");
    return prepareHousingLog({
      logDate,
      housingUnit,
      shift,
      templateVersion: config.templateVersion,
      values,
      events,
      signatures,
    });
  };

  const persistDraft = async (): Promise<{ id: string }> => {
    const input = buildInput();
    const record = draftId
      ? await updateHousingLogDraft(draftId, input)
      : await createHousingLogDraft(input);
    setDraftId(record.id);
    setValues(record.values);
    setEvents(record.events);
    setStatus(record.status);
    return record;
  };

  const saveDraft = async () => {
    if (!config || !logDate) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const record = await persistDraft();
      setNotice(`Draft saved — ${record.id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Draft could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const generateLog = async () => {
    if (!config) return;
    const input = buildInput();
    const nextIssues = validateHousingLog(input);
    setIssues(nextIssues);
    setNotice(undefined);
    if (nextIssues.length) {
      requestAnimationFrame(() => document.getElementById("housing-log-issues")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setBusy(true);
    try {
      const draft = await persistDraft();
      const finalized = await finalizeHousingLog(draft.id);
      setStatus(finalized.status);
      setNotice(`Housing Log finalized successfully — ${finalized.id}`);
    } catch (error) {
      if (error instanceof HousingLogApiError && error.issues.length) setIssues(error.issues);
      setNotice(error instanceof Error ? error.message : "Housing Log could not be finalized.");
    } finally {
      setBusy(false);
    }
  };

  const jumpTo = (path: string) => {
    const element = document.getElementById(targetId(path));
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  };

  const addEvent = () => setEvents((current) => [
    ...current,
    { id: crypto.randomUUID(), time: "", activity: "", initials: "" },
  ]);

  const updateEvent = (id: string, key: keyof Omit<HousingLogEvent, "id">, value: string) => {
    setEvents((current) => current.map((event) => event.id === id ? { ...event, [key]: value } : event));
    setIssues((current) => current.filter((issue) => issue.path !== `events.${id}.${key}`));
  };

  const removeEvent = (id: string) => setEvents((current) => current.filter((event) => event.id !== id));

  return (
    <PageShell
      title="Housing Log"
      subtitle="Digital prototype based on Housing Unit Logs revised 4/27/26. Use test data only."
      icon={ClipboardList}
      maxWidthClass="max-w-6xl"
    >
      <section className={`${hudPanel} p-4 sm:p-5`}>
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">Select official log</h2>
        <p className="mt-1 text-xs text-blue-200/60">Choose the housing unit and shift before entering the log.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className={hudLabel} htmlFor="housing-unit">Housing Unit</label>
            <select id="housing-unit" className={hudInput} disabled={disabled} value={housingUnit} onChange={(event) => { resetForm(); setHousingUnit(event.target.value as HousingUnit | ""); }}>
              <option value="">Select…</option>
              {housingUnits.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </div>
          <div>
            <label className={hudLabel} htmlFor="housing-shift">Shift</label>
            <select id="housing-shift" className={hudInput} disabled={disabled} value={shift} onChange={(event) => { resetForm(); setShift(event.target.value as HousingShift | ""); }}>
              <option value="">Select…</option>
              {housingShifts.map((item) => <option key={item} value={item}>{item === "1" ? "First" : item === "2" ? "Second" : "Third"} shift</option>)}
            </select>
          </div>
          <div>
            <label className={hudLabel} htmlFor={targetId("logDate")}>Log Date</label>
            <input id={targetId("logDate")} type="date" value={logDate} disabled={disabled} onChange={(event) => setLogDate(event.target.value)} className={`${hudInput} ${errorPaths.has("logDate") ? "border-red-400 ring-2 ring-red-400/25" : ""}`} />
          </div>
        </div>
        {config && <p className="mt-3 text-[11px] text-blue-300/55">Official source: worksheet {config.sourceSheet} · template version {config.templateVersion}</p>}
      </section>

      {!config && (
        <div className={`${hudPanel} mt-4 p-8 text-center text-sm text-blue-200/65`}>
          Select both a housing unit and shift to load the applicable official requirements.
        </div>
      )}

      {config && (
        <div className="mt-4 space-y-4">
          {status === "finalized" && (
            <div className="rounded-xl border border-emerald-400/60 bg-emerald-950/70 p-4 text-emerald-100" role="status">
              <div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" /> Housing Log finalized</div>
              <p className="mt-1 text-sm text-emerald-200/75">This stored record is read-only. Record ID: {draftId}</p>
            </div>
          )}

          {issues.length > 0 && (
            <section id="housing-log-issues" className="rounded-xl border border-red-400/70 bg-red-950/70 p-4" role="alert">
              <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-red-100">
                <AlertTriangle className="h-5 w-5" /> Log not ready — {issues.length} {issues.length === 1 ? "item requires" : "items require"} attention
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {issues.map((issue, index) => (
                  <li key={`${issue.path}-${index}`}>
                    <button type="button" onClick={() => jumpTo(issue.path)} className="w-full rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-left text-xs text-red-100 hover:border-red-300">
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {config.sections.map((section) => (
            <section key={section.key} className={`${hudPanel} p-4 sm:p-5`}>
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">{section.title}</h2>
              {section.description && <p className="mt-1 text-xs leading-relaxed text-blue-200/60">{section.description}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {section.fields.map((definition) => (
                  <FieldControl key={definition.key} definition={definition} value={values[definition.key]} disabled={disabled} error={errorPaths.has(`values.${definition.key}`)} onChange={(value) => setValue(definition.key, value)} />
                ))}
              </div>
            </section>
          ))}

          <section className={`${hudPanel} p-4 sm:p-5`}>
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">Required inspections and activities</h2>
            <p className="mt-1 text-xs text-blue-200/60">Complete each preprinted requirement from worksheet {config.sourceSheet}.</p>
            <div className="mt-4 space-y-3">
              {config.activities.map((item, index) => (
                <div key={item.key} className="rounded-lg border border-blue-400/25 bg-blue-950/25 p-3">
                  <h3 className="text-xs font-bold text-blue-100">{index + 1}. {item.label}</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {item.detailFields.map((definition) => (
                      <FieldControl key={definition.key} definition={definition} value={values[definition.key]} disabled={disabled} error={errorPaths.has(`values.${definition.key}`)} onChange={(value) => setValue(definition.key, value)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${hudPanel} p-4 sm:p-5`}>
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">Inmate counts</h2>
            <p className="mt-1 text-xs text-blue-200/60">Component values calculate the total automatically. Operational count judgments remain with staff.</p>
            <div className="mt-4 space-y-4">
              {config.counts.map((count) => {
                const prefix = `counts.${count.key}`;
                const total = calculateCountTotal(config, count.key, values);
                const definitions: FieldDefinition[] = [
                  ...(!count.isBeginning ? [
                    { key: `${prefix}.recallTime`, label: "Recall time", inputType: "time" as const, required: true },
                    { key: `${prefix}.clearTime`, label: "Count clear time", inputType: "time" as const, required: true },
                  ] : []),
                  { key: `${prefix}.countTime`, label: "Count time", inputType: "time", required: true },
                  ...count.components.map((component) => ({ key: `${prefix}.components.${component}`, label: component, inputType: "number" as const, required: true })),
                  { key: `${prefix}.conductedBy`, label: "Conducted by", inputType: "text", required: true },
                  { key: `${prefix}.initials`, label: "Initials", inputType: "text", required: true },
                ];
                return (
                  <div key={count.key} className="rounded-lg border border-blue-400/25 bg-blue-950/25 p-3">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-xs font-bold text-blue-100">{count.label}</h3>
                      <span className="rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-100">Total: {total ?? "—"}</span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {definitions.map((definition) => <FieldControl key={definition.key} definition={definition} value={values[definition.key]} disabled={disabled} error={errorPaths.has(`values.${definition.key}`)} onChange={(value) => setValue(definition.key, value)} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${hudPanel} p-4 sm:p-5`}>
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">Required {config.securityCheckLabel.startsWith("Sanitation") ? "sanitation" : "security"} checks</h2>
            <p className="mt-1 text-xs text-blue-200/60">The official form requires {config.securityCheckCount} entries for this unit and shift.</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {Array.from({ length: config.securityCheckCount }, (_, index) => {
                const prefix = `securityChecks.${index + 1}`;
                const definitions: FieldDefinition[] = [
                  { key: `${prefix}.time`, label: "Time", inputType: "time", required: true },
                  { key: `${prefix}.performedBy`, label: "Completed by", inputType: "text", required: true },
                  { key: `${prefix}.initials`, label: "Initials", inputType: "text", required: true },
                ];
                return (
                  <div key={prefix} className="rounded-lg border border-blue-400/25 bg-blue-950/25 p-3">
                    <h3 className="text-xs font-bold text-blue-100">Check {index + 1}</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {definitions.map((definition) => <FieldControl key={definition.key} definition={definition} value={values[definition.key]} disabled={disabled} error={errorPaths.has(`values.${definition.key}`)} onChange={(value) => setValue(definition.key, value)} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${hudPanel} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">Additional event log</h2>
                <p className="mt-1 text-xs text-blue-200/60">If any part of a row is entered, time, activity, and initials are all required.</p>
              </div>
              <button type="button" onClick={addEvent} disabled={disabled} className="inline-flex items-center gap-2 rounded-md border border-blue-300/50 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-100 disabled:opacity-40"><Plus className="h-4 w-4" /> Add Event</button>
            </div>
            <div className="mt-4 space-y-3">
              {events.length === 0 && <p className="rounded-lg border border-dashed border-blue-400/25 p-4 text-center text-xs text-blue-200/50">No additional events entered.</p>}
              {events.map((event, index) => {
                const unfinished = !(event.time.trim() && event.activity.trim() && event.initials.trim());
                return (
                  <div key={event.id} className="grid gap-3 rounded-lg border border-blue-400/25 bg-blue-950/25 p-3 sm:grid-cols-[140px_1fr_110px_auto] sm:items-end">
                    <div>
                      <label className={hudLabel} htmlFor={targetId(`events.${event.id}.time`)}>Time</label>
                      <input id={targetId(`events.${event.id}.time`)} type="time" value={event.time} disabled={disabled} onChange={(e) => updateEvent(event.id, "time", e.target.value)} className={`${hudInput} ${errorPaths.has(`events.${event.id}.time`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`} />
                    </div>
                    <div>
                      <label className={hudLabel} htmlFor={targetId(`events.${event.id}.activity`)}>Event / Activity</label>
                      <textarea id={targetId(`events.${event.id}.activity`)} rows={2} value={event.activity} disabled={disabled} onChange={(e) => updateEvent(event.id, "activity", e.target.value)} className={`${hudInput} ${errorPaths.has(`events.${event.id}.activity`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`} />
                    </div>
                    <div>
                      <label className={hudLabel} htmlFor={targetId(`events.${event.id}.initials`)}>Initials</label>
                      <input id={targetId(`events.${event.id}.initials`)} value={event.initials} disabled={disabled} onChange={(e) => updateEvent(event.id, "initials", e.target.value)} className={`${hudInput} ${errorPaths.has(`events.${event.id}.initials`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`} />
                    </div>
                    <button type="button" title={unfinished ? `Remove unfinished event ${index + 1}` : "Completed events cannot be removed"} disabled={disabled || !unfinished} onClick={() => removeEvent(event.id)} className="mb-0.5 rounded-md border border-red-400/35 p-2.5 text-red-200 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${hudPanel} p-4 sm:p-5`}>
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-blue-100">Signatures</h2>
            <p className="mt-1 text-xs text-blue-200/60">The official form requires the signature areas shown below before finalization.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {config.signatures.map((signature) => (
                <div key={signature.key} id={targetId(`signatures.${signature.key}`)} tabIndex={-1} className={`rounded-lg border bg-blue-950/25 p-3 ${errorPaths.has(`signatures.${signature.key}`) ? "border-red-400" : "border-blue-400/25"}`}>
                  <h3 className="mb-3 text-xs font-bold text-blue-100">{signature.label}</h3>
                  <SignaturePad label={signature.label} value={signatures[signature.key]} disabled={disabled} hasError={errorPaths.has(`signatures.${signature.key}`)} onChange={(value) => { setSignatures((current) => ({ ...current, [signature.key]: value })); setIssues((current) => current.filter((issue) => issue.path !== `signatures.${signature.key}`)); }} />
                </div>
              ))}
            </div>
          </section>

          <section className={`${hudPanel} sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 p-4`}>
            <div className="min-w-0 text-xs text-blue-200/65">{notice ?? (draftId ? `Draft ID: ${draftId}` : "Not yet saved")}</div>
            <div className="flex gap-2">
              <button type="button" onClick={saveDraft} disabled={disabled || !logDate} className="inline-flex items-center gap-2 rounded-md border border-blue-300/50 bg-blue-500/15 px-4 py-2 text-xs font-bold text-blue-100 disabled:opacity-40"><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save Draft"}</button>
              <button type="button" onClick={generateLog} disabled={disabled} className="inline-flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/20 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> Generate Log</button>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
