import type {
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
