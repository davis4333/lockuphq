import type {
  HousingLogDraftCreated,
  HousingLogDraftInput,
  HousingLogSummary,
  StoredHousingLog,
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
 * The server response includes `accessCode` in plaintext exactly once, at
 * creation time. The caller must display it to the officer — it is never
 * returned again by any other endpoint.
 */
export function createHousingLogDraft(
  input: HousingLogDraftInput,
): Promise<HousingLogDraftCreated> {
  return request("/api/housing-logs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateHousingLogDraft(
  id: string,
  input: HousingLogDraftInput,
): Promise<StoredHousingLog> {
  return request(`/api/housing-logs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function finalizeHousingLog(id: string): Promise<StoredHousingLog> {
  return request(`/api/housing-logs/${encodeURIComponent(id)}/finalize`, {
    method: "POST",
    body: "{}",
  });
}

export function getHousingLog(id: string): Promise<StoredHousingLog> {
  return request(`/api/housing-logs/${encodeURIComponent(id)}`);
}

/**
 * Session-scoped: the server only ever returns drafts this browser has
 * already unlocked (by creating or entering the access code for). This is
 * intentionally not a directory of every draft in the system.
 */
export function listHousingLogDrafts(): Promise<HousingLogSummary[]> {
  return request("/api/housing-logs?status=draft");
}

/** Unlocks a draft by its officer-entered access code for this browser session. */
export function unlockHousingLogDraft(code: string): Promise<{ draftId: string }> {
  return request("/api/housing-logs/unlock", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}
