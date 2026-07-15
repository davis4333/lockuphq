// LOCKUPHQ DR Writer — authentication, roles, and sessions (blueprint §18
// Phase 7; §12 security requirements; Stage 1 secure workspace).
//
// - Passwords are stored as scrypt hashes with per-user salts; comparison is
//   constant-time. Plaintext passwords are never persisted or logged.
// - Sessions have both an idle timeout (screen-lock style inactivity) and an
//   absolute expiry. Expired, locked, or revoked sessions fail closed.
// - Sessions deliberately do NOT survive a process restart (fail closed):
//   crash recovery restores report state, not authentication state. Users do
//   persist (see store.ts).
// - Synthetic users only — no real credentials or personnel data.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type Role = 'officer' | 'supervisor' | 'system_admin' | 'audit_reader';

export const ROLES: Role[] = ['officer', 'supervisor', 'system_admin', 'audit_reader'];

export type AuthErrorCode =
  | 'BAD_CREDENTIALS'
  | 'AUTH_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_LOCKED'
  | 'FORBIDDEN'
  | 'INPUT_REJECTED';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.name = 'AuthError';
  }
}

export interface UserRecord {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
  person_id: string | null; // link to the person registry, where applicable
  password_salt: string; // hex
  password_hash: string; // hex, scrypt
  active: boolean;
  created_at: string;
}

export interface SessionRecord {
  session_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  absolute_expires_at: string;
  last_activity_at: string;
  locked: boolean;
  revoked_at: string | null;
}

export interface AuthConfig {
  clock?: () => Date;
  idle_timeout_minutes?: number; // default 30
  absolute_timeout_hours?: number; // default 12
}

const SCRYPT_KEYLEN = 32;

function hashPassword(password: string, saltHex: string): string {
  return scryptSync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN).toString('hex');
}

export class AuthService {
  private readonly users = new Map<string, UserRecord>(); // by user_id
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly clock: () => Date;
  readonly idleTimeoutMs: number;
  readonly absoluteTimeoutMs: number;
  private userCounter = 0;

  constructor(config: AuthConfig = {}) {
    this.clock = config.clock ?? (() => new Date());
    this.idleTimeoutMs = (config.idle_timeout_minutes ?? 30) * 60_000;
    this.absoluteTimeoutMs = (config.absolute_timeout_hours ?? 12) * 3_600_000;
  }

  private now(): Date {
    return this.clock();
  }

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------

  createUser(args: { username: string; password: string; role: Role; display_name: string; person_id?: string }): UserRecord {
    if (!args.username || !args.password || args.password.length < 8) {
      throw new AuthError('INPUT_REJECTED', 'Username and a password of at least 8 characters are required');
    }
    if (!ROLES.includes(args.role)) {
      throw new AuthError('INPUT_REJECTED', `Unknown role: ${String(args.role)}`);
    }
    if (this.findByUsername(args.username)) {
      throw new AuthError('INPUT_REJECTED', `Username already exists: ${args.username}`);
    }
    this.userCounter += 1;
    const salt = randomBytes(16).toString('hex');
    const user: UserRecord = {
      user_id: `usr-${this.userCounter}`,
      username: args.username,
      display_name: args.display_name,
      role: args.role,
      person_id: args.person_id ?? null,
      password_salt: salt,
      password_hash: hashPassword(args.password, salt),
      active: true,
      created_at: this.now().toISOString(),
    };
    this.users.set(user.user_id, user);
    return { ...user };
  }

  deactivateUser(userId: string): void {
    const user = this.users.get(userId);
    if (!user) throw new AuthError('INPUT_REJECTED', `Unknown user: ${userId}`);
    user.active = false;
    // Fail closed: every session of a deactivated user is revoked immediately.
    for (const session of this.sessions.values()) {
      if (session.user_id === userId && session.revoked_at === null) {
        session.revoked_at = this.now().toISOString();
      }
    }
  }

