import type { HousingLogConfig } from "@workspace/housing-log";
import type { HousingLogDocumentRecord } from "../documentSpike/types.ts";

export type ExcelCellWrite = {
  address: string;
  coverageKeys: readonly string[];
  value: (record: HousingLogDocumentRecord) => string;
};

export type OfficialWorksheetLayout = {
  writes: ExcelCellWrite[];
  pageStarts: number[];
  pageEnds: number[];
  headerRows: number[];
  supervisorSignatureRows: number[];
  officerSignatureRows: number[];
  officialEventRows: number[];
  continuationSourceStart: number;
  continuationSourceEnd: number;
  continuationEventRows: number[];
  continuationSupervisorRow: number;
  continuationOfficerRow: number;
};

type RowInfo = { row: number; cells: Map<string, string> };

const stored = (record: HousingLogDocumentRecord, key: string): string =>
  String(record.values[key] ?? "").trim();

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((text) => unescapeXml(text[1]!))
      .join(""),
  );
}

function rowsFromXml(sheetXml: string, sharedStringsXml: string): RowInfo[] {
  const strings = sharedStrings(sharedStringsXml);
  return [...sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)].map(
    (rowMatch) => {
      const row = Number(rowMatch[1]!.match(/\br="(\d+)"/)?.[1]);
      const cells = new Map<string, string>();
      for (const cellMatch of rowMatch[2]!.matchAll(
        /<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g,
      )) {
        const attributes = cellMatch[1] ?? cellMatch[2] ?? "";
        const address = attributes.match(/\br="([^"]+)"/)?.[1];
        if (!address) continue;
        const type = attributes.match(/\bt="([^"]+)"/)?.[1];
        const body = cellMatch[3] ?? "";
        const inline = body.match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1];
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = inline === undefined ? (raw ?? "") : unescapeXml(inline);
        if (type === "s" && raw !== undefined)
          value = strings[Number(raw)] ?? "";
        cells.set(address, value);
      }
      return { row, cells };
    },
  );
}

function blankValues(template: string, values: readonly string[]): string {
  let index = 0;
  const normalized = template.replace(/_+[A-Za-z0-9./-]+_+/g, "_____");
  const output = normalized.replace(
    /_{2,}/g,
    (placeholder) => values[index++] ?? placeholder,
  );
  const remaining = values.slice(index).filter(Boolean);
  return remaining.length ? `${output} [${remaining.join(" | ")}]` : output;
}

/**
 * Every canonical time value is stored and rendered in unambiguous 24-hour
 * HH:MM form, so an "AM / PM" (or "AM/PM") choice immediately following one
 * in official template wording is always resolvable, never a genuine open
 * question for the officer — leaving both words in a generated worksheet
 * reads as an unfinished form. Resolves it to the single correct word.
 */
export function resolveAmPmPlaceholders(text: string): string {
  return text.replace(
    /\b([01]?\d|2[0-3]):([0-5]\d)(\s*)AM\s*\/\s*PM\b/gi,
    (_match, hours: string, minutes: string, spacer: string) =>
      `${hours}:${minutes}${spacer}${Number(hours) >= 12 ? "PM" : "AM"}`,
  );
}

const write = (
  address: string,
  coverageKeys: readonly string[],
  value: (record: HousingLogDocumentRecord) => string,
): ExcelCellWrite => ({ address, coverageKeys, value });

function templateWrite(
  row: RowInfo,
  keys: readonly string[],
  values: (record: HousingLogDocumentRecord) => readonly string[],
): ExcelCellWrite {
  const source = row.cells.get(`B${row.row}`) ?? "";
  return write(`B${row.row}`, keys, (record) =>
    blankValues(source, values(record)),
  );
}

function direct(address: string, key: string): ExcelCellWrite {
  return write(address, [key], (record) => stored(record, key));
}

function countTotal(
  record: HousingLogDocumentRecord,
  key: string,
  components: readonly string[],
): string {
  return String(
    components.reduce(
      (sum, component) =>
        sum +
        Number(record.values[`counts.${key}.components.${component}`] ?? 0),
      0,
    ),
  );
}

