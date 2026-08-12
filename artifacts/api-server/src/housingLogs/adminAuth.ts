import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

export const HOUSING_LOG_ADMIN_COOKIE = "lockuphq_housing_admin_session";
export const HOUSING_LOG_ADMIN_SESSION_MILLISECONDS = 8 * 60 * 60 * 1000;

const digest = (value: string) => createHash("sha256").update(value).digest();
const sessionKey = (token: string) => digest(token).toString("hex");

export function verifyAdminPassword(
  suppliedPassword: string,
  configuredPassword: string,
): boolean {
  if (!suppliedPassword || !configuredPassword) return false;
  return timingSafeEqual(digest(suppliedPassword), digest(configuredPassword));
}

export class HousingLogAdminSessions {
  private readonly expirations = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly durationMilliseconds = HOUSING_LOG_ADMIN_SESSION_MILLISECONDS,
  ) {}

  issue(): string {
    this.removeExpired();
    const token = randomBytes(32).toString("base64url");
    this.expirations.set(
      sessionKey(token),
      this.now() + this.durationMilliseconds,
    );
    return token;
  }

  accepts(token: string | undefined): boolean {
    if (!token) return false;
    const key = sessionKey(token);
    const expiresAt = this.expirations.get(key);
    if (!expiresAt || expiresAt <= this.now()) {
      this.expirations.delete(key);
      return false;
    }
    return true;
  }

  revoke(token: string | undefined): void {
    if (token) this.expirations.delete(sessionKey(token));
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [key, expiresAt] of this.expirations)
      if (expiresAt <= now) this.expirations.delete(key);
  }
}

export function cookieValue(
  request: Request,
  name: string,
): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const item of cookie.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function setAdminSessionCookie(
  response: Response,
  token: string,
  secure: boolean,
): void {
  response.cookie(HOUSING_LOG_ADMIN_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/admin",
    maxAge: HOUSING_LOG_ADMIN_SESSION_MILLISECONDS,
  });
}

export function clearAdminSessionCookie(
  response: Response,
  secure: boolean,
): void {
  response.clearCookie(HOUSING_LOG_ADMIN_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/admin",
  });
}

export function requireHousingLogAdminSession(
  sessions: HousingLogAdminSessions,
): RequestHandler {
  return (request, response, next) => {
    if (!sessions.accepts(cookieValue(request, HOUSING_LOG_ADMIN_COOKIE))) {
      response.status(401).json({ error: "Housing Log admin login required." });
      return;
    }
    next();
  };
}
