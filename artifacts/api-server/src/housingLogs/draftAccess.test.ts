import assert from "node:assert/strict";
import test from "node:test";
import {
  DraftAccessSessions,
  DraftUnlockRateLimiter,
  generateDraftAccessCode,
  hashDraftAccessCode,
  normalizeDraftAccessCode,
} from "./draftAccess";

test("generated access codes have the expected shape and are not predictable", () => {
  const codes = Array.from({ length: 200 }, () => generateDraftAccessCode());
  for (const code of codes) assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  // No ambiguous characters (0/O/1/I/L) that could cause a typo to silently
  // resolve to a *different valid* code instead of just failing to match.
  for (const code of codes) assert.doesNotMatch(code, /[O0I1L]/);
  assert.equal(new Set(codes).size, codes.length, "200 codes should not collide");
});

test("normalization strips separators/whitespace and is case-insensitive", () => {
  assert.equal(normalizeDraftAccessCode("K7M4-92QF"), "K7M492QF");
  assert.equal(normalizeDraftAccessCode("k7m4 92qf"), "K7M492QF");
  assert.equal(normalizeDraftAccessCode("  k7m4-92qf  "), "K7M492QF");
  assert.equal(normalizeDraftAccessCode("k7-m4-92-qf"), "K7M492QF");
});

test("hashing is deterministic and never reveals the plaintext", () => {
  const hashOne = hashDraftAccessCode(normalizeDraftAccessCode("K7M4-92QF"));
  const hashTwo = hashDraftAccessCode(normalizeDraftAccessCode("k7m4 92qf"));
  assert.equal(hashOne, hashTwo);
  assert.match(hashOne, /^[0-9a-f]{64}$/);
  assert.notEqual(hashOne, "K7M492QF");
  assert.notEqual(
    hashOne,
    hashDraftAccessCode(normalizeDraftAccessCode("AAAA-AAAA")),
  );
});

test("sessions authorize only the draft IDs they were given, and expire", () => {
  let now = 0;
  const sessions = new DraftAccessSessions(() => now, 1_000);
  const token = sessions.authorize(undefined, "draft-1");
  assert.equal(sessions.isAuthorized(token, "draft-1"), true);
  assert.equal(sessions.isAuthorized(token, "draft-2"), false);
  assert.equal(sessions.isAuthorized(undefined, "draft-1"), false);
  assert.equal(sessions.isAuthorized("not-a-real-token", "draft-1"), false);

  const extended = sessions.authorize(token, "draft-2");
  assert.equal(extended, token, "authorizing a second draft reuses the token");
  assert.deepEqual(
    sessions.authorizedDraftIds(token).sort(),
    ["draft-1", "draft-2"],
  );

  now += 1_001;
  assert.equal(sessions.isAuthorized(token, "draft-1"), false);
  assert.deepEqual(sessions.authorizedDraftIds(token), []);

  // A session extension attempt against an expired token issues a brand-new
  // one rather than reviving the stale one.
  const revived = sessions.authorize(token, "draft-3");
  assert.notEqual(revived, token);
  assert.equal(sessions.isAuthorized(revived, "draft-1"), false);
  assert.equal(sessions.isAuthorized(revived, "draft-3"), true);
});

test("rate limiter allows free attempts, then backs off, then resets on success", () => {
  let now = 0;
  const limiter = new DraftUnlockRateLimiter(() => now);
  const key = "203.0.113.7";
  assert.equal(limiter.lockedForMilliseconds(key), 0);

  for (let i = 0; i < 5; i += 1) {
    limiter.registerFailure(key);
    assert.equal(limiter.lockedForMilliseconds(key), 0, `attempt ${i + 1}`);
  }
  limiter.registerFailure(key); // 6th failure trips the lockout
  const lockedMs = limiter.lockedForMilliseconds(key);
  assert.ok(lockedMs > 0);

  now += lockedMs; // wait it out
  assert.equal(limiter.lockedForMilliseconds(key), 0);

  limiter.registerFailure(key); // a further failure backs off longer
  const secondLockMs = limiter.lockedForMilliseconds(key);
  assert.ok(secondLockMs > lockedMs);

  now += secondLockMs;
  limiter.registerSuccess(key);
  assert.equal(limiter.lockedForMilliseconds(key), 0);

  // Failures are tracked independently per key — one attacker never blocks
  // a different, legitimate source.
  const otherKey = "198.51.100.9";
  assert.equal(limiter.lockedForMilliseconds(otherKey), 0);
});
