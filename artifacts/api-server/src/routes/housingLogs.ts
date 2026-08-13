import { Router, type IRouter } from "express";
import {
  formatHousingLogDateForDisplay,
  housingLogDraftInputSchema,
  housingLogFinalizeInputSchema,
  prepareHousingLog,
  type HousingLogFinalizeConfirmation,
} from "@workspace/housing-log";
import { ensureHousingLogSchema } from "../housingLogs/db";
import {
  getHousingLogRepository,
  type HousingLogRepository,
} from "../housingLogs/repository";
import { validateHousingLogForFinalization } from "../housingLogs/signatureValidation";
import { generateExcelHousingLog } from "../housingLogs/excelTemplate/generateExcelHousingLog";
import {
  HousingLogWorkbookRegistry,
  registerOfficialHousingLogWorkbook,
  type HousingLogWorkbookTemplate,
} from "../housingLogs/excelTemplate/workbookRegistry";
import { safeFilePart } from "../housingLogs/filenames";

export type HousingLogsRouterOptions = {
  repository?: HousingLogRepository;
  workbookRegistry?: HousingLogWorkbookRegistry;
};

/**
 * Officer-facing Housing Log API.
 *
 * Officers keep their one working Housing Log entirely in local (IndexedDB)
 * browser storage — see `housingLogLocalStore.ts` in cdc-coach — and the
 * server never stores, lists, or authorizes access to an in-progress draft.
 * There are exactly two server interactions:
 *
 *   - POST /housing-logs/preview/xlsx — stateless: validates and renders the
 *     CURRENT payload to an official .xlsx and returns it. Nothing is
 *     persisted, no record is looked up by id, and finalization idempotency
 *     is untouched. Used for the pre-finalize "Preview Official Log" /
 *     "Download Current Log" workflow.
 *   - POST /housing-logs/finalize — the one atomic submit-to-finalize call.
 *
 * There is no officer-facing GET/PATCH/list/unlock endpoint, and no draft
 * UUID is ever handed back as something the officer could use to resume or
 * browse anything — admin's separate archive is the only place stored
 * Housing Logs can be read back.
 */
export function createHousingLogsRouter(
  optionsOrRepository?: HousingLogsRouterOptions | HousingLogRepository,
): IRouter {
  const options: HousingLogsRouterOptions =
    optionsOrRepository && "finalizeSubmission" in optionsOrRepository
      ? { repository: optionsOrRepository }
      : (optionsOrRepository ?? {});
  const router: IRouter = Router();
  const requiresConfiguredDatabase = options.repository === undefined;
  const records = options.repository ?? getHousingLogRepository();
  const workbookRegistry =
    options.workbookRegistry ??
    registerOfficialHousingLogWorkbook(new HousingLogWorkbookRegistry());

  // Registered ahead of the database-availability gate below: this route
  // makes no database call in either direction (no read, no write), so it
  // must keep working for review/download even when Housing Log persistence
  // is temporarily unavailable — a database outage should not also block an
  // officer from reviewing or saving a copy of the record they're about to
  // (once the database recovers) submit.
  router.post("/housing-logs/preview/xlsx", async (req, res) => {
    const parsed = housingLogDraftInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid Housing Log data.",
        issues: parsed.error.issues,
      });
    const input = prepareHousingLog(parsed.data);
    const issues = validateHousingLogForFinalization(input);
    if (issues.length)
      return res.status(422).json({
        error: "Housing Log is not ready to preview or download.",
        issues,
      });

    const now = new Date().toISOString();
    // A synthetic in-memory record satisfying the shape the shared Excel
    // generator expects — `status: "draft"` is the true state (this payload
    // has not been finalized and this call never finalizes it); `id` is a
    // fixed placeholder, never a real record id an officer could reuse to
    // look anything up later. Never persisted.
    const syntheticRecord = {
      ...input,
      id: "preview",
      status: "draft" as const,
      createdAt: now,
      updatedAt: now,
      finalizedAt: null,
    };
    const template: HousingLogWorkbookTemplate =
      workbookRegistry.resolveRecord(syntheticRecord);
    const generated = await generateExcelHousingLog(syntheticRecord, template);
    const fileName = [
      "Housing-Log",
      formatHousingLogDateForDisplay(input.logDate),
      `Shift-${input.shift}`,
      safeFilePart(input.housingUnit),
    ].join("-");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(`${fileName}.xlsx`)}`,
    );
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(generated.bytes.length));
    return res.status(200).send(generated.bytes);
  });

  router.use("/housing-logs", async (_req, res, next) => {
    if (requiresConfiguredDatabase && !(await ensureHousingLogSchema())) {
      return res.status(503).json({
        error:
          "Housing Log persistence is temporarily unavailable and will retry automatically. Other LockUpHQ tools remain available.",
      });
    }
    return next();
  });

  router.post("/housing-logs/finalize", async (req, res) => {
    const parsed = housingLogFinalizeInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid Housing Log submission.",
        issues: parsed.error.issues,
      });
    const { submissionId, ...draftInput } = parsed.data;
    const result = await records.finalizeSubmission(draftInput, submissionId);
    if (result.outcome === "validation_failed") {
      return res.status(422).json({
        error: "Housing Log is not ready to finalize.",
        issues: result.issues,
      });
    }
    if (result.outcome === "submission_conflict") {
      return res.status(409).json({
        error:
          "This Housing Log submission was already finalized, but the current local form has changed since that submission. Nothing on this device was cleared. An administrator should review the finalized record before continuing.",
      });
    }
    const body: HousingLogFinalizeConfirmation = {
      id: result.record.id,
      finalizedAt: result.record.finalizedAt!,
    };
    return res.status(200).json(body);
  });

  return router;
}

export default createHousingLogsRouter();
