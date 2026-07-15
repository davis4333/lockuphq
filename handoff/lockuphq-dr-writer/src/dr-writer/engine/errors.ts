// LOCKUPHQ DR Writer — typed engine errors. The engine fails closed:
// every rejected operation throws; nothing is silently repaired or merged.

export type EngineErrorCode =
  | 'DEPLOYMENT_FAILED'
  | 'NOT_FOUND'
  | 'STALE_WRITE'
  | 'SESSION_LOCK'
  | 'SYSTEM_HOLD'
  | 'LIFECYCLE'
  | 'HASH_MISMATCH'
  | 'AMBIGUOUS_PERSON'
  | 'RAPID_CONFIRMATION'
  | 'CHARGE_UNSUPPORTED_TERMINAL'
  | 'GATE_BLOCKED'
  | 'VALIDATION'
  | 'RETRY_LIMIT'
  | 'CERTIFICATION_REJECTED'
  | 'TOKEN_REJECTED'
  | 'OUTPUT_REJECTED'
  | 'SUBJECT_SPECIFIC_FACT'
  | 'UNKNOWN_FACT_ID'
  | 'INPUT_REJECTED'
  | 'FORBIDDEN';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.code = code;
    this.name = 'EngineError';
  }
}

export function isEngineError(err: unknown, code: EngineErrorCode): boolean {
  return err instanceof EngineError && err.code === code;
}