const ACTIVITY_PATTERNS: Record<string, RegExp> = {
  preaAnnouncement: /PREA procedures/i,
  cameraVerification: /video cameras appear/i,
  lockInspection: /Daily lock & locking systems/i,
  externalInspection: /An external safety and security inspection/i,
  laundryReleased: /Laundry orderly released/i,
  caustics: /Caustics distributed/i,
  intercom: /intercom system is placed/i,
  laundryReturned: /Laundry returned to inmates/i,
  libraryAc: /escorts library clerk into AC wing/i,
  libraryDc: /escorts library clerk into DC wing/i,
  libraryDeparture: /Library clerk departs/i,
  adminRecStart: /Administrative confinement recreation begins/i,
  adminRecComplete: /Administrative confinement recreation complete/i,
  disciplinaryRecStart: /Disciplinary confinement recreation begins/i,
  disciplinaryRecComplete: /Disciplinary confinement recreation complete/i,
  mail: /Mail distributed/i,
  healthComfort: /Health\/comfort items issued/i,
  itemsDistributed: /^Items distributed/i,
  laundryExchange: /Dirty laundry picked up/i,
  showersAcStart: /Showers\/shaves\/haircuts begin in AC wing/i,
  showersAcComplete: /Showers\/shaves\/haircuts completed in AC wing/i,
  showersDcStart: /Showers\/shaves\/haircuts begin in DC wing/i,
  showersDcFollowup: /Showers\/shaves\/haircuts completed in AC wing/i,
  unannouncedInspection: /conducts an unannounced security inspection/i,
};

function rowText(row: RowInfo): string {
  return row.cells.get(`B${row.row}`) ?? "";
}

function findRow(
  rows: readonly RowInfo[],
  pattern: RegExp,
  context: string,
): RowInfo {
  const row = rows.find((candidate) => pattern.test(rowText(candidate)));
  if (!row) throw new Error(`Official worksheet is missing ${context}.`);
  return row;
}

function findSpanEnd(
  rows: readonly RowInfo[],
  start: number,
  key: string,
): number {
  const endings: Record<string, RegExp> = {
    preaAnnouncement: /female staff/i,
    lockInspection: /occupancy changes/i,
    externalInspection: /tampering noted/i,
    intercom: /cell doors are secured\.?/i,
  };
  const ending = endings[key];
  if (!ending) return start;
  const endingRow =
    rows.find(
      (row) =>
        row.row >= start && row.row <= start + 5 && ending.test(rowText(row)),
    )?.row ?? start;
  // The row matching the ending phrase doesn't always also carry this
  // activity's fill-in blanks — some official worksheets wrap the same
  // sentence across one extra row depending on shift wording length (e.g.
  // 2_CDEFG's lockInspection puts "occupancy changes was conducted by" on
  // one row and the "Sergeant / Officer ____, complete at ____" blanks on
  // the next). Only reach past the ending row when the whole span up to
  // it has no blanks at all — if a blank already exists in-span (as for
  // preaAnnouncement, whose blank is on its very first row), extending
  // further would just make the reverse fill-row search latch onto some
  // unrelated later row's underscores instead.
  const spanHasBlanks = rows.some(
    (row) =>
      row.row >= start && row.row <= endingRow && /_{2,}/.test(rowText(row)),
  );
  if (!spanHasBlanks) {
    const nextRow = rows.find((row) => row.row === endingRow + 1);
    if (nextRow && /_{2,}/.test(rowText(nextRow))) return nextRow.row;
  }
  return endingRow;
}

