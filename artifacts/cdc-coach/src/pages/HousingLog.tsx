import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  ClipboardList,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  calculateCountTotal,
  getEasternCalendarDate,
  getHousingLogConfig,
  hasMeaningfulHousingLogContent,
  housingShifts,
  housingUnits,
  prepareHousingLog,
  validateHousingLog,
  type FieldDefinition,
  type HousingLogDraftInput,
  type HousingLogEvent,
  type HousingLogSummary,
  type HousingLogSignatures,
  type HousingLogValue,
  type HousingShift,
  type HousingUnit,
  type ValidationIssue,
} from "@workspace/housing-log";
import PageShell, { hudInput, hudLabel } from "@/components/PageShell";
import SignaturePad from "@/components/SignaturePad";
import {
  buildSectionIndex,
  canonicalFieldsWithPrefix,
  computeWorkspaceStatus,
  housingLogTaskIds,
  housingLogTaskLabels,
  shortFieldLabel,
  taskForPath,
  type HousingLogTaskId,
} from "@/lib/housingLogSections";
import {
  createHousingLogDraft,
  finalizeHousingLog,
  getHousingLog,
  HousingLogApiError,
  listHousingLogDrafts,
  updateHousingLogDraft,
} from "@/lib/housingLogApi";

const today = getEasternCalendarDate();

// Calm, opaque working surface — the themed artwork stays around the
// workspace instead of showing through behind dense form fields.
const workPanel = "rounded-xl border border-blue-400/25 bg-[#060d24]";
const subCard = "rounded-lg border border-blue-400/20 bg-[#0a1330] p-3";

