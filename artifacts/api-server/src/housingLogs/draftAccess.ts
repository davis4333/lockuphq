import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { cookieValue } from "./adminAuth";

/**
 * Lightweight prototype-scale draft access-code protection.
 *
 * IMPORTANT: this is NOT officer identity/authentication. It is a shared
 * secret that any staff member legitimately working the same housing unit
 * can be given, so several officers can resume the same in-progress shift
 * log. It does not identify who made a given entry. A production
 * institutional rollout should replace this with individual officer
 * accounts; this mechanism only prevents a draft from being openly
 * readable/editable by anyone who can see or guess its UUID.
 */

export const HOUSING_LOG_DRAFT_SESSION_COOKIE = "lockuphq_housing_draft_session";
export const DRAFT_SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // one shift

// Crockford-style alphabet with 0/O/1/I/L removed so a misread character
// never silently produces a *different valid* code — it just fails to match.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_GROUP_LENGTH = 4;
const CODE_GROUP_COUNT = 2;

/** log(32^8) ≈ 40 bits of entropy — appropriate for a shift-length shared secret. */
export function generateDraftAccessCode(): string {
  const groups = Array.from({ length: CODE_GROUP_COUNT }, () =>
    Array.from(
      { length: CODE_GROUP_LENGTH },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join(""),
  );
  return groups.join("-");
}

/** Uppercases and strips everything but the alphabet (dashes, spaces, etc). */
export function normalizeDraftAccessCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashDraftAccessCode(normalizedCode: string): string {
  return createHash("sha256").update(normalizedCode).digest("hex");
}

/**
 * In-memory session store mapping a random bearer token to the set of draft
 * IDs it has unlocked. A process restart clears all sessions, requiring the
 * access code again — acceptable for this prototype.
 */
export class DraftAccessSessions {
  private readonly sessions = new Map<
    string,
    { draftIds: Set<string>; expiresAt: number }
  >();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly durationMilliseconds = DRAFT_SESSION_DURATION_MS,
  ) {}

  private sessionKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [key, session] of this.sessions)
      if (session.expiresAt <= now) this.sessions.delete(key);
  }

  /**
   * Authorizes draftId for this browser: extends the existing session token
   * if it is still valid, otherwise issues a brand-new one. Returns the
   * token to set as the cookie value.
   */
  authorize(existingToken: string | undefined, draftId: string): string {
    this.removeExpired();
    if (existingToken) {
      const session = this.sessions.get(this.sessionKey(existingToken));
      if (session && session.expiresAt > this.now()) {
        session.draftIds.add(draftId);
        return existingToken;
      }
    }
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(this.sessionKey(token), {
      draftIds: new Set([draftId]),
      expiresAt: this.now() + this.durationMilliseconds,
    });
    return token;
  }

  isAuthorized(token: string | undefined, draftId: string): boolean {
    if (!token) return false;
    const session = this.sessions.get(this.sessionKey(token));
    if (!session || session.expiresAt <= this.now()) return false;
    return session.draftIds.has(draftId);
  }

  /** Draft IDs unlocked in this browser/session — powers "Recent Drafts". */
  authorizedDraftIds(token: string | undefined): string[] {
    if (!token) return [];
    const session = this.sessions.get(this.sessionKey(token));
    if (!session || session.expiresAt <= this.now()) return [];
    return [...session.draftIds];
  }
}

/**
 * Simple prototype-scale backoff for repeated wrong access-code attempts,
 * keyed by client IP (the draft being targeted isn't known until a code
 * actually matches, so per-draft limiting isn't meaningful here).
 */
export class DraftUnlockRateLimiter {
  private readonly attempts = new Map<
    string,
    { failures: number; lockedUntil: number; lastAttempt: number }
  >();

  private readonly freeAttempts = 5;
  private readonly baseLockoutMs = 5_000;
  private readonly maxLockoutMs = 5 * 60 * 1000;
  private readonly resetAfterMs = 30 * 60 * 1000;

  constructor(private readonly now: () => number = Date.now) {}

  private prune(key: string): void {
    const entry = this.attempts.get(key);
    if (entry && this.now() - entry.lastAttempt > this.resetAfterMs)
      this.attempts.delete(key);
  }

  lockedForMilliseconds(key: string): number {
    this.prune(key);
    const entry = this.attempts.get(key);
    if (!entry) return 0;
    return Math.max(0, entry.lockedUntil - this.now());
  }

  registerFailure(key: string): void {
    this.prune(key);
    const entry = this.attempts.get(key) ?? {
      failures: 0,
      lockedUntil: 0,
      lastAttempt: 0,
    };
    entry.failures += 1;
    entry.lastAttempt = this.now();
    if (entry.failures > this.freeAttempts) {
      const backoffSteps = entry.failures - this.freeAttempts;
      entry.lockedUntil =
        this.now() +
        Math.min(this.baseLockoutMs * 2 ** (backoffSteps - 1), this.maxLockoutMs);
    }
    this.attempts.set(key, entry);
  }

  registerSuccess(key: string): void {
    this.attempts.delete(key);
  }
}

export function rateLimitKeyForRequest(request: Request): string {
  return request.ip ?? "unknown";
}

export function draftSessionCookieValue(request: Request): string | undefined {
  return cookieValue(request, HOUSING_LOG_DRAFT_SESSION_COOKIE);
}

export function setDraftSessionCookie(
  response: Response,
  token: string,
  secure: boolean,
): void {
  response.cookie(HOUSING_LOG_DRAFT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api/housing-logs",
    maxAge: DRAFT_SESSION_DURATION_MS,
  });
}

/**
 * Rejects any request for a draft this browser session has not unlocked. A
 * draft UUID alone is never sufficient — the route param is checked against
 * the session's authorized draft-ID set, not merely "a session cookie
 * exists". 404 for a genuinely unknown ID, 403 for one that exists but is
 * not authorized in this session.
 */
export function requireDraftAccess(sessions: DraftAccessSessions): RequestHandler {
  return (request, response, next) => {
    const id = String(request.params["id"]);
    if (!sessions.isAuthorized(draftSessionCookieValue(request), id)) {
      response.status(403).json({
        error: "Enter this draft's access code to continue.",
      });
      return;
    }
    next();
  };
}
