import { inflateSync } from "node:zlib";
import {
  getHousingLogConfig,
  validateHousingLog,
  type HousingLogDraftInput,
  type ValidationIssue,
} from "@workspace/housing-log";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const dataUrlPattern = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

type SignatureMetrics = {
  inkPixels: number;
  width: number;
  height: number;
  inkWidth: number;
  inkHeight: number;
};

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance)
    return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function inspectPngSignature(value: string): SignatureMetrics | undefined {
  const match = dataUrlPattern.exec(value);
  if (!match) return undefined;
  let png: Buffer;
  try {
    png = Buffer.from(match[1], "base64");
  } catch {
    return undefined;
  }
  if (
    png.length < 100 ||
    png.length > 1_000_000 ||
    !png.subarray(0, 8).equals(pngSignature)
  )
    return undefined;

  let offset = 8;
  let width = 0;
  let height = 0;
  let validHeader = false;
  let ended = false;
  const compressed: Buffer[] = [];

  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) return undefined;
    const chunk = png.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      if (validHeader || length !== 13) return undefined;
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const bitDepth = chunk[8];
      const colorType = chunk[9];
      const compression = chunk[10];
      const filter = chunk[11];
      const interlace = chunk[12];
      validHeader =
        bitDepth === 8 &&
        colorType === 6 &&
        compression === 0 &&
        filter === 0 &&
        interlace === 0;
    } else if (type === "IDAT") {
      compressed.push(chunk);
    } else if (type === "IEND") {
      ended = true;
      break;
    }
    offset = dataEnd + 4;
  }

  if (!validHeader || !ended || compressed.length === 0) return undefined;
  if (
    width < 300 ||
    width > 2_000 ||
    height < 100 ||
    height > 1_000 ||
    width * height > 2_000_000
  )
    return undefined;

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(compressed), {
      maxOutputLength: 10_000_000,
    });
  } catch {
    return undefined;
  }
  if (raw.length !== height * (stride + 1)) return undefined;

  let previous = Buffer.alloc(stride);
  let rawOffset = 0;
  let inkPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    if (filterType === undefined || filterType > 4) return undefined;
    const current = Buffer.from(raw.subarray(rawOffset, rawOffset + stride));
    rawOffset += stride;
    for (let index = 0; index < stride; index += 1) {
      const left =
        index >= bytesPerPixel ? (current[index - bytesPerPixel] ?? 0) : 0;
      const up = previous[index] ?? 0;
      const upperLeft =
        index >= bytesPerPixel ? (previous[index - bytesPerPixel] ?? 0) : 0;
      const predictor =
        filterType === 0
          ? 0
          : filterType === 1
            ? left
            : filterType === 2
              ? up
              : filterType === 3
                ? Math.floor((left + up) / 2)
                : paeth(left, up, upperLeft);
      current[index] = ((current[index] ?? 0) + predictor) & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const pixel = x * bytesPerPixel;
      const red = current[pixel] ?? 255;
      const green = current[pixel + 1] ?? 255;
      const blue = current[pixel + 2] ?? 255;
      const alpha = current[pixel + 3] ?? 0;
      if (alpha > 32 && (red < 225 || green < 225 || blue < 225)) {
        inkPixels += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    previous = current;
  }

  return {
    inkPixels,
    width,
    height,
    inkWidth: maxX >= minX ? maxX - minX + 1 : 0,
    inkHeight: maxY >= minY ? maxY - minY + 1 : 0,
  };
}

export function validateHousingLogSignatureImages(
  input: HousingLogDraftInput,
): ValidationIssue[] {
  const config = getHousingLogConfig(input.housingUnit, input.shift);
  const issues: ValidationIssue[] = [];
  for (const signature of config.signatures) {
    const value = input.signatures[signature.key];
    if (!value?.startsWith("data:image/png;base64,")) continue;
    const metrics = inspectPngSignature(value);
    if (
      !metrics ||
      metrics.inkPixels < 120 ||
      metrics.inkWidth < 40 ||
      metrics.inkHeight < 10
    ) {
      issues.push({
        path: `signatures.${signature.key}`,
        label: signature.label,
        message: `${signature.label} must contain a valid handwritten signature, not a blank or tiny mark.`,
      });
    }
  }
  return issues;
}

export function validateHousingLogForFinalization(
  input: HousingLogDraftInput,
): ValidationIssue[] {
  const issues = [
    ...validateHousingLog(input),
    ...validateHousingLogSignatureImages(input),
  ];
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.path}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
