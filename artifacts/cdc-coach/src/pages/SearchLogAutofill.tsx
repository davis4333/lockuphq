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
} from "lucide-react";
import PageShell, { hudPanel, hudInput, hudLabel } from "@/components/PageShell";
import {
  SEARCH_TYPES,
  STAFF_RANKS,
  TABLET_VALUES,
  type GroupedEntry,
  type ReviewRow,
  type SetupFields,
} from "@/lib/searchLog/types";
import { parseBedBookFile, BedBookParseError } from "@/lib/searchLog/bedBookParser";
import { groupByBedId } from "@/lib/searchLog/bedBookGrouper";
import {
  buildReviewRows,
  resequenceTimes,
  validateRow,
  findDuplicateBedIds,
  formatDateMMDDYY,
  formatDateMMDDYYDashed,
  buildOfficer,
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
  staffName: "",
  staffRank: "C/O",
  discrepancies: "None",
  tablet: "N",
});

const btnBlue =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-blue-300/50 bg-blue-600/85 px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-400/35 bg-[rgba(4,11,34,0.7)] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-blue-200/80 transition-colors hover:border-blue-300/60 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-40";
const cellInput =
  "w-full rounded border border-blue-400/30 bg-[rgba(2,8,24,0.7)] px-1.5 py-1 text-[11px] text-blue-50 focus:outline-none focus:border-blue-300/70";
const th =
  "px-2 py-2 text-left text-[9px] font-bold uppercase tracking-[0.1em] text-blue-200/70 whitespace-nowrap";