function activityWrites(
  rows: readonly RowInfo[],
  config: HousingLogConfig,
): ExcelCellWrite[] {
  return config.activities.flatMap((activity): ExcelCellWrite[] => {
    const pattern = ACTIVITY_PATTERNS[activity.key];
    if (!pattern)
      throw new Error(`No official activity matcher for ${activity.key}.`);
    let candidates = rows.filter((row) => pattern.test(rowText(row)));
    if (activity.key === "showersDcFollowup") candidates = candidates.slice(-1);
    else candidates = candidates.slice(0, 1);
    const start = candidates[0];
    if (!start)
      throw new Error(
        `Official worksheet is missing activity ${activity.key}.`,
      );
    const end = findSpanEnd(rows, start.row, activity.key);
    const timeKey = `activities.${activity.key}.time`;
    const initialsKey = `activities.${activity.key}.initials`;
    const detailKeys = activity.detailFields
      .map((field) => field.key)
      .filter((key) => key !== timeKey && key !== initialsKey);
    const result: ExcelCellWrite[] = [direct(`A${start.row}`, timeKey)];
    const spanRows = rows.filter(
      (row) => row.row >= start.row && row.row <= end,
    );
    const fillRow =
      [...spanRows].reverse().find((row) => /_{2,}/.test(rowText(row))) ??
      start;
    if (detailKeys.length) {
      const source = rowText(fillRow);
      result.push(
        write(`B${fillRow.row}`, detailKeys, (record) => {
          const detail = stored(record, detailKeys[0]!);
          switch (activity.key) {
            case "preaAnnouncement":
              return `In compliance with PREA procedures, Sergeant / Officer ${detail} made an announcement in all`;
            case "cameraVerification":
              return `Sergeant / Officer ${detail} verifies the housing unit video cameras appear to be operational.`;
            case "lockInspection":
              return `occupancy changes was conducted by Sergeant / Officer ${detail}, complete at ${stored(record, timeKey)} AM / PM.`;
            case "externalInspection":
              return `tampering noted by Sergeant / Officer ${detail}, complete at ${stored(record, timeKey)} AM / PM.`;
            case "libraryAc":
              return `Sergeant / Officer ${detail} escorts library clerk into AC wing.`;
            case "libraryDc":
              return `Sergeant / Officer ${detail} escorts library clerk into DC wing.`;
            case "adminRecStart":
              return `Administrative confinement recreation begins, supervised by Sergeant / Officer ${detail}.`;
            case "disciplinaryRecStart":
              return `Disciplinary confinement recreation begins, supervised by Sergeant / Officer ${detail}.`;
            case "mail":
              return `Mail distributed by Sergeant / Officer ${detail}.`;
            case "healthComfort":
              return `Health/comfort items issued by Sergeant / Officer ${detail}.`;
            case "itemsDistributed":
              return `Items distributed ${detail}`;
            case "unannouncedInspection":
              return `Shift Supervisor ${detail} conducts an unannounced security inspection of the housing unit.`;
            default:
              return blankValues(source, [detail]);
          }
        }),
      );
    } else if (/_{2,}/.test(rowText(fillRow))) {
      result.push(
        write(`B${fillRow.row}`, [], (record) =>
          blankValues(rowText(fillRow), [stored(record, timeKey)]),
        ),
      );
    }
    result.push(direct(`D${end}`, initialsKey));
    return result;
  });
}

function staffWrites(
  rows: readonly RowInfo[],
  config: HousingLogConfig,
): ExcelCellWrite[] {
  const staffCount =
    config.sections.find((section) => section.key === "staff")!.fields.length /
    9;
  const dutyRows = rows.filter((row) =>
    /on duty with the following equipment/i.test(rowText(row)),
  );
  if (dutyRows.length !== staffCount)
    throw new Error(
      `Official worksheet has ${dutyRows.length} staff rows; expected ${staffCount}. Sample: ${rows
        .slice(0, 10)
        .map((row) => `${row.row}:${rowText(row)}`)
        .join(" || ")}`,
    );
  return dutyRows.flatMap((row, index): ExcelCellWrite[] => {
    const number = index + 1;
    const prefix = `staff.${number}`;
    const equipmentRow = rows.find(
      (candidate) => candidate.row === row.row + 1,
    )!;
    const sourceDuty = rowText(row);
    const position =
      sourceDuty.match(
        /^(Sergeant(?:\s*\/\s*Officer)?|Officer(?:\s+\d+)?)/i,
      )?.[1] ?? (number === 1 ? "Sergeant" : "Officer");
    return [
      write(
        `A${row.row}`,
        [`${prefix}.assumedAt`, `${prefix}.relievedAt`],
        (record) =>
          `${stored(record, `${prefix}.assumedAt`)} / ${stored(record, `${prefix}.relievedAt`)}`,
      ),
      write(
        `B${row.row}`,
        [`${prefix}.name`, `${prefix}.keyRing`, `${prefix}.radio`],
        (record) =>
          `${position} ${stored(record, `${prefix}.name`)} on duty with the following equipment: ` +
          `Keyring ${stored(record, `${prefix}.keyRing`)}, Radio ${stored(record, `${prefix}.radio`)},`,
      ),
      write(
        `B${equipmentRow.row}`,
        [
          `${prefix}.chemicalAgent`,
          `${prefix}.chemicalAgentSeal`,
          `${prefix}.bodyAlarm`,
          `${prefix}.cuffsCase`,
        ],
        (record) =>
          `Chemical agent pouch ${stored(record, `${prefix}.chemicalAgent`)} ` +
          `seal ${stored(record, `${prefix}.chemicalAgentSeal`)} ` +
          `Body alarm ${stored(record, `${prefix}.bodyAlarm`)} ` +
          `Cuffs & case ${stored(record, `${prefix}.cuffsCase`)}`,
      ),
    ];
  });
}

