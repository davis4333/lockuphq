import { createHash } from "node:crypto";
import {
  formatHousingLogDateForDisplay,
  type HousingLogManualEmailResult,
  type HousingShift,
} from "@workspace/housing-log";
import {
  getHousingLogDeliverySettings,
  getHousingLogDeliverySettingsRepository,
  type HousingLogDeliverySettingsRepository,
} from "./deliverySettings";
import {
  getHousingLogDeliveryAttemptRepository,
  type HousingLogDeliveryAttemptRepository,
} from "./deliveryAttempts";
import {
  createHousingLogEmailProviderFromEnvironment,
  HousingLogEmailProviderError,
  type HousingLogEmailFailureCategory,
  type HousingLogEmailProvider,
} from "./emailProvider";
import {
  buildHousingLogShiftPackage,
  type HousingLogShiftPackage,
} from "./shiftPackage";

const shiftLabels: Record<HousingShift, string> = {
  "1": "First Shift",
  "2": "Second Shift",
  "3": "Third Shift",
};

export type HousingLogManualEmailFailureCategory =
  | HousingLogEmailFailureCategory
  | "no_recipients"
  | "recipient_settings_unavailable"
  | "package_generation_failed"
  | "delivery_ledger_unavailable"
  | "provider_failure"
  | "delivery_result_unrecorded";

export class HousingLogManualEmailError extends Error {
  constructor(
    public readonly category: HousingLogManualEmailFailureCategory,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "HousingLogManualEmailError";
  }
}

export type HousingLogManualEmailDependencies = {
  deliverySettingsRepository?: HousingLogDeliverySettingsRepository;
  attemptRepository?: HousingLogDeliveryAttemptRepository;
  emailProviderFactory?: () => HousingLogEmailProvider;
  packageBuilder?: (
    logDate: string,
    shift: HousingShift,
  ) => Promise<HousingLogShiftPackage>;
  now?: () => Date;
};

function providerError(error: unknown): HousingLogManualEmailError {
  if (error instanceof HousingLogEmailProviderError) {
    const status =
      error.category === "provider_not_configured"
        ? 503
        : error.category === "attachment_too_large"
          ? 413
          : error.category === "provider_timeout"
            ? 504
            : 502;
    return new HousingLogManualEmailError(
      error.category,
      status,
      error.message,
    );
  }
  return new HousingLogManualEmailError(
    "provider_failure",
    502,
    "The email provider could not accept the Housing Log package.",
  );
}

function emailBody(packageResult: HousingLogShiftPackage): string {
  const { manifest } = packageResult;
  const missing = manifest.missingHousingUnits.length
    ? manifest.missingHousingUnits.join(", ")
    : "None";
  const duplicates = manifest.duplicateHousingUnitSlots.length
    ? manifest.duplicateHousingUnitSlots
        .map((slot) => slot.housingUnit)
        .join(", ")
    : "None";
  return [
    "Housing Unit Logs shift package",
    "",
    `Housing Log date: ${formatHousingLogDateForDisplay(manifest.packageDate)}`,
    `Shift: ${shiftLabels[manifest.shift]}`,
    `Package status: ${manifest.completenessStatus}`,
    `Housing Logs included: ${manifest.includedLogs.length}`,
    `Missing housing units: ${missing}`,
    `Duplicate housing units: ${duplicates}`,
    "",
    "The attached ZIP contains the editable official Excel Housing Logs, manifest, and checksums.",
  ].join("\n");
}

const packageChecksum = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

export async function sendHousingLogShiftPackageEmail(
  logDate: string,
  shift: HousingShift,
  dependencies: HousingLogManualEmailDependencies = {},
): Promise<HousingLogManualEmailResult> {
  const settingsRepository =
    dependencies.deliverySettingsRepository ??
    getHousingLogDeliverySettingsRepository();
  const attemptRepository =
    dependencies.attemptRepository ?? getHousingLogDeliveryAttemptRepository();
  const providerFactory =
    dependencies.emailProviderFactory ??
    createHousingLogEmailProviderFromEnvironment;
  const packageBuilder =
    dependencies.packageBuilder ?? buildHousingLogShiftPackage;
  const now = dependencies.now ?? (() => new Date());

  let recipients: string[];
  try {
    const settings = await getHousingLogDeliverySettings(settingsRepository);
    recipients = [...settings.deliveryRecipients];
  } catch {
    throw new HousingLogManualEmailError(
      "recipient_settings_unavailable",
      503,
      "Housing Log delivery recipients are temporarily unavailable.",
    );
  }
  if (!recipients.length)
    throw new HousingLogManualEmailError(
      "no_recipients",
      409,
      "No Housing Log delivery recipients are configured.",
    );

  let provider: HousingLogEmailProvider;
  try {
    provider = providerFactory();
  } catch (error) {
    throw providerError(error);
  }

  let packageResult: HousingLogShiftPackage;
  try {
    packageResult = await packageBuilder(logDate, shift);
  } catch {
    throw new HousingLogManualEmailError(
      "package_generation_failed",
      500,
      "The Housing Log shift package could not be generated.",
    );
  }

  const startedAt = now();
  const sha256 = packageChecksum(packageResult.bytes);
  let attempt;
  try {
    attempt = await attemptRepository.start({
      logDate,
      shift,
      startedAt,
      packageCompleteness: packageResult.manifest.completenessStatus,
      packageSha256: sha256,
      recipients,
    });
  } catch {
    throw new HousingLogManualEmailError(
      "delivery_ledger_unavailable",
      503,
      "The delivery attempt could not be recorded, so no email was sent.",
    );
  }

  let sendResult;
  try {
    sendResult = await provider.sendHousingLogPackage({
      recipients,
      subject: `Housing Unit Logs — ${formatHousingLogDateForDisplay(logDate)} — ${shiftLabels[shift]}`,
      text: emailBody(packageResult),
      attachment: {
        filename: packageResult.filename,
        contentType: "application/zip",
        bytes: packageResult.bytes,
      },
      idempotencyKey: attempt.id,
    });
  } catch (error) {
    const controlled = providerError(error);
    try {
      await attemptRepository.markFailed(
        attempt.id,
        controlled.category,
        controlled.message,
        now(),
      );
    } catch {
      throw new HousingLogManualEmailError(
        "delivery_ledger_unavailable",
        503,
        "Email delivery failed and the delivery attempt could not be updated.",
      );
    }
    throw controlled;
  }

  const completedAt = now();
  try {
    await attemptRepository.markSent(
      attempt.id,
      sendResult.messageId,
      completedAt,
    );
  } catch {
    throw new HousingLogManualEmailError(
      "delivery_result_unrecorded",
      503,
      "The email provider accepted the package, but confirmation could not be recorded. Do not retry until the attempt is checked.",
    );
  }

  return {
    attemptId: attempt.id,
    logDate,
    shift,
    packageStatus: packageResult.manifest.completenessStatus,
    recipientCount: recipients.length,
    includedLogCount: packageResult.manifest.includedLogs.length,
    missingHousingUnits: [...packageResult.manifest.missingHousingUnits],
    duplicateHousingUnits: packageResult.manifest.duplicateHousingUnitSlots.map(
      (slot) => slot.housingUnit,
    ),
    sentAt: completedAt.toISOString(),
  };
}
