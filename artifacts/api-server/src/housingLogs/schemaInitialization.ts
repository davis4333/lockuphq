export type RetriableInitializer = {
  ensureReady(force?: boolean): Promise<boolean>;
  isReady(): boolean;
  lastError(): unknown;
  markUnavailable(): void;
};

type RetriableInitializerOptions = {
  retryDelayMs?: number;
  now?: () => number;
};

export function createRetriableInitializer(
  initialize: () => Promise<void>,
  options: RetriableInitializerOptions = {},
): RetriableInitializer {
  const retryDelayMs = options.retryDelayMs ?? 30_000;
  const now = options.now ?? Date.now;
  let ready = false;
  let error: unknown;
  let retryAfter = 0;
  let inFlight: Promise<boolean> | undefined;

  const ensureReady = async (force = false): Promise<boolean> => {
    if (ready) return true;
    if (inFlight) return inFlight;
    if (!force && now() < retryAfter) return false;

    const attempt = (async () => {
      try {
        await initialize();
        ready = true;
        error = undefined;
        retryAfter = 0;
        return true;
      } catch (caught) {
        ready = false;
        error = caught;
        retryAfter = now() + retryDelayMs;
        return false;
      }
    })();
    inFlight = attempt;
    try {
      return await attempt;
    } finally {
      if (inFlight === attempt) inFlight = undefined;
    }
  };

  return {
    ensureReady,
    isReady: () => ready,
    lastError: () => error,
    markUnavailable: () => {
      ready = false;
      retryAfter = 0;
    },
  };
}