export default function SearchLogAutofill() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [setup, setSetup] = useState<SetupFields>(defaultSetup);
  const [groups, setGroups] = useState<GroupedEntry[] | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [parseInfo, setParseInfo] = useState<{
    fileName: string;
    delimiter: string;
    headerRowIndex: number;
    totalDataRows: number;
    uniqueCells: number;
  } | null>(null);
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [filter, setFilter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setParsing(true);
    setParseError("");
    setGenError("");
    setConfirmed(false);
    try {
      const parsed = await parseBedBookFile(file);
      const grouped = groupByBedId(parsed);
      setGroups(grouped);
      setRows(buildReviewRows(grouped, setup));
      setParseInfo({
        fileName: file.name,
        delimiter: parsed.delimiter,
        headerRowIndex: parsed.headerRowIndex,
        totalDataRows: parsed.totalDataRows,
        uniqueCells: grouped.length,
      });
    } catch (err) {
      setGroups(null);
      setRows([]);
      setParseInfo(null);
      if (err instanceof BedBookParseError) setParseError(err.message);
      else setParseError(`Could not read the Bed Book file: ${String(err)}`);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function clearRoster() {
    setGroups(null);
    setRows([]);
    setParseInfo(null);
    setParseError("");
    setGenError("");
    setConfirmed(false);
    setFilter("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function rebuildFromRoster() {
    if (groups) setRows(buildReviewRows(groups, setup));
    setConfirmed(false);
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setConfirmed(false);
  }

  // ── Bulk-apply helpers ──
  function bulkDate() {
    const d = formatDateMMDDYY(setup.dateOfSearch);
    setRows((prev) => prev.map((r) => ({ ...r, date: d })));
    setConfirmed(false);
  }
  function bulkTimes() {
    setRows((prev) => resequenceTimes(prev, setup.startTime));
    setConfirmed(false);
  }
  function bulkType() {
    setRows((prev) => prev.map((r) => ({ ...r, type: setup.searchType })));
    setConfirmed(false);
  }
  function bulkOfficer() {
    const o = buildOfficer(setup.staffRank, setup.staffName);
    setRows((prev) => prev.map((r) => ({ ...r, officer: o })));
    setConfirmed(false);
  }
  function bulkDiscrepancies() {
    setRows((prev) => prev.map((r) => ({ ...r, discrepancies: setup.discrepancies })));
    setConfirmed(false);
  }
  function bulkTablet() {
    setRows((prev) => prev.map((r) => ({ ...r, tablet: setup.tablet })));
    setConfirmed(false);
  }

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

  return (
    <PageShell
      title="Search Log Autofill"
      icon={ScrollText}
      maxWidthClass="max-w-6xl"
      subtitle="Upload a Bed Book roster, review the parsed cells and search details, then generate a completed Search Log by filling the original DC6-2001 Word form. The blank form, headers, and footer are never altered — only the data boxes are filled."
    >
      {/* Privacy notice */}
      <div
        className="mb-5 flex items-start gap-3 rounded-lg border border-amber-400/70 bg-[rgba(28,18,2,0.72)] px-4 py-3"
        style={{ boxShadow: "0 0 22px rgba(245,158,11,0.18)" }}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-[11px] leading-relaxed text-amber-100/85">
          Uploaded Bed Book data is processed for this browser session only — it is not saved to a
          database, not stored in your browser, and never sent to AI or any external service.
          Refreshing the page clears the roster. Review all generated entries before official use.
        </p>
      </div>

      {/* Step 1 — Upload */}
      <section className={`${hudPanel} mb-5 p-5`}>
        <SectionTitle step="1" title="Upload Bed Book" />
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
            <Stat label="Unique cells" value={parseInfo.uniqueCells} />
            <Stat
              label="Delimiter"
              value={parseInfo.delimiter === "\t" ? "TAB" : parseInfo.delimiter || "—"}
            />
            <button onClick={clearRoster} className={`${btnGhost} ml-auto`}>
              <Trash2 className="h-3.5 w-3.5" /> Clear Uploaded Bed Book
            </button>
          </div>
        )}
      </section>

      {/* Step 2 — Setup */}
      <section className={`${hudPanel} mb-5 p-5`}>
        <SectionTitle step="2" title="Search Log Setup" />
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Location *">
            <input
              className={hudInput}
              placeholder="e.g. B-Dorm"
              value={setup.location}
              onChange={(e) => setSetupField("location", e.target.value)}
            />
          </Field>
          <Field label="Date of Search" action={parseInfo ? { label: "Apply", onClick: bulkDate } : undefined}>
            <input
              type="date"
              className={hudInput}
              value={setup.dateOfSearch}
              onChange={(e) => setSetupField("dateOfSearch", e.target.value)}
            />
          </Field>
          <Field label="Start Time" action={parseInfo ? { label: "Apply", onClick: bulkTimes } : undefined}>
            <input
              type="time"
              className={hudInput}
              value={setup.startTime}
              onChange={(e) => setSetupField("startTime", e.target.value)}
            />
          </Field>
          <Field label="Type of Search" action={parseInfo ? { label: "Apply", onClick: bulkType } : undefined}>
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
          <Field label="Staff Name">
            <input
              className={hudInput}
              placeholder="e.g. Rivera"
              value={setup.staffName}
              onChange={(e) => setSetupField("staffName", e.target.value)}
            />
          </Field>
          <Field label="Staff Rank" action={parseInfo ? { label: "Apply Officer", onClick: bulkOfficer } : undefined}>
            <select
              className={hudInput}
              value={setup.staffRank}
              onChange={(e) => setSetupField("staffRank", e.target.value as SetupFields["staffRank"])}
            >
              {STAFF_RANKS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Discrepancies / Contraband" action={parseInfo ? { label: "Apply", onClick: bulkDiscrepancies } : undefined}>
            <input
              className={hudInput}
              value={setup.discrepancies}
              onChange={(e) => setSetupField("discrepancies", e.target.value)}
            />
          </Field>
          <Field label="Tablet Y/N" action={parseInfo ? { label: "Apply", onClick: bulkTablet } : undefined}>
            <select
              className={hudInput}
              value={setup.tablet}
              onChange={(e) => setSetupField("tablet", e.target.value as SetupFields["tablet"])}
            >
              {TABLET_VALUES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-amber-200/80">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Times auto-fill from the start time, +1 minute per row. Review and confirm all generated
          times before official use.
        </p>
        {parseInfo && (
          <button onClick={rebuildFromRoster} className={`${btnGhost} mt-3`}>
            Reset rows from roster &amp; setup
          </button>
        )}
      </section>

      {/* Step 3 — Review */}
      {rows.length > 0 && (
        <section className={`${hudPanel} mb-5 p-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <SectionTitle step="3" title="Review &amp; Edit Entries" inline />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-blue-300/70">
                {includedRows.length} of {rows.length} included
                {flaggedCount > 0 && (
                  <span className="ml-2 text-amber-300/90">• {flaggedCount} flagged</span>
                )}
              </span>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-300/50" />
              <input
                className={`${hudInput} pl-8 py-1.5 text-xs`}
                placeholder="Search rows…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-blue-400/25">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[rgba(2,8,24,0.8)]">
                <tr>
                  <th className={th}>Incl.</th>
                  <th className={th}>Date</th>
                  <th className={th}>Time</th>
                  <th className={th}>Area/Bunk</th>
                  <th className={th}>Type</th>
                  <th className={`${th} min-w-[180px]`}>Inmate Name/FDC Number</th>
                  <th className={th}>Officer</th>
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
                      <td className="px-2 py-1 text-center align-top">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                          className="h-3.5 w-3.5 accent-blue-500"
                        />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input className={`${cellInput} w-[72px]`} value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input className={`${cellInput} w-[64px]`} value={r.time} onChange={(e) => updateRow(r.id, { time: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input className={`${cellInput} w-[80px]`} value={r.area} onChange={(e) => updateRow(r.id, { area: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <select className={`${cellInput} w-[68px]`} value={r.type} onChange={(e) => updateRow(r.id, { type: e.target.value })}>
                          {SEARCH_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-1 align-top">
                        <textarea
                          rows={Math.max(1, r.inmate.split("\n").length)}
                          className={`${cellInput} min-w-[180px] resize-y leading-snug`}
                          value={r.inmate}
                          onChange={(e) => updateRow(r.id, { inmate: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input className={`${cellInput} w-[96px]`} value={r.officer} onChange={(e) => updateRow(r.id, { officer: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <input className={`${cellInput} w-[110px]`} value={r.discrepancies} onChange={(e) => updateRow(r.id, { discrepancies: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 align-top">
                        <select className={`${cellInput} w-[52px]`} value={r.tablet} onChange={(e) => updateRow(r.id, { tablet: e.target.value })}>
                          {TABLET_VALUES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1 align-top">
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
                            <AlertTriangle className="h-3 w-3" />
                            {(flags.length + (isDup ? 1 : 0))} warning
                            {flags.length + (isDup ? 1 : 0) > 1 ? "s" : ""}
                          </span>
                        )}
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

      {/* Step 4 — Generate */}
      {rows.length > 0 && (
        <section className={`${hudPanel} mb-2 p-5`}>
          <SectionTitle step="4" title="Generate &amp; Download" />
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
            className={btnBlue}
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
    <div>
      <div className="flex items-center justify-between">
        <span className={hudLabel}>{label}</span>
        {action && (
          <button
            onClick={action.onClick}
            className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-blue-300/70 hover:text-blue-100"
          >
            {action.label} →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex flex-col">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-300/55">{label}</span>
      <span className="text-sm font-semibold text-blue-100">{value}</span>
    </span>
  );
}
