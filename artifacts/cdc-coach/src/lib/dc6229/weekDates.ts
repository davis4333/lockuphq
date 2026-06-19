import { DAY_NAMES, type Dc6229DateFormat } from "./types";

export interface WeekDay {
  dayName: string;
  iso: string;
  formatted: string;
}

/**
 * Parse a "yyyy-mm-dd" string as a LOCAL calendar date. Using `new Date(iso)`
 * would parse as UTC midnight and can shift the day depending on timezone, so we
 * build the date from explicit components instead.
 */
export function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

export function toIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function isSunday(iso: string): boolean {
  const d = parseLocalDate(iso);
  return !!d && d.getDay() === 0;
}

/** The Sunday on or before the given date (returns the same date if already Sunday). */
export function previousSunday(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() - d.getDay());
  return toIso(d);
}

/** The Sunday on or after the given date (returns the same date if already Sunday). */
export function nextSunday(iso: string): string {
  const d = parseLocalDate(iso);
  if (!d) return iso;
  const fwd = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + fwd);
  return toIso(d);
}

export function formatDate(d: Date, fmt: Dc6229DateFormat): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  const base = `${mm}/${dd}/${yy}`;
  return fmt === "dayPrefixed" ? `${DAY_NAMES[d.getDay()]} ${base}` : base;
}

/** Build 7 consecutive days (Sun..Sat) starting at the given Sunday. */
export function buildWeekDays(weekStartIso: string, fmt: Dc6229DateFormat): WeekDay[] {
  const start = parseLocalDate(weekStartIso);
  if (!start) return [];
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ dayName: DAY_NAMES[i], iso: toIso(d), formatted: formatDate(d, fmt) });
  }
  return out;
}