function equipmentWrites(
  rows: readonly RowInfo[],
  config: HousingLogConfig,
): ExcelCellWrite[] {
  const result: ExcelCellWrite[] = [];
  const add = (
    pattern: RegExp,
    keys: string[],
    value: (record: HousingLogDocumentRecord) => string,
  ) => {
    const row = findRow(rows, pattern, `equipment row ${pattern}`);
    result.push(write(`B${row.row}`, keys, value));
  };
  if (config.housingUnit === "Infirmary") {
    add(
      /Key ring .*Body alarm .*Cuff/i,
      [
        "equipment.infirmaryKeyRing",
        "equipment.infirmaryBodyAlarm",
        "equipment.infirmaryCuff",
        "equipment.infirmaryCuffCase",
      ],
      (record) =>
        `Key ring ${stored(record, "equipment.infirmaryKeyRing")}, ` +
        `Body alarm ${stored(record, "equipment.infirmaryBodyAlarm")}, ` +
        `Cuff ${stored(record, "equipment.infirmaryCuff")}, ` +
        `Cuff case ${stored(record, "equipment.infirmaryCuffCase")} are accounted for and in serviceable condition.`,
    );
    add(
      /Radio accounted for and tested/i,
      ["equipment.infirmaryRadio"],
      (record) =>
        `Radio accounted for and tested to ensure they are operational ${stored(record, "equipment.infirmaryRadio")} and the status has been reported to the`,
    );
    add(
      /main control room by/i,
      ["equipment.radioStatusReportedBy"],
      (record) =>
        `main control room by Sergeant / Officer ${stored(record, "equipment.radioStatusReportedBy")}`,
    );
  } else {
    const keyRingKeys = Array.from(
      { length: 8 },
      (_, i) => `equipment.acceptedKeyRings.${i + 1}`,
    );
    add(
      /Accepting the following key ring numbers/i,
      keyRingKeys,
      (record) =>
        `Accepting the following key ring numbers: ${keyRingKeys.map((key) => stored(record, key)).join(" ")}`,
    );
    const radioKeys = Array.from(
      { length: 3 },
      (_, i) => `equipment.radios.${i + 1}`,
    );
    add(
      /Radios accounted for and tested/i,
      radioKeys,
      (record) =>
        `Radios accounted for and tested to ensure they are operational ${radioKeys.map((key) => stored(record, key)).join(" ")} and their status has been`,
    );
    add(
      /reported to the main control room by/i,
      ["equipment.radioStatusReportedBy"],
      (record) =>
        `reported to the main control room by Sergeant / Officer ${stored(record, "equipment.radioStatusReportedBy")}`,
    );
    if (config.housingUnit === "B")
      add(
        /Cell Extraction Team equipment/i,
        ["equipment.cellExtraction"],
        (record) =>
          `All Cell Extraction Team equipment has been inspected and accounted for by Officer/Sergeant ${stored(record, "equipment.cellExtraction")}.`,
      );
    add(
      /Radio charging station/i,
      [
        "equipment.radioChargingStation",
        "equipment.extraBatteries",
        "equipment.inspectionMirror",
        "equipment.cellUnlockingBars",
      ],
      (record) =>
        `Radio charging station ${stored(record, "equipment.radioChargingStation")} with ${stored(record, "equipment.extraBatteries")} extra batteries, ` +
        `Inspection mirror ${stored(record, "equipment.inspectionMirror")}, ${stored(record, "equipment.cellUnlockingBars")} Cell unlocking bars,`,
    );
    const alarmKeys = Array.from(
      { length: 3 },
      (_, i) => `equipment.bodyAlarms.${i + 1}`,
    );
    const cuffKeys = Array.from(
      { length: 3 },
      (_, i) => `equipment.cuffs.${i + 1}`,
    );
    add(
      /Ligature cutters/i,
      ["equipment.ligatureCutterSeal", ...alarmKeys, ...cuffKeys],
      (record) =>
        `one pair of Ligature cutters with seal ${stored(record, "equipment.ligatureCutterSeal")}, ` +
        `Body alarms ${alarmKeys.map((key) => stored(record, key)).join(" ")}, Cuffs ${cuffKeys.map((key) => stored(record, key)).join(" ")},`,
    );
    const caseKeys = Array.from(
      { length: 3 },
      (_, i) => `equipment.cuffCases.${i + 1}`,
    );
    add(
      /Cuff cases/i,
      [...caseKeys, "equipment.legRestraints", "equipment.backboards"],
      (record) =>
        `Cuff cases ${caseKeys.map((key) => stored(record, key)).join(" ")}, ` +
        `Leg restraints ${stored(record, "equipment.legRestraints")} and ${stored(record, "equipment.backboards")} backboard are accounted for and in serviceable`,
    );
    add(
      /Off-going shift advised the status of all passes/i,
      ["equipment.passesAccounted", "equipment.unaccountedPasses"],
      (record) =>
        `condition. Off-going shift advised the status of all passes ${stored(record, "equipment.passesAccounted")}, ` +
        `any passes unaccounted for ${stored(record, "equipment.unaccountedPasses")},`,
    );
    add(
      /incident report submitted/i,
      ["equipment.incidentReport"],
      (record) =>
        `Shift Supervisor notified, and an incident report submitted ${stored(record, "equipment.incidentReport")}`,
    );
  }
  add(
    /First Aid Kit accounted/i,
    ["equipment.firstAidSeal", "equipment.ppeKit"],
    (record) =>
      `First Aid Kit accounted for and secured with seal ${stored(record, "equipment.firstAidSeal")}, ` +
      `PPE kit present ${stored(record, "equipment.ppeKit")}, One-way breathing mask`,
  );
  add(
    /in first aid kit/i,
    [
      "equipment.breathingMask",
      "equipment.fireExtinguishers",
      "equipment.fireAlarm",
    ],
    (record) =>
      `in first aid kit ${stored(record, "equipment.breathingMask")} ` +
      `Fire extinguishers present / fully charged ${stored(record, "equipment.fireExtinguishers")} ` +
      `Fire alarm operational ${stored(record, "equipment.fireAlarm")}`,
  );
  add(
    /Equipment inventory conducted/i,
    ["equipment.inventoryComplete"],
    (record) =>
      `Equipment inventory conducted, all assigned equipment accounted for and in serviceable condition ${stored(record, "equipment.inventoryComplete")}`,
  );
  add(
    /Post orders read and signed/i,
    ["equipment.postOrders"],
    (record) =>
      `Post orders read and signed by all Officers assigned ${stored(record, "equipment.postOrders")}`,
  );
  if (config.housingUnit !== "Infirmary") {
    add(
      /medication inventoried by/i,
      ["medication.inventoriedBy"],
      (record) =>
        `Over the counter medication inventoried by Sergeant / Officer ${stored(record, "medication.inventoriedBy")} (Count number of packs)`,
    );
    add(
      /Acetaminophen/i,
      ["medication.acetaminophen", "medication.alamag", "medication.ibuprofen"],
      (record) =>
        `Acetaminophen ${stored(record, "medication.acetaminophen")} ` +
        `Alamag ${stored(record, "medication.alamag")} ` +
        `Ibuprofen ${stored(record, "medication.ibuprofen")} and notate totals on medical form.`,
    );
  }
  return result;
}