  getUser(userId: string): UserRecord | null {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  private findByUsername(username: string): UserRecord | null {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return null;
  }

  private verifyPassword(user: UserRecord, password: string): boolean {
    const candidate = Buffer.from(hashPassword(password, user.password_salt), 'hex');
    const stored = Buffer.from(user.password_hash, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  login(username: string, password: string): SessionRecord {
    const user = this.findByUsername(username);
    // Same error for unknown user and wrong password — no username probing.
    if (!user || !user.active || !this.verifyPassword(user, password)) {
      throw new AuthError('BAD_CREDENTIALS', 'Invalid username or password');
    }
    const now = this.now();
    const session: SessionRecord = {
      session_id: `sess-${randomBytes(24).toString('hex')}`,
      user_id: user.user_id,
      role: user.role,
      created_at: now.toISOString(),
      absolute_expires_at: new Date(now.getTime() + this.absoluteTimeoutMs).toISOString(),
      last_activity_at: now.toISOString(),
      locked: false,
      revoked_at: null,
    };
    this.sessions.set(session.session_id, session);
    return { ...session };
  }

  // Validates the session and returns the user. Touches last_activity_at on
  // success. Throws (fail closed) on unknown/revoked/expired/idle/locked.
  requireSession(sessionId: string | null | undefined): { user: UserRecord; session: SessionRecord } {
    if (!sessionId) throw new AuthError('AUTH_REQUIRED', 'Sign in to continue');
    const session = this.sessions.get(sessionId);
    if (!session || session.revoked_at !== null) {
      throw new AuthError('AUTH_REQUIRED', 'Session is not valid. Sign in again.');
    }
    const now = this.now();
    if (now.toISOString() > session.absolute_expires_at) {
      session.revoked_at = now.toISOString();
      throw new AuthError('SESSION_EXPIRED', 'Your session has ended. Sign in again.');
    }
    if (now.getTime() - Date.parse(session.last_activity_at) > this.idleTimeoutMs) {
      // Idle timeout behaves as an automatic screen lock (§12).
      session.locked = true;
    }
    if (session.locked) {
      throw new AuthError('SESSION_LOCKED', 'Screen is locked. Enter your password to unlock.');
    }
    const user = this.users.get(session.user_id);
    if (!user || !user.active) {
      session.revoked_at = now.toISOString();
      throw new AuthError('AUTH_REQUIRED', 'Session is not valid. Sign in again.');
    }
    session.last_activity_at = now.toISOString();
    return { user: { ...user }, session: { ...session } };
  }

  lockSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.revoked_at !== null) {
      throw new AuthError('AUTH_REQUIRED', 'Session is not valid. Sign in again.');
    }
    session.locked = true;
  }

  unlockSession(sessionId: string, password: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.revoked_at !== null) {
      throw new AuthError('AUTH_REQUIRED', 'Session is not valid. Sign in again.');
    }
    const now = this.now();
    if (now.toISOString() > session.absolute_expires_at) {
      session.revoked_at = now.toISOString();
      throw new AuthError('SESSION_EXPIRED', 'Your session has ended. Sign in again.');
    }
    const user = this.users.get(session.user_id);
    if (!user || !user.active || !this.verifyPassword(user, password)) {
      throw new AuthError('BAD_CREDENTIALS', 'Invalid password');
    }
    session.locked = false;
    session.last_activity_at = now.toISOString();
  }

  logout(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.revoked_at === null) {
      session.revoked_at = this.now().toISOString();
    }
  }

  getSession(sessionId: string): SessionRecord | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  // Non-mutating liveness check (used for session-lock claims): valid, not
  // revoked, not absolutely expired, not idle-expired, not locked.
  isSessionUsable(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.revoked_at !== null || session.locked) return false;
    const now = this.now();
    if (now.toISOString() > session.absolute_expires_at) return false;
    if (now.getTime() - Date.parse(session.last_activity_at) > this.idleTimeoutMs) return false;
    return true;
  }

  // ------------------------------------------------------------------
  // Persistence (users only — sessions never survive a restart)
  // ------------------------------------------------------------------

  serializeUsers(): { users: UserRecord[]; userCounter: number } {
    return { users: [...this.users.values()].map((u) => ({ ...u })), userCounter: this.userCounter };
  }

  restoreUsers(state: { users: UserRecord[]; userCounter: number }): void {
    this.users.clear();
    for (const user of state.users) this.users.set(user.user_id, { ...user });
    this.userCounter = state.userCounter;
  }
}
