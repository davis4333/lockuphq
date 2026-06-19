import { useMemo, useRef, useState } from "react";
import {
  ScrollText,
  Upload,
  Trash2,
  Download,
  Search as SearchIcon,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  X,
  PencilLine,
} from "lucide-react";
import PageShell, { hudPanel, hudInput, hudLabel } from "@/components/PageShell";
import {
  SEARCH_TYPES,
  STAFF_RANKS,
  TABLET_MODES,
  type TabletValue,
  ROWS_PER_PAGE,
  type BunkHandling,
  type EntryMethod,
  type ParsedBedBook,
  type ReviewRow,
  type SetupFields,
} from "@/lib/searchLog/types";
import { parseBedBookFile, BedBookParseError } from "@/lib/searchLog/bedBookParser";
import { groupBedBook } from "@/lib/searchLog/bedBookGrouper";
import {
  buildReviewRows,
  createManualRow,
  resequenceTimes,
  validateRow,
  validateStaff,
  findDuplicateBedIds,
  formatDateMMDDYY,
  formatDateMMDDYYDashed,
  combineStaff,
  createStaffMember,
  normalizeTimingCellKey,
  randomTablet,
  tabletValuesForMode,
} from "@/lib/searchLog/searchLogRowBuilder";
import {
  fillSearchLogDocx,
  SearchLogDocxError,
  type DocxFillRow,
} from "@/lib/searchLog/searchLogDocxFiller";

const TEMPLATE_URL = `${import.meta.env.BASE_URL}search-log-template.docx`;

const defaultSetup = (): SetupFields => ({
  location: "",
  dateOfSearch: "",
  startTime: "",
  searchType: "Area",
  staff: [createStaffMember()],
  discrepancies: "None",
  tabletMode: "Random",
});

const TABLET_MODE_LABELS: Record<SetupFields["tabletMode"], string> = {
  Y: "Y — all yes",
  N: "N — all no",
  Random: "Random Y / N",
};

// Per-row Tablet dropdown. The first two are this-row values; the last three are
// bulk shortcuts that rewrite the whole Tablet column. Their values are distinct
// from "Y"/"N" so the controlled <select> always snaps back to the row's own value.
const TABLET_ROW_OPTIONS: { value: string; label: string }[] = [
  { value: "Y", label: "Y - Yes" },
  { value: "N", label: "N - No" },
  { value: "ALL_Y", label: "Y - Yes All" },
  { value: "ALL_N", label: "N - No All" },
  { value: "RANDOM", label: "Random Y/N" },
];

const ENTRY_METHODS: { value: EntryMethod; label: string; icon: typeof FileSpreadsheet }[] = [
  { value: "bedbook", label: "Bed Book Upload", icon: FileSpreadsheet },
  { value: "manual", label: "Manual Entry", icon: PencilLine },
];

const BUNK_OPTIONS: { value: BunkHandling; label: string; desc: string }[] = [
  {
    value: "byCell",
    label: "Group bunks by cell",
    desc: "Lower & upper bunks share one row — the area shows the cell (e.g. B1-106) with both inmates in a single box, shrunk to fit.",
  },
  {
    value: "byBunk",
    label: "List bunks separately",
    desc: "Each bunk is its own row (e.g. B1-106L and B1-106U). Both bunks in a cell still share one search time.",
  },
];