function countWrites(
  rows: readonly RowInfo[],
  config: HousingLogConfig,
): ExcelCellWrite[] {
  return config.counts.flatMap((count): ExcelCellWrite[] => {
    const prefix = `counts.${count.key}`;
    const countTitle = count.label.replace(/ count$/i, "");
    const labelPattern = count.isBeginning
      ? /Beginning inmate count/i
      : count.key === "pre-turnout"
        ? /^(?:Formal\s*\/\s*)?Pre-tu(?:rn|rm)out count/i
        : new RegExp(
            `^(?:Formal\\s*\\/\\s*)?${escapeRegExp(countTitle)} count`,
            "i",
          );
    const row = findRow(rows, labelPattern, `count ${count.key}`);
    const componentKeys = count.components.map(
      (component) => `${prefix}.components.${component}`,
    );
    if (count.isBeginning)
      return [
        direct(`A${row.row}`, `${prefix}.countTime`),
        write(
          `B${row.row}`,
          componentKeys,
          (record) =>
            `Beginning inmate count: ${count.components
              .map(
                (component) =>
                  `${component} ${stored(record, `${prefix}.components.${component}`)}`,
              )
              .join(
                " ",
              )} Total ${countTotal(record, count.key, count.components)}`,
        ),
        direct(`D${row.row}`, `${prefix}.initials`),
      ];
    const componentRow = rows.find(
      (candidate) => candidate.row === row.row + 1,
    )!;
    const conductedRow = rows.find(
      (candidate) =>
        candidate.row > componentRow.row &&
        candidate.row <= componentRow.row + 15 &&
        /conducted by/i.test(rowText(candidate)),
    );
    if (!conductedRow)
      throw new Error(
        `Official worksheet is missing count attestation ${count.key}.`,
      );
    const sourceCount = rowText(row);
    const title =
      sourceCount.match(/^(.*?Recall time)/i)?.[1] ??
      `${count.label} Recall time`;
    const sourceComponents = rowText(componentRow);
    const attestationTail = sourceComponents.match(
      /(Count,\s*security[\s\S]*|Security,\s*safety[\s\S]*)/i,
    )?.[1];
    const sourceConducted = rowText(conductedRow);
    const conductedPrefix =
      sourceConducted.match(/^(.*?conducted by)/i)?.[1] ?? "conducted by";
    const conductor =
      count.conductedByLabel?.replace(/^Conducted by\s*/i, "") ??
      "Sergeant / Officer";
    return [
      direct(`A${row.row}`, `${prefix}.countTime`),
      write(
        `B${row.row}`,
        [`${prefix}.recallTime`, `${prefix}.countTime`, `${prefix}.clearTime`],
        (record) =>
          `${title} ${stored(record, `${prefix}.recallTime`)} Count time ${stored(record, `${prefix}.countTime`)} Count clear ${stored(record, `${prefix}.clearTime`)}`,
      ),
      write(
        `B${componentRow.row}`,
        componentKeys,
        (record) =>
          `${count.components
            .map(
              (component) =>
                `${component} ${stored(record, `${prefix}.components.${component}`)}`,
            )
            .join(
              " ",
            )} Total ${countTotal(record, count.key, count.components)}${attestationTail ? ` ${attestationTail}` : ""}`,
      ),
      write(
        `B${conductedRow.row}`,
        [`${prefix}.conductedBy`],
        (record) =>
          `${conductedPrefix} ${conductor} ${stored(record, `${prefix}.conductedBy`)}.`,
      ),
      direct(`D${conductedRow.row}`, `${prefix}.initials`),
    ];
  });
}

