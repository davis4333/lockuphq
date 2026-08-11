export type SignatureInkMetrics = {
  distance: number;
  points: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export const SIGNATURE_LOGICAL_WIDTH = 900;
export const SIGNATURE_LOGICAL_HEIGHT = 220;
export const MAX_SIGNATURE_PIXEL_RATIO = 2;
const MAX_SIGNATURE_BACKING_WIDTH = 2_000;
const MAX_SIGNATURE_BACKING_HEIGHT = 1_000;

export function signaturePixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio < 1) return 1;
  return Math.min(devicePixelRatio, MAX_SIGNATURE_PIXEL_RATIO);
}

export function signatureBackingDimensions(
  devicePixelRatio: number,
  displayWidth = SIGNATURE_LOGICAL_WIDTH,
  displayHeight = SIGNATURE_LOGICAL_HEIGHT,
): {
  width: number;
  height: number;
  pixelRatio: number;
  scaleX: number;
  scaleY: number;
} {
  const pixelRatio = signaturePixelRatio(devicePixelRatio);
  const width = Math.min(
    MAX_SIGNATURE_BACKING_WIDTH,
    Math.max(
      SIGNATURE_LOGICAL_WIDTH,
      Math.round((displayWidth || SIGNATURE_LOGICAL_WIDTH) * pixelRatio),
    ),
  );
  const height = Math.min(
    MAX_SIGNATURE_BACKING_HEIGHT,
    Math.max(
      SIGNATURE_LOGICAL_HEIGHT,
      Math.round((displayHeight || SIGNATURE_LOGICAL_HEIGHT) * pixelRatio),
    ),
  );
  return {
    width,
    height,
    pixelRatio,
    scaleX: width / SIGNATURE_LOGICAL_WIDTH,
    scaleY: height / SIGNATURE_LOGICAL_HEIGHT,
  };
}

export const emptySignatureInkMetrics = (): SignatureInkMetrics => ({
  distance: 0,
  points: 0,
  minX: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
});

export const isPlausibleSignatureInk = (
  metrics: SignatureInkMetrics,
): boolean =>
  metrics.distance >= 80 &&
  metrics.points >= 6 &&
  metrics.maxX - metrics.minX >= 40 &&
  metrics.maxY - metrics.minY >= 10;
