import assert from "node:assert/strict";
import test from "node:test";
import {
  emptySignatureInkMetrics,
  isPlausibleSignatureInk,
} from "./signatureInk";

test("a pointer tap does not count as a signature", () => {
  const metrics = emptySignatureInkMetrics();
  metrics.points = 1;
  metrics.minX = metrics.maxX = 100;
  metrics.minY = metrics.maxY = 50;

  assert.equal(isPlausibleSignatureInk(metrics), false);
});

test("a tiny accidental dot or short stroke does not count as a signature", () => {
  assert.equal(
    isPlausibleSignatureInk({
      distance: 12,
      points: 8,
      minX: 100,
      maxX: 108,
      minY: 50,
      maxY: 55,
    }),
    false,
  );
});

test("a deliberate handwritten stroke can be captured", () => {
  assert.equal(
    isPlausibleSignatureInk({
      distance: 180,
      points: 18,
      minX: 80,
      maxX: 260,
      minY: 40,
      maxY: 100,
    }),
    true,
  );
});