function securityWrites(
  rows: readonly RowInfo[],
  config: HousingLogConfig,
): ExcelCellWrite[] {
  const checks = rows.filter((row) =>
    /(Security|Sanitation) check conducted/i.test(rowText(row)),
  );
  if (checks.length !== config.securityCheckCount)
    throw new Error(
      `Official worksheet has ${checks.length} security checks; expected ${config.securityCheckCount}.`,
    );
  return checks.flatMap((row, index): ExcelCellWrite[] => {
    const prefix = `securityChecks.${index + 1}`;
    const source = rowText(row);
    const narrativePrefix = source.match(/^(.*?\bby\s+)/i)?.[1];
    const officialRole = source.match(
      /\b(Sergeant\s*\/\s*Officer|Officer\s*\/\s*Sergeant|Sergeant|Officer)\b/i,
    )?.[1];
    return [
      direct(`A${row.row}`, `${prefix}.time`),
      write(`B${row.row}`, [`${prefix}.performedBy`], (record) =>
        narrativePrefix && officialRole
          ? `${narrativePrefix}${officialRole} ${stored(record, `${prefix}.performedBy`)}.`
          : blankValues(source, [stored(record, `${prefix}.performedBy`)]),
      ),
      direct(`D${row.row}`, `${prefix}.initials`),
    ];
  });
}

