import { Router, type IRouter, type Response } from "express";
import {
  getHousingLogConfig,
  housingShifts,
  housingUnits,
  isValidHousingLogDate,
  type HousingLogArchiveResponse,
  type HousingShift,
} from "@workspace/housing-log";
import { ensureHousingLogSchema } from "../housingLogs/db";
import {
  clearAdminSessionCookie,
  cookieValue,
  HOUSING_LOG_ADMIN_COOKIE,
  HousingLogAdminSessions,
  requireHousingLogAdminSession,
  setAdminSessionCookie,
  verifyAdminPassword,
} from "../housingLogs/adminAuth";
import {
  addHousingLogAdditionalRecipient,
  DuplicateHousingLogRecipientError,
  getHousingLogDeliverySettings,
  getHousingLogDeliverySettingsRepository,
  HousingLogAdditionalRecipientNotFoundError,
  HousingLogPrimaryRecipientRequiredError,
  InvalidHousingLogDeliverySettingsInputError,
  InvalidHousingLogRecipientEmailError,
  removeHousingLogAdditionalRecipient,
  setHousingLogPrimaryRecipient,
  type HousingLogDeliverySettingsRepository,
  updateHousingLogAdditionalRecipient,
} from "../housingLogs/deliverySettings";
import {
  getHousingLogRepository,
  type HousingLogRepository,
} from "../housingLogs/repository";
import { generateExcelHousingLog } from "../housingLogs/excelTemplate/generateExcelHousingLog";
import {
  buildHousingLogShiftPackage,
  type HousingLogShiftPackage,
} from "../housingLogs/shiftPackage";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
} from "../housingLogs/excelTemplate/workbookRegistry";

type AdminHousingLogsRouterOptions = {
  repository?: HousingLogRepository;
  sessions?: HousingLogAdminSessions;
  passwordProvider?: () => string | undefined;
  secureCookies?: boolean;
  workbookRegistry?: HousingLogWorkbookRegistry;
  shiftPackageBuilder?: (
    logDate: string,
    shift: HousingShift,
  ) => Promise<HousingLogShiftPackage>;
  deliverySettingsRepository?: HousingLogDeliverySettingsRepository;
};

const safeFilePart = (value: string) =>
  value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

