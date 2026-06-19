import { useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Upload,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  X,
  PencilLine,
  CalendarDays,
} from "lucide-react";
import PageShell, { hudPanel, hudInput, hudLabel } from "@/components/PageShell";
import {
  type Dc6229DateFormat,
  type Dc6229EntryMethod,
  type Dc6229Record,
  type Dc6229Setup,
} from "@/lib/dc6229/types";
import { parseBedBookForDc6229, Dc6229ParseError, makeManualRecord } from "@/lib/dc6229/bedBookMapper";
import { buildWeekDays, isSunday, previousSunday, nextSunday, parseLocalDate } from "@/lib/dc6229/weekDates";
import { validateRecord, validateSetup } from "@/lib/dc6229/validation";
import { fillDc6229Docx, Dc6229DocxError, type Dc6229FormData } from "@/lib/dc6229/dc6229DocxFiller";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}dc6-229-template.docx`;

const btnBlue =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300/50 bg-blue-600/85 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-400/35 bg-[rgba(4,11,34,0.7)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-200/80 transition-colors hover:border-blue-300/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40";
const cellInput =
  "w-full rounded border border-blue-400/30 bg-[rgba(2,8,24,0.7)] px-2 py-1.5 text-[12px] text-blue-50 focus:outline-none focus:border-blue-300/70";
const th =
  "px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-blue-200/70 align-bottom";

const ENTRY_METHODS: {
  value: Dc6229EntryMethod;
  label: string;
  desc: string;
  icon: typeof FileSpreadsheet;
}[] = [
  {
    value: "bedbook",
    label: "Fill from Bed Book",
    desc: "Upload a Bed Book roster (CSV / XLSX) and a DC6-229 form is prepared for every inmate.",
    icon: FileSpreadsheet,
  },
  {
    value: "manual",
    label: "Manually Add Inmates",
    desc: "Add each inmate by hand with a guided form — no roster file needed.",
    icon: PencilLine,
  },
];

const DATE_FORMATS: { value: Dc6229DateFormat; label: string; example: string }[] = [
  { value: "mmddyy", label: "MM/DD/YY", example: "06/14/26" },
  { value: "dayPrefixed", label: "Day + Date", example: "Sun over 06/14/26" },
];

const defaultSetup = (): Dc6229Setup => ({
  weekStart: "",
  dateFormat: "mmddyy",
  filePrefix: "",
});

function dashedWeekLabel(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return "UNDATED";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${mm}-${dd}-${yy}`;
}

