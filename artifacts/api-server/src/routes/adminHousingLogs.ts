import { Router, type IRouter } from "express";
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
};

const safeFilePart = (value: string) =>
  value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

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
          "Housing Log archive persistence is temporarily unavailable and will retry automatically.",
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
