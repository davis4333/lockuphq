import type {
  CountDefinition,
  FieldDefinition,
  FormSection,
  HousingLogConfig,
  HousingShift,
  HousingUnit,
  RequiredActivityDefinition,
} from "./types";
import { housingUnits } from "./types";

const yesNo = ["Yes", "No"] as const;
const yesNoNa = ["Yes", "No", "N/A"] as const;

const field = (
  key: string,
  label: string,
  inputType: FieldDefinition["inputType"] = "text",
  options?: readonly string[],
  required = true,
): FieldDefinition => ({ key, label, inputType, options, required });

const numberedFields = (
  key: string,
  label: string,
  count: number,
): FieldDefinition[] =>
  Array.from({ length: count }, (_, index) =>
    field(`${key}.${index + 1}`, `${label} ${index + 1}`),
  );

const staffFields = (positions: string[]): FieldDefinition[] =>
  positions.flatMap((position, index) => {
    const prefix = `staff.${index + 1}`;
    return [
      field(`${prefix}.name`, `${position} name`),
      {
        ...field(`${prefix}.assumedAt`, `${position} time assumed duties`, "time"),
        allowNa: true,
      },
      {
        ...field(`${prefix}.relievedAt`, `${position} time relieved`, "time"),
        allowNa: true,
      },
      field(`${prefix}.keyRing`, `${position} key ring`),
      field(`${prefix}.radio`, `${position} radio`),
      field(`${prefix}.chemicalAgent`, `${position} chemical-agent pouch`),
      field(`${prefix}.chemicalAgentSeal`, `${position} chemical-agent seal`),
      field(`${prefix}.bodyAlarm`, `${position} body alarm`),
      field(`${prefix}.cuffsCase`, `${position} handcuffs and case`),
    ];
  });

const activity = (
  key: string,
  label: string,
  details: FieldDefinition[] = [],
  sourceNote?: string,
): RequiredActivityDefinition => ({
  key,
  label,
  detailFields: [
    field(`activities.${key}.time`, `${label} — time`, "time"),
    ...details,
    field(`activities.${key}.initials`, `${label} — initials`),
  ],
  sourceNote,
});

const performedBy = (key: string, label = "Completed by") => field(key, label);

const commonActivities = (): RequiredActivityDefinition[] => [
  activity("preaAnnouncement", "PREA female-staff announcement", [
    performedBy(
      "activities.preaAnnouncement.performedBy",
      "Announcement made by",
    ),
  ]),
  activity("cameraVerification", "Housing-unit camera verification", [
    performedBy("activities.cameraVerification.performedBy", "Verified by"),
  ]),
  activity("lockInspection", "Daily lock and locking-systems inspection", [
    performedBy(
      "activities.lockInspection.performedBy",
      "Inspection completed by",
    ),
  ]),
  activity("externalInspection", "External safety and security inspection", [
    performedBy(
      "activities.externalInspection.performedBy",
      "Inspection completed by",
    ),
  ]),
];

const supervisorActivity = activity(
  "unannouncedInspection",
  "Shift supervisor unannounced security inspection",
  [
    performedBy(
      "activities.unannouncedInspection.supervisor",
      "Shift supervisor",
    ),
  ],
);

const shiftActivities: Record<
  HousingShift,
  Record<"AH" | "B" | "CDEFG" | "INF", RequiredActivityDefinition[]>