function targetId(path: string): string {
  return `housing-log-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function shiftName(shift: HousingShift | ""): string {
  return shift === "1"
    ? "First shift"
    : shift === "2"
      ? "Second shift"
      : shift === "3"
        ? "Third shift"
        : "";
}

type FieldControlProps = {
  definition: FieldDefinition;
  value: HousingLogValue | undefined;
  disabled: boolean;
  error: boolean;
  onChange: (value: HousingLogValue) => void;
};

function FieldControl({
  definition,
  value,
  disabled,
  error,
  onChange,
}: FieldControlProps) {
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
      <label className={hudLabel} htmlFor={common.id}>
        {definition.label}
      </label>
      {definition.inputType === "textarea" ? (
        <textarea
          {...common}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : definition.inputType === "choice" ? (
        <select {...common} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select…</option>
          {definition.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
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

type TaskStatusVisual = {
  icon: ReactNode;
  detail: string;
};

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
  const [lastSavedAt, setLastSavedAt] = useState<Date>();
  const [busy, setBusy] = useState(false);
  const [savedDrafts, setSavedDrafts] = useState<HousingLogSummary[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [activeTask, setActiveTask] = useState<HousingLogTaskId>("setup");
  const panelHeadingRefs = useRef<
    Partial<Record<HousingLogTaskId, HTMLHeadingElement | null>>
  >({});

  const config = useMemo(
    () =>
      housingUnit && shift
        ? getHousingLogConfig(housingUnit, shift)
        : undefined,
    [housingUnit, shift],
  );
  const sectionIndex = useMemo(
    () => (config ? buildSectionIndex(config) : undefined),
    [config],
  );
  const errorPaths = useMemo(
    () => new Set(issues.map((issue) => issue.path)),
    [issues],
  );
  const disabled = busy || status === "finalized";
  const hasMeaningfulData = hasMeaningfulHousingLogContent({
    values,
    events,
    signatures,
  });

  // Live task statuses derived from the canonical validator — the same
  // validateHousingLog used at finalization. No parallel required-field list.
  const workspace = useMemo(() => {
    if (!config || !housingUnit || !shift) return undefined;
    return computeWorkspaceStatus(
      config,
      prepareHousingLog({
        logDate,
        housingUnit,
        shift,
        templateVersion: config.templateVersion,
        values,
        events,
        signatures,
      }),
    );
  }, [config, housingUnit, shift, logDate, values, events, signatures]);

  const refreshSavedDrafts = async () => {
    try {
      setSavedDrafts(await listHousingLogDrafts());
    } catch {
      setSavedDrafts([]);
    }
  };

  useEffect(() => {
    void refreshSavedDrafts();
  }, []);

  const resetForm = () => {
    setValues({});
    setEvents([]);
    setSignatures({});
    setIssues([]);
    setDraftId(undefined);
    setStatus("draft");
    setNotice(undefined);
    setLastSavedAt(undefined);
  };

  const confirmDiscard = (): boolean =>
    !hasMeaningfulData ||
    window.confirm(
      "Changing this selection will clear the Housing Log data currently shown. Continue?",
    );

  const changeHousingUnit = (next: HousingUnit | "") => {
    if (!confirmDiscard()) return;
    resetForm();
    setHousingUnit(next);
  };

  const changeShift = (next: HousingShift | "") => {
    if (!confirmDiscard()) return;
    resetForm();
    setShift(next);
  };

  const resumeDraft = async () => {
    if (!resumeId || !confirmDiscard()) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const record = await getHousingLog(resumeId);
      setHousingUnit(record.housingUnit);
      setShift(record.shift);
      setLogDate(record.logDate);
      setValues(record.values);
      setEvents(record.events);
      setSignatures(record.signatures);
      setIssues([]);
      setDraftId(record.id);
      setStatus(record.status);
      setLastSavedAt(new Date(record.updatedAt));
      setNotice(`Draft resumed — ${record.id}`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Draft could not be reopened.",
      );
    } finally {
      setBusy(false);
    }
  };

  const setValue = (key: string, value: HousingLogValue) => {
    setValues((current) => ({ ...current, [key]: value }));
    setIssues((current) =>
      current.filter((issue) => issue.path !== `values.${key}`),
    );
  };

  const buildInput = (): HousingLogDraftInput => {
    if (!config || !housingUnit || !shift)
      throw new Error("Select a housing unit and shift.");
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
    setLastSavedAt(new Date());
    return record;
  };

  const saveDraft = async () => {
    if (!config || !logDate) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const record = await persistDraft();
      setNotice(`Draft saved — ${record.id}`);
      await refreshSavedDrafts();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };

  const goToTask = (task: HousingLogTaskId) => {
    setActiveTask(task);
    requestAnimationFrame(() => {
      const heading = panelHeadingRefs.current[task];
      heading?.scrollIntoView({ behavior: "smooth", block: "start" });
      heading?.focus({ preventScroll: true });
    });
  };

  const goToPath = (path: string) => {
    if (sectionIndex) setActiveTask(taskForPath(path, sectionIndex));
    requestAnimationFrame(() => {
      const element = document.getElementById(targetId(path));
      element?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (element instanceof HTMLElement)
        element.focus({ preventScroll: true });
    });
  };

  const generateLog = async () => {
    if (!config) return;
    const input = buildInput();
    const nextIssues = validateHousingLog(input);
    setIssues(nextIssues);
    setNotice(undefined);
    if (nextIssues.length) {
      setActiveTask("review");
      requestAnimationFrame(() =>
        document
          .getElementById("housing-log-issues")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
      return;
    }
    setBusy(true);
    try {
      const draft = await persistDraft();
      const finalized = await finalizeHousingLog(draft.id);
      setStatus(finalized.status);
      setNotice(`Housing Log finalized successfully — ${finalized.id}`);
      await refreshSavedDrafts();
    } catch (error) {
      if (error instanceof HousingLogApiError && error.issues.length)
        setIssues(error.issues);
      setNotice(
        error instanceof Error
          ? error.message
          : "Housing Log could not be finalized.",
      );
    } finally {
      setBusy(false);
    }
  };

  const addEvent = (): string => {
    const id = crypto.randomUUID();
    setEvents((current) => [
      ...current,
      { id, time: "", activity: "", initials: "" },
    ]);
    return id;
  };

  const addEventAndFocus = () => {
    if (disabled) return;
    const id = addEvent();
    setActiveTask("events");
    requestAnimationFrame(() => {
      const input = document.getElementById(targetId(`events.${id}.time`));
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (input instanceof HTMLElement) input.focus({ preventScroll: true });
    });
  };

  const updateEvent = (
    id: string,
    key: keyof Omit<HousingLogEvent, "id">,
    value: string,
  ) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === id ? { ...event, [key]: value } : event,
      ),
    );
    setIssues((current) =>
      current.filter((issue) => issue.path !== `events.${id}.${key}`),
    );
  };

  const removeEvent = (id: string) =>
    setEvents((current) => current.filter((event) => event.id !== id));

  const statusVisual = (task: HousingLogTaskId): TaskStatusVisual => {
    if (!workspace) {
      if (task === "setup")
        return {
          icon: <CircleDot className="h-4 w-4 text-blue-300" aria-hidden />,
          detail: "Start here",
        };
      return {
        icon: <Circle className="h-4 w-4 text-blue-300/40" aria-hidden />,
        detail: "Select unit & shift first",
      };
    }
    const info = workspace.tasks[task];
    if (info.ready) {
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden />,
        detail:
          task === "events" && !info.started ? "Optional — none yet" : "Ready",
      };
    }
    if (info.started) {
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />,
        detail: `${info.remaining} remaining`,
      };
    }
    return {
      icon: <Circle className="h-4 w-4 text-blue-300/50" aria-hidden />,
      detail: `${info.remaining} required`,
    };
  };

  const navButton = (task: HousingLogTaskId, compact: boolean) => {
    const visual = statusVisual(task);
    const active = activeTask === task;
    const locked = !config && task !== "setup";
    return (
      <button
        key={task}
        type="button"
        onClick={() => goToTask(task)}
        disabled={locked}
        aria-current={active ? "true" : undefined}
        className={`${
          compact
            ? "flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left"
            : "flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left"
        } transition-colors ${
          active
            ? "border-blue-300/70 bg-blue-500/20 text-blue-50"
            : "border-blue-400/20 bg-[#0a1330] text-blue-200/80 hover:border-blue-300/50 hover:text-blue-100"
        } disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {visual.icon}
        <span className="min-w-0">
          <span className="block text-xs font-bold leading-tight">
            {housingLogTaskLabels[task]}
          </span>
          <span className="block text-[10px] leading-tight text-blue-200/55">
            {visual.detail}
          </span>
        </span>
      </button>
    );
  };

  const panelHidden = (task: HousingLogTaskId) =>
    activeTask !== task || (!config && task !== "setup");

  const panelHeading = (task: HousingLogTaskId, text: string) => (
    <h2
      ref={(node) => {
        panelHeadingRefs.current[task] = node;
      }}
      tabIndex={-1}
      className="scroll-mt-28 text-sm font-black uppercase tracking-[0.14em] text-blue-100 outline-none"
    >
      {text}
    </h2>
  );

  const readySummary = workspace
    ? `${workspace.readySections} of ${housingLogTaskIds.length} sections ready • ${workspace.totalRemaining} required ${workspace.totalRemaining === 1 ? "item" : "items"} remaining`
    : "Select a housing unit and shift to begin";

  return (
    <PageShell
      title="Housing Log"
      subtitle="Digital prototype based on Housing Unit Logs revised 4/27/26. Use test data only."
      icon={ClipboardList}
      maxWidthClass="max-w-6xl"
    >
      {/* ── Compact current-log summary header ── */}
      <div
        className={`${workPanel} sticky top-2 z-30 p-3 sm:p-4`}
        role="region"
        aria-label="Current Housing Log summary"
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-bold text-blue-100">
              <span className="uppercase tracking-[0.12em]">
                {housingUnit ? `Unit ${housingUnit}` : "No unit selected"}
              </span>
              {shift && <span>{shiftName(shift)}</span>}
              <span className="text-blue-200/70">{logDate}</span>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                  status === "finalized"
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                    : "border-blue-400/40 bg-blue-500/10 text-blue-200"
                }`}
              >
                {status === "finalized" ? "Finalized" : "Draft"}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-blue-200/60">
              {readySummary}
              {lastSavedAt &&
                ` • Last saved ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={addEventAndFocus}
              disabled={disabled || !config}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300/50 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-100 hover:border-blue-200/70 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden /> Add Event
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={disabled || !config || !logDate}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/60 bg-blue-400/25 px-3 py-2 text-xs font-black text-blue-50 hover:border-blue-100/80 disabled:opacity-40"
            >
              <Save className="h-4 w-4" aria-hidden />{" "}
              {busy ? "Saving…" : "Save Draft"}
            </button>
          </div>
        </div>
        {notice && (
          <p className="mt-2 text-[11px] text-blue-200/75" role="status">
            {notice}
          </p>
        )}
      </div>

      {/* ── Mobile / tablet task navigator ── */}
      <nav
        aria-label="Housing Log tasks"
        className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden"
      >
        {housingLogTaskIds.map((task) => navButton(task, true))}
      </nav>

      <div className="mt-3 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-4">
        {/* ── Desktop task rail ── */}
        <nav
          aria-label="Housing Log tasks"
          className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-2"
        >
          {housingLogTaskIds.map((task) => navButton(task, false))}
        </nav>

        {/* ── Focused work area ── */}
        <div className="min-w-0 space-y-4">
          {status === "finalized" && (
            <div
              className="rounded-xl border border-emerald-400/60 bg-emerald-950/80 p-4 text-emerald-100"
              role="status"
            >
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-5 w-5" aria-hidden /> Housing Log
                finalized
              </div>
              <p className="mt-1 text-sm text-emerald-200/75">
                This stored record is read-only. Record ID: {draftId}
              </p>
            </div>
          )}

          {/* ── 1. Shift Setup ── */}
          <section
            hidden={panelHidden("setup")}
            aria-labelledby="housing-log-panel-setup"
            className={`${workPanel} p-4 sm:p-5`}
          >
            <div id="housing-log-panel-setup">
              {panelHeading("setup", "Shift Setup")}
            </div>
            <p className="mt-1 text-xs text-blue-200/60">
              Choose the housing unit and shift to load the official
              requirements, or resume a saved draft.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className={hudLabel} htmlFor="housing-unit">
                  Housing Unit
                </label>
                <select
                  id="housing-unit"
                  className={hudInput}
                  disabled={disabled}
                  value={housingUnit}
                  onChange={(event) =>
                    changeHousingUnit(event.target.value as HousingUnit | "")
                  }
                >
                  <option value="">Select…</option>
                  {housingUnits.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={hudLabel} htmlFor="housing-shift">
                  Shift
                </label>
                <select
                  id="housing-shift"
                  className={hudInput}
                  disabled={disabled}
                  value={shift}
                  onChange={(event) =>
                    changeShift(event.target.value as HousingShift | "")
                  }
                >
                  <option value="">Select…</option>
                  {housingShifts.map((item) => (
                    <option key={item} value={item}>
                      {shiftName(item)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={hudLabel} htmlFor={targetId("logDate")}>
                  Log Date
                </label>
                <input
                  id={targetId("logDate")}
                  type="date"
                  value={logDate}
                  disabled={disabled}
                  onChange={(event) => setLogDate(event.target.value)}
                  className={`${hudInput} ${errorPaths.has("logDate") ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                />
              </div>
            </div>
            {config && (
              <p className="mt-3 text-[11px] text-blue-300/55">
                Official source: worksheet {config.sourceSheet} · template
                version {config.templateVersion}
              </p>
            )}
            <div className="mt-4 border-t border-blue-400/20 pt-4">
              <label className={hudLabel} htmlFor="housing-log-resume">
                Resume a saved draft
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id="housing-log-resume"
                  className={hudInput}
                  disabled={busy || savedDrafts.length === 0}
                  value={resumeId}
                  onChange={(event) => setResumeId(event.target.value)}
                >
                  <option value="">
                    {savedDrafts.length
                      ? "Select a draft…"
                      : "No saved drafts available"}
                  </option>
                  {savedDrafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.logDate} · {draft.housingUnit} ·{" "}
                      {shiftName(draft.shift)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !resumeId}
                  onClick={resumeDraft}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-blue-300/50 bg-blue-500/15 px-4 py-2 text-xs font-bold text-blue-100 disabled:opacity-40"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden /> Resume Draft
                </button>
              </div>
            </div>
            {config ? (
              <div className="mt-4 rounded-lg border border-blue-300/30 bg-blue-500/10 p-3">
                <p className="text-xs text-blue-100">
                  Setup complete. Continue with{" "}
                  <button
                    type="button"
                    onClick={() => goToTask("staff")}
                    className="font-bold underline decoration-blue-300/60 underline-offset-2 hover:text-white"
                  >
                    Staff &amp; Equipment
                  </button>{" "}
                  or jump to any task from the navigator.
                </p>
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-blue-400/25 p-4 text-center text-xs text-blue-200/55">
                Select both a housing unit and shift to unlock the remaining
                tasks.
              </p>
            )}
          </section>

          {config && (
            <>
              {/* ── 2. Staff & Equipment ── */}
              <section
                hidden={panelHidden("staff")}
                aria-labelledby="housing-log-panel-staff"
                className={`${workPanel} p-4 sm:p-5`}
              >
                <div id="housing-log-panel-staff">
                  {panelHeading("staff", "Staff & Equipment")}
                </div>
                <div className="mt-4 space-y-5">
                  {config.sections.map((section) => (
                    <fieldset
                      key={section.key}
                      className="rounded-lg border border-blue-400/20 p-3 sm:p-4"
                    >
                      <legend className="px-2 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                        {section.key === "staff"
                          ? "Staff on Duty"
                          : section.key === "equipment"
                            ? "Equipment / Accountability"
                            : section.title}
                      </legend>
                      <p className="text-[11px] leading-relaxed text-blue-200/55">
                        {section.title}
                        {section.description ? ` — ${section.description}` : ""}
                      </p>
                      <div className="mt-3 grid gap-4 sm:grid-cols-2">
                        {section.fields.map((definition) => (
                          <FieldControl
                            key={definition.key}
                            definition={definition}
                            value={values[definition.key]}
                            disabled={disabled}
                            error={errorPaths.has(`values.${definition.key}`)}
                            onChange={(value) =>
                              setValue(definition.key, value)
                            }
                          />
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </section>

              {/* ── 3. Counts & Required Activities ── */}
              <section
                hidden={panelHidden("counts")}
                aria-labelledby="housing-log-panel-counts"
                className={`${workPanel} p-4 sm:p-5`}
              >
                <div id="housing-log-panel-counts">
                  {panelHeading("counts", "Counts & Required Activities")}
                </div>

                <h3 className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                  Inmate counts
                </h3>
                <p className="mt-1 text-xs text-blue-200/60">
                  Component values calculate the total automatically.
                  Operational count judgments remain with staff.
                </p>
                <div className="mt-3 space-y-4">
                  {config.counts.map((count) => {
                    const prefix = `counts.${count.key}`;
                    const total = calculateCountTotal(
                      config,
                      count.key,
                      values,
                    );
                    // Canonical fields for this count — no parallel list.
                    const definitions: FieldDefinition[] =
                      canonicalFieldsWithPrefix(config, `${prefix}.`).map(
                        (definition) => ({
                          ...definition,
                          label: shortFieldLabel(definition),
                        }),
                      );
                    return (
                      <div key={count.key} className={subCard}>
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="text-xs font-bold text-blue-100">
                            {count.label}
                          </h4>
                          <span className="rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-100">
                            Total: {total ?? "—"}
                          </span>
                        </div>
                        {count.officialAttestation && (
                          <p className="mt-3 rounded-md border border-blue-400/25 bg-[#0d1738] px-3 py-2 text-xs leading-relaxed text-blue-100">
                            Official count attestation:{" "}
                            {count.officialAttestation} The entered initials
                            attest to this requirement.
                          </p>
                        )}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {definitions.map((definition) => (
                            <FieldControl
                              key={definition.key}
                              definition={definition}
                              value={values[definition.key]}
                              disabled={disabled}
                              error={errorPaths.has(
                                `values.${definition.key}`,
                              )}
                              onChange={(value) =>
                                setValue(definition.key, value)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <h3 className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                  Required inspections and activities
                </h3>
                <p className="mt-1 text-xs text-blue-200/60">
                  Complete each preprinted requirement from worksheet{" "}
                  {config.sourceSheet}.
                </p>
                <div className="mt-3 space-y-3">
                  {config.activities.map((item, index) => (
                    <div key={item.key} className={subCard}>
                      <h4 className="text-xs font-bold text-blue-100">
                        {index + 1}. {item.label}
                      </h4>
                      {item.sourceNote && (
                        <p className="mt-2 rounded-md border border-amber-400/35 bg-amber-950/40 px-3 py-2 text-xs leading-relaxed text-amber-100">
                          Source-form discrepancy: {item.sourceNote}
                        </p>
                      )}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {item.detailFields.map((definition) => (
                          <FieldControl
                            key={definition.key}
                            definition={definition}
                            value={values[definition.key]}
                            disabled={disabled}
                            error={errorPaths.has(`values.${definition.key}`)}
                            onChange={(value) =>
                              setValue(definition.key, value)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── 4. Security Checks ── */}
              <section
                hidden={panelHidden("checks")}
                aria-labelledby="housing-log-panel-checks"
                className={`${workPanel} p-4 sm:p-5`}
              >
                <div id="housing-log-panel-checks">
                  {panelHeading(
                    "checks",
                    config.securityCheckLabel.startsWith("Sanitation")
                      ? "Sanitation Checks"
                      : "Security Checks",
                  )}
                </div>
                <p className="mt-1 text-xs text-blue-200/60">
                  The official form requires {config.securityCheckCount}{" "}
                  entries for this unit and shift.
                </p>
                <div
                  aria-hidden
                  className="mt-4 hidden grid-cols-[64px_1fr_1fr_110px] gap-3 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-blue-300/60 sm:grid"
                >
                  <span>Check</span>
                  <span>Time</span>
                  <span>Completed by</span>
                  <span>Initials</span>
                </div>
                <ul className="mt-2 space-y-2">
                  {Array.from(
                    { length: config.securityCheckCount },
                    (_, index) => {
                      const prefix = `securityChecks.${index + 1}`;
                      // Canonical fields for this check row — no parallel list.
                      const rowFields: FieldDefinition[] =
                        canonicalFieldsWithPrefix(config, `${prefix}.`).map(
                          (definition) => ({
                            ...definition,
                            label: shortFieldLabel(definition),
                          }),
                        );
                      const rowDone = rowFields.every(
                        (field) =>
                          !isBlankRow(values[field.key]),
                      );
                      return (
                        <li
                          key={prefix}
                          className={`${subCard} grid gap-3 sm:grid-cols-[64px_1fr_1fr_110px] sm:items-center`}
                        >
                          <div className="flex items-center gap-1.5 text-xs font-bold text-blue-100">
                            {rowDone ? (
                              <CheckCircle2
                                className="h-4 w-4 text-emerald-300"
                                aria-hidden
                              />
                            ) : (
                              <Circle
                                className="h-4 w-4 text-blue-300/40"
                                aria-hidden
                              />
                            )}
                            <span>#{index + 1}</span>
                            <span className="sr-only">
                              {rowDone ? "complete" : "incomplete"}
                            </span>
                          </div>
                          {rowFields.map((definition) => (
                            <div key={definition.key}>
                              <label
                                className={`${hudLabel} sm:sr-only`}
                                htmlFor={targetId(`values.${definition.key}`)}
                              >
                                Check {index + 1} — {definition.label}
                              </label>
                              <input
                                id={targetId(`values.${definition.key}`)}
                                type={
                                  definition.inputType === "time"
                                    ? "time"
                                    : "text"
                                }
                                value={String(values[definition.key] ?? "")}
                                disabled={disabled}
                                aria-invalid={errorPaths.has(
                                  `values.${definition.key}`,
                                )}
                                onChange={(event) =>
                                  setValue(definition.key, event.target.value)
                                }
                                className={`${hudInput} ${errorPaths.has(`values.${definition.key}`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                              />
                            </div>
                          ))}
                        </li>
                      );
                    },
                  )}
                </ul>
              </section>

              {/* ── 5. Event Log ── */}
              <section
                hidden={panelHidden("events")}
                aria-labelledby="housing-log-panel-events"
                className={`${workPanel} p-4 sm:p-5`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div id="housing-log-panel-events">
                    {panelHeading("events", "Event Log")}
                    <p className="mt-1 text-xs text-blue-200/60">
                      If any part of a row is entered, time, activity, and
                      initials are all required.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addEventAndFocus}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 rounded-md border border-blue-300/50 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-100 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" aria-hidden /> Add Event
                  </button>
                </div>
                <ol className="mt-4 space-y-3">
                  {events.length === 0 && (
                    <li className="list-none rounded-lg border border-dashed border-blue-400/25 p-4 text-center text-xs text-blue-200/50">
                      No additional events entered.
                    </li>
                  )}
                  {events.map((event, index) => {
                    const unfinished = !(
                      event.time.trim() &&
                      event.activity.trim() &&
                      event.initials.trim()
                    );
                    return (
                      <li
                        key={event.id}
                        className={`${subCard} grid gap-3 sm:grid-cols-[36px_120px_1fr_100px_auto] sm:items-start`}
                      >
                        <span
                          className="pt-2 text-xs font-black text-blue-300/70"
                          aria-hidden
                        >
                          {index + 1}.
                        </span>
                        <div>
                          <label
                            className={hudLabel}
                            htmlFor={targetId(`events.${event.id}.time`)}
                          >
                            Time
                          </label>
                          <input
                            id={targetId(`events.${event.id}.time`)}
                            type="time"
                            value={event.time}
                            disabled={disabled}
                            aria-invalid={errorPaths.has(
                              `events.${event.id}.time`,
                            )}
                            onChange={(e) =>
                              updateEvent(event.id, "time", e.target.value)
                            }
                            className={`${hudInput} ${errorPaths.has(`events.${event.id}.time`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                          />
                        </div>
                        <div>
                          <label
                            className={hudLabel}
                            htmlFor={targetId(`events.${event.id}.activity`)}
                          >
                            Event / Activity
                          </label>
                          <textarea
                            id={targetId(`events.${event.id}.activity`)}
                            rows={2}
                            value={event.activity}
                            disabled={disabled}
                            aria-invalid={errorPaths.has(
                              `events.${event.id}.activity`,
                            )}
                            onChange={(e) =>
                              updateEvent(event.id, "activity", e.target.value)
                            }
                            className={`${hudInput} ${errorPaths.has(`events.${event.id}.activity`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                          />
                        </div>
                        <div>
                          <label
                            className={hudLabel}
                            htmlFor={targetId(`events.${event.id}.initials`)}
                          >
                            Initials
                          </label>
                          <input
                            id={targetId(`events.${event.id}.initials`)}
                            value={event.initials}
                            disabled={disabled}
                            aria-invalid={errorPaths.has(
                              `events.${event.id}.initials`,
                            )}
                            onChange={(e) =>
                              updateEvent(event.id, "initials", e.target.value)
                            }
                            className={`${hudInput} ${errorPaths.has(`events.${event.id}.initials`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                          />
                        </div>
                        <button
                          type="button"
                          title={
                            unfinished
                              ? `Remove unfinished event ${index + 1}`
                              : "Completed events cannot be removed"
                          }
                          disabled={disabled || !unfinished}
                          onClick={() => removeEvent(event.id)}
                          className="mt-6 rounded-md border border-red-400/35 p-2.5 text-red-200 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          <span className="sr-only">
                            Remove event {index + 1}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>

              {/* ── 6. Review & Signatures ── */}
              <section
                hidden={panelHidden("review")}
                aria-labelledby="housing-log-panel-review"
                className={`${workPanel} p-4 sm:p-5`}
              >
                <div id="housing-log-panel-review">
                  {panelHeading("review", "Review & Signatures")}
                </div>

                {workspace && (
                  <div className="mt-4 rounded-lg border border-blue-400/20 bg-[#0a1330] p-3">
                    <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                      Shift review — {readySummary}
                    </h3>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {housingLogTaskIds
                        .filter((task) => task !== "review")
                        .map((task) => {
                          const info = workspace.tasks[task];
                          return (
                            <li
                              key={task}
                              className="flex items-center justify-between gap-3 rounded-md border border-blue-400/15 px-3 py-2"
                            >
                              <span className="flex items-center gap-2 text-xs text-blue-100">
                                {statusVisual(task).icon}
                                {housingLogTaskLabels[task]}
                              </span>
                              {info.ready ? (
                                <span className="text-[11px] font-bold text-emerald-300">
                                  Ready
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => goToTask(task)}
                                  className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-200 hover:border-amber-300"
                                >
                                  {info.remaining} remaining →
                                </button>
                              )}
                            </li>
                          );
                        })}
                    </ul>
                  </div>
                )}

                {issues.length > 0 && (
                  <section
                    id="housing-log-issues"
                    className="mt-4 rounded-xl border border-red-400/70 bg-red-950/80 p-4"
                    role="alert"
                  >
                    <div className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.1em] text-red-100">
                      <AlertTriangle className="h-5 w-5" aria-hidden /> Log not
                      ready — {issues.length}{" "}
                      {issues.length === 1 ? "item requires" : "items require"}{" "}
                      attention
                    </div>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {issues.map((issue, index) => (
                        <li key={`${issue.path}-${index}`}>
                          <button
                            type="button"
                            onClick={() => goToPath(issue.path)}
                            className="w-full rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-left text-xs text-red-100 hover:border-red-300"
                          >
                            {issue.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <h3 className="mt-6 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                  Signatures
                </h3>
                <p className="mt-1 text-xs text-blue-200/60">
                  The official form requires the signature areas shown below
                  before finalization.
                </p>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  {config.signatures.map((signature) => (
                    <div
                      key={signature.key}
                      id={targetId(`signatures.${signature.key}`)}
                      tabIndex={-1}
                      className={`rounded-lg border bg-[#0a1330] p-3 ${errorPaths.has(`signatures.${signature.key}`) ? "border-red-400" : "border-blue-400/20"}`}
                    >
                      <h4 className="mb-3 text-xs font-bold text-blue-100">
                        {signature.label}
                      </h4>
                      <SignaturePad
                        label={signature.label}
                        value={signatures[signature.key]}
                        disabled={disabled}
                        hasError={errorPaths.has(
                          `signatures.${signature.key}`,
                        )}
                        onChange={(value) => {
                          setSignatures((current) => ({
                            ...current,
                            [signature.key]: value,
                          }));
                          setIssues((current) =>
                            current.filter(
                              (issue) =>
                                issue.path !== `signatures.${signature.key}`,
                            ),
                          );
                        }}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-blue-400/20 pt-4">
                  <div className="min-w-0 text-xs text-blue-200/65">
                    {notice ??
                      (draftId ? `Draft ID: ${draftId}` : "Not yet saved")}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveDraft}
                      disabled={disabled || !logDate}
                      className="inline-flex items-center gap-2 rounded-md border border-blue-300/50 bg-blue-500/15 px-4 py-2.5 text-xs font-bold text-blue-100 disabled:opacity-40"
                    >
                      <Save className="h-4 w-4" aria-hidden />{" "}
                      {busy ? "Saving…" : "Save Draft"}
                    </button>
                    <button
                      type="button"
                      onClick={generateLog}
                      disabled={disabled}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Finalize
                      Housing Log
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function isBlankRow(value: HousingLogValue | undefined): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}
