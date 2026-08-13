import type { PDFFont } from "pdf-lib";
import { fitSingleLine } from "./textLayout.ts";
import type { HousingLogDocumentRecord } from "./types.ts";

export type LayoutBox = {
  pageIndex: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type BUnitPlacement = {
  id: string;
  coverageKeys: readonly string[];
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  safeBox: LayoutBox;
  erase: boolean;
  value: (record: HousingLogDocumentRecord) => string;
};

export type MeasuredPlacement = BUnitPlacement & {
  text: string;
  fontSize: number;
  textBox: LayoutBox;
};

export type LayoutViolation = {
  placementId: string;
  protectedId?: string;
  reason: "outside-safe-box" | "fixed-label-collision" | "placement-collision";
};

type RegionOptions = {
  coverageKeys?: readonly string[];
  erase?: boolean;
  value?: (record: HousingLogDocumentRecord) => string;
};

const storedValue = (key: string) => (record: HousingLogDocumentRecord) =>
  String(record.values[key] ?? "").trim();

function region(
  id: string,
  pageIndex: number,
  x0: number,
  x1: number,
  y: number,
  rowBottom: number,
  rowTop: number,
  options: RegionOptions = {},
): BUnitPlacement {
  return {
    id,
    coverageKeys: options.coverageKeys ?? [id],
    pageIndex,
    x: x0 + 1,
    y,
    width: x1 - x0 - 2,
    safeBox: { pageIndex, x0, y0: rowBottom, x1, y1: rowTop },
    erase: options.erase ?? true,
    value: options.value ?? storedValue(id),
  };
}

const timeCell = (
  id: string,
  pageIndex: number,
  y: number,
  rowBottom: number,
  rowTop: number,
  options: RegionOptions = {},
) =>
  region(
    id,
    pageIndex,
    19.4,
    pageIndex === 0 ? 74.1 : 74.8,
    y,
    rowBottom,
    rowTop,
    { ...options, erase: false },
  );

const initialsCell = (
  id: string,
  pageIndex: number,
  y: number,
  rowBottom: number,
  rowTop: number,
  options: RegionOptions = {},
) =>
  region(
    id,
    pageIndex,
    pageIndex === 0 ? 528.7 : 534.5,
    pageIndex === 0 ? 585.1 : 591.4,
    y,
    rowBottom,
    rowTop,
    { ...options, erase: false },
  );

function countPlacements(options: {
  key: string;
  pageIndex: number;
  formalY: number;
  formalBottom: number;
  formalTop: number;
  wingY: number;
  wingBottom: number;
  wingTop: number;
  timeXs: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  wingXs: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  conducted?: {
    pageIndex: number;
    x0: number;
    x1: number;
    y: number;
    rowBottom: number;
    rowTop: number;
  };
  initials?: {
    pageIndex: number;
    y: number;
    rowBottom: number;
    rowTop: number;
  };
}): BUnitPlacement[] {
  const prefix = `counts.${options.key}`;
  const [recall, count, clear] = options.timeXs;
  const [wingOne, wingTwo, wingThree, total] = options.wingXs;
  const placements = [
    timeCell(
      `${prefix}.countTime.timeCell`,
      options.pageIndex,
      options.formalY,
      options.formalBottom,
      options.formalTop,
      {
        coverageKeys: [],
        value: storedValue(`${prefix}.countTime`),
      },
    ),
    region(
      `${prefix}.recallTime`,
      options.pageIndex,
      recall[0],
      recall[1],
      options.formalY,
      options.formalBottom,
      options.formalTop,
    ),
    region(
      `${prefix}.countTime`,
      options.pageIndex,
      count[0],
      count[1],
      options.formalY,
      options.formalBottom,
      options.formalTop,
    ),
    region(
      `${prefix}.clearTime`,
      options.pageIndex,
      clear[0],
      clear[1],
      options.formalY,
      options.formalBottom,
      options.formalTop,
    ),
    region(
      `${prefix}.components.Wing One`,
      options.pageIndex,
      wingOne[0],
      wingOne[1],
      options.wingY,
      options.wingBottom,
      options.wingTop,
    ),
    region(
      `${prefix}.components.Wing Two`,
      options.pageIndex,
      wingTwo[0],
      wingTwo[1],
      options.wingY,
      options.wingBottom,
      options.wingTop,
    ),
    region(
      `${prefix}.components.Wing Three`,
      options.pageIndex,
      wingThree[0],
      wingThree[1],
      options.wingY,
      options.wingBottom,
      options.wingTop,
    ),
    region(
      `${prefix}.total`,
      options.pageIndex,
      total[0],
      total[1],
      options.wingY,
      options.wingBottom,
      options.wingTop,
    ),
  ];
  if (options.conducted) {
    const c = options.conducted;
    placements.push(
      region(
        `${prefix}.conductedBy`,
        c.pageIndex,
        c.x0,
        c.x1,
        c.y,
        c.rowBottom,
        c.rowTop,
        {
          coverageKeys: [`${prefix}.conductedByRole`, `${prefix}.conductedBy`],
        },
      ),
    );
  }
  if (options.initials) {
    const i = options.initials;
    placements.push(
      initialsCell(
        `${prefix}.initials`,
        i.pageIndex,
        i.y,
        i.rowBottom,
        i.rowTop,
      ),
    );
  }
  return placements;
}

const placements: BUnitPlacement[] = [
  region("logDate", 0, 454.5, 552, 893, 889.5, 906, {
    value: (record) => record.logDate,
  }),
  ...[1, 2, 3].flatMap((staff, index) => {
    const y = 842.2 - index * 32.88;
    const bottom = 840.58 - index * 32.88;
    const top = 857.14 - index * 32.88;
    const issuedY = 825.8 - index * 32.88;
    const issuedBottom = bottom - 16.44;
    const issuedTop = top - 16.44;
    return [
      timeCell(`staff.${staff}.dutyWindow`, 0, y, bottom, top, {
        coverageKeys: [`staff.${staff}.assumedAt`, `staff.${staff}.initials`],
        value: storedValue(`staff.${staff}.assumedAt`),
      }),
      region(
        `staff.${staff}.name`,
        0,
        staff === 1 ? 110.8 : 105.4,
        staff === 1 ? 183.7 : 178.3,
        y,
        bottom,
        top,
      ),
      region(
        `staff.${staff}.keyRing`,
        0,
        staff === 1 ? 359.5 : 354.1,
        staff === 1 ? 384.6 : 379.2,
        y,
        bottom,
        top,
      ),
      region(
        `staff.${staff}.radio`,
        0,
        staff === 1 ? 410.8 : 405.5,
        staff === 1 ? 435.9 : 430.5,
        y,
        bottom,
        top,
      ),
      region(
        `staff.${staff}.chemicalAgent`,
        0,
        160.3,
        183.1,
        issuedY,
        issuedBottom,
        issuedTop,
      ),
      region(
        `staff.${staff}.chemicalAgentSeal`,
        0,
        201.9,
        238.4,
        issuedY,
        issuedBottom,
        issuedTop,
      ),
      region(
        `staff.${staff}.bodyAlarm`,
        0,
        285.3,
        308.1,
        issuedY,
        issuedBottom,
        issuedTop,
      ),
      region(
        `staff.${staff}.cuffsCase`,
        0,
        360.6,
        383.4,
        issuedY,
        issuedBottom,
        issuedTop,
      ),
    ];
  }),
  timeCell("activities.preaAnnouncement.time", 0, 743.6, 741.94, 758.5),
  region(
    "activities.preaAnnouncement.performedBy",
    0,
    286.7,
    359.6,
    743.6,
    741.94,
    758.5,
  ),
  initialsCell("activities.preaAnnouncement.initials", 0, 727.1, 725.5, 742.06),
  timeCell("activities.cameraVerification.time", 0, 710.7, 709.06, 725.62),
  region(
    "activities.cameraVerification.performedBy",
    0,
    144.3,
    217.3,
    710.7,
    709.06,
    725.62,
  ),
  initialsCell(
    "activities.cameraVerification.initials",
    0,
    710.7,
    709.06,
    725.62,
  ),
  timeCell("counts.beginning.countTime", 0, 694.3, 692.62, 709.18),
  region(
    "counts.beginning.components.Wing One",
    0,
    206.3,
    229.1,
    694.3,
    692.62,
    709.18,
  ),
  region(
    "counts.beginning.components.Wing Two",
    0,
    272.5,
    295.3,
    694.3,
    692.62,
    709.18,
  ),
  region(
    "counts.beginning.components.Wing Three",
    0,
    343.6,
    366.4,
    694.3,
    692.62,
    709.18,
  ),
  region("counts.beginning.total", 0, 390.2, 413, 694.3, 692.62, 709.18),
  initialsCell("counts.beginning.initials", 0, 694.3, 692.62, 709.18),
  ...Array.from({ length: 8 }, (_, index) =>
    region(
      `equipment.acceptedKeyRings.${index + 1}`,
      0,
      235.4 + index * 25.1,
      258.2 + index * 25.1,
      677.8,
      676.18,
      692.74,
    ),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    region(
      `equipment.radios.${index + 1}`,
      0,
      304.9 + index * 25.1,
      327.7 + index * 25.1,
      661.3,
      659.74,
      676.3,
    ),
  ),
  region(
    "equipment.radioStatusReportedBy",
    0,
    280,
    353,
    644.9,
    643.3,
    659.86,
    {
      coverageKeys: [
        "equipment.radioStatusReportedBy",
        "equipment.firstAidInventoryTime",
        "equipment.firstAidInventoryInitials",
      ],
    },
  ),
  // This wide box (built for one printed name) is reused as a combined home
  // for the two equipment-acceptance completion time/initials pairs added
  // during the Staff & Equipment audit — this legacy PDF-overlay spike
  // (superseded by the live XLSX export path) was never wired to model
  // per-line completion time/initials, and giving each its own narrow box
  // here isn't worth new hand-measured PDF coordinates for an unreachable
  // prototype format.
  region(
    "equipment.cellExtraction",
    0,
    361.1,
    479,
    628.5,
    626.86,
    643.42,
    {
      coverageKeys: [
        "equipment.cellExtraction",
        "equipment.keysAcceptedTime",
        "equipment.keysAcceptedInitials",
        "equipment.radiosAccountedForTime",
        "equipment.radiosAccountedForInitials",
      ],
    },
  ),
  region("equipment.radioChargingStation", 0, 161.2, 184, 612, 610.42, 626.98),
  region("equipment.extraBatteries", 0, 204.6, 218.2, 612, 610.42, 626.98),
  region("equipment.inspectionMirror", 0, 341.8, 366.8, 612, 610.42, 626.98),
  region("equipment.cellUnlockingBars", 0, 369.1, 391.9, 612, 610.42, 626.98),
  region(
    "equipment.ligatureCutterSeal",
    0,
    212.7,
    251.5,
    595.6,
    593.98,
    610.54,
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    region(
      `equipment.bodyAlarms.${index + 1}`,
      0,
      301.9 + index * 25.1,
      324.7 + index * 25.1,
      595.6,
      593.98,
      610.54,
    ),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    region(
      `equipment.cuffs.${index + 1}`,
      0,
      402.2 + index * 25.1,
      425 + index * 25.1,
      595.6,
      593.98,
      610.54,
    ),
  ),
  ...Array.from({ length: 3 }, (_, index) =>
    region(
      `equipment.cuffCases.${index + 1}`,
      0,
      117.4 + index * 25.1,
      140.2 + index * 25.1,
      579.1,
      577.54,
      594.1,
    ),
  ),
  region("equipment.legRestraints", 0, 247.1, 269.9, 579.1, 577.54, 594.1),
  region("equipment.backboards", 0, 287.6, 301.3, 579.1, 577.54, 594.1),
  region("equipment.passesAccounted", 0, 286.3, 321, 562.7, 561.1, 577.66),
  region("equipment.unaccountedPasses", 0, 425.4, 464.2, 562.7, 561.1, 577.66),
  // See the equipment.cellExtraction comment above — this wide box also
  // hosts the radio-charging-station completion time/initials pair.
  region(
    "equipment.incidentReport",
    0,
    291,
    343.7,
    546.3,
    544.66,
    561.22,
    {
      coverageKeys: [
        "equipment.incidentReport",
        "equipment.radioChargingStationTime",
        "equipment.radioChargingStationInitials",
      ],
    },
  ),
  region("equipment.firstAidSeal", 0, 257.8, 296.5, 529.8, 528.22, 544.78),
  region("equipment.ppeKit", 0, 357.5, 392.1, 529.8, 528.22, 544.78),
  region("equipment.breathingMask", 0, 128.3, 160.8, 513.4, 511.78, 528.34),
  region("equipment.fireExtinguishers", 0, 314.6, 347.1, 513.4, 511.78, 528.34),
  region("equipment.fireAlarm", 0, 432.2, 464.7, 513.4, 511.78, 528.34),
  region(
    "equipment.inventoryComplete",
    0,
    439.9,
    472.4,
    496.9,
    495.34,
    511.9,
    {
      coverageKeys: [
        "equipment.inventoryComplete",
        "equipment.equipmentInventoryTime",
        "equipment.equipmentInventoryInitials",
      ],
    },
  ),
  region("equipment.postOrders", 0, 267.8, 300.3, 480.5, 478.9, 495.46),
  region(
    "medication.inventoriedBy",
    0,
    305,
    377.9,
    464,
    462.46,
    479.02,
    {
      coverageKeys: [
        "medication.inventoriedBy",
        "equipment.medicationInventoryTime",
        "equipment.medicationInventoryInitials",
      ],
    },
  ),
  region("medication.acetaminophen", 0, 136.4, 159.2, 447.6, 446.02, 462.58),
  region("medication.alamag", 0, 192.6, 215.4, 447.6, 446.02, 462.58),
  region("medication.ibuprofen", 0, 255.8, 278.6, 447.6, 446.02, 462.58),
  timeCell("activities.lockInspection.time", 0, 431.2, 429.53, 446.09),
  region(
    "activities.lockInspection.performedBy",
    0,
    284.2,
    359.5,
    381.8,
    380.21,
    396.77,
  ),
  region(
    "activities.lockInspection.completedAt",
    0,
    406.1,
    428.9,
    381.8,
    380.21,
    396.77,
    { coverageKeys: [], value: storedValue("activities.lockInspection.time") },
  ),
  initialsCell("activities.lockInspection.initials", 0, 381.8, 380.21, 396.77),
  timeCell("activities.externalInspection.time", 0, 365.4, 363.77, 380.33),
  region(
    "activities.externalInspection.performedBy",
    0,
    217,
    292.3,
    316.1,
    314.45,
    331.01,
  ),
  region(
    "activities.externalInspection.completedAt",
    0,
    338.9,
    361.7,
    316.1,
    314.45,
    331.01,
    {
      coverageKeys: [],
      value: storedValue("activities.externalInspection.time"),
    },
  ),
  initialsCell(
    "activities.externalInspection.initials",
    0,
    316.1,
    314.45,
    331.01,
  ),
  ...countPlacements({
    key: "midnight",
    pageIndex: 0,
    formalY: 299.6,
    formalBottom: 298.01,
    formalTop: 314.57,
    wingY: 283.2,
    wingBottom: 281.57,
    wingTop: 298.13,
    timeXs: [
      [212.4, 235.2],
      [280.3, 303.1],
      [349.8, 372.6],
    ],
    wingXs: [
      [116.5, 139.3],
      [182.8, 205.6],
      [253.9, 276.7],
      [300.4, 323.2],
    ],
    conducted: {
      pageIndex: 0,
      x0: 285.9,
      x1: 361.1,
      y: 217.4,
      rowBottom: 215.81,
      rowTop: 232.37,
    },
    initials: { pageIndex: 0, y: 217.4, rowBottom: 215.81, rowTop: 232.37 },
  }),
  ...countPlacements({
    key: "early-morning",
    pageIndex: 0,
    formalY: 201,
    formalBottom: 199.37,
    formalTop: 215.93,
    wingY: 184.5,
    wingBottom: 182.93,
    wingTop: 199.49,
    timeXs: [
      [230.7, 253.5],
      [298.6, 321.4],
      [368.2, 391],
    ],
    wingXs: [
      [116.5, 139.3],
      [182.8, 205.6],
      [253.9, 276.7],
      [300.4, 323.2],
    ],
    conducted: {
      pageIndex: 1,
      x0: 288.9,
      x1: 365.8,
      y: 857.9,
      rowBottom: 856.3,
      rowTop: 873.1,
    },
    initials: { pageIndex: 1, y: 857.9, rowBottom: 856.3, rowTop: 873.1 },
  }),
  region("logDate.page2", 1, 455.5, 559, 893, 889.3, 906, {
    coverageKeys: [],
    value: (record) => record.logDate,
  }),
  ...countPlacements({
    key: "pre-turnout",
    pageIndex: 1,
    formalY: 841.2,
    formalBottom: 839.26,
    formalTop: 855.94,
    wingY: 824.5,
    wingBottom: 822.58,
    wingTop: 839.26,
    timeXs: [
      [224.4, 247.7],
      [293.3, 316.6],
      [364, 387.3],
    ],
    wingXs: [
      [117.6, 140.9],
      [184.9, 208.2],
      [257, 280.3],
      [304.3, 327.6],
    ],
    conducted: {
      pageIndex: 1,
      x0: 288.9,
      x1: 365.8,
      y: 757.8,
      rowBottom: 755.86,
      rowTop: 772.54,
    },
    initials: { pageIndex: 1, y: 757.8, rowBottom: 755.86, rowTop: 772.54 },
  }),
  ...countPlacements({
    key: "morning",
    pageIndex: 1,
    formalY: 741.1,
    formalBottom: 739.18,
    formalTop: 755.86,
    wingY: 724.5,
    wingBottom: 722.5,
    wingTop: 739.18,
    timeXs: [
      [212.3, 235.6],
      [281.2, 304.5],
      [351.9, 375.2],
    ],
    wingXs: [
      [117.6, 140.9],
      [184.9, 208.2],
      [257, 280.3],
      [304.3, 327.6],
    ],
    conducted: {
      pageIndex: 1,
      x0: 288.9,
      x1: 365.8,
      y: 657.7,
      rowBottom: 655.75,
      rowTop: 672.43,
    },
    initials: { pageIndex: 1, y: 657.7, rowBottom: 655.75, rowTop: 672.43 },
  }),
  timeCell("activities.intercom.time", 1, 641, 639.43, 656.23),
  initialsCell("activities.intercom.initials", 1, 591, 589.39, 606.19),
  ...Array.from({ length: 17 }, (_, index) => {
    const y = 574.3 - index * 16.68;
    const bottom = 572.35 - index * 16.68;
    const top = 589.03 - index * 16.68;
    const number = index + 1;
    return [
      timeCell(`securityChecks.${number}.time`, 1, y, bottom, top),
      region(
        `securityChecks.${number}.performedBy`,
        1,
        367.8,
        444.8,
        y,
        bottom,
        top,
        {
          coverageKeys: [
            `securityChecks.${number}.performedByRole`,
            `securityChecks.${number}.performedBy`,
          ],
        },
      ),
      initialsCell(`securityChecks.${number}.initials`, 1, y, bottom, top),
    ];
  }).flat(),
  timeCell("activities.unannouncedInspection.time", 1, 290.7, 288.77, 305.45),
  region(
    "activities.unannouncedInspection.supervisor",
    1,
    140,
    214.6,
    290.7,
    288.77,
    305.45,
    {
      coverageKeys: [
        "activities.unannouncedInspection.supervisorRole",
        "activities.unannouncedInspection.supervisor",
      ],
    },
  ),
  initialsCell(
    "activities.unannouncedInspection.initials",
    1,
    290.7,
    288.77,
    305.45,
  ),
  region("logDate.page3", 2, 455.5, 559, 893, 889.3, 906, {
    coverageKeys: [],
    value: (record) => record.logDate,
  }),
];

export const B_UNIT_FIRST_SHIFT_PLACEMENTS = placements;

type ProtectedRegion = LayoutBox & { id: string };

// These fixed-label regions are measured independently from the 1_B PDF. They
// cover the page-2 formal-count labels that previously collided, every repeated
// security-check label, and the disclaimer/signature labels on all three pages.
export const B_UNIT_PROTECTED_REGIONS: readonly ProtectedRegion[] = [
  {
    id: "pre-turnout-label-1",
    pageIndex: 1,
    x0: 77.3,
    y0: 839.26,
    x1: 224.4,
    y1: 855.94,
  },
  {
    id: "pre-turnout-label-2",
    pageIndex: 1,
    x0: 247.7,
    y0: 839.26,
    x1: 293.3,
    y1: 855.94,
  },
  {
    id: "pre-turnout-label-3",
    pageIndex: 1,
    x0: 316.6,
    y0: 839.26,
    x1: 364,
    y1: 855.94,
  },
  {
    id: "pre-turnout-label-4",
    pageIndex: 1,
    x0: 387.3,
    y0: 839.26,
    x1: 533.1,
    y1: 855.94,
  },
  {
    id: "pre-turnout-wing-one-label",
    pageIndex: 1,
    x0: 77.3,
    y0: 822.58,
    x1: 117.6,
    y1: 839.26,
  },
  {
    id: "pre-turnout-wing-two-label",
    pageIndex: 1,
    x0: 140.9,
    y0: 822.58,
    x1: 184.9,
    y1: 839.26,
  },
  {
    id: "pre-turnout-wing-three-label",
    pageIndex: 1,
    x0: 208.2,
    y0: 822.58,
    x1: 257,
    y1: 839.26,
  },
  {
    id: "pre-turnout-total-label",
    pageIndex: 1,
    x0: 280.3,
    y0: 822.58,
    x1: 304.3,
    y1: 839.26,
  },
  {
    id: "pre-turnout-wing-tail",
    pageIndex: 1,
    x0: 327.6,
    y0: 822.58,
    x1: 533.1,
    y1: 839.26,
  },
  {
    id: "morning-label-1",
    pageIndex: 1,
    x0: 77.3,
    y0: 739.18,
    x1: 212.3,
    y1: 755.86,
  },
  {
    id: "morning-label-2",
    pageIndex: 1,
    x0: 235.6,
    y0: 739.18,
    x1: 281.2,
    y1: 755.86,
  },
  {
    id: "morning-label-3",
    pageIndex: 1,
    x0: 304.5,
    y0: 739.18,
    x1: 351.9,
    y1: 755.86,
  },
  {
    id: "morning-label-4",
    pageIndex: 1,
    x0: 375.2,
    y0: 739.18,
    x1: 533.1,
    y1: 755.86,
  },
  {
    id: "morning-wing-one-label",
    pageIndex: 1,
    x0: 77.3,
    y0: 722.5,
    x1: 117.6,
    y1: 739.18,
  },
  {
    id: "morning-wing-two-label",
    pageIndex: 1,
    x0: 140.9,
    y0: 722.5,
    x1: 184.9,
    y1: 739.18,
  },
  {
    id: "morning-wing-three-label",
    pageIndex: 1,
    x0: 208.2,
    y0: 722.5,
    x1: 257,
    y1: 739.18,
  },
  {
    id: "morning-total-label",
    pageIndex: 1,
    x0: 280.3,
    y0: 722.5,
    x1: 304.3,
    y1: 739.18,
  },
  {
    id: "morning-wing-tail",
    pageIndex: 1,
    x0: 327.6,
    y0: 722.5,
    x1: 533.1,
    y1: 739.18,
  },
  ...Array.from({ length: 17 }, (_, index) => {
    const y0 = 572.35 - index * 16.68;
    return {
      id: `security-check-${index + 1}-label`,
      pageIndex: 1,
      x0: 76.1,
      y0,
      x1: 367.8,
      y1: y0 + 16.68,
    };
  }),
  {
    id: "page1-supervisor-label",
    pageIndex: 0,
    x0: 20,
    y0: 116.78,
    x1: 165,
    y1: 133.22,
  },
  {
    id: "page1-officer-label",
    pageIndex: 0,
    x0: 20,
    y0: 100.34,
    x1: 148,
    y1: 117.62,
  },
  { id: "page1-disclaimer", pageIndex: 0, x0: 20, y0: 54, x1: 586, y1: 100.34 },
  {
    id: "page2-supervisor-label",
    pageIndex: 1,
    x0: 20,
    y0: 121.94,
    x1: 167,
    y1: 139.46,
  },
  {
    id: "page2-officer-label",
    pageIndex: 1,
    x0: 20,
    y0: 105.62,
    x1: 150,
    y1: 122.78,
  },
  { id: "page2-disclaimer", pageIndex: 1, x0: 20, y0: 54, x1: 592, y1: 105.62 },
  {
    id: "page3-supervisor-label",
    pageIndex: 2,
    x0: 20,
    y0: 113.9,
    x1: 167,
    y1: 129.26,
  },
  {
    id: "page3-officer-label",
    pageIndex: 2,
    x0: 20,
    y0: 99.74,
    x1: 150,
    y1: 114.74,
  },
  { id: "page3-disclaimer", pageIndex: 2, x0: 20, y0: 54, x1: 592, y1: 99.38 },
];

function overlaps(a: LayoutBox, b: LayoutBox, margin = 0.15): boolean {
  return (
    a.pageIndex === b.pageIndex &&
    a.x0 < b.x1 - margin &&
    a.x1 > b.x0 + margin &&
    a.y0 < b.y1 - margin &&
    a.y1 > b.y0 + margin
  );
}

export function measureBUnitFirstShiftPlacements(
  record: HousingLogDocumentRecord,
  font: Pick<PDFFont, "widthOfTextAtSize" | "heightAtSize">,
  layout: readonly BUnitPlacement[] = placements,
): MeasuredPlacement[] {
  return layout.flatMap((placement) => {
    const text = placement.value(record);
    if (!text) return [];
    const fontSize = fitSingleLine(font, placement.id, text, placement.width);
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize, { descender: true });
    return [
      {
        ...placement,
        text,
        fontSize,
        textBox: {
          pageIndex: placement.pageIndex,
          x0: placement.x,
          y0: placement.y - 1.5,
          x1: placement.x + textWidth,
          y1: placement.y - 1.5 + textHeight,
        },
      },
    ];
  });
}