> = {
  "1": {
    AH: [
      activity("laundryReleased", "Laundry orderly released"),
      activity("caustics", "Caustics distributed and containers retrieved"),
    ],
    B: [activity("intercom", "Intercom placed in active listening mode")],
    CDEFG: [
      activity("intercom", "Intercom placed in active listening mode"),
      activity("laundryReleased", "Laundry orderly released"),
      activity("caustics", "Caustics distributed and containers retrieved"),
    ],
    INF: [],
  },
  "2": {
    AH: [
      activity("laundryReturned", "Laundry returned to inmates"),
      activity("caustics", "Caustics distributed and containers retrieved"),
    ],
    B: [
      activity("intercom", "Intercom placed in active listening mode"),
      activity("libraryAc", "Library clerk escort to AC wing", [
        performedBy("activities.libraryAc.escort", "Escort"),
      ]),
      activity("libraryDc", "Library clerk escort to DC wing", [
        performedBy("activities.libraryDc.escort", "Escort"),
      ]),
      activity("libraryDeparture", "Library clerk departs"),
      activity(
        "adminRecStart",
        "Administrative confinement recreation begins",
        [performedBy("activities.adminRecStart.supervisor", "Supervised by")],
      ),
      activity(
        "adminRecComplete",
        "Administrative confinement recreation complete",
      ),
      activity(
        "disciplinaryRecStart",
        "Disciplinary confinement recreation begins",
        [
          performedBy(
            "activities.disciplinaryRecStart.supervisor",
            "Supervised by",
          ),
        ],
      ),
      activity(
        "disciplinaryRecComplete",
        "Disciplinary confinement recreation complete",
      ),
    ],
    CDEFG: [
      activity("laundryReturned", "Laundry returned to inmates"),
      activity("caustics", "Caustics distributed and containers retrieved"),
      activity("intercom", "Intercom placed in active listening mode"),
    ],
    INF: [
      activity("laundryReturned", "Laundry returned to inmates"),
      activity("caustics", "Caustics distributed and containers retrieved"),
    ],
  },
  "3": {
    AH: [
      activity("mail", "Mail distributed", [
        performedBy("activities.mail.performedBy", "Distributed by"),
      ]),
      activity("caustics", "Caustics distributed and containers retrieved"),
      activity("healthComfort", "Health/comfort items issued", [
        performedBy("activities.healthComfort.performedBy", "Issued by"),
      ]),
      activity("itemsDistributed", "Health/comfort items documented", [
        field(
          "activities.itemsDistributed.items",
          "Items distributed",
          "textarea",
        ),
      ]),
    ],
    B: [
      activity("intercom", "Intercom placed in active listening mode"),
      activity("healthComfort", "Health/comfort items issued", [
        performedBy("activities.healthComfort.performedBy", "Issued by"),
      ]),
      activity("itemsDistributed", "Health/comfort items documented", [
        field(
          "activities.itemsDistributed.items",
          "Items distributed",
          "textarea",
        ),
      ]),
      activity(
        "adminRecStart",
        "Administrative confinement recreation begins",
        [performedBy("activities.adminRecStart.supervisor", "Supervised by")],
      ),
      activity(
        "adminRecComplete",
        "Administrative confinement recreation complete",
      ),
      activity(
        "disciplinaryRecStart",
        "Disciplinary confinement recreation begins",
        [
          performedBy(
            "activities.disciplinaryRecStart.supervisor",
            "Supervised by",
          ),
        ],
      ),
      activity(
        "laundryExchange",
        "Dirty laundry picked up and clean laundry delivered to AC/DC wings",
      ),
      activity(
        "showersAcStart",
        "Showers, shaves, and haircuts begin in AC wing",
      ),
      activity(
        "showersAcComplete",
        "Showers, shaves, and haircuts complete in AC wing",
      ),
      activity(
        "showersDcStart",
        "Showers, shaves, and haircuts begin in DC wing",
      ),
      activity(
        "showersDcFollowup",
        "Showers, shaves, and haircuts completed in AC wing",
        [],
        "Official worksheet 3_B repeats “completed in AC wing” after the DC-wing start row. This source wording is preserved pending administrative confirmation.",
      ),
    ],
    CDEFG: [
      activity("intercom", "Intercom placed in active listening mode"),
      activity("mail", "Mail distributed", [
        performedBy("activities.mail.performedBy", "Distributed by"),
      ]),
      activity("caustics", "Caustics distributed and containers retrieved"),
      activity("healthComfort", "Health/comfort items issued", [
        performedBy("activities.healthComfort.performedBy", "Issued by"),
      ]),
      activity("itemsDistributed", "Health/comfort items documented", [
        field(
          "activities.itemsDistributed.items",
          "Items distributed",
          "textarea",
        ),
      ]),
    ],
    INF: [
      activity("healthComfort", "Health/comfort items issued", [
        performedBy("activities.healthComfort.performedBy", "Issued by"),
      ]),
      activity("itemsDistributed", "Health/comfort items documented", [
        field(
          "activities.itemsDistributed.items",
          "Items distributed",
          "textarea",
        ),
      ]),
      activity("laundryReturned", "Laundry returned to inmates"),
      activity("caustics", "Caustics distributed and containers retrieved"),
    ],
  },
};

