import { deflateSync } from "node:zlib";

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

export function signatureDataUrl(mode: "valid" | "blank" | "tiny"): string {
  const width = 400;
  const height = 120;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1), 255);
  for (let y = 0; y < height; y += 1) raw[y * (stride + 1)] = 0;

  const setPixel = (x: number, y: number) => {
    const offset = y * (stride + 1) + 1 + x * 4;
    raw[offset] = 15;
    raw[offset + 1] = 23;
    raw[offset + 2] = 42;
    raw[offset + 3] = 255;
  };

  if (mode === "valid") {
    for (let x = 45; x < 340; x += 1) {
      const centerY = 35 + Math.round(18 * Math.sin(x / 18));
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -2; dy <= 2; dy += 1) setPixel(x + dx, centerY + dy);
      }
    }
  } else if (mode === "tiny") {
    for (let x = 196; x <= 202; x += 1) {
      for (let y = 57; y <= 63; y += 1) setPixel(x, y);
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}
