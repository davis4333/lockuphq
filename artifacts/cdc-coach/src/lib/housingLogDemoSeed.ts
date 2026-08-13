export {
  cryptoRng,
  seededRng,
  generateCompleteDemoValues,
  generateIncompleteDemoValues,
  groupForFieldKey,
  shiftRelativeMinutes,
  type DemoRng,
  type DemoFieldGroup,
  type DemoSeedValues,
  type DemoIncompleteSeed,
} from "@workspace/housing-log";

import type { DemoRng } from "@workspace/housing-log";

function randInt(rng: DemoRng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * A plausible cursive-like path within the signature pad's logical
 * coordinate space (see signatureInk.ts), guaranteed to clear the same
 * isPlausibleSignatureInk thresholds a real hand-drawn stroke must clear
 * (total distance, point count, and bounding-box spread). SignaturePad
 * draws these points through its normal stroke/finish code path — this
 * function only picks the geometry, it never touches validation itself.
 *
 * Kept in the app package rather than the shared domain package: unlike
 * the rest of the demo generator, this one is inherently tied to the
 * signature pad's own coordinate space and ink-plausibility rules.
 */
export function generateSignatureStrokePoints(
  rng: DemoRng,
): { x: number; y: number }[] {
  const baseline = randInt(rng, 100, 140);
  const amplitude = randInt(rng, 25, 45);
  const startX = randInt(rng, 60, 120);
  const endX = randInt(rng, 620, 760);
  const points: { x: number; y: number }[] = [];
  const steps = randInt(rng, 24, 40);
  for (let i = 0; i <= steps; i += 1) {
    const progress = i / steps;
    const x = startX + (endX - startX) * progress;
    const wave =
      Math.sin(progress * Math.PI * randInt(rng, 3, 5)) * amplitude +
      (rng() - 0.5) * 8;
    points.push({ x, y: baseline + wave });
  }
  return points;
}
