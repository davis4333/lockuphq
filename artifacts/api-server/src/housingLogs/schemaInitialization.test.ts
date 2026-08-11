import assert from "node:assert/strict";
import test from "node:test";
import { createRetriableInitializer } from "./schemaInitialization";

test("a failed initialization retries after the throttle window and recovers", async () => {
  let currentTime = 1_000;
  let attempts = 0;
  const initializer = createRetriableInitializer(
    async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary database failure");
    },
    { retryDelayMs: 5_000, now: () => currentTime },
  );

  assert.equal(await initializer.ensureReady(), false);
  assert.equal(initializer.isReady(), false);
  assert.equal(attempts, 1);
  assert.equal(await initializer.ensureReady(), false);
  assert.equal(attempts, 1);

  currentTime += 5_000;
  assert.equal(await initializer.ensureReady(), true);
  assert.equal(initializer.isReady(), true);
  assert.equal(attempts, 2);
});

test("concurrent retry requests share one initialization attempt", async () => {
  let attempts = 0;
  let completeAttempt: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    completeAttempt = resolve;
  });
  const initializer = createRetriableInitializer(async () => {
    attempts += 1;
    await waiting;
  });

  const first = initializer.ensureReady();
  const second = initializer.ensureReady();
  assert.equal(attempts, 1);
  completeAttempt?.();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(attempts, 1);
});
