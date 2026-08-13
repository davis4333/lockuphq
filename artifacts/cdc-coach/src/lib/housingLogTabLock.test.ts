import assert from "node:assert/strict";
import test from "node:test";
import {
  createHousingLogTabLock,
  type HousingLogTabStatus,
} from "./housingLogTabLock";

// A lone tab optimistically reports "active" immediately (no artificial
// lockout while it waits to see whether another tab answers), so "status
// equals active" cannot be used to detect "the claim handshake finished".
// Tests that need a settled first tab before opening a second one just wait
// out the handshake window with a plain delay instead.
const CLAIM_SETTLE_MS = 300;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForStatus(
  lock: ReturnType<typeof createHousingLogTabLock>,
  target: HousingLogTabStatus,
  timeoutMs = 1000,
): Promise<void> {
  if (lock.getStatus() === target) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          `Timed out waiting for status "${target}" (currently "${lock.getStatus()}")`,
        ),
      );
    }, timeoutMs);
    const unsubscribe = lock.subscribe((status) => {
      if (status === target) {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      }
    });
  });
}

test("a single tab reports active by default with no contenders", async () => {
  const lock = createHousingLogTabLock();
  try {
    assert.equal(lock.getStatus(), "active");
    await sleep(CLAIM_SETTLE_MS);
    assert.equal(lock.getStatus(), "active");
  } finally {
    lock.close();
  }
});

test("a second tab opened after the claim window becomes secondary and the first stays active", async () => {
  const first = createHousingLogTabLock();
  try {
    await sleep(CLAIM_SETTLE_MS);
    assert.equal(first.getStatus(), "active");
    const second = createHousingLogTabLock();
    try {
      await waitForStatus(second, "secondary");
      assert.equal(first.getStatus(), "active");
    } finally {
      second.close();
    }
  } finally {
    first.close();
  }
});

test("a cleared broadcast reaches the other tab", async () => {
  const first = createHousingLogTabLock();
  try {
    await sleep(CLAIM_SETTLE_MS);
    const second = createHousingLogTabLock();
    try {
      await waitForStatus(second, "secondary");
      const clearedOnSecond = new Promise<void>((resolve) => {
        const unsubscribe = second.subscribeCleared(() => {
          unsubscribe();
          resolve();
        });
      });
      first.announceCleared();
      await clearedOnSecond;
    } finally {
      second.close();
    }
  } finally {
    first.close();
  }
});

test("two tabs racing to open simultaneously converge on exactly one active tab", async () => {
  const first = createHousingLogTabLock();
  const second = createHousingLogTabLock();
  try {
    await Promise.all([
      waitForStatus(first, first.tabId < second.tabId ? "active" : "secondary"),
      waitForStatus(second, second.tabId < first.tabId ? "active" : "secondary"),
    ]);
    const statuses = [first.getStatus(), second.getStatus()].sort();
    assert.deepEqual(statuses, ["active", "secondary"]);
  } finally {
    first.close();
    second.close();
  }
});
