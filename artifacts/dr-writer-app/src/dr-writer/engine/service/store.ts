// LOCKUPHQ DR Writer — atomic persistence and append-only audit trail
// (blueprint §18 Phase 7; §9 atomic stage commits, crash recovery; Stage 23
// audit commit; §12 — audit access and retention stricter than app logs).
//
// Layout inside the store directory:
//   state.json  — full engine state, replaced atomically (tmp + fsync + rename)
//   audit.log   — append-only JSONL; every line carries a hash chained to the
//                 previous line, so any rewrite or deletion is detectable
//   users.json  — user accounts (scrypt hashes only), replaced atomically
//
// Crash model: a crash mid-write leaves either an orphan tmp file (ignored on
// load) or a torn final audit line (detected and healed from state.json, which
// also contains the full audit log). State is written BEFORE the audit file is
// appended, so audit.log never claims an event whose state was lost — recovery
// always resumes from the last completed commit, and the audit file is healed
// forward from state, never truncated.

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditEvent } from '../types.ts';
import { hashValue } from '../hash.ts';

export interface AuditLine {
  event: AuditEvent;
  chain_hash: string; // sha256 over (previous chain_hash, event)
}

export const AUDIT_CHAIN_GENESIS = 'audit-chain-genesis';

export function chainHash(previous: string, event: AuditEvent): string {
  return hashValue({ previous, event });
}

function writeFileAtomic(path: string, data: string): void {
  const tmp = `${path}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, data, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

function appendFileDurable(path: string, data: string): void {
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, data, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export class StoreIntegrityError extends Error {
  constructor(message: string) {
    super(`[STORE_INTEGRITY] ${message}`);
    this.name = 'StoreIntegrityError';
  }
}

export class FileStore {
  readonly dir: string;
  private readonly statePath: string;
  private readonly auditPath: string;
  private readonly usersPath: string;

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    this.statePath = join(dir, 'state.json');
    this.auditPath = join(dir, 'audit.log');
    this.usersPath = join(dir, 'users.json');
  }

  // ------------------------------------------------------------------
  // Engine state
  // ------------------------------------------------------------------

  saveState(state: unknown): void {
    writeFileAtomic(this.statePath, JSON.stringify(state));
  }

  loadState<T>(): T | null {
    if (!existsSync(this.statePath)) return null;
    const raw = readFileSync(this.statePath, 'utf8');
    try {
      return JSON.parse(raw) as T;
    } catch {
      // state.json is only ever written atomically; a parse failure means the
      // file was tampered with or the volume corrupted. Fail closed.
      throw new StoreIntegrityError('state.json is not valid JSON; refusing to boot from a corrupt state file');
    }
  }

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------

  saveUsers(users: unknown): void {
    writeFileAtomic(this.usersPath, JSON.stringify(users));
  }

  loadUsers<T>(): T | null {
    if (!existsSync(this.usersPath)) return null;
    const raw = readFileSync(this.usersPath, 'utf8');
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new StoreIntegrityError('users.json is not valid JSON; refusing to boot from a corrupt user file');
    }
  }

  // ------------------------------------------------------------------
  // Append-only audit trail
  // ------------------------------------------------------------------

  // Reads the audit file tolerating exactly one torn (crash-truncated) final
  // line. Verifies the hash chain: any rewritten, reordered, or deleted line
  // breaks the chain and boot fails closed.
  readAudit(): { lines: AuditLine[]; tornTail: boolean } {
    if (!existsSync(this.auditPath)) return { lines: [], tornTail: false };
    const raw = readFileSync(this.auditPath, 'utf8');
    const rawLines = raw.split('\n').filter((l) => l.length > 0);
    const lines: AuditLine[] = [];
    let tornTail = false;
    for (let i = 0; i < rawLines.length; i++) {
      let parsed: AuditLine;
      try {
        parsed = JSON.parse(rawLines[i]) as AuditLine;
      } catch {
        if (i === rawLines.length - 1) {
          tornTail = true; // crash mid-append; healed from state by the service
          break;
        }
        throw new StoreIntegrityError(`audit.log line ${i + 1} is not valid JSON (not the final line — not a torn write)`);
      }
      const previous = lines.length === 0 ? AUDIT_CHAIN_GENESIS : lines[lines.length - 1].chain_hash;
      if (parsed.chain_hash !== chainHash(previous, parsed.event)) {
        throw new StoreIntegrityError(`audit.log hash chain broken at line ${i + 1}; the audit trail has been altered`);
      }
      lines.push(parsed);
    }
    return { lines, tornTail };
  }

  // Appends events, continuing the hash chain. `previousChainHash` must be the
  // chain hash of the current final intact line (or the genesis value).
  appendAudit(events: AuditEvent[], previousChainHash: string): string {
    let previous = previousChainHash;
    let buffer = '';
    for (const event of events) {
      const line: AuditLine = { event, chain_hash: chainHash(previous, event) };
      buffer += `${JSON.stringify(line)}\n`;
      previous = line.chain_hash;
    }
    if (buffer.length > 0) appendFileDurable(this.auditPath, buffer);
    return previous;
  }

  // Crash healing only: rewrites the audit file from the authoritative event
  // list in state.json when the tail line was torn mid-append. This never
  // drops events — it re-derives the full chain from state, which is a
  // superset of the intact prefix (verified by the caller before healing).
  healAuditFromState(events: AuditEvent[]): string {
    let previous = AUDIT_CHAIN_GENESIS;
    let buffer = '';
    for (const event of events) {
      const line: AuditLine = { event, chain_hash: chainHash(previous, event) };
      buffer += `${JSON.stringify(line)}\n`;
      previous = line.chain_hash;
    }
    writeFileAtomic(this.auditPath, buffer);
    return previous;
  }
}