export function findBUnitLayoutViolations(
  measured: readonly MeasuredPlacement[],
  protectedRegions: readonly ProtectedRegion[] = B_UNIT_PROTECTED_REGIONS,
): LayoutViolation[] {
  const violations: LayoutViolation[] = [];
  for (const placement of measured) {
    const safe = placement.safeBox;
    const text = placement.textBox;
    if (
      text.x0 < safe.x0 ||
      text.x1 > safe.x1 ||
      text.y0 < safe.y0 ||
      text.y1 > safe.y1
    ) {
      violations.push({
        placementId: placement.id,
        reason: "outside-safe-box",
      });
    }
    for (const protectedRegion of protectedRegions) {
      if (overlaps(text, protectedRegion)) {
        violations.push({
          placementId: placement.id,
          protectedId: protectedRegion.id,
          reason: "fixed-label-collision",
        });
      }
    }
  }
  for (let left = 0; left < measured.length; left += 1) {
    for (let right = left + 1; right < measured.length; right += 1) {
      const a = measured[left]!;
      const b = measured[right]!;
      if (overlaps(a.textBox, b.textBox)) {
        violations.push({
          placementId: a.id,
          protectedId: b.id,
          reason: "placement-collision",
        });
      }
    }
  }
  return violations;
}

export function bUnitFirstShiftCoverageKeys(): Set<string> {
  return new Set(placements.flatMap((placement) => placement.coverageKeys));
}

export function boxesOverlap(a: LayoutBox, b: LayoutBox): boolean {
  return overlaps(a, b, 0);
}
