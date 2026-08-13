import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleDot,
  ClipboardList,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  calculateCountTotal,
  getEasternCalendarDate,
  getHousingLogConfig,
  hasMeaningfulHousingLogContent,
  housingShifts,
  housingUnitLabels,
  housingUnits,
  prepareHousingLog,
  validateHousingLog,
  type FieldDefinition,
  type HousingLogEvent,
  type HousingLogSignatures,
  type HousingLogValue,
  type HousingShift,
  type HousingUnit,
  type ValidationIssue,
} from "@workspace/housing-log";
import PageShell, { hudInput, hudLabel } from "@/components/PageShell";
import SignaturePad, {
  type SignaturePadHandle,
} from "@/components/SignaturePad";
import {
  cryptoRng,
  generateCompleteDemoValues,
  generateIncompleteDemoValues,
  generateSignatureStrokePoints,
  type DemoRng,
} from "@/lib/housingLogDemoSeed";
import {
  buildSectionIndex,
  canonicalFieldsWithPrefix,
  computeWorkspaceStatus,
  housingLogTaskIds,
  housingLogTaskLabels,
  isStaffSlotNA,
  keyRingSuggestions,
  shortFieldLabel,
  STAFF_NA_VALUE,
  staffFieldLabel,
  staffSlotsForConfig,
  taskForPath,
  type HousingLogTaskId,
  type StaffSlot,
} from "@/lib/housingLogSections";
import { formatLogDateForDisplay } from "@/lib/housingLogArchive";
import { finalizeHousingLog, HousingLogApiError } from "@/lib/housingLogApi";
import {
  clearHousingLogLocalState,
  createSubmissionId,
  emptyHousingLogLocalWorkingState,
  loadHousingLogLocalState,
  saveHousingLogLocalState,
  type HousingLogLocalWorkingState,
} from "@/lib/housingLogLocalStore";
import {
  createHousingLogTabLock,
  type HousingLogTabLock,
  type HousingLogTabStatus,
} from "@/lib/housingLogTabLock";

const today = getEasternCalendarDate();
const AUTOSAVE_DEBOUNCE_MS = 500;

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

/**
 * Fields whose real-world values are short codes (key-ring IDs, cuff/radio
 * numbers, initials, seals, alarms) or inherently short input types (time,
 * number, choice) get a narrow control instead of a full-card-width one —
 * the control width should match the data ("C1", "153B"), not the label.
 */
function isCompactField(definition: FieldDefinition): boolean {
  if (
    definition.inputType === "time" ||
    definition.inputType === "number" ||
    definition.inputType === "choice"
  ) {
    return true;
  }
  if (definition.inputType !== "text") return false;
  const key = definition.key.toLowerCase();
  return /keyring|radio|cuff|bodyalarm|seal|chemicalagent|initials$/.test(
    key,
  );
}

/**
 * A fixed, per-type max width so every time field is the same width as
 * every other time field, every initials field the same as every other
 * initials field, and so on — instead of every compact control stretching
 * to fill whatever grid track it happens to land in (`hudInput` is
 * `w-full`, so it fills its wrapping div; capping that div's width is what
 * actually makes the control narrow).
 */
function compactWidthClass(definition: FieldDefinition): string {
  if (definition.inputType === "time") return "sm:max-w-[130px]";
  if (definition.inputType === "number") return "sm:max-w-[90px]";
  if (definition.inputType === "choice") return "sm:max-w-[160px]";
  if (/initials$/i.test(definition.key)) return "sm:max-w-[100px]";
  return "sm:max-w-[140px]";
}

type FieldControlProps = {
  definition: FieldDefinition;
  value: HousingLogValue | undefined;
  disabled: boolean;
  error: boolean;
  onChange: (value: HousingLogValue) => void;
  suggestions?: string[];
};

function FieldControl({
  definition,
  value,
  disabled,
  error,
  onChange,
  suggestions,
}: FieldControlProps) {
  const compact = isCompactField(definition);
  const className = `${hudInput} ${error ? "border-red-400 ring-2 ring-red-400/25" : ""}`;
  const common = {
    id: targetId(`values.${definition.key}`),
    disabled,
    "aria-invalid": error,
    value: value ?? "",
    className,
  };
  const listId = suggestions ? `${common.id}-list` : undefined;
  // Flex row, not a grid: a compact control (time/role/initials/short code)
  // shrinks to its fixed width and never grows past it; a name/text field
  // grows to fill whatever space is left in the row. This is what keeps a
  // row of "Time / Role / Name / Initials" reading as one aligned line
  // instead of every control stretching to an equal-width grid track.
  const spanClass =
    definition.inputType === "textarea"
      ? "w-full basis-full"
      : compact
        ? `w-full shrink-0 ${compactWidthClass(definition)}`
        : "min-w-[160px] flex-1 basis-[160px]";
  return (
    <div className={spanClass}>
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
        <>
          <input
            {...common}
            type={definition.inputType}
            list={listId}
            min={definition.inputType === "number" ? 0 : undefined}
            step={definition.inputType === "number" ? 1 : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
          {listId && (
            <datalist id={listId}>
              {suggestions?.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          )}
        </>
      )}
    </div>
  );
}

type TaskStatusVisual = {
  icon: ReactNode;
  detail: string;
};

/** Build the payload sent to the local store from the component's live state. */
function toLocalWorkingState(
  base: HousingLogLocalWorkingState,
  patch: Partial<HousingLogLocalWorkingState>,
): HousingLogLocalWorkingState {
  return { ...base, ...patch, savedAt: new Date().toISOString() };
}

