import type { HousingLogDocumentRecord } from "../documentSpike/types.ts";

export type ExcelCellWrite = {
  address: string;
  coverageKeys: readonly string[];
  value: (record: HousingLogDocumentRecord) => string;
};

const stored = (record: HousingLogDocumentRecord, key: string): string =>
  String(record.values[key] ?? "").trim();

const write = (
  address: string,
  coverageKeys: readonly string[],
  value: (record: HousingLogDocumentRecord) => string,
): ExcelCellWrite => ({ address, coverageKeys, value });

const direct = (address: string, key: string): ExcelCellWrite =>
  write(address, [key], (record) => stored(record, key));

const countTotal = (
  record: HousingLogDocumentRecord,
  countKey: string,
): string => {
  const storedTotal = stored(record, `counts.${countKey}.total`);
  if (storedTotal) return storedTotal;
  return String(
    ["Wing One", "Wing Two", "Wing Three"].reduce(
      (sum, component) =>
        sum +
        Number(
          record.values[`counts.${countKey}.components.${component}`] ?? 0,
        ),
      0,
    ),
  );
};

function formalCountWrites(options: {
  key: string;
  title: string;
  timeAddress: string;
  formalAddress: string;
  wingAddress: string;
  conductedAddress: string;
  initialsAddress: string;
}): ExcelCellWrite[] {
  const prefix = `counts.${options.key}`;
  return [
    direct(options.timeAddress, `${prefix}.countTime`),
    write(
      options.formalAddress,
      [`${prefix}.recallTime`, `${prefix}.countTime`, `${prefix}.clearTime`],
      (record) =>
        `Formal / ${options.title} count Recall time ${stored(record, `${prefix}.recallTime`)} ` +
        `Count time ${stored(record, `${prefix}.countTime`)} ` +
        `Count clear ${stored(record, `${prefix}.clearTime`)}`,
    ),
    write(
      options.wingAddress,
      [
        `${prefix}.components.Wing One`,
        `${prefix}.components.Wing Two`,
        `${prefix}.components.Wing Three`,
      ],
      (record) =>
        `Wing One ${stored(record, `${prefix}.components.Wing One`)} ` +
        `Wing Two ${stored(record, `${prefix}.components.Wing Two`)} ` +
        `Wing Three ${stored(record, `${prefix}.components.Wing Three`)} ` +
        `Total ${countTotal(record, options.key)}`,
    ),
    write(
      options.conductedAddress,
      [`${prefix}.conductedBy`],
      (record) =>
        `less than twice per shift, conducted by Sergeant / Officer ${stored(record, `${prefix}.conductedBy`)}.`,
    ),
    direct(options.initialsAddress, `${prefix}.initials`),
  ];
}

const staffWrites = [1, 2, 3].flatMap((staff, index): ExcelCellWrite[] => {
  const dutyRow = 4 + index * 2;
  const equipmentRow = dutyRow + 1;
  const title = staff === 1 ? "Sergeant" : "Officer";
  return [
    write(
      `A${dutyRow}`,
      [`staff.${staff}.assumedAt`, `staff.${staff}.relievedAt`],
      (record) =>
        `${stored(record, `staff.${staff}.assumedAt`)} / ${stored(record, `staff.${staff}.relievedAt`)}`,
    ),
    write(
      `B${dutyRow}`,
      [`staff.${staff}.name`, `staff.${staff}.keyRing`, `staff.${staff}.radio`],
      (record) =>
        `${title} ${stored(record, `staff.${staff}.name`)} on duty with the following equipment: ` +
        `Keyring ${stored(record, `staff.${staff}.keyRing`)}, Radio ${stored(record, `staff.${staff}.radio`)},`,
    ),
    write(
      `B${equipmentRow}`,
      [
        `staff.${staff}.chemicalAgent`,
        `staff.${staff}.chemicalAgentSeal`,
        `staff.${staff}.bodyAlarm`,
        `staff.${staff}.cuffsCase`,
      ],
      (record) =>
        `Chemical agent pouch ${stored(record, `staff.${staff}.chemicalAgent`)} ` +
        `seal ${stored(record, `staff.${staff}.chemicalAgentSeal`)} ` +
        `Body alarm ${stored(record, `staff.${staff}.bodyAlarm`)} ` +
        `Cuffs & case ${stored(record, `staff.${staff}.cuffsCase`)}`,
    ),
  ];
});