const countNames: Record<HousingShift, string[]> = {
  "1": ["Beginning", "Midnight", "Early morning", "Pre-turnout", "Morning"],
  "2": ["Beginning", "Midday", "Afternoon"],
  "3": ["Beginning", "Afternoon", "Secure", "Master roster", "Midnight"],
};

const openBayCountAttestation =
  "Count, security, safety, sanitation, including checks of locking systems of all open bay areas that house inmates, to include the Officer's station doors, laundry room doors, and exits during each formal count, conducted by Sergeant / Officer ________________.";

const cellDoorCountAttestation =
  "Count, security, safety, sanitation checks conducted, all sliding cell doors and locking mechanisms were visually inspected (when the cell doors are open) or physically checked (by pulling on them when they are in the secured position) and control panels observed by staff for malfunctions, during each formal count, but not less than twice per shift, conducted by Sergeant / Officer ________________.";

const infirmaryConductor = (
  shift: HousingShift,
  formalCountIndex: number,
): string => {
  if (shift !== "1") return "Sergeant / Officer";
  return (
    ["Officer", "Sergeant", "Sergeant", "Sergeant / Officer"][
      formalCountIndex - 1
    ] ?? "Sergeant / Officer"
  );
};

const countsFor = (
  unit: HousingUnit,
  shift: HousingShift,
): CountDefinition[] => {
  const components =
    unit === "Infirmary"
      ? ["Infirmary", "Isolation", "MTB", "Outcount"]
      : unit === "A" || unit === "H"
        ? ["Wing One", "Wing Two"]
        : ["Wing One", "Wing Two", "Wing Three"];
  return countNames[shift].map((label, index) => {
    const conductor =
      unit === "Infirmary"
        ? infirmaryConductor(shift, index)
        : "Sergeant / Officer";
    return {
      key: label.toLowerCase().replaceAll(" ", "-"),
      label: index === 0 ? "Beginning inmate count" : `${label} count`,
      components,
      isBeginning: index === 0,
      requiresConductedBy: index !== 0,
      ...(index === 0
        ? {}
        : {
            conductedByLabel: `Conducted by ${conductor}`,
            officialAttestation:
              unit === "A" || unit === "H"
                ? openBayCountAttestation
                : unit === "Infirmary"
                  ? `Security, safety, sanitation, including checks of locking systems of all open bay areas that house inmates, to include the Officer's station doors, laundry room doors, and exits during each formal count, conducted by ${conductor} ________________.`
                  : cellDoorCountAttestation,
          }),
    };
  });
};

const staffFor = (unit: HousingUnit, shift: HousingShift): string[] => {
  if (unit === "Infirmary") return ["Sergeant / Officer"];
  if (unit === "B" && shift === "3")
    return ["Sergeant", "Officer 1", "Officer 2", "Officer 3", "Officer 4"];
  return ["Sergeant", "Officer 1", "Officer 2"];
};