export default function HousingLog() {
  const [housingUnit, setHousingUnit] = useState<HousingUnit | "">("");
  const [shift, setShift] = useState<HousingShift | "">("");
  const [logDate, setLogDate] = useState(today);
  const [values, setValues] = useState<Record<string, HousingLogValue>>({});
  const [events, setEvents] = useState<HousingLogEvent[]>([]);
  const [signatures, setSignatures] = useState<HousingLogSignatures>({});
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [submissionId, setSubmissionId] = useState<string>(() =>
    createSubmissionId(),
  );
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [notice, setNotice] = useState<string>();
  const [finalizeError, setFinalizeError] = useState<string>();
  const [finalizedAt, setFinalizedAt] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [activeTask, setActiveTask] = useState<HousingLogTaskId>("setup");
  const panelHeadingRefs = useRef<
    Partial<Record<HousingLogTaskId, HTMLHeadingElement | null>>
  >({});

  // ── Local-only working state (IndexedDB) — restore / autosave / storage health ──
  const [restoreState, setRestoreState] = useState<
    "loading" | "restored" | "none" | "incompatible" | "unavailable"
  >("loading");
  const [restoreBannerDismissed, setRestoreBannerDismissed] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<
    "idle" | "saving" | "saved" | "unavailable"
  >("idle");
  const [localSavedAt, setLocalSavedAt] = useState<Date>();
  const [storageWarning, setStorageWarning] = useState<string>();
  const hydratedRef = useRef(false);
  const skipNextAutosaveRef = useRef(false);

  // ── Same-device cross-tab coordination ──
  const [tabStatus, setTabStatus] = useState<HousingLogTabStatus>("active");
  const tabLockRef = useRef<HousingLogTabLock | undefined>(undefined);

  // ── Unit/shift/date change guard (protects the one local working log) ──
  const [pendingChange, setPendingChange] = useState<
    { housingUnit: HousingUnit | ""; shift: HousingShift | ""; logDate: string }
    | undefined
  >();

  // ── Clear Current Log confirmation ──
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearError, setClearError] = useState<string>();
  // True once the server has confirmed finalization but the local IndexedDB
  // copy could not (yet) be removed — the record is safely finalized either
  // way; this only tracks whether the device still holds a stale local copy.
  const [localClearPending, setLocalClearPending] = useState(false);

  // ── Demo mode (?demo=1) — proof-of-concept fake-data seeding only ──
  const [isDemoMode] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("demo") === "1",
  );
  const [isDemoData, setIsDemoData] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const signaturePadRefs = useRef<
    Partial<Record<string, SignaturePadHandle | null>>
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
  const readOnlyTab = tabStatus === "secondary";
  const disabled = busy || status === "finalized" || readOnlyTab;
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

  // ── Quick Event Entry composer state (declared early so restore can seed it) ──
  const [composerTime, setComposerTime] = useState("");
  const [composerActivity, setComposerActivity] = useState("");
  const [composerInitials, setComposerInitials] = useState("");
  const [composerError, setComposerError] = useState<string>();
  const composerTimeRef = useRef<HTMLInputElement>(null);

  const applyLocalState = (state: HousingLogLocalWorkingState) => {
    setSubmissionId(state.submissionId);
    setHousingUnit(state.housingUnit);
    setShift(state.shift);
    setLogDate(state.logDate || today);
    setValues(state.values);
    setEvents(state.events);
    setSignatures(state.signatures);
    setIsDemoData(state.isDemoData);
    setComposerTime(state.composer.time);
    setComposerActivity(state.composer.activity);
    setComposerInitials(state.composer.initials);
    if (
      state.activeTask &&
      (housingLogTaskIds as readonly string[]).includes(state.activeTask)
    ) {
      setActiveTask(state.activeTask as HousingLogTaskId);
    }
    setLocalSavedAt(new Date(state.savedAt));
    // A local record that still carries a finalizedConfirmation means the
    // server-side finalize already succeeded but removing this device's
    // copy failed (or hadn't finished) before the page was left/reloaded.
    // It must never come back as an editable draft.
    if (state.finalizedConfirmation) {
      setStatus("finalized");
      setFinalizedAt(state.finalizedConfirmation.finalizedAt);
      setLocalClearPending(true);
    } else {
      setStatus("draft");
      setFinalizedAt(undefined);
      setLocalClearPending(false);
    }
  };

  // ── Restore on mount ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadHousingLogLocalState();
      if (cancelled) return;
      if (!result.ok) {
        setRestoreState(
          result.reason === "unavailable" ? "unavailable" : "incompatible",
        );
        hydratedRef.current = true;
        return;
      }
      if (!result.state) {
        setRestoreState("none");
        hydratedRef.current = true;
        return;
      }
      skipNextAutosaveRef.current = true;
      applyLocalState(result.state);
      setRestoreState("restored");
      hydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Same-device tab coordination ──
  useEffect(() => {
    const lock = createHousingLogTabLock();
    tabLockRef.current = lock;
    setTabStatus(lock.getStatus());
    const unsubscribeStatus = lock.subscribe(setTabStatus);
    const unsubscribeCleared = lock.subscribeCleared(() => {
      // Another tab cleared the shared local working log — drop whatever
      // this tab has in memory instead of ever writing it back.
      skipNextAutosaveRef.current = true;
      applyLocalState(emptyHousingLogLocalWorkingState());
      setRestoreState("none");
    });
    return () => {
      unsubscribeStatus();
      unsubscribeCleared();
      lock.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Builds the local-store payload from current form state. `extra` lets
  // the finalize flow stamp a `finalizedConfirmation` onto the same shape
  // without duplicating this construction logic.
  const buildLocalState = (
    extra: Partial<HousingLogLocalWorkingState> = {},
  ): HousingLogLocalWorkingState =>
    toLocalWorkingState(emptyHousingLogLocalWorkingState(), {
      submissionId,
      housingUnit,
      shift,
      logDate,
      templateVersion: config?.templateVersion,
      values,
      events,
      signatures,
      isDemoData,
      activeTask,
      composer: {
        time: composerTime,
        activity: composerActivity,
        initials: composerInitials,
      },
      ...extra,
    });

  // ── Debounced local autosave ──
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (readOnlyTab) return; // never let a secondary tab overwrite the active tab's data
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    setLocalSaveStatus("saving");
    const timer = setTimeout(() => {
      void (async () => {
        const state = buildLocalState();
        const result = await saveHousingLogLocalState(state);
        if (result.ok) {
          setLocalSaveStatus("saved");
          setLocalSavedAt(new Date());
          setStorageWarning(undefined);
        } else {
          setLocalSaveStatus("unavailable");
          setStorageWarning(
            "This Housing Log could not be saved on this device. Keep this page open and contact a supervisor/administrator.",
          );
        }
      })();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    submissionId,
    housingUnit,
    shift,
    logDate,
    values,
    events,
    signatures,
    isDemoData,
    activeTask,
    composerTime,
    composerActivity,
    composerInitials,
    readOnlyTab,
  ]);

  const resetFormState = () => {
    staffStashRef.current = {};
    setValues({});
    setEvents([]);
    setSignatures({});
    setIssues([]);
    setStatus("draft");
    setNotice(undefined);
    setFinalizeError(undefined);
    setFinalizedAt(undefined);
    setIsDemoData(false);
    setComposerTime("");
    setComposerActivity("");
    setComposerInitials("");
    setComposerError(undefined);
    setActiveTask("setup");
    setSubmissionId(createSubmissionId());
  };

  const startNewLog = (
    nextUnit: HousingUnit | "",
    nextShift: HousingShift | "",
    nextDate: string,
  ) => {
    resetFormState();
    setHousingUnit(nextUnit);
    setShift(nextShift);
    setLogDate(nextDate);
  };

  const requestSelectionChange = (
    nextUnit: HousingUnit | "",
    nextShift: HousingShift | "",
    nextDate: string,
  ) => {
    const changed =
      nextUnit !== housingUnit || nextShift !== shift || nextDate !== logDate;
    if (!changed) return;
    if (!hasMeaningfulData) {
      startNewLog(nextUnit, nextShift, nextDate);
      return;
    }
    setPendingChange({ housingUnit: nextUnit, shift: nextShift, logDate: nextDate });
  };

  const confirmPendingChange = () => {
    if (!pendingChange) return;
    startNewLog(
      pendingChange.housingUnit,
      pendingChange.shift,
      pendingChange.logDate,
    );
    setPendingChange(undefined);
  };

  const clearCurrentLog = async () => {
    setClearError(undefined);
    // Only claim success — and only reset the visible form — once the
    // device copy is actually gone. A failed IndexedDB delete must never be
    // reported as "cleared" nor discard what's still on screen.
    const result = await clearHousingLogLocalState();
    if (!result.ok) {
      setClearError(
        "The Housing Log could not be cleared from this device. Nothing was intentionally deleted. Try again before starting another Housing Log.",
      );
      setClearConfirmOpen(false);
      return;
    }
    resetFormState();
    setHousingUnit("");
    setShift("");
    setLogDate(today);
    setLocalClearPending(false);
    skipNextAutosaveRef.current = true;
    tabLockRef.current?.announceCleared();
    setLocalSaveStatus("idle");
    setLocalSavedAt(undefined);
    setRestoreState("none");
    setClearConfirmOpen(false);
  };

  /** Retry action for a finalized record whose local copy failed to clear. */
  const removeLocalCopy = async () => {
    setClearError(undefined);
    const result = await clearHousingLogLocalState();
    if (!result.ok) {
      setClearError(
        "The Housing Log could not be cleared from this device. Nothing was intentionally deleted. Try again before starting another Housing Log.",
      );
      return;
    }
    setLocalClearPending(false);
    skipNextAutosaveRef.current = true;
    tabLockRef.current?.announceCleared();
    setLocalSaveStatus("idle");
    setLocalSavedAt(undefined);
  };

  // ── Demo seeding — populates the local form only; never saves server-side
  // or bypasses validation. Signatures are drawn through the same
  // SignaturePad canvas/onChange path (and the same isPlausibleSignatureInk
  // gate) a real hand-drawn signature uses. ──
  const drawDemoSignature = (key: string, rng: DemoRng) => {
    signaturePadRefs.current[key]?.drawSyntheticStroke(
      generateSignatureStrokePoints(rng),
    );
  };

  const seedCompleteDemo = () => {
    if (!config || disabled) return;
    setDemoBusy(true);
    const rng = cryptoRng();
    const seed = generateCompleteDemoValues(config, rng);
    setValues(seed.values);
    setEvents(seed.events);
    setIssues([]);
    setIsDemoData(true);
    setNotice("Complete demo data generated — every field is filled.");
    requestAnimationFrame(() => {
      for (const signature of config.signatures)
        drawDemoSignature(signature.key, rng);
      setDemoBusy(false);
    });
  };

  const seedIncompleteDemo = () => {
    if (!config || disabled) return;
    setDemoBusy(true);
    const rng = cryptoRng();
    const seed = generateIncompleteDemoValues(config, rng);
    setValues(seed.values);
    setEvents(seed.events);
    setIssues([]);
    setIsDemoData(true);
    const omittedCount =
      seed.omittedValueKeys.length + seed.omitSignatureKeys.length;
    setNotice(
      `Incomplete demo data generated — ${omittedCount} required item${omittedCount === 1 ? "" : "s"} intentionally left blank.`,
    );
    requestAnimationFrame(() => {
      for (const signature of config.signatures)
        if (!seed.omitSignatureKeys.includes(signature.key))
          drawDemoSignature(signature.key, rng);
      setDemoBusy(false);
    });
  };

  const confirmDemoDataPersist = (): boolean =>
    !isDemoData ||
    window.confirm(
      "This Housing Log contains generated DEMO data. Continue anyway?",
    );

  const setValue = (key: string, value: HousingLogValue) => {
    setValues((current) => ({ ...current, [key]: value }));
    setIssues((current) =>
      current.filter((issue) => issue.path !== `values.${key}`),
    );
  };

  // ── Staff slot presence (Sergeant / Officer N/A toggles) ──
  const staffSlots = useMemo(
    () => (config ? staffSlotsForConfig(config) : []),
    [config],
  );
  const sergeantSlot = staffSlots.find((slot) => slot.kind === "sergeant");
  const officerSlots = staffSlots.filter((slot) => slot.kind === "officer");
  // Stash of the values a slot held before it was marked N/A, so toggling a
  // position back on restores what the officer had typed instead of stale N/A.
  const staffStashRef = useRef<Record<string, Record<string, HousingLogValue>>>(
    {},
  );

  const markSlotAbsent = (slot: StaffSlot) => {
    staffStashRef.current[slot.prefix] = Object.fromEntries(
      slot.fields
        .map((field) => [field.key, values[field.key]] as const)
        .filter(
          ([, value]) => String(value ?? "").trim() !== STAFF_NA_VALUE,
        ),
    );
    setValues((current) => {
      const next = { ...current };
      for (const field of slot.fields) next[field.key] = STAFF_NA_VALUE;
      return next;
    });
    setIssues((current) =>
      current.filter(
        (issue) => !issue.path.startsWith(`values.${slot.prefix}.`),
      ),
    );
  };

  const markSlotPresent = (slot: StaffSlot) => {
    const stash = staffStashRef.current[slot.prefix] ?? {};
    setValues((current) => {
      const next = { ...current };
      for (const field of slot.fields) {
        const restored = stash[field.key];
        // Never leave stale N/A behind once the position is active again.
        if (restored !== undefined && String(restored).trim() !== "") {
          next[field.key] = restored;
        } else {
          delete next[field.key];
        }
      }
      return next;
    });
  };

  const activeOfficerCount = officerSlots.filter(
    (slot) => !isStaffSlotNA(slot, values),
  ).length;

  const setOfficerCount = (count: number) => {
    officerSlots.forEach((slot, index) => {
      const shouldBePresent = index < count;
      const isPresent = !isStaffSlotNA(slot, values);
      if (shouldBePresent && !isPresent) markSlotPresent(slot);
      if (!shouldBePresent && isPresent) markSlotAbsent(slot);
    });
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

  const finalize = async () => {
    if (!config || !housingUnit || !shift || readOnlyTab) return;
    if (!confirmDemoDataPersist()) return;
    const input = prepareHousingLog({
      logDate,
      housingUnit,
      shift,
      templateVersion: config.templateVersion,
      values,
      events,
      signatures,
    });
    const nextIssues = validateHousingLog(input);
    setIssues(nextIssues);
    setFinalizeError(undefined);
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
      // Never clear local data until the server confirms success — a
      // network failure, timeout, or validation rejection must leave this
      // Housing Log completely intact for the officer to retry. A 409 here
      // means this submissionId already finalized with different content
      // (the officer edited the form after an earlier lost response) — the
      // server refused to silently treat this as the same submission, and
      // the local data below is equally left untouched.
      const confirmation = await finalizeHousingLog({ ...input, submissionId });
      setStatus("finalized");
      setFinalizedAt(confirmation.finalizedAt);
      setNotice("Housing Log finalized successfully.");
      skipNextAutosaveRef.current = true;
      // The record is now safely finalized server-side regardless of what
      // happens next. Stamp that fact into the local copy immediately, so
      // if removing it below fails (or a reload happens before it
      // finishes), this device can never show it again as an editable
      // draft or resubmit it as a new record.
      await saveHousingLogLocalState(
        buildLocalState({ finalizedConfirmation: confirmation }),
      );
      const clearResult = await clearHousingLogLocalState();
      if (clearResult.ok) {
        setLocalClearPending(false);
        tabLockRef.current?.announceCleared();
      } else {
        setLocalClearPending(true);
      }
    } catch (error) {
      if (error instanceof HousingLogApiError && error.issues.length)
        setIssues(error.issues);
      setFinalizeError(
        error instanceof Error
          ? error.message
          : "Housing Log could not be finalized. Nothing was lost — try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startNextLog = () => {
    resetFormState();
    setHousingUnit("");
    setShift("");
    setLogDate(today);
  };

  // ── Quick Event Entry composer ──
  // Replaces the old "Add Event then scroll back and fill it in" flow: the
  // composer stays visible while the history grows, and submitting appends
  // directly to the existing event model (see logComposedEvent below) — no
  // blank row is ever created just by navigating to this panel.
  const nowTime = (): string => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`;
  };

  const focusEventComposer = () => {
    if (disabled) return;
    setActiveTask("events");
    requestAnimationFrame(() => {
      composerTimeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      composerTimeRef.current?.focus({ preventScroll: true });
    });
  };

  const logComposedEvent = () => {
    if (disabled) return;
    const time = composerTime.trim();
    const activity = composerActivity.trim();
    const initials = composerInitials.trim();
    if (!time || !activity || !initials) {
      setComposerError(
        "Enter a time, event/activity, and initials before logging.",
      );
      return;
    }
    setComposerError(undefined);
    setEvents((current) => [
      ...current,
      { id: crypto.randomUUID(), time, activity, initials },
    ]);
    // Clear time and activity for the next entry; keep initials — the same
    // officer typically logs several events in a row.
    setComposerTime("");
    setComposerActivity("");
    requestAnimationFrame(() => composerTimeRef.current?.focus());
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

  const localStatusLabel = (() => {
    if (readOnlyTab) return "Read-only — active in another tab";
    if (localSaveStatus === "unavailable") return "Not saved on this device";
    if (localSaveStatus === "saving") return "Saving on this device…";
    if (localSavedAt)
      return `Saved on this device ${localSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    return "Not yet saved on this device";
  })();

  return (
    <PageShell
      title="Housing Log"
      subtitle="Digital prototype based on Housing Unit Logs revised 4/27/26. Use test data only."
      icon={ClipboardList}
      maxWidthClass="max-w-6xl"
    >
      {isDemoMode && (
        <div
          className="mb-3 rounded-lg border-2 border-dashed border-fuchsia-400 bg-[repeating-linear-gradient(135deg,rgba(217,70,239,0.25)_0,rgba(217,70,239,0.25)_10px,rgba(88,28,135,0.35)_10px,rgba(88,28,135,0.35)_20px)] px-4 py-2.5 text-center"
          role="status"
        >
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-100">
            Demo Mode — Generated Fake Data
          </span>
        </div>
      )}

      {tabStatus === "secondary" && (
        <div
          className="mb-3 rounded-lg border border-amber-400/60 bg-amber-950/60 px-4 py-2.5 text-center text-xs font-bold text-amber-100"
          role="status"
        >
          Housing Log is already open in another tab on this device. This tab
          is read-only. If that tab is closed, refresh this page to continue
          here.
        </div>
      )}

      {restoreState === "restored" &&
        !restoreBannerDismissed &&
        housingUnit &&
        shift && (
          <div
            className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-400/50 bg-emerald-950/40 px-4 py-3"
            role="status"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.1em] text-emerald-200">
                {housingUnitLabels[housingUnit]} • {shiftName(shift)} •{" "}
                {formatLogDateForDisplay(logDate)}
              </p>
              <p className="mt-1 text-[11px] text-emerald-100/80">
                Working Housing Log restored from this device. Continue where
                you left off.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRestoreBannerDismissed(true)}
              className="shrink-0 rounded-md p-1 text-emerald-200/70 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

      {(restoreState === "incompatible" || restoreState === "unavailable") && (
        <div
          className="mb-3 rounded-lg border border-amber-400/60 bg-amber-950/50 px-4 py-3"
          role="alert"
        >
          <p className="text-xs font-black uppercase tracking-[0.1em] text-amber-200">
            {restoreState === "incompatible"
              ? "Saved local Housing Log could not be restored"
              : "This device cannot save a Housing Log locally"}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-100/80">
            {restoreState === "incompatible"
              ? "A Housing Log saved on this device is in a format this version can no longer read. It has not been changed or submitted."
              : "Local saving is unavailable in this browser. You can keep working, but nothing will be saved if you leave this page — finalize before navigating away."}
          </p>
          {restoreState === "incompatible" && (
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="mt-2 rounded-md border border-amber-300/50 bg-amber-900/40 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-amber-50 hover:bg-amber-800/50"
            >
              Clear Current Log
            </button>
          )}
        </div>
      )}

      {storageWarning && (
        <div
          className="mb-3 rounded-lg border border-red-400/60 bg-red-950/60 px-4 py-2.5 text-xs font-bold text-red-100"
          role="alert"
        >
          {storageWarning}
        </div>
      )}

      {clearError && !localClearPending && (
        <div
          className="mb-3 rounded-lg border border-red-400/60 bg-red-950/60 px-4 py-2.5 text-xs font-bold text-red-100"
          role="alert"
        >
          {clearError}
        </div>
      )}

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
                {housingUnit
                  ? housingUnitLabels[housingUnit]
                  : "No unit selected"}
              </span>
              {shift && <span>{shiftName(shift)}</span>}
              <span className="text-blue-200/70">
                {formatLogDateForDisplay(logDate)}
              </span>
              <span
                className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                  status === "finalized"
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                    : "border-blue-400/40 bg-blue-500/10 text-blue-200"
                }`}
              >
                {status === "finalized" ? "Finalized" : "Working"}
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-blue-200/60">
              {readySummary} • {localStatusLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={focusEventComposer}
              disabled={disabled || !config}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300/50 bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-100 hover:border-blue-200/70 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden /> Log Event
            </button>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              disabled={busy || readOnlyTab || (!hasMeaningfulData && !config)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-200 hover:border-red-300/60 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Clear Current Log
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
                finalized successfully
              </div>
              <p className="mt-1 text-sm text-emerald-200/75">
                {finalizedAt &&
                  `Finalized ${new Date(finalizedAt).toLocaleString()}. `}
                This shift's Housing Log now belongs to the admin archive —
                view, download, or correct it there. Start the next Housing
                Log below.
              </p>
              {localClearPending && (
                <div className="mt-3 rounded-lg border border-amber-400/60 bg-amber-950/50 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.08em] text-amber-200">
                    Device copy not yet removed
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-100/85">
                    Finalization succeeded — the record is safely stored.
                    This device's local copy of it could not be removed yet,
                    though. It cannot be edited or resubmitted; try removing
                    it below.
                  </p>
                  <button
                    type="button"
                    onClick={() => void removeLocalCopy()}
                    className="mt-2 rounded-md border border-amber-300/60 bg-amber-900/40 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-50 hover:bg-amber-800/50"
                  >
                    Remove Local Copy
                  </button>
                  {clearError && (
                    <p className="mt-2 text-[11px] text-amber-100" role="alert">
                      {clearError}
                    </p>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={startNextLog}
                className="mt-3 rounded-md border border-emerald-300/60 bg-emerald-800/40 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-emerald-50 hover:bg-emerald-700/50"
              >
                Start Next Housing Log
              </button>
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
              requirements. This device keeps one working Housing Log — it
              saves itself automatically.
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
                    requestSelectionChange(
                      event.target.value as HousingUnit | "",
                      shift,
                      logDate,
                    )
                  }
                >
                  <option value="">Select…</option>
                  {housingUnits.map((unit) => (
                    <option key={unit} value={unit}>
                      {housingUnitLabels[unit]}
                    </option>
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
                    requestSelectionChange(
                      housingUnit,
                      event.target.value as HousingShift | "",
                      logDate,
                    )
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
                  onChange={(event) =>
                    requestSelectionChange(
                      housingUnit,
                      shift,
                      event.target.value,
                    )
                  }
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
            {isDemoMode && config && (
              <div className="mt-4 rounded-lg border border-fuchsia-400/50 bg-fuchsia-950/30 p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-fuchsia-200">
                  Demo Seeding
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-fuchsia-100/70">
                  Fills the form with random fake data for this unit and
                  shift. Every click generates different values. Nothing is
                  sent to the server automatically — Finalize will warn you
                  first.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={seedCompleteDemo}
                    disabled={disabled || demoBusy}
                    className="rounded-md border border-emerald-400/60 bg-emerald-600/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-100 hover:bg-emerald-500/35 disabled:opacity-40"
                  >
                    Seed Complete Demo
                  </button>
                  <button
                    type="button"
                    onClick={seedIncompleteDemo}
                    disabled={disabled || demoBusy}
                    className="rounded-md border border-amber-400/60 bg-amber-600/20 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-amber-100 hover:bg-amber-500/30 disabled:opacity-40"
                  >
                    Seed Incomplete Demo
                  </button>
                </div>
              </div>
            )}
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
                  {/* Shift staffing selector */}
                  {(sergeantSlot || officerSlots.length >= 2) && (
                    <div className="rounded-lg border border-blue-400/25 bg-blue-950/40 p-3 sm:p-4">
                      <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                        Shift Staffing
                      </h3>
                      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
                        {sergeantSlot && (
                          <fieldset>
                            <legend className={hudLabel}>
                              Sergeant / Supervisor present?
                            </legend>
                            <div
                              className="mt-1 flex gap-2"
                              role="group"
                            >
                              {(["Yes", "No"] as const).map((option) => {
                                const present = !isStaffSlotNA(
                                  sergeantSlot,
                                  values,
                                );
                                const selected =
                                  option === "Yes" ? present : !present;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={selected}
                                    onClick={() => {
                                      if (selected) return;
                                      if (option === "No")
                                        markSlotAbsent(sergeantSlot);
                                      else markSlotPresent(sergeantSlot);
                                    }}
                                    className={`rounded-md border px-4 py-1.5 text-sm font-bold transition-colors ${
                                      selected
                                        ? "border-blue-300/70 bg-blue-500/30 text-white"
                                        : "border-blue-400/25 bg-blue-950/50 text-blue-200/70 hover:text-white"
                                    }`}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>
                        )}
                        {officerSlots.length >= 2 && (
                          <fieldset>
                            <legend className={hudLabel}>
                              Number of officers
                            </legend>
                            <div className="mt-1 flex gap-2" role="group">
                              {officerSlots.map((_, index) => {
                                const count = index + 1;
                                const selected = activeOfficerCount === count;
                                return (
                                  <button
                                    key={count}
                                    type="button"
                                    disabled={disabled}
                                    aria-pressed={selected}
                                    onClick={() => setOfficerCount(count)}
                                    className={`rounded-md border px-4 py-1.5 text-sm font-bold transition-colors ${
                                      selected
                                        ? "border-blue-300/70 bg-blue-500/30 text-white"
                                        : "border-blue-400/25 bg-blue-950/50 text-blue-200/70 hover:text-white"
                                    }`}
                                  >
                                    {count}
                                  </button>
                                );
                              })}
                            </div>
                          </fieldset>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-blue-200/55">
                        Positions marked absent are recorded as N/A on the
                        official log and are not flagged as missing.
                      </p>
                    </div>
                  )}

                  {/* Person-specific cards */}
                  {staffSlots.map((slot) => {
                    const absent = isStaffSlotNA(slot, values);
                    const heading =
                      slot.kind === "sergeant"
                        ? "Sergeant / Supervisor"
                        : slot.position;
                    if (absent) {
                      return (
                        <div
                          key={slot.prefix}
                          className="flex items-center justify-between rounded-lg border border-blue-400/15 bg-blue-950/30 px-3 py-2"
                        >
                          <p className="text-xs font-black uppercase tracking-[0.12em] text-blue-200/60">
                            {heading}{" "}
                            <span className="font-bold normal-case tracking-normal">
                              — N/A (not assigned this shift)
                            </span>
                          </p>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => markSlotPresent(slot)}
                            className="rounded-md border border-blue-400/25 px-3 py-1 text-[11px] font-bold text-blue-200/70 hover:text-white"
                          >
                            Mark present
                          </button>
                        </div>
                      );
                    }
                    return (
                      <fieldset
                        key={slot.prefix}
                        className="rounded-lg border border-blue-400/20 p-3 sm:p-4"
                      >
                        <legend className="px-2 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                          {heading}
                        </legend>
                        <div className="mt-2 flex flex-wrap items-end gap-3">
                          {slot.fields.map((definition) => (
                            <FieldControl
                              key={definition.key}
                              definition={{
                                ...definition,
                                label: staffFieldLabel(slot, definition),
                              }}
                              value={values[definition.key]}
                              disabled={disabled}
                              error={errorPaths.has(
                                `values.${definition.key}`,
                              )}
                              suggestions={keyRingSuggestions(
                                definition,
                                housingUnit,
                              )}
                              onChange={(value) =>
                                setValue(definition.key, value)
                              }
                            />
                          ))}
                        </div>
                      </fieldset>
                    );
                  })}

                  {/* Shared unit equipment / accountability sections */}
                  {config.sections
                    .filter((section) => section.key !== "staff")
                    .map((section) => (
                      <fieldset
                        key={section.key}
                        className="rounded-lg border border-blue-400/20 p-3 sm:p-4"
                      >
                        <legend className="px-2 text-xs font-black uppercase tracking-[0.12em] text-blue-100">
                          {section.key === "equipment"
                            ? "Equipment / Accountability"
                            : section.title}
                        </legend>
                        <p className="text-[11px] leading-relaxed text-blue-200/55">
                          {section.title}
                          {section.description
                            ? ` — ${section.description}`
                            : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap items-end gap-3">
                          {section.fields.map((definition) => (
                            <FieldControl
                              key={definition.key}
                              definition={definition}
                              value={values[definition.key]}
                              disabled={disabled}
                              error={errorPaths.has(
                                `values.${definition.key}`,
                              )}
                              suggestions={keyRingSuggestions(
                                definition,
                                housingUnit,
                              )}
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
                        <div className="mt-3 flex flex-wrap items-end gap-3">
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
                      <div className="mt-3 flex flex-wrap items-end gap-3">
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
                  className="mt-4 hidden grid-cols-[56px_128px_120px_1fr_90px] gap-3 px-3 text-[10px] font-black uppercase tracking-[0.14em] text-blue-300/60 sm:grid"
                >
                  <span>Check</span>
                  <span>Time</span>
                  <span>Role</span>
                  <span>Name</span>
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
                          className={`${subCard} grid gap-3 sm:grid-cols-[56px_128px_120px_1fr_90px] sm:items-center`}
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
                              {definition.inputType === "choice" ? (
                                <select
                                  id={targetId(`values.${definition.key}`)}
                                  value={String(values[definition.key] ?? "")}
                                  disabled={disabled}
                                  aria-invalid={errorPaths.has(
                                    `values.${definition.key}`,
                                  )}
                                  onChange={(event) =>
                                    setValue(definition.key, event.target.value)
                                  }
                                  className={`${hudInput} ${errorPaths.has(`values.${definition.key}`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                                >
                                  <option value="">Select…</option>
                                  {definition.options?.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : (
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
                              )}
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
                <div id="housing-log-panel-events">
                  {panelHeading("events", "Event Log")}
                  <p className="mt-1 text-xs text-blue-200/60">
                    Log each event as it happens. Entered order is preserved
                    exactly — events are never re-sorted by time.
                  </p>
                </div>

                {/* Quick Event Entry composer — stays visible while the
                    history below grows, so logging event N+1 never requires
                    scrolling back to an "Add Event" action. */}
                <div
                  className="sticky top-20 z-20 mt-4 rounded-lg border border-blue-300/40 bg-[#0a1330] p-3 shadow-lg shadow-black/40 sm:top-24"
                  role="group"
                  aria-label="Quick event entry"
                >
                  <div className="grid gap-2 sm:grid-cols-[150px_1fr_90px_auto] sm:items-end">
                    <div>
                      <label
                        className={hudLabel}
                        htmlFor="housing-log-composer-time"
                      >
                        Time
                      </label>
                      <div className="flex gap-1">
                        <input
                          id="housing-log-composer-time"
                          ref={composerTimeRef}
                          type="time"
                          value={composerTime}
                          disabled={disabled}
                          onChange={(event) => {
                            setComposerTime(event.target.value);
                            setComposerError(undefined);
                          }}
                          className={`${hudInput} min-w-[104px] flex-1`}
                        />
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            setComposerTime(nowTime());
                            setComposerError(undefined);
                          }}
                          title="Fill the current time — you can still change it"
                          className="shrink-0 rounded-md border border-blue-300/50 bg-blue-500/15 px-2 text-[10px] font-black uppercase text-blue-100 hover:bg-blue-500/25"
                        >
                          Now
                        </button>
                      </div>
                    </div>
                    <div>
                      <label
                        className={hudLabel}
                        htmlFor="housing-log-composer-activity"
                      >
                        Event / Activity
                      </label>
                      <textarea
                        id="housing-log-composer-activity"
                        rows={1}
                        value={composerActivity}
                        disabled={disabled}
                        placeholder="What happened…"
                        onChange={(event) => {
                          setComposerActivity(event.target.value);
                          setComposerError(undefined);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && event.ctrlKey) {
                            event.preventDefault();
                            logComposedEvent();
                          }
                        }}
                        className={`${hudInput} resize-y`}
                      />
                    </div>
                    <div>
                      <label
                        className={hudLabel}
                        htmlFor="housing-log-composer-initials"
                      >
                        Initials
                      </label>
                      <input
                        id="housing-log-composer-initials"
                        value={composerInitials}
                        disabled={disabled}
                        onChange={(event) => {
                          setComposerInitials(event.target.value);
                          setComposerError(undefined);
                        }}
                        className={hudInput}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={logComposedEvent}
                      disabled={disabled}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-emerald-400/60 bg-emerald-600/25 px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-emerald-100 hover:bg-emerald-500/35 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" aria-hidden /> Log Event
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10px] text-blue-200/50">
                    Ctrl+Enter in the event field also logs it. Nothing is
                    added until you submit — no need to click Add Event first.
                  </p>
                  {composerError && (
                    <p className="mt-1 text-[11px] text-red-300" role="alert">
                      {composerError}
                    </p>
                  )}
                </div>

                {/* Compact operational log — scrolls below the composer.
                    Each row remains directly editable and removable. */}
                <ol className="mt-4 space-y-1.5">
                  {events.length === 0 && (
                    <li className="list-none rounded-lg border border-dashed border-blue-400/25 p-4 text-center text-xs text-blue-200/50">
                      No events logged yet.
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
                        className="grid grid-cols-[28px_86px_1fr_60px_auto] items-start gap-2 rounded-md border border-blue-400/15 bg-[#0a1330]/70 px-2 py-1.5 sm:items-center"
                      >
                        <span
                          className="pt-1.5 text-[10px] font-black text-blue-300/60 sm:pt-0"
                          aria-hidden
                        >
                          {index + 1}.
                        </span>
                        <input
                          aria-label={`Event ${index + 1} time`}
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
                          className={`${hudInput} px-1.5 py-1 text-xs ${errorPaths.has(`events.${event.id}.time`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                        />
                        <textarea
                          aria-label={`Event ${index + 1} activity`}
                          id={targetId(`events.${event.id}.activity`)}
                          rows={1}
                          value={event.activity}
                          disabled={disabled}
                          aria-invalid={errorPaths.has(
                            `events.${event.id}.activity`,
                          )}
                          onChange={(e) =>
                            updateEvent(event.id, "activity", e.target.value)
                          }
                          className={`${hudInput} resize-y px-2 py-1 text-xs ${errorPaths.has(`events.${event.id}.activity`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                        />
                        <input
                          aria-label={`Event ${index + 1} initials`}
                          id={targetId(`events.${event.id}.initials`)}
                          value={event.initials}
                          disabled={disabled}
                          aria-invalid={errorPaths.has(
                            `events.${event.id}.initials`,
                          )}
                          onChange={(e) =>
                            updateEvent(event.id, "initials", e.target.value)
                          }
                          className={`${hudInput} px-1.5 py-1 text-xs ${errorPaths.has(`events.${event.id}.initials`) ? "border-red-400 ring-2 ring-red-400/25" : ""}`}
                        />
                        <button
                          type="button"
                          title={
                            unfinished
                              ? `Remove unfinished event ${index + 1}`
                              : "Completed events cannot be removed"
                          }
                          disabled={disabled || !unfinished}
                          onClick={() => removeEvent(event.id)}
                          className="rounded-md border border-red-400/35 p-1.5 text-red-200 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
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
                        ref={(node) => {
                          signaturePadRefs.current[signature.key] = node;
                        }}
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

                {finalizeError && (
                  <p
                    className="mt-4 rounded-md border border-red-400/50 bg-red-950/50 px-3 py-2 text-xs text-red-100"
                    role="alert"
                  >
                    {finalizeError} Nothing has been lost — this Housing Log
                    remains saved on this device. You can retry.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-blue-400/20 pt-4">
                  <div className="min-w-0 text-xs text-blue-200/65">
                    {localStatusLabel}
                  </div>
                  <button
                    type="button"
                    onClick={finalize}
                    disabled={disabled}
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-500/20 px-4 py-2.5 text-xs font-black uppercase tracking-[0.08em] text-emerald-100 disabled:opacity-40"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />{" "}
                    {busy ? "Finalizing…" : "Finalize Housing Log"}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {/* ── Unit/shift/date change guard — protects the one local working log ── */}
      {pendingChange && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="housing-log-change-guard-title"
        >
          <div className="w-full max-w-md rounded-xl border border-blue-400/40 bg-[#0a1330] p-5">
            <h2
              id="housing-log-change-guard-title"
              className="text-sm font-black uppercase tracking-[0.1em] text-blue-100"
            >
              Unfinished Housing Log on this device
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-blue-200/75">
              You already have an unfinished{" "}
              {housingUnit ? housingUnitLabels[housingUnit] : "Housing Log"}
              {shift ? ` / ${shiftName(shift)}` : ""} Housing Log saved on
              this device. Changing the unit, shift, or date starts a
              different Housing Log.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => setPendingChange(undefined)}
                className="inline-flex items-center justify-center rounded-md border border-blue-300/60 bg-blue-500/20 px-4 py-2 text-xs font-black text-blue-50"
              >
                Continue Current Log
              </button>
              <button
                type="button"
                onClick={confirmPendingChange}
                className="inline-flex items-center justify-center rounded-md border border-red-400/50 bg-red-950/40 px-4 py-2 text-xs font-bold text-red-200 hover:border-red-300/70"
              >
                Clear Current Log and Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Current Log confirmation ── */}
      {clearConfirmOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="housing-log-clear-title"
        >
          <div className="w-full max-w-md rounded-xl border border-red-400/40 bg-[#0a1330] p-5">
            <h2
              id="housing-log-clear-title"
              className="text-sm font-black uppercase tracking-[0.1em] text-red-200"
            >
              Clear this unfinished Housing Log?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-blue-200/75">
              This will permanently remove the Housing Log currently saved on
              this device. Finalized Housing Logs stored in the admin archive
              will not be affected.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => void clearCurrentLog()}
                className="inline-flex items-center justify-center rounded-md border border-red-400/60 bg-red-600/25 px-4 py-2 text-xs font-black uppercase tracking-[0.06em] text-red-100 hover:bg-red-500/35"
              >
                Clear Current Log
              </button>
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                className="inline-flex items-center justify-center rounded-md border border-blue-300/50 bg-blue-500/15 px-4 py-2 text-xs font-bold text-blue-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
