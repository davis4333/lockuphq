import type {
  HousingLogEvent,
  HousingLogSignatures,
  HousingLogValue,
  HousingShift,
  HousingUnit,
} from "@workspace/housing-log";

/**
 * Officer-facing local-only working state.
 *
 * The officer keeps exactly one unfinished Housing Log at a time, stored
 * entirely in this browser/device via IndexedDB (never cookies — signatures
 * and dozens of field values comfortably exceed what cookies are meant to
 * carry). The server never sees this data until the officer finalizes; there
 * is no server-side draft, no draft id to browse or resume, nothing to log
 * in. See HousingLog.tsx for the autosave/restore wiring.
 */

export const HOUSING_LOG_LOCAL_SCHEMA_VERSION = 1;

const DB_NAME = "lockuphq-housing-log";
const DB_VERSION = 1;
const STORE_NAME = "working-log";
/** Single fixed key — there is only ever one local working record. */
const RECORD_KEY = "current";

export type HousingLogLocalComposerState = {
  time: string;
  activity: string;
  initials: string;
};

export type HousingLogLocalWorkingState = {
  schemaVersion: number;
  /** Client-generated idempotency key sent with the finalize request. */
  submissionId: string;
  housingUnit: HousingUnit | "";
  shift: HousingShift | "";
  logDate: string;
  templateVersion?: string;
  values: Record<string, HousingLogValue>;
  events: HousingLogEvent[];
  signatures: HousingLogSignatures;
  isDemoData: boolean;
  activeTask?: string;
  /** In-progress, not-yet-submitted event composer input — never auto-logged. */
  composer: HousingLogLocalComposerState;
  /** ISO timestamp of the last successful local save. */
  savedAt: string;
  /**
   * Set immediately after the server confirms a successful finalize, before
   * the local record is removed. If IndexedDB removal then fails and this
   * survives to a later page load, the officer must see "already finalized,
   * remove the local copy" — never an editable draft — even though the
   * server-side write already fully succeeded.
   */
  finalizedConfirmation?: { id: string; finalizedAt: string };
};

export function createSubmissionId(): string {
  return crypto.randomUUID();
}

export function emptyHousingLogLocalWorkingState(): HousingLogLocalWorkingState {
  return {
    schemaVersion: HOUSING_LOG_LOCAL_SCHEMA_VERSION,
    submissionId: createSubmissionId(),
    housingUnit: "",
    shift: "",
    logDate: "",
    values: {},
    events: [],
    signatures: {},
    isDemoData: false,
    composer: { time: "", activity: "", initials: "" },
    savedAt: new Date().toISOString(),
  };
}

export type HousingLogLocalLoadResult =
  | { ok: true; state: HousingLogLocalWorkingState | undefined }
  | { ok: false; reason: "unavailable" | "corrupted" | "incompatible_version" };

export type HousingLogLocalWriteResult =
  | { ok: true }
  | { ok: false; reason: "unavailable" | "quota_exceeded" | "write_failed" };

function indexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB open blocked."));
  });
}

export function isPlausibleWorkingState(
  value: unknown,
): value is HousingLogLocalWorkingState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["schemaVersion"] === "number" &&
    typeof candidate["submissionId"] === "string" &&
    typeof candidate["values"] === "object" &&
    Array.isArray(candidate["events"]) &&
    typeof candidate["signatures"] === "object" &&
    typeof candidate["composer"] === "object"
  );
}

export async function loadHousingLogLocalState(): Promise<HousingLogLocalLoadResult> {
  if (!indexedDbAvailable()) return { ok: false, reason: "unavailable" };
  try {
    const db = await openDatabase();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(RECORD_KEY);
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () =>
        reject(getRequest.error ?? new Error("IndexedDB read failed."));
    });
    db.close();
    if (raw === undefined) return { ok: true, state: undefined };
    if (!isPlausibleWorkingState(raw)) return { ok: false, reason: "corrupted" };
    if (raw.schemaVersion !== HOUSING_LOG_LOCAL_SCHEMA_VERSION)
      return { ok: false, reason: "incompatible_version" };
    return { ok: true, state: raw };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function saveHousingLogLocalState(
  state: HousingLogLocalWorkingState,
): Promise<HousingLogLocalWriteResult> {
  if (!indexedDbAvailable()) return { ok: false, reason: "unavailable" };
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(state, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed."));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB write aborted."));
    });
    db.close();
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError")
      return { ok: false, reason: "quota_exceeded" };
    return { ok: false, reason: "write_failed" };
  }
}

export async function clearHousingLogLocalState(): Promise<HousingLogLocalWriteResult> {
  if (!indexedDbAvailable()) return { ok: false, reason: "unavailable" };
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB clear failed."));
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB clear aborted."));
    });
    db.close();
    return { ok: true };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}
