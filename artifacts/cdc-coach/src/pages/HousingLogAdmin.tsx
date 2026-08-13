import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Download,
  FileSpreadsheet,
  MailCheck,
  LogOut,
  Trash2,
} from "lucide-react";
import type {
  HousingLogArchiveResponse,
  HousingLogManualEmailResult,
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
  emailHousingLogShiftPackage,
  getHousingLogArchive,
  HousingLogAdminApiError,
  loginHousingLogAdmin,
  logoutHousingLogAdmin,
  removeHousingLogRecord,
} from "@/lib/housingLogAdminApi";
import {
  buildHousingLogArchiveTree,
  formatArchiveDate,
  formatLogDateForDisplay,
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
  const [sendingPackage, setSendingPackage] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [emailResult, setEmailResult] =
    useState<HousingLogManualEmailResult | null>(null);
  const [emailError, setEmailError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{
    id: string;
    logDate: string;
    shift: HousingShift;
    housingUnit: string;
    finalizedAt: string;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

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
        setRecipientCount(0);
        setEmailResult(null);
        setEmailError(null);
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
      setRecipientCount(0);
      setEmailResult(null);
      setEmailError(null);
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
        setRecipientCount(0);
        setEmailResult(null);
        setEmailError(null);
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
        setRecipientCount(0);
        setEmailResult(null);
        setEmailError(null);
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

  const confirmRemove = async () => {
    if (!removeConfirm) return;
    setRemoving(true);
    setRemoveError("");
    try {
      await removeHousingLogRecord(removeConfirm.id);
      setRemoveConfirm(null);
      await loadArchive();
    } catch (requestError) {
      if (
        requestError instanceof HousingLogAdminApiError &&
        requestError.status === 401
      ) {
        setAuthenticated(false);
        setArchive(null);
        setRemoveConfirm(null);
      } else {
        setRemoveError(
          requestError instanceof Error
            ? requestError.message
            : "The Housing Log could not be removed.",
        );
      }
    } finally {
      setRemoving(false);
    }
  };

  const emailPackage = async (logDate: string, shift: HousingShift) => {
    const key = `${logDate}-${shift}`;
    setSendingPackage(key);
    setEmailResult(null);
    setEmailError(null);
    try {
      setEmailResult(await emailHousingLogShiftPackage(logDate, shift));
    } catch (requestError) {
      if (
        requestError instanceof HousingLogAdminApiError &&
        requestError.status === 401
      ) {
        setAuthenticated(false);
        setArchive(null);
      }
      if (
        !(
          requestError instanceof HousingLogAdminApiError &&
          requestError.status === 401
        )
      )
        setEmailError({
          key,
          message:
            requestError instanceof Error
              ? requestError.message
              : "The shift package could not be emailed.",
        });
    } finally {
      setSendingPackage(null);
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
              setRecipientCount(0);
              setEmailResult(null);
              setEmailError(null);
            }}
            onSettingsChange={(settings) =>
              setRecipientCount(settings.deliveryRecipients.length)
            }
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
                                    {formatLogDateForDisplay(date.logDate)}
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
                                      <div className="mx-3 mb-3 flex flex-col gap-3 rounded-md border border-blue-400/25 bg-blue-950/25 p-3 lg:flex-row lg:items-center lg:justify-between">
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
                                            {shift.packageState === "complete"
                                              ? "COMPLETE"
                                              : "INCOMPLETE"}
                                          </div>
                                          <div className="mt-0.5 text-[9px] uppercase tracking-[0.08em] text-blue-200/50">
                                            {
                                              packageStateLabel[
                                                shift.packageState
                                              ]
                                            }
                                          </div>
                                          <div className="mt-1 text-[10px] text-blue-200/60">
                                            {formatLogDateForDisplay(date.logDate)} ·{" "}
                                            {shiftLabel[shift.shift]} ·{" "}
                                            {recipientCount} active recipient
                                            {recipientCount === 1 ? "" : "s"}
                                          </div>
                                          {shift.packageState !==
                                            "complete" && (
                                            <div className="mt-2 text-[10px] font-semibold text-amber-200">
                                              This package is incomplete. It can
                                              still be emailed.
                                            </div>
                                          )}
                                          {emailResult?.logDate ===
                                            date.logDate &&
                                            emailResult.shift ===
                                              shift.shift && (
                                              <div className="mt-2 text-[10px] font-semibold text-emerald-200">
                                                Sent successfully to{" "}
                                                {emailResult.recipientCount}{" "}
                                                recipient
                                                {emailResult.recipientCount ===
                                                1
                                                  ? ""
                                                  : "s"}
                                                . Package status:{" "}
                                                {emailResult.packageStatus}.
                                              </div>
                                            )}
                                          {emailError?.key ===
                                            `${date.logDate}-${shift.shift}` && (
                                            <div className="mt-2 text-[10px] font-semibold text-red-200">
                                              {emailError.message} Use Email
                                              Shift Package to retry.
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row">
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
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void emailPackage(
                                                date.logDate,
                                                shift.shift,
                                              )
                                            }
                                            disabled={
                                              sendingPackage ===
                                              `${date.logDate}-${shift.shift}`
                                            }
                                            className="inline-flex items-center justify-center gap-2 rounded border border-emerald-300/50 bg-emerald-800/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-50 hover:bg-emerald-700/45 disabled:opacity-50"
                                          >
                                            <MailCheck className="h-3.5 w-3.5" />
                                            {sendingPackage ===
                                            `${date.logDate}-${shift.shift}`
                                              ? "Emailing Package…"
                                              : "Email Shift Package"}
                                          </button>
                                        </div>
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
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setRemoveConfirm({
                                                        id: record.id,
                                                        logDate: date.logDate,
                                                        shift: shift.shift,
                                                        housingUnit:
                                                          slot.housingUnit,
                                                        finalizedAt:
                                                          record.finalizedAt,
                                                      })
                                                    }
                                                    className="mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded border border-red-400/35 bg-red-950/20 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-red-300/80 hover:border-red-300/60 hover:bg-red-900/30 hover:text-red-100"
                                                  >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                    Remove Duplicate / Bad Log
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

      {removeConfirm && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="housing-log-remove-title"
        >
          <div className="w-full max-w-md rounded-xl border border-red-400/40 bg-[#0a1330] p-5">
            <h2
              id="housing-log-remove-title"
              className="text-sm font-black uppercase tracking-[0.1em] text-red-200"
            >
              Remove this finalized Housing Log?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-blue-200/75">
              This removes the record from the archive, missing/duplicate
              calculations, shift packages, and manual email — it does not
              delete it. The original stays available if it's ever needed
              for audit.
            </p>
            <div className="mt-3 rounded-md border border-blue-400/25 bg-blue-950/30 p-3 text-xs text-blue-100">
              <div>{removeConfirm.housingUnit}</div>
              <div>
                {formatLogDateForDisplay(removeConfirm.logDate)} ·{" "}
                {shiftLabel[removeConfirm.shift]}
              </div>
              <div className="mt-1 text-blue-200/65">
                Finalized {new Date(removeConfirm.finalizedAt).toLocaleString()}
              </div>
            </div>
            {removeError && (
              <p className="mt-3 text-[11px] text-red-300" role="alert">
                {removeError}
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => void confirmRemove()}
                disabled={removing}
                className="inline-flex items-center justify-center rounded-md border border-red-400/60 bg-red-600/25 px-4 py-2 text-xs font-black uppercase tracking-[0.06em] text-red-100 hover:bg-red-500/35 disabled:opacity-50"
              >
                {removing ? "Removing…" : "Remove This Log"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRemoveConfirm(null);
                  setRemoveError("");
                }}
                disabled={removing}
                className="inline-flex items-center justify-center rounded-md border border-blue-300/50 bg-blue-500/15 px-4 py-2 text-xs font-bold text-blue-100 disabled:opacity-50"
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
