import type { HousingLogArchiveResponse } from "@workspace/housing-log";

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

export async function downloadHousingLogExcel(id: string): Promise<void> {
  const response = await fetch(
    `/api/admin/housing-logs/${encodeURIComponent(id)}/excel`,
    { credentials: "same-origin" },
  );
  if (!response.ok) await errorFromResponse(response);
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const fileName = encodedName
    ? decodeURIComponent(encodedName)
    : "Housing-Log.xlsx";
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