export default function DC6229DailyRecord() {
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [entryMethod, setEntryMethod] = useState<Dc6229EntryMethod>("bedbook");
  const [setup, setSetup] = useState<Dc6229Setup>(defaultSetup);

  const [bedBookRecords, setBedBookRecords] = useState<Dc6229Record[]>([]);
  const [manualRecords, setManualRecords] = useState<Dc6229Record[]>([]);
  const [parseInfo, setParseInfo] = useState<{ fileName: string; count: number } | null>(null);
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [draft, setDraft] = useState<Dc6229Record>(makeManualRecord);
  const [draftError, setDraftError] = useState("");

  const [filter, setFilter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const isManual = entryMethod === "manual";
  const records = isManual ? manualRecords : bedBookRecords;
  const setActive = isManual ? setManualRecords : setBedBookRecords;

  const setupFlags = useMemo(() => validateSetup(setup), [setup]);
  const setupBlocked = setupFlags.some((f) => f.blocking);
  const weekStartIsSunday = !!setup.weekStart && isSunday(setup.weekStart);

  const weekDays = useMemo(
    () => (weekStartIsSunday ? buildWeekDays(setup.weekStart, setup.dateFormat) : []),
    [setup.weekStart, setup.dateFormat, weekStartIsSunday],
  );

  const recordFlags = useMemo(
    () => new Map(records.map((r) => [r.id, validateRecord(r)])),
    [records],
  );
  const includedRecords = useMemo(() => records.filter((r) => r.include), [records]);
  const blockingCount = useMemo(
    () => includedRecords.filter((r) => (recordFlags.get(r.id) ?? []).some((f) => f.blocking)).length,
    [includedRecords, recordFlags],
  );
  const warnCount = useMemo(
    () =>
      includedRecords.filter((r) => {
        const f = recordFlags.get(r.id) ?? [];
        return f.length > 0 && !f.some((x) => x.blocking);
      }).length,
    [includedRecords, recordFlags],
  );

  const summary = useMemo(() => {
    const total = records.length;
    const included = includedRecords.length;
    return { total, included, excluded: total - included, forms: included, pages: included * 2 };
  }, [records, includedRecords]);

  const visibleRecords = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [r.inmateName, r.fdc, r.cellNumber, r.rawCell, r.status].join(" ").toLowerCase().includes(q),
    );
  }, [records, filter]);

  function setSetupField<K extends keyof Dc6229Setup>(key: K, value: Dc6229Setup[K]) {
    setSetup((prev) => ({ ...prev, [key]: value }));
    setConfirmed(false);
  }

  function changeEntryMethod(method: Dc6229EntryMethod) {
    setEntryMethod(method);
    setConfirmed(false);
    setGenError("");
    setFilter("");
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setParsing(true);
    setParseError("");
    setGenError("");
    setConfirmed(false);
    try {
      const recs = await parseBedBookForDc6229(file);
      setBedBookRecords(recs);
      setParseInfo({ fileName: file.name, count: recs.length });
    } catch (err) {
      setBedBookRecords([]);
      setParseInfo(null);
      if (err instanceof Dc6229ParseError) setParseError(err.message);
      else setParseError(`Could not read the Bed Book file: ${String(err)}`);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearRoster() {
    if (bedBookRecords.length > 0 && !window.confirm("Clear the uploaded roster? This cannot be undone.")) return;
    setBedBookRecords([]);
    setParseInfo(null);
    setParseError("");
    setGenError("");
    setConfirmed(false);
    setFilter("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function setDraftField<K extends keyof Dc6229Record>(key: K, value: Dc6229Record[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDraftError("");
  }

  function addInmate() {
    if (!draft.inmateName.trim()) {
      setDraftError("Enter the inmate name before adding.");
      return;
    }
    setManualRecords((prev) => [
      ...prev,
      {
        ...draft,
        inmateName: draft.inmateName.trim(),
        fdc: draft.fdc.trim(),
        cellNumber: draft.cellNumber.trim(),
        status: draft.status.trim(),
      },
    ]);
    setDraft(makeManualRecord());
    setDraftError("");
    setConfirmed(false);
    window.requestAnimationFrame(() => nameRef.current?.focus());
  }

  function clearManualRecords() {
    if (manualRecords.length === 0) return;
    if (!window.confirm("Remove all manually added inmates? This cannot be undone.")) return;
    setManualRecords([]);
    setConfirmed(false);
  }

  function updateRecord(id: string, patch: Partial<Dc6229Record>) {
    setActive((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setConfirmed(false);
  }
  function removeRecord(id: string) {
    setActive((prev) => prev.filter((r) => r.id !== id));
    setConfirmed(false);
  }
  function setAllIncluded(include: boolean) {
    setActive((prev) => prev.map((r) => ({ ...r, include })));
    setConfirmed(false);
  }

  const hasRecords = records.length > 0;
  const canGenerate =
    includedRecords.length > 0 && weekStartIsSunday && blockingCount === 0 && confirmed;

  async function handleGenerate() {
    setGenError("");
    if (includedRecords.length === 0) {
      setGenError("No inmates are selected to include in the packet.");
      return;
    }
    if (!weekStartIsSunday) {
      setGenError("Choose a week start date that falls on a Sunday before generating.");
      return;
    }
    if (weekDays.length !== 7) {
      setGenError("Could not build the 7 week dates. Check the week start date.");
      return;
    }
    if (blockingCount > 0) {
      setGenError("Some included inmates are missing a required name. Fix or exclude them first.");
      return;
    }
    setGenerating(true);
    try {
      const dates = weekDays.map((d) => d.docx);
      const forms: Dc6229FormData[] = includedRecords.map((r) => ({
        inmateName: r.inmateName.trim(),
        fdc: r.fdc.trim(),
        cellNumber: r.cellNumber.trim(),
        status: r.status.trim(),
        dates,
      }));
      const blob = await fillDc6229Docx(`${TEMPLATE_URL}?v=${Date.now()}`, { forms });
      const prefix = setup.filePrefix.trim() ? `${setup.filePrefix.trim()} - ` : "";
      const name = `${prefix}DC6-229 Daily Record - Week of ${dashedWeekLabel(setup.weekStart)} (${forms.length} inmate${forms.length === 1 ? "" : "s"}).docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof Dc6229DocxError) setGenError(err.message);
      else setGenError(`DC6-229 generation failed: ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  const reviewStep = isManual ? "3" : "3";
  const genStep = "4";

  return (
    <PageShell
      title="DC6-229 Daily Record"
      icon={ClipboardList}
      maxWidthClass="max-w-7xl"
      subtitle="Prepare a Daily Record of Special Housing (DC6-229) for each inmate — upload a Bed Book roster or add inmates by hand, choose the Sunday the week starts, then generate one packet with a complete 2-page form per inmate. The original Word form is never altered — only the name, FDC#, cell, status, and the 7 week dates are filled, and page 2 of every form is left untouched."
    >
      {/* Privacy notice */}
      <div
        className="mb-5 flex items-start gap-3 rounded-lg border border-amber-400/70 bg-[rgba(28,18,2,0.72)] px-4 py-3"
        style={{ boxShadow: "0 0 22px rgba(245,158,11,0.18)" }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-[11px] leading-relaxed text-amber-100/85">
          Bed Book and manually entered data are processed for this browser session only — they are
          not saved to a database, not stored in your browser, and never sent to AI or any external
          service. Refreshing the page clears everything. Review all generated forms before official use.
        </p>
      </div>

      {/* Step 1 — Entry method */}
      <section className={`${hudPanel} mb-5 p-5`}>
        <SectionTitle step="1" title="Entry Method" />
        <div className="grid gap-3 sm:grid-cols-2">
          {ENTRY_METHODS.map((opt) => {
            const active = entryMethod === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => changeEntryMethod(opt.value)}
                aria-pressed={active}
                className={`flex items-start gap-3 rounded-lg border px-4 py-4 text-left transition-colors ${
                  active
                    ? "border-blue-300/70 bg-blue-500/10"
                    : "border-blue-400/25 bg-[rgba(2,8,24,0.5)] hover:border-blue-300/50"
                }`}
                style={active ? { boxShadow: "0 0 18px rgba(37,99,235,0.28)" } : undefined}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                    active ? "border-blue-300/70 bg-blue-500/20 text-blue-100" : "border-blue-400/30 text-blue-300/70"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.06em] text-blue-50">
                    {opt.label}
                    {active && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-300" />}
                  </span>
                  <span className="text-[11px] leading-snug text-blue-300/70">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Step 2 — Week setup */}
      <section className={`${hudPanel} mb-5 p-5`}>
        <SectionTitle step="2" title="Week & Output Setup" />
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Week Start (Sunday) *">
            <input
              type="date"
              className={hudInput}
              value={setup.weekStart}
              onChange={(e) => setSetupField("weekStart", e.target.value)}
            />
            {setup.weekStart && !weekStartIsSunday && (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-300/90">
                  Not a Sunday
                </span>
                <button className={btnGhost} onClick={() => setSetupField("weekStart", previousSunday(setup.weekStart))}>
                  Use previous Sunday
                </button>
                <button className={btnGhost} onClick={() => setSetupField("weekStart", nextSunday(setup.weekStart))}>
                  Use next Sunday
                </button>
              </div>
            )}
          </Field>

          <Field label="Date Format">
            <div className="flex flex-col gap-1.5">
              {DATE_FORMATS.map((f) => (
                <label key={f.value} className="flex items-center gap-2 text-[12px] text-blue-100/90">
                  <input
                    type="radio"
                    name="dc6229-dateformat"
                    className="accent-blue-500"
                    checked={setup.dateFormat === f.value}
                    onChange={() => setSetupField("dateFormat", f.value)}
                  />
                  <span className="font-semibold">{f.label}</span>
                  <span className="text-blue-300/55">e.g. {f.example}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Filename Prefix (optional)">
            <input
              className={hudInput}
              placeholder="e.g. B-Dorm"
              value={setup.filePrefix}
              onChange={(e) => setSetupField("filePrefix", e.target.value)}
            />
          </Field>
        </div>

        {/* Week preview */}
        {weekDays.length === 7 && (
          <div className="mt-4 rounded-lg border border-blue-400/25 bg-[rgba(2,8,24,0.5)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-blue-300/80" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-200/70">
                Week dates filled into each form
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
              {weekDays.map((d) => (
                <div key={d.iso} className="rounded border border-blue-400/20 bg-[rgba(4,11,34,0.6)] px-2 py-1.5 text-center">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-300/60">{d.dayName}</div>
                  <div className="text-[12px] font-mono font-semibold text-blue-50">{d.date}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Bed Book upload */}
      {!isManual && (
        <section className={`${hudPanel} mb-5 p-5`}>
          <SectionTitle step="3" title="Upload Bed Book Roster" />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors ${
              dragOver ? "border-blue-300/80 bg-blue-500/10" : "border-blue-400/35 bg-[rgba(2,8,24,0.5)]"
            }`}
          >
            <Upload className="h-7 w-7 text-blue-300/80" />
            <div>
              <p className="text-sm font-semibold text-blue-50">Drag &amp; drop a Bed Book file here</p>
              <p className="mt-0.5 text-[11px] text-blue-300/65">CSV (optional SEP=|), XLSX, or XLS — processed in your browser only.</p>
            </div>
            <button className={btnBlue} onClick={() => fileRef.current?.click()} disabled={parsing}>
              <Upload className="h-4 w-4" />
              {parsing ? "Reading…" : "Choose File"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {parseError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-400/60 bg-[rgba(34,6,6,0.6)] px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-[12px] leading-relaxed text-red-200/90">{parseError}</p>
            </div>
          )}

          {parseInfo && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-400/40 bg-[rgba(4,24,16,0.55)] px-3 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <p className="text-[12px] text-emerald-100/90">
                  Loaded <span className="font-bold">{parseInfo.count}</span> inmate{parseInfo.count === 1 ? "" : "s"} from{" "}
                  <span className="font-semibold">{parseInfo.fileName}</span>.
                </p>
              </div>
              <button className={btnGhost} onClick={clearRoster}>
                <Trash2 className="h-3.5 w-3.5" /> Clear Roster
              </button>
            </div>
          )}
        </section>
      )}

      {/* Manual entry */}
      {isManual && (
        <section className={`${hudPanel} mb-5 p-5`}>
          <SectionTitle step="3" title="Add Inmates" />
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Inmate Name *">
              <input
                ref={nameRef}
                className={hudInput}
                placeholder="LAST, FIRST"
                value={draft.inmateName}
                onChange={(e) => setDraftField("inmateName", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addInmate();
                }}
              />
            </Field>
            <Field label="FDC#">
              <input
                className={hudInput}
                placeholder="e.g. A12345"
                value={draft.fdc}
                onChange={(e) => setDraftField("fdc", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addInmate();
                }}
              />
            </Field>
            <Field label="Cell # (after the printed “B”)">
              <input
                className={hudInput}
                placeholder="e.g. 1-106L"
                value={draft.cellNumber}
                onChange={(e) => setDraftField("cellNumber", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addInmate();
                }}
              />
            </Field>
            <Field label="Status">
              <input
                className={hudInput}
                placeholder="e.g. AC"
                value={draft.status}
                onChange={(e) => setDraftField("status", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addInmate();
                }}
              />
            </Field>
          </div>
          {draftError && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-red-300/90">
              <AlertTriangle className="h-3.5 w-3.5" /> {draftError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <button className={btnBlue} onClick={addInmate}>
              <Plus className="h-4 w-4" /> Add Inmate
            </button>
            {manualRecords.length > 0 && (
              <button className={btnGhost} onClick={clearManualRecords}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All ({manualRecords.length})
              </button>
            )}
          </div>
        </section>
      )}

      {/* Step — Review */}
      {hasRecords && (
        <section className={`${hudPanel} mb-5 p-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle step={reviewStep} title={`Review Inmates (${records.length})`} inline />
            <div className="flex flex-wrap items-center gap-2">
              <input
                className={`${cellInput} w-44`}
                placeholder="Filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <button className={btnGhost} onClick={() => setAllIncluded(true)}>
                Include All
              </button>
              <button className={btnGhost} onClick={() => setAllIncluded(false)}>
                Exclude All
              </button>
            </div>
          </div>

          {(blockingCount > 0 || warnCount > 0) && (
            <div className="mb-3 flex flex-wrap gap-2">
              {blockingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-red-400/55 bg-[rgba(34,6,6,0.5)] px-2.5 py-1 text-[11px] font-semibold text-red-200/90">
                  <AlertTriangle className="h-3.5 w-3.5" /> {blockingCount} need a name (blocking)
                </span>
              )}
              {warnCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/50 bg-[rgba(28,18,2,0.5)] px-2.5 py-1 text-[11px] font-semibold text-amber-200/90">
                  <AlertTriangle className="h-3.5 w-3.5" /> {warnCount} to review (warnings)
                </span>
              )}
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-blue-400/20">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[44px]" />
                <col className="w-[40px]" />
                <col />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[110px]" />
                <col className="w-[44px]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[rgba(4,11,34,0.96)] backdrop-blur">
                <tr className="border-b border-blue-400/30">
                  <th className={th}>Use</th>
                  <th className={th}>#</th>
                  <th className={th}>Inmate Name</th>
                  <th className={th}>FDC#</th>
                  <th className={th}>Cell #</th>
                  <th className={th}>Status</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((r, i) => {
                  const flags = recordFlags.get(r.id) ?? [];
                  const hasBlock = flags.some((f) => f.blocking);
                  const hasWarn = flags.length > 0 && !hasBlock;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-blue-400/10 ${
                        !r.include ? "opacity-45" : hasBlock ? "bg-[rgba(34,6,6,0.28)]" : hasWarn ? "bg-[rgba(28,18,2,0.22)]" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5 align-top">
                        <input
                          type="checkbox"
                          className="mt-1 accent-blue-500"
                          checked={r.include}
                          onChange={(e) => updateRecord(r.id, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top text-[11px] font-mono text-blue-300/60">{i + 1}</td>
                      <td className="px-2 py-1.5 align-top">
                        <input
                          className={cellInput}
                          value={r.inmateName}
                          placeholder="LAST, FIRST"
                          onChange={(e) => updateRecord(r.id, { inmateName: e.target.value })}
                        />
                        {flags.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {flags.map((f, fi) => (
                              <li
                                key={fi}
                                className={`text-[10px] leading-snug ${f.blocking ? "text-red-300/90" : "text-amber-300/85"}`}
                              >
                                • {f.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input
                          className={cellInput}
                          value={r.fdc}
                          placeholder="A12345"
                          onChange={(e) => updateRecord(r.id, { fdc: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input
                          className={cellInput}
                          value={r.cellNumber}
                          placeholder="1-106L"
                          onChange={(e) => updateRecord(r.id, { cellNumber: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <input
                          className={cellInput}
                          value={r.status}
                          placeholder="AC"
                          onChange={(e) => updateRecord(r.id, { status: e.target.value })}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <button
                          className="rounded p-1 text-blue-300/60 transition-colors hover:bg-red-500/15 hover:text-red-300"
                          onClick={() => removeRecord(r.id)}
                          aria-label="Remove inmate"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {visibleRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-[12px] text-blue-300/55">
                      No inmates match the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Step — Generate */}
      {hasRecords && (
        <section className={`${hudPanel} mb-5 p-5`}>
          <SectionTitle step={genStep} title="Generate Packet" />

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Inmates" value={summary.total} />
            <Stat label="Included" value={summary.included} accent="emerald" />
            <Stat label="Forms" value={summary.forms} />
            <Stat label="Pages" value={summary.pages} />
          </div>

          {!weekStartIsSunday && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-amber-300/90">
              <AlertTriangle className="h-4 w-4" /> Choose a Sunday week start above before generating.
            </p>
          )}

          <label className="mb-3 flex items-start gap-2.5 rounded-lg border border-blue-400/25 bg-[rgba(2,8,24,0.5)] px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 accent-blue-500"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="text-[11px] leading-relaxed text-blue-200/80">
              I have reviewed every included inmate's name, FDC#, cell, and status, and confirm the week dates
              are correct. One complete 2-page DC6-229 will be generated per included inmate.
            </span>
          </label>

          {genError && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-400/60 bg-[rgba(34,6,6,0.6)] px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-[12px] leading-relaxed text-red-200/90">{genError}</p>
            </div>
          )}

          <button className={btnBlue} onClick={handleGenerate} disabled={!canGenerate || generating}>
            <Download className="h-4 w-4" />
            {generating ? "Generating…" : `Generate & Download (${summary.forms} form${summary.forms === 1 ? "" : "s"})`}
          </button>
          {!confirmed && includedRecords.length > 0 && weekStartIsSunday && blockingCount === 0 && (
            <p className="mt-2 text-[11px] text-blue-300/55">Check the confirmation box to enable download.</p>
          )}
        </section>
      )}
    </PageShell>
  );
}

function SectionTitle({ step, title, inline }: { step: string; title: string; inline?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${inline ? "" : "mb-4"}`}>
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-blue-300/60 bg-blue-600/30 text-[11px] font-black text-blue-100"
        style={{ boxShadow: "0 0 12px rgba(37,99,235,0.3)" }}
      >
        {step}
      </span>
      <h2 className="text-[13px] font-bold uppercase tracking-[0.1em] text-blue-50">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={hudLabel}>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "emerald" }) {
  return (
    <div className="rounded-lg border border-blue-400/25 bg-[rgba(2,8,24,0.5)] px-3 py-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-300/60">{label}</div>
      <div className={`text-xl font-black ${accent === "emerald" ? "text-emerald-300" : "text-blue-50"}`}>{value}</div>
    </div>
  );
}
