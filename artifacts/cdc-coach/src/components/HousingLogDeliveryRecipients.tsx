import { FormEvent, useEffect, useState } from "react";
import { Mail, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { HousingLogDeliverySettings } from "@workspace/housing-log";
import { hudInput, hudLabel, hudPanel } from "@/components/PageShell";
import {
  addHousingLogAdditionalRecipient,
  getHousingLogDeliverySettings,
  HousingLogAdminApiError,
  removeHousingLogAdditionalRecipient,
  setHousingLogPrimaryRecipient,
  updateHousingLogAdditionalRecipient,
} from "@/lib/housingLogAdminApi";

type DeliveryRecipientsProps = {
  onUnauthorized: () => void;
  onSettingsChange?: (settings: HousingLogDeliverySettings) => void;
};

export default function HousingLogDeliveryRecipients({
  onUnauthorized,
  onSettingsChange,
}: DeliveryRecipientsProps) {
  const [settings, setSettings] = useState<HousingLogDeliverySettings | null>(
    null,
  );
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [additionalEmail, setAdditionalEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");

  const handleError = (requestError: unknown, fallback: string) => {
    if (
      requestError instanceof HousingLogAdminApiError &&
      requestError.status === 401
    ) {
      onUnauthorized();
      return;
    }
    setError(requestError instanceof Error ? requestError.message : fallback);
  };

  const applySettings = (result: HousingLogDeliverySettings) => {
    setSettings(result);
    onSettingsChange?.(result);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getHousingLogDeliverySettings();
      applySettings(result);
      setPrimaryEmail(result.primaryEmail ?? "");
    } catch (requestError) {
      handleError(requestError, "Delivery recipients could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const savePrimary = async (event: FormEvent) => {
    event.preventDefault();
    setSaving("primary");
    setError("");
    try {
      const result = await setHousingLogPrimaryRecipient(primaryEmail);
      applySettings(result);
      setPrimaryEmail(result.primaryEmail ?? "");
    } catch (requestError) {
      handleError(requestError, "The primary recipient could not be saved.");
    } finally {
      setSaving("");
    }
  };

  const addRecipient = async (event: FormEvent) => {
    event.preventDefault();
    setSaving("add");
    setError("");
    try {
      const result = await addHousingLogAdditionalRecipient(additionalEmail);
      applySettings(result);
      setAdditionalEmail("");
    } catch (requestError) {
      handleError(requestError, "The additional recipient could not be added.");
    } finally {
      setSaving("");
    }
  };

  const toggleRecipient = async (id: string, active: boolean) => {
    setSaving(id);
    setError("");
    try {
      applySettings(await updateHousingLogAdditionalRecipient(id, { active }));
    } catch (requestError) {
      handleError(requestError, "The recipient status could not be changed.");
    } finally {
      setSaving("");
    }
  };

  const removeRecipient = async (id: string) => {
    setSaving(id);
    setError("");
    try {
      applySettings(await removeHousingLogAdditionalRecipient(id));
    } catch (requestError) {
      handleError(requestError, "The recipient could not be removed.");
    } finally {
      setSaving("");
    }
  };

  return (
    <section className={`${hudPanel} mb-5 p-4 sm:p-5`}>
      <div className="flex flex-col gap-3 border-b border-blue-400/25 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-white">
            <Mail className="h-4 w-4 text-blue-300" /> Delivery Recipients
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-blue-200/60">
            The primary recipient and every active additional recipient will
            receive the same Housing Log shift package when an administrator
            emails it. Inactive recipients receive nothing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-blue-400/40 bg-blue-950/50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100 hover:border-blue-300/70 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Retry Recipients
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-red-400/45 bg-red-950/35 p-3 text-xs text-red-100">
          {error}
        </div>
      )}

      {loading && !settings ? (
        <div className="py-6 text-center text-xs text-blue-200/65">
          Loading delivery recipients…
        </div>
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <form
            onSubmit={savePrimary}
            className="rounded-lg border border-blue-400/25 bg-blue-950/20 p-4"
          >
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
              Primary Recipient
            </h3>
            <p className="mt-1 text-[10px] text-blue-200/55">
              Required before additional recipients can be configured. The
              primary recipient is always active.
            </p>
            <label className={`${hudLabel} mt-4`} htmlFor="primary-recipient">
              Email address
            </label>
            <input
              id="primary-recipient"
              type="email"
              value={primaryEmail}
              onChange={(event) => setPrimaryEmail(event.target.value)}
              className={hudInput}
              placeholder="sergeant@example.com"
              autoComplete="email"
              required
            />
            <button
              type="submit"
              disabled={saving === "primary" || !primaryEmail.trim()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded border border-blue-300/50 bg-blue-700/30 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-blue-50 hover:bg-blue-600/45 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {settings?.primaryEmail ? "Update Primary" : "Set Primary"}
            </button>
          </form>

          <div className="rounded-lg border border-blue-400/25 bg-blue-950/20 p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.12em] text-blue-100">
              Additional Recipients
            </h3>
            <p className="mt-1 text-[10px] text-blue-200/55">
              Every active recipient receives the package. “Additional” does not
              mean failover-only.
            </p>
            <form
              onSubmit={addRecipient}
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="email"
                aria-label="Additional recipient email"
                value={additionalEmail}
                onChange={(event) => setAdditionalEmail(event.target.value)}
                className={hudInput}
                placeholder="backup@example.com"
                required
              />
              <button
                type="submit"
                disabled={
                  saving === "add" ||
                  !additionalEmail.trim() ||
                  !settings?.primaryEmail
                }
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded border border-emerald-400/45 bg-emerald-900/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-100 hover:bg-emerald-800/35 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add Recipient
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {settings?.additionalRecipients.length ? (
                settings.additionalRecipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="flex flex-col gap-3 rounded-md border border-slate-500/30 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-100">
                        {recipient.email}
                      </div>
                      <div
                        className={`mt-1 text-[9px] font-black uppercase tracking-[0.12em] ${recipient.active ? "text-emerald-300" : "text-slate-400"}`}
                      >
                        {recipient.active ? "Active" : "Inactive"}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void toggleRecipient(recipient.id, !recipient.active)
                        }
                        disabled={saving === recipient.id}
                        className="rounded border border-blue-400/40 bg-blue-950/45 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-blue-100 hover:border-blue-300/70 disabled:opacity-50"
                      >
                        {recipient.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${recipient.email}`}
                        onClick={() => void removeRecipient(recipient.id)}
                        disabled={saving === recipient.id}
                        className="inline-flex items-center gap-1 rounded border border-red-400/40 bg-red-950/30 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.1em] text-red-100 hover:bg-red-900/45 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-blue-400/30 p-4 text-center text-[10px] text-blue-200/55">
                  No additional recipients configured.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
