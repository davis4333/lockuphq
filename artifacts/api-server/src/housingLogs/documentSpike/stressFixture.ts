import { deflateSync } from "node:zlib";
import {
  fieldsForConfig,
  getHousingLogConfig,
  prepareHousingLog,
  type HousingLogDraftInput,
  type StoredHousingLog,
} from "@workspace/housing-log";

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

function fakeHandwrittenSignature(phase: number): string {
  const width = 900;
  const height = 220;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1), 0);
  for (let y = 0; y < height; y += 1) raw[y * (stride + 1)] = 0;
  const setPixel = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * (stride + 1) + 1 + x * 4;
    raw[offset] = 12;
    raw[offset + 1] = 18;
    raw[offset + 2] = 32;
    raw[offset + 3] = 255;
  };
  const stroke = (x: number, y: number) => {
    for (let dx = -2; dx <= 2; dx += 1)
      for (let dy = -2; dy <= 2; dy += 1) setPixel(x + dx, y + dy);
  };
  // A synthetic cursive-like trace with ascenders, descenders, and a flourish.
  for (let x = 70; x < 780; x += 1) {
    const t = (x - 70) / 710;
    const y = Math.round(
      112 +
        38 * Math.sin(x / 28 + phase) +
        15 * Math.sin(x / 9 + phase * 0.7) -
        28 * Math.sin(t * Math.PI),
    );
    stroke(x, y);
  }
  for (let x = 130; x < 835; x += 1)
    stroke(x, Math.round(166 + 7 * Math.sin(x / 47 + phase)));

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

export function createBUnitStressRecord(eventCount = 72): StoredHousingLog {
  const config = getHousingLogConfig("B", "1");
  const values: HousingLogDraftInput["values"] = {};
  let number = 1;
  for (const field of fieldsForConfig(config)) {
    if (field.inputType === "time") values[field.key] = "23:58";
    else if (field.inputType === "number") values[field.key] = number++;
    else if (field.inputType === "choice") values[field.key] = field.options?.[0] ?? "Yes";
    else values[field.key] = `FAKE ${field.label}`;
  }

  Object.assign(values, {
    "staff.1.name": "Alexandra Montgomery",
    "staff.2.name": "Christopher Beaumont",
    "staff.3.name": "Jacqueline Rutherford",
    "staff.1.keyRing": "K101",
    "staff.2.keyRing": "K202",
    "staff.3.keyRing": "K303",
    "staff.1.radio": "R11",
    "staff.2.radio": "R22",
    "staff.3.radio": "R33",
    "staff.1.chemicalAgent": "CAP-11",
    "staff.1.chemicalAgentSeal": "S-111",
    "staff.1.bodyAlarm": "BA-1",
    "staff.1.cuffsCase": "CC-1",
    "staff.2.chemicalAgent": "CAP-22",
    "staff.2.chemicalAgentSeal": "S-222",
    "staff.2.bodyAlarm": "BA-2",
    "staff.2.cuffsCase": "CC-2",
    "staff.3.chemicalAgent": "CAP-33",
    "staff.3.chemicalAgentSeal": "S-333",
    "staff.3.bodyAlarm": "BA-3",
    "staff.3.cuffsCase": "CC-3",
    "equipment.cellExtraction": "Sgt. Montgomery",
    "equipment.radioChargingStation": "OK",
    "equipment.inspectionMirror": "M-19",
    "equipment.ligatureCutterSeal": "LC-44721",
    "equipment.legRestraints": "2",
    "equipment.firstAidSeal": "FA-91827",
    "medication.inventoriedBy": "Officer Jacqueline Rutherford",
  });
  for (let index = 1; index <= 8; index += 1)
    values[`equipment.acceptedKeyRings.${index}`] = `K${100 + index}`;
  for (let index = 1; index <= 3; index += 1) {
    values[`equipment.radios.${index}`] = `R${20 + index}`;
    values[`equipment.bodyAlarms.${index}`] = `BA${index}`;
    values[`equipment.cuffs.${index}`] = `C${index}`;
    values[`equipment.cuffCases.${index}`] = `CC${index}`;
  }

  const events = Array.from({ length: eventCount }, (_, index) => {
    const afterMidnight = index >= Math.floor(eventCount / 2);
    const minute = index % 60;
    return {
      id: `fake-event-${String(index + 1).padStart(3, "0")}`,
      time: afterMidnight
        ? `00:${String(minute).padStart(2, "0")}`
        : `23:${String(minute).padStart(2, "0")}`,
      activity:
        `FAKE EVENT ${String(index + 1).padStart(3, "0")}: Officer completed a detailed security, sanitation, equipment, and welfare inspection; all observations were documented and reported to the shift supervisor without exception.`,
      initials: index % 2 === 0 ? "AM" : "JR",
    };
  });
  const prepared = prepareHousingLog({
    logDate: "2026-08-11",
    shift: "1",
    housingUnit: "B",
    templateVersion: config.templateVersion,
    values,
    events,
    signatures: {
      housingSupervisor: fakeHandwrittenSignature(0.4),
      housingOfficer: fakeHandwrittenSignature(1.2),
    },
  });
  return {
    id: "phase2a-fake-b-unit-2026-08-11-shift-1",
    ...prepared,
    status: "finalized",
    createdAt: "2026-08-11T04:00:00.000Z",
    updatedAt: "2026-08-12T12:00:00.000Z",
    finalizedAt: "2026-08-12T12:00:00.000Z",
  };
}