function pageLayout(
  rows: readonly RowInfo[],
): Omit<OfficialWorksheetLayout, "writes"> {
  const headerRows = rows
    .filter((row) => /^HOUSING UNIT/i.test(row.cells.get(`A${row.row}`) ?? ""))
    .map((row) => row.row);
  const pageStarts = [...headerRows];
  const supervisorSignatureRows = rows
    .filter((row) =>
      /Housing Supervisor Signature/i.test(row.cells.get(`A${row.row}`) ?? ""),
    )
    .map((row) => row.row);
  const officerSignatureRows = rows
    .filter((row) =>
      /Housing Officer Signature/i.test(row.cells.get(`A${row.row}`) ?? ""),
    )
    .map((row) => row.row);
  const pageEnds = pageStarts.map((start, index) =>
    pageStarts[index + 1]
      ? pageStarts[index + 1]! - 1
      : (officerSignatureRows[index] ?? start) + 1,
  );
  if (
    headerRows.length !== pageStarts.length ||
    supervisorSignatureRows.length !== pageStarts.length ||
    officerSignatureRows.length !== pageStarts.length
  )
    throw new Error(
      `Official worksheet page/signature structure is inconsistent (pages ${pageStarts.length}, headers ${headerRows.length}, supervisors ${supervisorSignatureRows.length}, officers ${officerSignatureRows.length}).`,
    );
  const rowMap = new Map(rows.map((row) => [row.row, row]));
  const eventRowsForPage = (page: number) => {
    const start = headerRows[page]! + 2;
    const end = supervisorSignatureRows[page]! - 1;
    return Array.from(
      { length: end - start + 1 },
      (_, index) => start + index,
    ).filter((rowNumber) => {
      const row = rowMap.get(rowNumber);
      return row?.cells.has(`B${rowNumber}`) && !rowText(row).trim();
    });
  };
  const officialEventRows = pageStarts.flatMap((_, page) =>
    eventRowsForPage(page),
  );
  const last = pageStarts.length - 1;
  const continuationSourceStart = headerRows[last]!;
  const continuationSourceEnd = pageEnds[last]!;
  return {
    pageStarts,
    pageEnds,
    headerRows,
    supervisorSignatureRows,
    officerSignatureRows,
    officialEventRows,
    continuationSourceStart,
    continuationSourceEnd,
    continuationEventRows: eventRowsForPage(last).map(
      (row) => row - continuationSourceStart + 1,
    ),
    continuationSupervisorRow:
      supervisorSignatureRows[last]! - continuationSourceStart + 1,
    continuationOfficerRow:
      officerSignatureRows[last]! - continuationSourceStart + 1,
  };
}

export function buildOfficialWorksheetLayout(
  sheetXml: string,
  sharedStringsXml: string,
  config: HousingLogConfig,
): OfficialWorksheetLayout {
  const rows = rowsFromXml(sheetXml, sharedStringsXml);
  const pages = pageLayout(rows);
  const rowsByNumber = new Map(rows.map((row) => [row.row, row]));
  const clearVariableEntries = pages.headerRows.flatMap((headerRow, page) => {
    const end = pages.supervisorSignatureRows[page]! - 1;
    return Array.from(
      { length: Math.max(0, end - headerRow - 1) },
      (_, index) => headerRow + index + 2,
    ).flatMap((rowNumber): ExcelCellWrite[] => {
      const row = rowsByNumber.get(rowNumber);
      if (!row) return [];
      return ["A", "D"].flatMap((column): ExcelCellWrite[] =>
        row.cells.has(`${column}${rowNumber}`)
          ? [write(`${column}${rowNumber}`, [], () => "")]
          : [],
      );
    });
  });
  const clearSignatureCellValues = [
    ...pages.supervisorSignatureRows,
    ...pages.officerSignatureRows,
  ].flatMap((row): ExcelCellWrite[] =>
    ["B", "C", "D"].map((column) => write(`${column}${row}`, [], () => "")),
  );
  const writes: ExcelCellWrite[] = [
    ...clearVariableEntries,
    ...clearSignatureCellValues,
    ...pages.headerRows.flatMap((row): ExcelCellWrite[] => [
      write(`A${row}`, [], (record) => {
        const source =
          rows
            .find((candidate) => candidate.row === row)!
            .cells.get(`A${row}`) ?? "";
        return source.replace(
          /HOUSING UNIT\s+.*?(?=\s+(?:First|Second|Third) shift)/i,
          `HOUSING UNIT  ${record.housingUnit}`,
        );
      }),
      write(`C${row}`, [], (record) => `DATE ${record.logDate}`),
    ]),
    ...staffWrites(rows, config),
    ...equipmentWrites(rows, config),
    ...countWrites(rows, config),
    ...activityWrites(rows, config),
    ...securityWrites(rows, config),
  ];
  return { writes, ...pages };
}