const safetyEquipmentFields = (): FieldDefinition[] => [
  field("equipment.firstAidSeal", "First-aid kit seal"),
  field("equipment.ppeKit", "PPE kit present", "choice", yesNo),
  field(
    "equipment.breathingMask",
    "One-way breathing mask present",
    "choice",
    yesNo,
  ),
  field(
    "equipment.fireExtinguishers",
    "Fire extinguishers present and fully charged",
    "choice",
    yesNo,
  ),
  field("equipment.fireAlarm", "Fire alarm operational", "choice", yesNo),
  field(
    "equipment.inventoryComplete",
    "Assigned-equipment inventory complete and serviceable",
    "choice",
    yesNo,
  ),
  field("equipment.postOrders", "Post orders read and signed", "choice", yesNo),
];

const equipmentSection = (unit: HousingUnit): FormSection => {
  const infirmary = unit === "Infirmary";
  const fields: FieldDefinition[] = infirmary
    ? [
        field("equipment.infirmaryKeyRing", "Infirmary unit key ring"),
        field("equipment.infirmaryBodyAlarm", "Infirmary unit body alarm"),
        field("equipment.infirmaryCuff", "Infirmary unit handcuffs"),
        field("equipment.infirmaryCuffCase", "Infirmary unit handcuff case"),
        field(
          "equipment.infirmaryRadio",
          "Infirmary unit radio accounted for and tested",
        ),
        field(
          "equipment.radioStatusReportedBy",
          "Radio status reported to main control by",
        ),
        ...safetyEquipmentFields(),
      ]
    : [
        ...numberedFields(
          "equipment.acceptedKeyRings",
          "Accepted key-ring number",
          8,
        ),
        ...numberedFields(
          "equipment.radios",
          "Radio accounted for and tested",
          3,
        ),
        field(
          "equipment.radioStatusReportedBy",
          "Radio status reported to main control by",
        ),
        ...(unit === "B"
          ? [
              field(
                "equipment.cellExtraction",
                "Cell Extraction Team equipment inspected by",
              ),
            ]
          : []),
        field(
          "equipment.radioChargingStation",
          "Radio charging station status",
        ),
        field("equipment.extraBatteries", "Extra batteries", "number"),
        field("equipment.inspectionMirror", "Inspection mirror"),
        field("equipment.cellUnlockingBars", "Cell unlocking bars", "number"),
        field("equipment.ligatureCutterSeal", "Ligature cutter seal"),
        ...numberedFields("equipment.bodyAlarms", "Body alarm", 3),
        ...numberedFields("equipment.cuffs", "Handcuffs", 3),
        ...numberedFields("equipment.cuffCases", "Handcuff case", 3),
        field("equipment.legRestraints", "Leg restraints accounted for"),
        field("equipment.backboards", "Backboards accounted for", "number"),
        field(
          "equipment.passesAccounted",
          "All passes accounted for",
          "choice",
          yesNo,
        ),
        field(
          "equipment.unaccountedPasses",
          "Unaccounted passes (enter N/A if none)",
        ),
        field(
          "equipment.incidentReport",
          "Supervisor notified and incident report submitted",
          "choice",
          yesNoNa,
        ),
        ...safetyEquipmentFields(),
        field(
          "medication.inventoriedBy",
          "Over-the-counter medication inventoried by",
        ),
        field("medication.acetaminophen", "Acetaminophen packs", "number"),
        field("medication.alamag", "Alamag packs", "number"),
        field("medication.ibuprofen", "Ibuprofen packs", "number"),
      ];
  return {
    key: "equipment",
    title: "Equipment and shift acceptance",
    description:
      "Complete every numbered slot and confirmation printed on the applicable official log. Enter N/A only where operationally appropriate.",
    fields,
  };
};

const familyFor = (unit: HousingUnit): "AH" | "B" | "CDEFG" | "INF" => {
  if (unit === "A" || unit === "H") return "AH";
  if (unit === "B") return "B";
  if (unit === "Infirmary") return "INF";
  return "CDEFG";
};

const checkCountFor = (
  family: ReturnType<typeof familyFor>,
  shift: HousingShift,
): number => {
  if (family === "B") return 17;
  if (family === "AH") return shift === "1" ? 9 : 8;
  if (family === "INF") return shift === "1" ? 9 : 8;
  return 9;
};

