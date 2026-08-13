import type {
  HousingLogDraftInput,
  HousingLogFinalizeConfirmation,
  HousingLogFinalizeInput,
  ValidationIssue,
} from "@workspace/housing-log";

export class HousingLogApiError extends Error {
  constructor(
    message: string,
    public readonly issues: ValidationIssue[] = [],
    public readonly status: number = 0,
  ) {
    super(message);
  }
}

async function readJsonError(response: Response): Promise<never> {
  let message = "Housing Log request failed.";
  let issues: ValidationIssue[] = [];
  try {
    const body = (await response.json()) as {
      error?: string;
      issues?: ValidationIssue[];
    };
    if (body.error) message = body.error;
    if (body.issues) issues = body.issues;
  } catch {
    // Keep the controlled fallback for a non-JSON proxy response.
  }
  throw new HousingLogApiError(message, issues, response.status);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const rawBody = await response.text();
  let body: { error?: string; issues?: ValidationIssue[] } | T | undefined;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as
        | { error?: string; issues?: ValidationIssue[] }
        | T;
    } catch {
      body = undefined;
    }
  }
  if (!response.ok) {
    const errorBody = (body ?? {}) as {
      error?: string;
      issues?: ValidationIssue[];
    };
    throw new HousingLogApiError(
      errorBody.error ?? "Housing Log request failed.",
      errorBody.issues ?? [],
      response.status,
    );
  }
  if (body === undefined)
    throw new HousingLogApiError(
      "Housing Log server returned an unreadable response.",
    );
  return body as T;
}

/**
 * The only officer-facing server call: submits the complete local working
 * Housing Log for canonical validation and atomic persistence. `submissionId`
 * is a stable id generated once per local working record (see
 * `housingLogLocalStore.ts`) so a retried call after a network failure or
 * timeout can never create a duplicate finalized record. Nothing is sent
 * anywhere else — there is no server draft to create, save, list, or resume.
 */
export function finalizeHousingLog(
  input: HousingLogFinalizeInput,
): Promise<HousingLogFinalizeConfirmation> {
  return request("/api/housing-logs/finalize", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type HousingLogPreviewXlsxResult = {
  blob: Blob;
  fileName: string;
};

/**
 * Stateless: validates the CURRENT local working payload with the same
 * canonical validation used by finalize and, if it passes, returns the
 * official .xlsx rendering of exactly that payload. Nothing is persisted,
 * no record is created or looked up by id, and finalization is untouched —
 * this can be called any number of times while reviewing (Preview Official
 * Log, Download Current Log) without side effects. On validation failure it
 * throws `HousingLogApiError` with the same `issues` shape finalize uses, so
 * the existing validation-issue summary can render it without a second
 * issue format to support.
 */
export async function previewHousingLogXlsx(
  input: HousingLogDraftInput,
): Promise<HousingLogPreviewXlsxResult> {
  const response = await fetch("/api/housing-logs/preview/xlsx", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) await readJsonError(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : "Housing-Log.xlsx";
  return { blob: await response.blob(), fileName };
}

/** Trigger a browser save of an already-fetched file — no network call. */
export function saveHousingLogBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
