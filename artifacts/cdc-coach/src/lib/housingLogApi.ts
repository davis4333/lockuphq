import type { HousingLogDraftInput, StoredHousingLog, ValidationIssue } from "@workspace/housing-log";

export class HousingLogApiError extends Error {
  constructor(message: string, public readonly issues: ValidationIssue[] = []) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json() as { error?: string; issues?: ValidationIssue[] } | T;
  if (!response.ok) {
    const errorBody = body as { error?: string; issues?: ValidationIssue[] };
    throw new HousingLogApiError(errorBody.error ?? "Housing Log request failed.", errorBody.issues ?? []);
  }
  return body as T;
}

export function createHousingLogDraft(input: HousingLogDraftInput): Promise<StoredHousingLog> {
  return request("/api/housing-logs", { method: "POST", body: JSON.stringify(input) });
}

export function updateHousingLogDraft(id: string, input: HousingLogDraftInput): Promise<StoredHousingLog> {
  return request(`/api/housing-logs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function finalizeHousingLog(id: string): Promise<StoredHousingLog> {
  return request(`/api/housing-logs/${encodeURIComponent(id)}/finalize`, { method: "POST", body: "{}" });
}
