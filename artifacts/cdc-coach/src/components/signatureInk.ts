export type SignatureInkMetrics = {
  distance: number;
  points: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

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
