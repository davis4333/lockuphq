import type {
  HousingLogArchiveResponse,
  HousingLogDeliverySettings,
  HousingLogManualEmailResult,
  HousingShift,
} from "@workspace/housing-log";

export class HousingLogAdminApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function errorFromResponse(response: Response): Promise<never> {
  let message = "Housing Log admin request failed.";
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    // Keep the controlled fallback for a non-JSON proxy response.
  }
  throw new HousingLogAdminApiError(message, response.status);
}

export async function loginHousingLogAdmin(password: string): Promise<void> {
  const response = await fetch("/api/admin/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) await errorFromResponse(response);
}

export async function logoutHousingLogAdmin(): Promise<void> {
  const response = await fetch("/api/admin/session", {
    method: "DELETE",
    credentials: "same-origin",
  });
  if (!response.ok) await errorFromResponse(response);
}

export async function getHousingLogArchive(): Promise<HousingLogArchiveResponse> {
  const response = await fetch("/api/admin/housing-logs/archive", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) await errorFromResponse(response);
  return response.json() as Promise<HousingLogArchiveResponse>;
}

async function downloadResponse(
  endpoint: string,
  fallbackName: string,
): Promise<void> {
  const response = await fetch(endpoint, { credentials: "same-origin" });
  if (!response.ok) await errorFromResponse(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fileName = encodedName ? decodeURIComponent(encodedName) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
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

export async function downloadHousingLogExcel(id: string): Promise<void> {
  return downloadResponse(
    `/api/admin/housing-logs/${encodeURIComponent(id)}/excel`,
    "Housing-Log.xlsx",
  );
}

/**
 * Admin-only soft delete for an accidentally finalized duplicate — see
 * `removeFinalizedLog` in the api-server repository. The record itself is
 * never destroyed; this only removes it from the archive listing and
 * everything derived from it.
 */
export async function removeHousingLogRecord(id: string): Promise<void> {
  const response = await fetch(
    `/api/admin/housing-logs/${encodeURIComponent(id)}/remove`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    },
  );
  if (!response.ok) await errorFromResponse(response);
}

export async function downloadHousingLogShiftPackage(
  logDate: string,
  shift: HousingShift,
): Promise<void> {
  return downloadResponse(
    `/api/admin/housing-logs/shift-package/${encodeURIComponent(logDate)}/${encodeURIComponent(shift)}`,
    `Housing-Logs_${logDate}_Shift-${shift}.zip`,
  );
}

export async function emailHousingLogShiftPackage(
  logDate: string,
  shift: HousingShift,
): Promise<HousingLogManualEmailResult> {
  const response = await fetch(
    `/api/admin/housing-logs/shift-package/${encodeURIComponent(logDate)}/${encodeURIComponent(shift)}/send`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    },
  );
  if (!response.ok) await errorFromResponse(response);
  return response.json() as Promise<HousingLogManualEmailResult>;
}

async function deliverySettingsRequest(
  endpoint: string,
  init?: RequestInit,
): Promise<HousingLogDeliverySettings> {
  const response = await fetch(endpoint, {
    credentials: "same-origin",
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) await errorFromResponse(response);
  return response.json() as Promise<HousingLogDeliverySettings>;
}

const deliverySettingsBase = "/api/admin/housing-logs/delivery-settings";

export function getHousingLogDeliverySettings(): Promise<HousingLogDeliverySettings> {
  return deliverySettingsRequest(deliverySettingsBase);
}

export function setHousingLogPrimaryRecipient(
  email: string,
): Promise<HousingLogDeliverySettings> {
  return deliverySettingsRequest(`${deliverySettingsBase}/primary`, {
    method: "PUT",
    body: JSON.stringify({ email }),
  });
}

export function addHousingLogAdditionalRecipient(
  email: string,
): Promise<HousingLogDeliverySettings> {
  return deliverySettingsRequest(`${deliverySettingsBase}/additional`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function updateHousingLogAdditionalRecipient(
  id: string,
  patch: { email?: string; active?: boolean },
): Promise<HousingLogDeliverySettings> {
  return deliverySettingsRequest(
    `${deliverySettingsBase}/additional/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function removeHousingLogAdditionalRecipient(
  id: string,
): Promise<HousingLogDeliverySettings> {
  return deliverySettingsRequest(
    `${deliverySettingsBase}/additional/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