export const B_UNIT_FIRST_SHIFT_EXCEL_WRITES: readonly ExcelCellWrite[] = [
  write("C1", [], (record) => `DATE ${record.logDate}`),
  write("C51", [], (record) => `DATE ${record.logDate}`),
  write("C100", [], (record) => `DATE ${record.logDate}`),
  ...staffWrites,
  direct("A10", "activities.preaAnnouncement.time"),
  write(
    "B10",
    ["activities.preaAnnouncement.performedBy"],
    (record) =>
      `In compliance with PREA procedures, Sergeant / Officer ${stored(record, "activities.preaAnnouncement.performedBy")} made an announcement in all`,
  ),
  direct("D11", "activities.preaAnnouncement.initials"),
  direct("A12", "activities.cameraVerification.time"),
  write(
    "B12",
    ["activities.cameraVerification.performedBy"],
    (record) =>
      `Sergeant / Officer ${stored(record, "activities.cameraVerification.performedBy")} verifies the housing unit video cameras appear to be operational.`,
  ),
  direct("D12", "activities.cameraVerification.initials"),
  direct("A13", "counts.beginning.countTime"),
  write(
    "B13",
    [
      "counts.beginning.components.Wing One",
      "counts.beginning.components.Wing Two",
      "counts.beginning.components.Wing Three",
    ],
    (record) =>
      `Beginning inmate count Wing One ${stored(record, "counts.beginning.components.Wing One")} ` +
      `Wing Two ${stored(record, "counts.beginning.components.Wing Two")} ` +
      `Wing Three ${stored(record, "counts.beginning.components.Wing Three")} ` +
      `Total ${countTotal(record, "beginning")}`,
  ),
  direct("D13", "counts.beginning.initials"),
  write(
    "B14",
    Array.from(
      { length: 8 },
      (_, index) => `equipment.acceptedKeyRings.${index + 1}`,
    ),
    (record) =>
      `Accepting the following key ring numbers: ${Array.from({ length: 8 }, (_, index) => stored(record, `equipment.acceptedKeyRings.${index + 1}`)).join("  ")}`,
  ),
  write(
    "B15",
    Array.from({ length: 3 }, (_, index) => `equipment.radios.${index + 1}`),
    (record) =>
      `Radios accounted for and tested to ensure they are operational ${Array.from({ length: 3 }, (_, index) => stored(record, `equipment.radios.${index + 1}`)).join("  ")} and their status has been`,
  ),
  write(
    "B16",
    ["equipment.radioStatusReportedBy"],
    (record) =>
      `reported to the main control room by Sergeant / Officer ${stored(record, "equipment.radioStatusReportedBy")}`,
  ),
  write(
    "B17",
    ["equipment.cellExtraction"],
    (record) =>
      `All Cell Extraction Team equipment has been inspected and accounted for by Officer/Sergeant ${stored(record, "equipment.cellExtraction")}.`,
  ),
  write(
    "B18",
    [
      "equipment.radioChargingStation",
      "equipment.extraBatteries",
      "equipment.inspectionMirror",
      "equipment.cellUnlockingBars",
    ],
    (record) =>
      `Radio charging station ${stored(record, "equipment.radioChargingStation")} ` +
      `with ${stored(record, "equipment.extraBatteries")} extra batteries, ` +
      `Inspection mirror ${stored(record, "equipment.inspectionMirror")}, ` +
      `${stored(record, "equipment.cellUnlockingBars")} Cell unlocking bars,`,
  ),
  write(
    "B19",
    [
      "equipment.ligatureCutterSeal",
      ...Array.from(
        { length: 3 },
        (_, index) => `equipment.bodyAlarms.${index + 1}`,
      ),
      ...Array.from(
        { length: 3 },
        (_, index) => `equipment.cuffs.${index + 1}`,
      ),
    ],
    (record) =>
      `one pair of Ligature cutters with seal ${stored(record, "equipment.ligatureCutterSeal")}, ` +
      `Body alarms ${Array.from({ length: 3 }, (_, index) => stored(record, `equipment.bodyAlarms.${index + 1}`)).join("  ")}, ` +
      `Cuffs ${Array.from({ length: 3 }, (_, index) => stored(record, `equipment.cuffs.${index + 1}`)).join("  ")},`,
  ),
  write(
    "B20",
    [
      ...Array.from(
        { length: 3 },
        (_, index) => `equipment.cuffCases.${index + 1}`,
      ),
      "equipment.legRestraints",
      "equipment.backboards",
    ],
    (record) =>
      `Cuff cases ${Array.from({ length: 3 }, (_, index) => stored(record, `equipment.cuffCases.${index + 1}`)).join("  ")}, ` +
      `Leg restraints ${stored(record, "equipment.legRestraints")} and ${stored(record, "equipment.backboards")} backboard are accounted for and in serviceable`,
  ),
  write(
    "B21",
    ["equipment.passesAccounted", "equipment.unaccountedPasses"],
    (record) =>
      `condition. Off-going shift advised the status of all passes ${stored(record, "equipment.passesAccounted")}, ` +
      `any passes unaccounted for ${stored(record, "equipment.unaccountedPasses")},`,
  ),
  write(
    "B22",
    ["equipment.incidentReport"],
    (record) =>
      `Shift Supervisor notified, and an incident report submitted ${stored(record, "equipment.incidentReport")}`,
  ),
  write(
    "B23",
    ["equipment.firstAidSeal", "equipment.ppeKit"],
    (record) =>
      `First Aid Kit accounted for and secured with seal ${stored(record, "equipment.firstAidSeal")}, ` +
      `PPE kit present ${stored(record, "equipment.ppeKit")}, One-way breathing mask`,
  ),
  write(
    "B24",
    [
      "equipment.breathingMask",
      "equipment.fireExtinguishers",
      "equipment.fireAlarm",
    ],
    (record) =>
      `in first aid kit ${stored(record, "equipment.breathingMask")} ` +
      `Fire extinguishers present / fully charged ${stored(record, "equipment.fireExtinguishers")} ` +
      `Fire alarm operational ${stored(record, "equipment.fireAlarm")}`,
  ),
  write(
    "B25",
    ["equipment.inventoryComplete"],
    (record) =>
      `Equipment inventory conducted, all assigned equipment accounted for and in serviceable condition ${stored(record, "equipment.inventoryComplete")}`,
  ),
  write(
    "B26",
    ["equipment.postOrders"],
    (record) =>
      `Post orders read and signed by all Officers assigned ${stored(record, "equipment.postOrders")}`,
  ),
  write(
    "B27",
    ["medication.inventoriedBy"],
    (record) =>
      `Over the counter medication inventoried by Sergeant / Officer ${stored(record, "medication.inventoriedBy")} (Count number of packs)`,
  ),
  write(
    "B28",
    ["medication.acetaminophen", "medication.alamag", "medication.ibuprofen"],
    (record) =>
      `Acetaminophen ${stored(record, "medication.acetaminophen")} ` +
      `Alamag ${stored(record, "medication.alamag")} ` +
      `Ibuprofen ${stored(record, "medication.ibuprofen")} and notate totals on medical form.`,
  ),
  direct("A29", "activities.lockInspection.time"),
  write(
    "B32",
    ["activities.lockInspection.performedBy"],
    (record) =>
      `occupancy changes was conducted by Sergeant / Officer ${stored(record, "activities.lockInspection.performedBy")}, ` +
      `complete at ${stored(record, "activities.lockInspection.time")} AM / PM.`,
  ),
  direct("D32", "activities.lockInspection.initials"),
  direct("A33", "activities.externalInspection.time"),
  write(
    "B36",
    ["activities.externalInspection.performedBy"],
    (record) =>
      `tampering noted by Sergeant / Officer ${stored(record, "activities.externalInspection.performedBy")}, ` +
      `complete at ${stored(record, "activities.externalInspection.time")} AM / PM.`,
  ),
  direct("D36", "activities.externalInspection.initials"),
  ...formalCountWrites({
    key: "midnight",
    title: "Midnight",
    timeAddress: "A37",
    formalAddress: "B37",
    wingAddress: "B38",
    conductedAddress: "B42",
    initialsAddress: "D42",
  }),
  ...formalCountWrites({
    key: "early-morning",
    title: "Early morning",
    timeAddress: "A43",
    formalAddress: "B43",
    wingAddress: "B44",
    conductedAddress: "B53",
    initialsAddress: "D53",
  }),
  ...formalCountWrites({
    key: "pre-turnout",
    // Preserve the official source workbook wording exactly, including its typo.
    title: "Pre-turmout",
    timeAddress: "A54",
    formalAddress: "B54",
    wingAddress: "B55",
    conductedAddress: "B59",
    initialsAddress: "D59",
  }),
  ...formalCountWrites({
    key: "morning",
    title: "Morning",
    timeAddress: "A60",
    formalAddress: "B60",
    wingAddress: "B61",
    conductedAddress: "B65",
    initialsAddress: "D65",
  }),
  direct("A66", "activities.intercom.time"),
  direct("D69", "activities.intercom.initials"),
  ...Array.from({ length: 17 }, (_, index): ExcelCellWrite[] => {
    const number = index + 1;
    const row = 70 + index;
    return [
      direct(`A${row}`, `securityChecks.${number}.time`),
      write(
        `B${row}`,
        [`securityChecks.${number}.performedBy`],
        (record) =>
          `Security check conducted in all areas of the housing unit by Sergeant / Officer ${stored(record, `securityChecks.${number}.performedBy`)}.`,
      ),
      direct(`D${row}`, `securityChecks.${number}.initials`),
    ];
  }).flat(),
  direct("A87", "activities.unannouncedInspection.time"),
  write(
    "B87",
    ["activities.unannouncedInspection.supervisor"],
    (record) =>
      `Shift Supervisor ${stored(record, "activities.unannouncedInspection.supervisor")} conducts an unannounced security inspection of the housing unit.`,
  ),
  direct("D87", "activities.unannouncedInspection.initials"),
];

export function bUnitFirstShiftExcelCoverageKeys(): Set<string> {
  return new Set(
    B_UNIT_FIRST_SHIFT_EXCEL_WRITES.flatMap((cell) => cell.coverageKeys),
  );
}
