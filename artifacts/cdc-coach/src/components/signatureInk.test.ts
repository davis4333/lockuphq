import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SIGNATURE_PIXEL_RATIO,
  SIGNATURE_LOGICAL_HEIGHT,
  SIGNATURE_LOGICAL_WIDTH,
  emptySignatureInkMetrics,
  isPlausibleSignatureInk,
  signatureBackingDimensions,
} from "./signatureInk";

test("signature backing dimensions scale for high-DPI displays and remain bounded", () => {
  assert.deepEqual(signatureBackingDimensions(2), {
    width: SIGNATURE_LOGICAL_WIDTH * 2,
    height: SIGNATURE_LOGICAL_HEIGHT * 2,
    pixelRatio: 2,
    scaleX: 2,
    scaleY: 2,
  });
  assert.equal(
    signatureBackingDimensions(4).pixelRatio,
    MAX_SIGNATURE_PIXEL_RATIO,
  );
  assert.deepEqual(signatureBackingDimensions(Number.NaN), {
    width: SIGNATURE_LOGICAL_WIDTH,
    height: SIGNATURE_LOGICAL_HEIGHT,
    pixelRatio: 1,
    scaleX: 1,
    scaleY: 1,
  });
  assert.deepEqual(signatureBackingDimensions(1, 1_200, 330), {
    width: 1_200,
    height: 330,
    pixelRatio: 1,
    scaleX: 1_200 / SIGNATURE_LOGICAL_WIDTH,
    scaleY: 330 / SIGNATURE_LOGICAL_HEIGHT,
  });
});

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
