// LOCKUPHQ DR Writer — canonical hashing for hash-bound confirmation,
// snapshots, certification, and tokens (blueprint invariants 5 and 21).

import { createHash } from 'node:crypto';

// Deterministic JSON: object keys sorted recursively so equal values hash equally.
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
  return `{${entries.join(',')}}`;
}

export function hashValue(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