function isObjectBody(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function sendDeliverySettingsError(error: unknown, response: Response) {
  if (
    error instanceof InvalidHousingLogRecipientEmailError ||
    error instanceof InvalidHousingLogDeliverySettingsInputError
  ) {
    response.status(400).json({ error: (error as Error).message });
    return true;
  }
  if (
    error instanceof DuplicateHousingLogRecipientError ||
    error instanceof HousingLogPrimaryRecipientRequiredError
  ) {
    response.status(409).json({ error: error.message });
    return true;
  }
  if (error instanceof HousingLogAdditionalRecipientNotFoundError) {
    response.status(404).json({ error: error.message });
    return true;
  }
  return false;
}

export function createAdminHousingLogsRouter(
  options: AdminHousingLogsRouterOptions = {},
): IRouter {
  const router: IRouter = Router();
  const sessions = options.sessions ?? new HousingLogAdminSessions();
  const records = options.repository ?? getHousingLogRepository();
  const requiresConfiguredDatabase = options.repository === undefined;
  const passwordProvider =
    options.passwordProvider ??
    (() => process.env["HOUSING_LOG_ADMIN_PASSWORD"]);
  const secureCookies =
    options.secureCookies ?? process.env["NODE_ENV"] === "production";
  const workbookRegistry =
    options.workbookRegistry ??
    registerOfficialHousingLogWorkbook(new HousingLogWorkbookRegistry());
  const shiftPackageBuilder =
    options.shiftPackageBuilder ??
    ((logDate: string, shift: HousingShift) =>
      buildHousingLogShiftPackage(logDate, shift, {
        repository: records,
        workbookRegistry,
      }));
  const deliverySettingsRepository =
    options.deliverySettingsRepository ??
    getHousingLogDeliverySettingsRepository();

  router.post("/admin/session", (request, response) => {
    const configuredPassword = passwordProvider();
    if (!configuredPassword) {
      response.status(503).json({
        error:
          "Housing Log admin access is not configured. Set HOUSING_LOG_ADMIN_PASSWORD in Replit Secrets.",
      });
      return;
    }
    const suppliedPassword =
      typeof request.body?.password === "string" ? request.body.password : "";
    if (!suppliedPassword) {
      response.status(400).json({ error: "Admin password is required." });
      return;
    }
    if (!verifyAdminPassword(suppliedPassword, configuredPassword)) {
      response.status(403).json({ error: "Incorrect admin password." });
      return;
    }
    setAdminSessionCookie(response, sessions.issue(), secureCookies);
    response.status(204).end();
  });

  router.get("/admin/session", (request, response) => {
    const authenticated = sessions.accepts(
      cookieValue(request, HOUSING_LOG_ADMIN_COOKIE),
    );
    if (!authenticated) {
      response.status(401).json({ error: "Housing Log admin login required." });
      return;
    }
    response.json({ authenticated: true });
  });

  router.delete("/admin/session", (request, response) => {
    sessions.revoke(cookieValue(request, HOUSING_LOG_ADMIN_COOKIE));
    clearAdminSessionCookie(response, secureCookies);
    response.status(204).end();
  });

  router.use("/admin/housing-logs", requireHousingLogAdminSession(sessions));
  router.use("/admin/housing-logs", async (_request, response, next) => {
    if (requiresConfiguredDatabase && !(await ensureHousingLogSchema())) {
      response.status(503).json({
        error:
          "Housing Log persistence is temporarily unavailable and will retry automatically.",
      });
      return;
    }
    next();
  });

  router.get("/admin/housing-logs/archive", async (_request, response) => {
    const finalized = await records.listFinalizedArchive();
    const body: HousingLogArchiveResponse = {
      expectedHousingUnits: [...housingUnits],
      records: finalized.map((record) => ({
        ...record,
        sourceSheet: getHousingLogConfig(record.housingUnit, record.shift)
          .sourceSheet,
      })),
    };
    response.setHeader("Cache-Control", "no-store");
    response.json(body);
  });

  router.get(
    "/admin/housing-logs/delivery-settings",
    async (_request, response) => {
      const settings = await getHousingLogDeliverySettings(
        deliverySettingsRepository,
      );
      response.setHeader("Cache-Control", "no-store");
      response.json(settings);
    },
  );

  router.put(
    "/admin/housing-logs/delivery-settings/primary",
    async (request, response) => {
      if (
        !isObjectBody(request.body) ||
        !hasOnlyKeys(request.body, ["email"])
      ) {
        response.status(400).json({ error: "Provide only a primary email." });
        return;
      }
      try {
        const settings = await setHousingLogPrimaryRecipient(
          request.body.email,
          deliverySettingsRepository,
        );
        response.setHeader("Cache-Control", "no-store");
        response.json(settings);
      } catch (error) {
        if (!sendDeliverySettingsError(error, response)) throw error;
      }
    },
  );

  router.post(
    "/admin/housing-logs/delivery-settings/additional",
    async (request, response) => {
      if (
        !isObjectBody(request.body) ||
        !hasOnlyKeys(request.body, ["email"])
      ) {
        response.status(400).json({ error: "Provide only a recipient email." });
        return;
      }
      try {
        const settings = await addHousingLogAdditionalRecipient(
          request.body.email,
          deliverySettingsRepository,
        );
        response.setHeader("Cache-Control", "no-store");
        response.status(201).json(settings);
      } catch (error) {
        if (!sendDeliverySettingsError(error, response)) throw error;
      }
    },
  );

  router.patch(
    "/admin/housing-logs/delivery-settings/additional/:id",
    async (request, response) => {
      if (
        !isObjectBody(request.body) ||
        !hasOnlyKeys(request.body, ["email", "active"])
      ) {
        response.status(400).json({
          error: "Provide only a recipient email or active state.",
        });
        return;
      }
      try {
        const settings = await updateHousingLogAdditionalRecipient(
          String(request.params["id"]),
          request.body,
          deliverySettingsRepository,
        );
        response.setHeader("Cache-Control", "no-store");
        response.json(settings);
      } catch (error) {
        if (!sendDeliverySettingsError(error, response)) throw error;
      }
    },
  );

  router.delete(
    "/admin/housing-logs/delivery-settings/additional/:id",
    async (request, response) => {
      try {
        const settings = await removeHousingLogAdditionalRecipient(
          String(request.params["id"]),
          deliverySettingsRepository,
        );
        response.setHeader("Cache-Control", "no-store");
        response.json(settings);
      } catch (error) {
        if (!sendDeliverySettingsError(error, response)) throw error;
      }
    },
  );

  router.get(
    "/admin/housing-logs/shift-package/:logDate/:shift",
    async (request, response) => {
      const logDate = String(request.params["logDate"]);
      const rawShift = String(request.params["shift"]);
      if (!isValidHousingLogDate(logDate)) {
        response.status(400).json({
          error: "Enter a real package date in YYYY-MM-DD format.",
        });
        return;
      }
      if (!housingShifts.includes(rawShift as HousingShift)) {
        response.status(400).json({ error: "Invalid Housing Log shift." });
        return;
      }
      const shift = rawShift as HousingShift;
      const generated = await shiftPackageBuilder(logDate, shift);
      response.setHeader("Content-Type", "application/zip");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(generated.filename)}`,
      );
      response.setHeader("Cache-Control", "no-store, private");
      response.setHeader("Pragma", "no-cache");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Content-Length", String(generated.bytes.length));
      response.status(200).send(generated.bytes);
    },
  );

  router.get("/admin/housing-logs/:id/excel", async (request, response) => {
    const record = await records.get(String(request.params["id"]));
    if (!record) {
      response.status(404).json({ error: "Housing Log not found." });
      return;
    }
    if (record.status !== "finalized") {
      response.status(409).json({
        error:
          "Only finalized Housing Logs can be downloaded from the archive.",
      });
      return;
    }

    const template = workbookRegistry.resolveRecord(record);
    const generated = await generateExcelHousingLog(record, template);
    const fileName = [
      "Housing-Log",
      record.logDate,
      `Shift-${record.shift}`,
      safeFilePart(record.housingUnit),
      record.id.slice(0, 8),
    ].join("-");
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`${fileName}.xlsx`)}`,
    );
    response.setHeader("Cache-Control", "no-store, private");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Length", String(generated.bytes.length));
    response.status(200).send(generated.bytes);
  });

  return router;
}

export default createAdminHousingLogsRouter();
