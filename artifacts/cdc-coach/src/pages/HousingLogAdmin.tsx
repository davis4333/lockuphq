import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Download,
  FileSpreadsheet,
  LogOut,
} from "lucide-react";
import type {
  HousingLogArchiveResponse,
  HousingShift,
} from "@workspace/housing-log";
import PageShell, {
  hudInput,
  hudLabel,
  hudPanel,
} from "@/components/PageShell";
import HousingLogDeliveryRecipients from "@/components/HousingLogDeliveryRecipients";
import {
  downloadHousingLogExcel,
  downloadHousingLogShiftPackage,
  getHousingLogArchive,
  HousingLogAdminApiError,
  loginHousingLogAdmin,
  logoutHousingLogAdmin,
} from "@/lib/housingLogAdminApi";
import {
  buildHousingLogArchiveTree,
  formatArchiveDate,
} from "@/lib/housingLogArchive";

const shiftLabel: Record<HousingShift, string> = {
  "1": "First Shift",
  "2": "Second Shift",
  "3": "Third Shift",
};

const packageStateLabel = {
  complete: "Complete",
  missing: "Missing logs",
  duplicates: "Duplicate logs",
  "missing-and-duplicates": "Missing + duplicates",
} as const;

export default function HousingLogAdmin() {
  const [archive, setArchive] = useState<HousingLogArchiveResponse | null>(
    null,
  );
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadingPackage, setDownloadingPackage] = useState<string | null>(
    null,
  );

  const loadArchive = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getHousingLogArchive();
      setArchive(result);
      setAuthenticated(true);
    } catch (requestError) {
      if (
        requestError instanceof HousingLogAdminApiError &&
        requestError.status === 401
      ) {
        setArchive(null);
        setAuthenticated(false);
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Housing Log archive could not be loaded.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadArchive();
  }, []);

  const tree = useMemo(
    () =>
      archive
        ? buildHousingLogArchiveTree(
            archive.records,
            archive.expectedHousingUnits,
          )
        : [],
    [archive],
  );

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await loginHousingLogAdmin(password);
      setPassword("");
      setAuthenticated(true);
      await loadArchive();
    } catch (requestError) {
      setAuthenticated(false);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Admin login failed.",
      );
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await logoutHousingLogAdmin();
    } finally {
      setArchive(null);
      setAuthenticated(false);
      setError("");
    }
  };

  const download = async (id: string) => {
    setDownloading(id);
    setError("");
    try {
      await downloadHousingLogExcel(id);
    } catch (requestError) {
      if (
        requestError instanceof HousingLogAdminApiError &&
        requestError.status === 401
      ) {
        setAuthenticated(false);
        setArchive(null);
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The editable Excel log could not be downloaded.",
      );
    } finally {
      setDownloading(null);
    }
  };

  const downloadPackage = async (logDate: string, shift: HousingShift) => {
    const key = `${logDate}-${shift}`;
    setDownloadingPackage(key);
    setError("");
    try {
      await downloadHousingLogShiftPackage(logDate, shift);
    } catch (requestError) {
      if (
        requestError instanceof HousingLogAdminApiError &&
        requestError.status === 401
      ) {
        setAuthenticated(false);
        setArchive(null);
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The shift package could not be downloaded.",
      );
    } finally {
      setDownloadingPackage(null);
    }
  };

  return (
    <PageShell
      title="Housing Log Admin Archive"
      subtitle="Browse finalized Housing Logs by official log date and download an editable Excel copy. Downloaded changes do not alter the finalized LockUpHQ record."
      icon={Archive}
      maxWidthClass="max-w-6xl"
    >
      {error && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-red-400/50 bg-red-950/50 p-3 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          {authenticated !== false && (
            <button
              type="button"
              onClick={() => void loadArchive()}
              disabled={loading}
              className="shrink-0 rounded-md border border-red-200/50 bg-red-900/35 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-red-50 hover:bg-red-800/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Retrying…" : "Retry Archive"}
            </button>
          )}
        </div>
      )}

      {authenticated === false ? (
        <form
          onSubmit={submitLogin}
          className={`${hudPanel} mx-auto max-w-md p-5`}
        >
          <h2 className="text-base font-black uppercase tracking-[0.1em] text-white">
            Admin Login
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-blue-200/65">
            Enter the Housing Log admin password configured in Replit Secrets.
          </p>
          <label className={`${hudLabel} mt-5`} htmlFor="admin-password">
            Admin password
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={hudInput}
            autoComplete="current-password"
            required
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="mt-4 w-full rounded-lg border border-blue-300/60 bg-blue-600/35 px-4 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-blue-50 transition hover:bg-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Open Archive"}
          </button>
        </form>
      ) : loading && !archive ? (
        <div className={`${hudPanel} p-6 text-center text-sm text-blue-200/70`}>
          Loading Housing Log archive…
        </div>
      ) : authenticated && archive ? (
        <>
          <HousingLogDeliveryRecipients
            onUnauthorized={() => {
              setArchive(null);
              setAuthenticated(false);
            }}
          />
          <section className={`${hudPanel} p-4 sm:p-5`}>
            <div className="mb-4 flex flex-col gap-3 border-b border-blue-400/25 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.14em] text-white">
                  Finalized Housing Logs
                </h2>
                <p className="mt-1 text-xs text-blue-200/60">
                  {archive.records.length} finalized record
                  {archive.records.length === 1 ? "" : "s"}. Missing and
                  duplicate unit slots are shown explicitly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-400/40 bg-blue-950/50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100 hover:border-blue-300/70"
              >
                <LogOut className="h-3.5 w-3.5" /> Log Out
              </button>
            </div>

            {tree.length === 0 ? (
              <div className="rounded-lg border border-dashed border-blue-400/35 p-8 text-center text-sm text-blue-200/65">
                No finalized Housing Logs are available yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tree.map((year) => (
                  <details
                    key={year.year}
                    open
                    className="group rounded-lg border border-blue-400/35 bg-slate-950/35"
                  >
                    <summary className="cursor-pointer px-4 py-3 text-base font-black text-blue-50 marker:text-blue-400">
                      {year.year}
                    </summary>
                    <div className="space-y-3 px-3 pb-3 sm:px-4">
                      {year.months.map((month) => (
                        <details
                          key={month.month}
                          open
                          className="rounded-lg border border-blue-500/25 bg-blue-950/20"
                        >
                          <summary className="cursor-pointer px-3 py-2.5 text-sm font-bold text-blue-100 marker:text-blue-400">
                            {month.label}
                          </summary>
                          <div className="space-y-3 px-3 pb-3">
                            {month.dates.map((date) => (
                              <details
                                key={date.logDate}
                                className="rounded-md border border-slate-500/30 bg-black/20"
                              >
                                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-100 marker:text-blue-400">
                                  {formatArchiveDate(date.logDate)}
                                  <span className="ml-2 font-mono text-[10px] text-blue-300/55">
                                    {date.logDate}
                                  </span>
                                </summary>
                                <div className="space-y-3 px-3 pb-3">
                                  {date.shifts.map((shift) => (
                                    <details
                                      key={shift.shift}
                                      className="rounded-md border border-slate-600/30 bg-slate-950/40"
                                    >
                                      <summary className="cursor-pointer px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] text-blue-200 marker:text-blue-400">
                                        {shiftLabel[shift.shift]}
                                      </summary>
                                      <div className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-blue-400/25 bg-blue-950/25 p-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-blue-300/65">
                                            Shift package status
                                          </div>
                                          <div
                                            className={`mt-1 text-xs font-black uppercase tracking-[0.08em] ${
                                              shift.packageState === "complete"
                                                ? "text-emerald-300"
                                                : "text-amber-300"
                                            }`}
                                          >
                                            {
                                              packageStateLabel[
                                                shift.packageState
                                              ]
                                            }
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void downloadPackage(
                                              date.logDate,
                                              shift.shift,
                                            )
                                          }
                                          disabled={
                                            downloadingPackage ===
                                            `${date.logDate}-${shift.shift}`
                                          }
                                          className="inline-flex items-center justify-center gap-2 rounded border border-blue-300/50 bg-blue-700/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-blue-50 hover:bg-blue-600/45 disabled:opacity-50"
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                          {downloadingPackage ===
                                          `${date.logDate}-${shift.shift}`
                                            ? "Building Package…"
                                            : "Download Shift Package"}
                                        </button>
                                      </div>
                                      <div className="grid gap-2 px-3 pb-3 md:grid-cols-2">
                                        {shift.units.map((slot) => (
                                          <div
                                            key={slot.housingUnit}
                                            className={`rounded-md border p-3 ${
                                              slot.duplicate
                                                ? "border-amber-400/65 bg-amber-950/25"
                                                : slot.missing
                                                  ? "border-red-400/30 bg-red-950/15"
                                                  : "border-emerald-400/30 bg-emerald-950/15"
                                            }`}
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <h3 className="text-xs font-black uppercase tracking-[0.08em] text-white">
                                                {slot.housingUnit}
                                              </h3>
                                              {slot.duplicate ? (
                                                <span className="rounded border border-amber-300/55 bg-amber-900/40 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">
                                                  Duplicate Logs
                                                </span>
                                              ) : slot.missing ? (
                                                <span className="rounded border border-red-300/35 bg-red-900/25 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-200/80">
                                                  Missing Log
                                                </span>
                                              ) : null}
                                            </div>

                                            {slot.records.map(
                                              (record, index) => (
                                                <div
                                                  key={record.id}
                                                  className={`${index ? "mt-3 border-t border-amber-300/25 pt-3" : "mt-2"}`}
                                                >
                                                  <div className="text-[10px] leading-relaxed text-slate-300/75">
                                                    <div>
                                                      Finalized{" "}
                                                      {new Date(
                                                        record.finalizedAt,
                                                      ).toLocaleString()}
                                                    </div>
                                                    <div>
                                                      Template{" "}
                                                      {record.templateVersion} ·{" "}
                                                      {record.sourceSheet}
                                                    </div>
                                                    <div className="font-mono text-[9px] text-slate-400/70">
                                                      {record.id}
                                                    </div>
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      void download(record.id)
                                                    }
                                                    disabled={
                                                      downloading === record.id
                                                    }
                                                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded border border-emerald-400/45 bg-emerald-900/25 px-2 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-100 hover:bg-emerald-800/35 disabled:opacity-50"
                                                  >
                                                    {downloading ===
                                                    record.id ? (
                                                      <FileSpreadsheet className="h-3.5 w-3.5 animate-pulse" />
                                                    ) : (
                                                      <Download className="h-3.5 w-3.5" />
                                                    )}
                                                    Download Editable Excel Log
                                                  </button>
                                                </div>
                                              ),
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </details>
                                  ))}
                                </div>
                              </details>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