const btnBlue =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300/50 bg-blue-600/85 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-400/35 bg-[rgba(4,11,34,0.7)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-200/80 transition-colors hover:border-blue-300/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40";
const cellInput =
  "w-full rounded border border-blue-400/30 bg-[rgba(2,8,24,0.7)] px-2 py-1.5 text-[12px] text-blue-50 focus:outline-none focus:border-blue-300/70";
const cellArea = `${cellInput} resize-y leading-snug`;
const th =
  "px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-blue-200/70 align-bottom";

const MAX_STAFF = 8;

/** Rough textarea row estimate so long values wrap instead of overflowing. */
function autoRows(value: string, perLine: number, cap = 4): number {
  const byNewline = value.split("\n").length;
  const byWrap = Math.ceil((value.trim().length || 1) / perLine);
  return Math.min(cap, Math.max(1, byNewline, byWrap));
}

export default function SearchLogAutofill() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [setup, setSetup] = useState<SetupFields>(defaultSetup);

  const [entryMethod, setEntryMethod] = useState<EntryMethod>("bedbook");
  const [bunkHandling, setBunkHandling] = useState<BunkHandling>("byCell");

  // Bed Book and manual rows are kept apart so switching the entry method hides —
  // never destroys — the other mode's work. `parsed` is retained so changing the
  // bunk handling re-groups the original roster losslessly (no re-upload).
  const [parsed, setParsed] = useState<ParsedBedBook | null>(null);
  const [bedBookRows, setBedBookRows] = useState<ReviewRow[]>([]);
  const [manualRows, setManualRows] = useState<ReviewRow[]>([]);
  const [parseInfo, setParseInfo] = useState<{ fileName: string; totalDataRows: number } | null>(
    null,
  );
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [filter, setFilter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const isManual = entryMethod === "manual";
  const rows = isManual ? manualRows : bedBookRows;
  const setActive = isManual ? setManualRows : setBedBookRows;

  const duplicateBedIds = useMemo(() => findDuplicateBedIds(rows), [rows]);
  const rowFlags = useMemo(
    () => new Map(rows.map((r) => [r.id, validateRow(r)])),
    [rows],
  );
  const includedRows = useMemo(() => rows.filter((r) => r.include), [rows]);
  const flaggedCount = useMemo(
    () =>
      includedRows.filter((r) => (rowFlags.get(r.id)?.length ?? 0) > 0).length,
    [includedRows, rowFlags],
  );
  const staffFlags = useMemo(() => validateStaff(setup.staff), [setup.staff]);

  // Upload stats reflect the CURRENT grouping (recomputed when bunk handling changes).
  const uploadStats = useMemo(() => {
    if (!parseInfo) return null;
    const uniqueCells = new Set(
      bedBookRows.map((r) => normalizeTimingCellKey(r.area || r.bedId)),
    ).size;
    return { entries: bedBookRows.length, uniqueCells };
  }, [parseInfo, bedBookRows]);

  // Roster summary (updates as rows are included/excluded).
  const summary = useMemo(() => {
    const total = rows.length;
    const included = includedRows.length;
    const uniqueCells = new Set(
      includedRows.map((r) => normalizeTimingCellKey(r.area || r.bedId)),
    ).size;
    const pages = included > 0 ? Math.ceil(included / ROWS_PER_PAGE) : 0;
    return { total, included, excluded: total - included, uniqueCells, pages };
  }, [rows, includedRows]);

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.bedId, r.area, r.inmate, r.officer, r.type, r.discrepancies]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, filter]);

  function setSetupField<K extends keyof SetupFields>(key: K, value: SetupFields[K]) {
    setSetup((prev) => ({ ...prev, [key]: value }));
    setConfirmed(false);
  }

  // ── Staff editor ──
  function addStaff() {
    setSetup((prev) =>
      prev.staff.length >= MAX_STAFF
        ? prev
        : { ...prev, staff: [...prev.staff, createStaffMember()] },
    );
    setConfirmed(false);
  }
  function removeStaff(id: string) {
    setSetup((prev) =>
      prev.staff.length <= 1
        ? prev
        : { ...prev, staff: prev.staff.filter((s) => s.id !== id) },
    );
    setConfirmed(false);
  }
  function updateStaff(id: string, patch: Partial<Omit<SetupFields["staff"][number], "id">>) {
    setSetup((prev) => ({
      ...prev,
      staff: prev.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
    setConfirmed(false);
  }

  // ── Entry method / bunk handling ──
  function changeEntryMethod(method: EntryMethod) {
    setEntryMethod(method);
    setConfirmed(false);
    setGenError("");
  }
  function changeBunkHandling(handling: BunkHandling) {
    setBunkHandling(handling);
    if (parsed) {
      setBedBookRows(buildReviewRows(groupBedBook(parsed, handling), setup, handling));
    }
    setConfirmed(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setParsing(true);
    setParseError("");
    setGenError("");
    setConfirmed(false);
    try {
      const parsedFile = await parseBedBookFile(file);
      setParsed(parsedFile);
      setBedBookRows(
        buildReviewRows(groupBedBook(parsedFile, bunkHandling), setup, bunkHandling),
      );
      setParseInfo({ fileName: file.name, totalDataRows: parsedFile.totalDataRows });
    } catch (err) {
      setParsed(null);
      setBedBookRows([]);
      setParseInfo(null);
      if (err instanceof BedBookParseError) setParseError(err.message);
      else setParseError(`Could not read the Bed Book file: ${String(err)}`);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearRoster() {
    setParsed(null);
    setBedBookRows([]);
    setParseInfo(null);
    setParseError("");
    setGenError("");
    setConfirmed(false);
    setFilter("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function rebuildFromRoster() {
    if (parsed) {
      setBedBookRows(buildReviewRows(groupBedBook(parsed, bunkHandling), setup, bunkHandling));
    }
    setConfirmed(false);
  }

  // ── Manual builder ──
  function addManualRow() {
    setManualRows((prev) => [...prev, createManualRow(setup, prev.length)]);
    setConfirmed(false);
  }
  function clearManualRows() {
    setManualRows([]);
    setConfirmed(false);
  }
  function applySetupToManual() {
    const officer = combineStaff(setup.staff);
    const date = formatDateMMDDYY(setup.dateOfSearch);
    setManualRows((prev) => {
      const updated = prev.map((r) => ({
        ...r,
        date,
        type: setup.searchType,
        officer,
        discrepancies: setup.discrepancies,
        tablet: setup.tabletMode === "Random" ? randomTablet() : setup.tabletMode,
      }));
      return resequenceTimes(updated, setup.startTime);
    });
    setConfirmed(false);
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setActive((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setConfirmed(false);
  }
  function removeRow(id: string) {
    setActive((prev) => prev.filter((r) => r.id !== id));
    setConfirmed(false);
  }

  // ── Bulk-apply helpers (operate on the active row set) ──
  function bulkDate() {
    const d = formatDateMMDDYY(setup.dateOfSearch);
    setActive((prev) => prev.map((r) => ({ ...r, date: d })));
    setConfirmed(false);
  }
  function bulkTimes() {
    setActive((prev) => resequenceTimes(prev, setup.startTime));
    setConfirmed(false);
  }
  function bulkType() {
    setActive((prev) => prev.map((r) => ({ ...r, type: setup.searchType })));
    setConfirmed(false);
  }
  function bulkOfficer() {
    const o = combineStaff(setup.staff);
    setActive((prev) => prev.map((r) => (r.include ? { ...r, officer: o } : r)));
    setConfirmed(false);
  }
  function bulkDiscrepancies() {
    setActive((prev) => prev.map((r) => ({ ...r, discrepancies: setup.discrepancies })));
    setConfirmed(false);
  }
  function setAllTablet(value: TabletValue) {
    setActive((prev) => prev.map((r) => ({ ...r, tablet: value })));
    setConfirmed(false);
  }
  function randomizeTablet() {
    setActive((prev) => {
      // Guarantee the Y/N mix across the rows that will actually appear in the
      // document (included rows); excluded rows just get any random value.
      const includedCount = prev.filter((r) => r.include).length;
      const mix = tabletValuesForMode("Random", includedCount);
      let k = 0;
      return prev.map((r) => ({
        ...r,
        tablet: r.include ? mix[k++] : randomTablet(),
      }));
    });
    setConfirmed(false);
  }
  function applyTablet() {
    if (setup.tabletMode === "Random") randomizeTablet();
    else setAllTablet(setup.tabletMode);
  }
  // Per-row Tablet dropdown: "Y"/"N" set just this row; the bulk values rewrite
  // the whole column. Generation isn't blocked, but reset confirmation either way.
  function selectRowTablet(rowId: string, choice: string) {
    if (choice === "Y" || choice === "N") {
      updateRow(rowId, { tablet: choice });
    } else if (choice === "ALL_Y") {
      setAllTablet("Y");
    } else if (choice === "ALL_N") {
      setAllTablet("N");
    } else if (choice === "RANDOM") {
      randomizeTablet();
    }
  }

  const hasRows = rows.length > 0;
  const canGenerate =
    includedRows.length > 0 && setup.location.trim().length > 0 && confirmed;

  async function handleGenerate() {
    setGenError("");
    if (includedRows.length === 0) {
      setGenError("No rows are selected to include in the Search Log.");
      return;
    }
    if (!setup.location.trim()) {
      setGenError("Enter a Location before generating.");
      return;
    }
    setGenerating(true);
    try {
      const docxRows: DocxFillRow[] = includedRows.map((r) => ({
        date: r.date,
        time: r.time,
        area: r.area,
        type: r.type,
        inmate: r.inmate,
        officer: r.officer,
        discrepancies: r.discrepancies,
        tablet: r.tablet,
        inmateFit: r.inmateFit,
      }));
      const blob = await fillSearchLogDocx(`${TEMPLATE_URL}?v=${Date.now()}`, {
        location: setup.location.trim(),
        rows: docxRows,
      });
      const dated = formatDateMMDDYYDashed(setup.dateOfSearch) || "UNDATED";
      const loc = setup.location.trim() || "Location";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Search Log - ${loc} - ${dated}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err instanceof SearchLogDocxError) setGenError(err.message);
      else setGenError(`Search Log generation failed: ${String(err)}`);
    } finally {
      setGenerating(false);
    }
  }

  const officerPreview = combineStaff(setup.staff);
  const staffIncomplete = staffFlags.length > 0;

  return (
    <PageShell
      title="Search Log Autofill"
      icon={ScrollText}
      maxWidthClass="max-w-7xl"
      subtitle="Enter the search details, then either upload a Bed Book roster or build the entries by hand. Review the rows and generate a completed Search Log by filling the original DC6-2001 Word form. The blank form, headers, and footer are never altered — only the data boxes are filled."
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
          service. Refreshing the page clears everything. Review all generated entries before
          official use.
        </p>
      </div>

      {/* Step 1 — Setup */}
      <section className={`${hudPanel} mb-5 p-5`}>
        <SectionTitle step="1" title="Search Log Setup" />
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Location *">
            <input
              className={hudInput}
              placeholder="e.g. B-Dorm"
              value={setup.location}
              onChange={(e) => setSetupField("location", e.target.value)}
            />
          </Field>
          <Field label="Date of Search" action={hasRows ? { label: "Apply", onClick: bulkDate } : undefined}>
            <input
              type="date"
              className={hudInput}
              value={setup.dateOfSearch}
              onChange={(e) => setSetupField("dateOfSearch", e.target.value)}
            />
          </Field>
          <Field label="Start Time" action={hasRows ? { label: "Apply", onClick: bulkTimes } : undefined}>
            <input
              type="time"
              className={hudInput}
              value={setup.startTime}
              onChange={(e) => setSetupField("startTime", e.target.value)}
            />
          </Field>
          <Field label="Type of Search" action={hasRows ? { label: "Apply", onClick: bulkType } : undefined}>
            <select
              className={hudInput}
              value={setup.searchType}
              onChange={(e) => setSetupField("searchType", e.target.value as SetupFields["searchType"])}
            >
              {SEARCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Discrepancies / Contraband" action={hasRows ? { label: "Apply", onClick: bulkDiscrepancies } : undefined}>
            <input
              className={hudInput}
              value={setup.discrepancies}
              onChange={(e) => setSetupField("discrepancies", e.target.value)}
            />
          </Field>
          <Field
            label="Tablet Y/N"
            action={hasRows ? { label: "Apply", onClick: applyTablet } : undefined}
          >
            <select
              className={hudInput}
              value={setup.tabletMode}
              onChange={(e) => setSetupField("tabletMode", e.target.value as SetupFields["tabletMode"])}
            >
              {TABLET_MODES.map((m) => (
                <option key={m} value={m}>
                  {TABLET_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>

          {/* Staff members — spans the full grid width */}
          <div className="flex flex-col sm:col-span-2 lg:col-span-3">
            <div className="flex min-h-[34px] items-end justify-between gap-2">
              <label className={`${hudLabel} mb-0`}>Staff Members (Officer Column)</label>
              {hasRows && (
                <button onClick={bulkOfficer} className={btnGhost} title="Apply combined officers to included rows">
                  Apply Officer
                </button>
              )}
            </div>
            <div className="mt-1.5 space-y-2">
              {setup.staff.map((m, idx) => (
                <div key={m.id} className="flex items-center gap-2">
                  <div className="w-[116px] shrink-0">
                    <select
                      className={hudInput}
                      value={m.rank}
                      onChange={(e) => updateStaff(m.id, { rank: e.target.value as SetupFields["staff"][number]["rank"] })}
                    >
                      {STAFF_RANKS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    className={`${hudInput} flex-1`}
                    placeholder={`Staff #${idx + 1} name${idx === 0 ? " (required)" : ""}`}
                    value={m.name}
                    onChange={(e) => updateStaff(m.id, { name: e.target.value })}
                  />
                  <button
                    onClick={() => removeStaff(m.id)}
                    disabled={setup.staff.length <= 1}
                    className={`${btnGhost} shrink-0`}
                    title={setup.staff.length <= 1 ? "At least one staff member is required" : "Remove staff member"}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button onClick={addStaff} disabled={setup.staff.length >= MAX_STAFF} className={btnGhost}>
                  <Plus className="h-3.5 w-3.5" /> Add Staff
                </button>
                {officerPreview && (
                  <span className="text-[11px] text-blue-300/70">
                    Officer column: <span className="text-blue-100/90">{officerPreview}</span>
                  </span>
                )}
              </div>
              {staffIncomplete && (
                <p className="flex items-center gap-2 text-[11px] text-amber-200/85">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {staffFlags[0].message}.
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-2 text-[11px] text-amber-200/80">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Times auto-fill from the Start Time — one minute per cell, with upper/lower bunks in the
          same cell sharing a time. Review and confirm all generated times before official use.
        </p>
        {!isManual && parsed && (
          <button onClick={rebuildFromRoster} className={`${btnGhost} mt-3`}>
            Reset rows from roster &amp; setup
          </button>
        )}
      </section>

      {/* Step 2 — Entry method */}
      <section className={`${hudPanel} mb-5 p-5`}>
        <SectionTitle step="2" title="Search Log Entry Method" />
        <div className="inline-flex rounded-lg border border-blue-400/35 bg-[rgba(2,8,24,0.6)] p-1">
          {ENTRY_METHODS.map((opt) => {
            const active = entryMethod === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => changeEntryMethod(opt.value)}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors ${
                  active ? "bg-blue-600/85 text-white" : "text-blue-200/70 hover:text-blue-100"
                }`}
              >
                <Icon className="h-4 w-4" /> {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-blue-300/65">
          {isManual
            ? "Build the Search Log entry by entry — no roster file needed."
            : "Upload a Bed Book roster (CSV / XLSX) and the rows are built for you."}
        </p>
      </section>

      {/* Step 3 — Upload (Bed Book) or Manual builder */}
      {!isManual ? (
        <section className={`${hudPanel} mb-5 p-5`}>
          <SectionTitle step="3" title="Upload Bed Book" />

          {/* Bunk handling */}
          <div className="mb-4 rounded-lg border border-blue-400/25 bg-[rgba(2,8,24,0.45)] p-3">
            <p className={`${hudLabel} mb-2`}>Bunk Handling</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {BUNK_OPTIONS.map((opt) => {
                const active = bunkHandling === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => changeBunkHandling(opt.value)}
                    className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition-colors ${
                      active
                        ? "border-blue-300/70 bg-blue-500/10"
                        : "border-blue-400/25 hover:border-blue-300/50"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-[12px] font-bold text-blue-100">
                      <span
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                          active ? "border-blue-300 bg-blue-400" : "border-blue-400/50"
                        }`}
                      />
                      {opt.label}
                    </span>
                    <span className="text-[10.5px] leading-snug text-blue-300/65">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label
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
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragOver
                ? "border-blue-300/80 bg-blue-500/10"
                : "border-blue-400/35 bg-[rgba(2,8,24,0.5)] hover:border-blue-300/60"
            }`}
          >
            <Upload className="h-7 w-7 text-blue-300/80" />
            <span className="text-sm font-semibold text-blue-100">
              Drag &amp; drop your Bed Book here, or click to browse
            </span>
            <span className="text-[11px] text-blue-300/55">Accepts .csv, .xlsx, or .xls</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>

          {parsing && <p className="mt-3 text-xs text-blue-300/70">Parsing Bed Book…</p>}
          {parseError && (
            <p className="mt-3 flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {parseError}
            </p>
          )}

          {parseInfo && (
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-blue-400/30 bg-[rgba(2,8,24,0.55)] px-4 py-3">
              <span className="flex items-center gap-2 text-xs text-blue-100">
                <FileSpreadsheet className="h-4 w-4 text-blue-300" />
                <span className="font-semibold">{parseInfo.fileName}</span>
              </span>
              <Stat label="Roster rows" value={parseInfo.totalDataRows} />
              <Stat label="Entries" value={uploadStats?.entries ?? 0} />
              <Stat label="Unique cells" value={uploadStats?.uniqueCells ?? 0} />
              <button onClick={clearRoster} className={`${btnGhost} ml-auto`}>
                <Trash2 className="h-3.5 w-3.5" /> Clear Uploaded Bed Book
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className={`${hudPanel} mb-5 p-5`}>
          <SectionTitle step="3" title="Manual Search Entries" />
          <p className="mb-3 text-[11px] leading-relaxed text-blue-200/75">
            Add rows and edit every field in the review table below. New rows start from your Setup
            defaults, with the time auto-incrementing one minute per row.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={addManualRow} className={btnBlue}>
              <Plus className="h-4 w-4" /> Add Search Row
            </button>
            <button onClick={applySetupToManual} disabled={manualRows.length === 0} className={btnGhost}>
              Apply Setup Defaults to All Rows
            </button>
            <button onClick={clearManualRows} disabled={manualRows.length === 0} className={btnGhost}>
              <Trash2 className="h-3.5 w-3.5" /> Clear Manual Rows
            </button>
          </div>
          {manualRows.length === 0 && (
            <p className="mt-3 text-[11px] text-blue-300/55">
              No manual rows yet — click &ldquo;Add Search Row&rdquo; to begin.
            </p>
          )}
        </section>
      )}

      {/* Step 4 — Review */}
      {hasRows && (
        <section className={`${hudPanel} mb-5 p-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle step="4" title="Review &amp; Edit Entries" inline />
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-300/50" />
              <input
                className={`${hudInput} py-1.5 pl-8 text-xs`}
                placeholder="Search rows…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Roster summary strip */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SummaryChip label="Mode" value={isManual ? "Manual Entry" : "Bed Book Upload"} />
            {!isManual && (
              <SummaryChip
                label="Bunks"
                value={bunkHandling === "byCell" ? "Grouped by cell" : "Separate bunks"}
              />
            )}
            <SummaryChip label="Total Entries" value={summary.total} />
            <SummaryChip label="Included" value={summary.included} tone="emerald" />
            <SummaryChip label="Excluded" value={summary.excluded} tone={summary.excluded > 0 ? "amber" : undefined} />
            <SummaryChip label="Unique Cells" value={summary.uniqueCells} />
            <SummaryChip label="Pages" value={summary.pages} />
            {flaggedCount > 0 && (
              <SummaryChip label="Flagged" value={flaggedCount} tone="amber" />
            )}
          </div>

          <div className="max-h-[62vh] overflow-y-auto overflow-x-hidden rounded-lg border border-blue-400/25">
            <table className="w-full table-fixed border-collapse text-xs">
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "27%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "6%" }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[rgba(2,8,24,0.96)]">
                <tr>
                  <th className={`${th} text-center`}>Incl.</th>
                  <th className={th}>Date</th>
                  <th className={th}>Time</th>
                  <th className={th}>Area/Bunk</th>
                  <th className={th}>Type</th>
                  <th className={th}>Inmate Name/FDC Number</th>
                  <th className={th}>Officer(s)</th>
                  <th className={th}>Discrep./Contraband</th>
                  <th className={th}>Tablet</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const flags = rowFlags.get(r.id) ?? [];
                  const isDup = r.bedId.trim() !== "" && duplicateBedIds.has(r.bedId.trim());
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-blue-400/15 ${r.include ? "" : "opacity-45"}`}
                    >
                      <td className="px-2 py-2 text-center align-top">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                          className="h-3.5 w-3.5 accent-blue-500"
                        />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <input className={cellInput} value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })} />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <input className={cellInput} value={r.time} onChange={(e) => updateRow(r.id, { time: e.target.value })} />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <input className={cellInput} value={r.area} onChange={(e) => updateRow(r.id, { area: e.target.value })} />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <select className={cellInput} value={r.type} onChange={(e) => updateRow(r.id, { type: e.target.value })}>
                          {SEARCH_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <textarea
                          rows={autoRows(r.inmate, 34)}
                          className={cellArea}
                          value={r.inmate}
                          onChange={(e) => updateRow(r.id, { inmate: e.target.value })}
                        />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <textarea
                          rows={autoRows(r.officer, 16)}
                          className={cellArea}
                          value={r.officer}
                          onChange={(e) => updateRow(r.id, { officer: e.target.value })}
                        />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <textarea
                          rows={autoRows(r.discrepancies, 16)}
                          className={cellArea}
                          value={r.discrepancies}
                          onChange={(e) => updateRow(r.id, { discrepancies: e.target.value })}
                        />
                      </td>
                      <td className="px-1.5 py-2 align-top">
                        <select className={cellInput} value={r.tablet} onChange={(e) => selectRowTablet(r.id, e.target.value)}>
                          {TABLET_ROW_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-col items-start gap-1.5">
                          {flags.length === 0 && !isDup ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400/90">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          ) : (
                            <span
                              title={[...flags.map((f) => f.message), isDup ? "Duplicate BED-ID grouping" : ""]
                                .filter(Boolean)
                                .join("; ")}
                              className="flex items-center gap-1 text-[10px] text-amber-300/90"
                            >
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {flags.length + (isDup ? 1 : 0)} warning
                              {flags.length + (isDup ? 1 : 0) > 1 ? "s" : ""}
                            </span>
                          )}
                          {r.source === "manual" && (
                            <button
                              onClick={() => removeRow(r.id)}
                              className="inline-flex items-center gap-1 text-[10px] text-red-300/80 transition-colors hover:text-red-200"
                              title="Remove this manual row"
                            >
                              <Trash2 className="h-3 w-3" /> Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleRows.length === 0 && (
            <p className="mt-3 text-center text-xs text-blue-300/55">No rows match your search.</p>
          )}
        </section>
      )}

      {/* Step 5 — Generate */}
      {hasRows && (
        <section className={`${hudPanel} mb-2 p-5`}>
          <SectionTitle step="5" title="Generate Search Log" />
          <p className="mb-4 text-[11px] leading-relaxed text-blue-200/75">
            Review all entries before official use. This tool only fills the original form with
            uploaded or manually entered information. It does not verify that searches were
            conducted.
          </p>

          {flaggedCount > 0 && (
            <p className="mb-3 flex items-center gap-2 rounded-md border border-amber-400/50 bg-[rgba(28,18,2,0.6)] px-3 py-2 text-[11px] text-amber-200/90">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {flaggedCount} included {flaggedCount === 1 ? "row has" : "rows have"} validation
              warnings. Fix, exclude, or confirm before generating.
            </p>
          )}

          {staffIncomplete && (
            <p className="mb-3 flex items-center gap-2 rounded-md border border-amber-400/50 bg-[rgba(28,18,2,0.6)] px-3 py-2 text-[11px] text-amber-200/90">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Officer / staff information is incomplete ({staffFlags[0].message}). You can still
              generate, but the officer column may be blank or partial.
            </p>
          )}

          <label className="mb-4 flex items-start gap-2.5 text-[12px] text-blue-100/90">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-blue-500"
            />
            <span>
              I have reviewed all entries, dates, and times, and confirm they are correct for
              official use.
            </span>
          </label>

          <button
            onClick={handleGenerate}
            disabled={!canGenerate || generating}
            className={`${btnBlue} w-full py-3 text-base sm:w-auto sm:px-8`}
            style={canGenerate && !generating ? { boxShadow: "0 0 20px rgba(37,99,235,0.35)" } : undefined}
          >
            <Download className="h-4 w-4" />
            {generating ? "Generating…" : "Generate & Download Search Log"}
          </button>

          {!canGenerate && (
            <p className="mt-2 text-[11px] text-blue-300/55">
              {setup.location.trim() === ""
                ? "Enter a Location and confirm your review to enable download."
                : includedRows.length === 0
                  ? "Include at least one row to generate."
                  : "Confirm your review to enable download."}
            </p>
          )}
          {genError && (
            <p className="mt-2 flex items-center gap-2 text-xs text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {genError}
            </p>
          )}
        </section>
      )}

    </PageShell>
  );
}

// ── Small presentational helpers ──
function SectionTitle({
  step,
  title,
  inline,
}: {
  step: string;
  title: string;
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${inline ? "" : "mb-4"}`}>
      <span
        className="flex h-6 w-6 items-center justify-center rounded-full border border-blue-400/50 bg-blue-500/15 text-[11px] font-black text-blue-200"
        style={{ boxShadow: "0 0 10px rgba(59,130,246,0.3)" }}
      >
        {step}
      </span>
      <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-blue-100">{title}</h2>
    </div>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-[34px] items-end justify-between gap-2">
        <label className={`${hudLabel} mb-0`}>{label}</label>
        {action && (
          <button onClick={action.onClick} className={btnGhost}>
            {action.label}
          </button>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-1.5 text-xs">
      <span className="text-blue-300/55">{label}:</span>
      <span className="font-semibold text-blue-100">{value}</span>
    </span>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-400/40 text-emerald-200"
      : tone === "amber"
        ? "border-amber-400/45 text-amber-200"
        : "border-blue-400/30 text-blue-100";
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-md border bg-[rgba(2,8,24,0.6)] px-3 py-1.5 ${toneClass}`}
    >
      <span className="text-[10px] uppercase tracking-[0.1em] opacity-70">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </span>
  );
}