const buildConfig = (
  housingUnit: HousingUnit,
  shift: HousingShift,
): HousingLogConfig => {
  const family = familyFor(housingUnit);
  const sourceSheet = `${shift}_${family}`;
  const staff = staffFor(housingUnit, shift);
  return {
    key: `${housingUnit}-${shift}`,
    sourceSheet,
    templateVersion: "2026-04-27",
    housingUnit,
    shift,
    shiftLabel: (
      { "1": "First shift", "2": "Second shift", "3": "Third shift" } as const
    )[shift],
    sections: [
      {
        key: "staff",
        title: "On-duty staff and issued equipment",
        description:
          "Enter each position and the issued equipment identified on the official form. Use N/A only when operationally appropriate.",
        fields: staffFields(staff),
      },
      equipmentSection(housingUnit),
    ],
    counts: countsFor(housingUnit, shift),
    activities: [
      ...commonActivities(),
      ...shiftActivities[shift][family],
      supervisorActivity,
    ],
    securityCheckCount: checkCountFor(family, shift),
    securityCheckLabel:
      housingUnit === "Infirmary" && shift === "1"
        ? "Sanitation check in all areas of the Infirmary"
        : "Security check in all areas of the housing unit",
    signatures:
      housingUnit === "Infirmary" && shift === "1"
        ? [{ key: "housingSupervisor", label: "Housing Supervisor Signature" }]
        : [
            { key: "housingSupervisor", label: "Housing Supervisor Signature" },
            { key: "housingOfficer", label: "Housing Officer Signature" },
          ],
  };
};

export const housingLogConfigs: HousingLogConfig[] = housingUnits.flatMap(
  (unit) => (["1", "2", "3"] as const).map((shift) => buildConfig(unit, shift)),
);

export function getHousingLogConfig(
  housingUnit: HousingUnit,
  shift: HousingShift,
): HousingLogConfig {
  const config = housingLogConfigs.find(
    (candidate) =>
      candidate.housingUnit === housingUnit && candidate.shift === shift,
  );
  if (!config)
    throw new Error(
      `No Housing Log configuration for ${housingUnit}, shift ${shift}`,
    );
  return config;
}

export function fieldsForConfig(config: HousingLogConfig): FieldDefinition[] {
  const countFields = config.counts.flatMap((count) => {
    const prefix = `counts.${count.key}`;
    return [
      ...(!count.isBeginning
        ? [
            field(
              `${prefix}.recallTime`,
              `${count.label} — recall time`,
              "time",
            ),
            field(
              `${prefix}.clearTime`,
              `${count.label} — count clear time`,
              "time",
            ),
          ]
        : []),
      field(`${prefix}.countTime`, `${count.label} — count time`, "time"),
      ...count.components.map((component) =>
        field(
          `${prefix}.components.${component}`,
          `${count.label} — ${component}`,
          "number",
        ),
      ),
      ...(count.requiresConductedBy
        ? [
            field(
              `${prefix}.conductedBy`,
              `${count.label} — ${count.conductedByLabel ?? "Conducted by"}`,
            ),
          ]
        : []),
      field(`${prefix}.initials`, `${count.label} — initials`),
    ];
  });
  const securityFields = Array.from(
    { length: config.securityCheckCount },
    (_, index) => {
      const prefix = `securityChecks.${index + 1}`;
      return [
        field(
          `${prefix}.time`,
          `${config.securityCheckLabel} ${index + 1} — time`,
          "time",
        ),
        field(
          `${prefix}.performedBy`,
          `${config.securityCheckLabel} ${index + 1} — completed by`,
        ),
        field(
          `${prefix}.initials`,
          `${config.securityCheckLabel} ${index + 1} — initials`,
        ),
      ];
    },
  ).flat();
  return [
    ...config.sections.flatMap((section) => section.fields),
    ...config.activities.flatMap((item) => item.detailFields),
    ...countFields,
    ...securityFields,
  ];
}
