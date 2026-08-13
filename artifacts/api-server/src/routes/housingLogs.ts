import { Router, type IRouter } from "express";
import {
  housingLogFinalizeInputSchema,
  type HousingLogFinalizeConfirmation,
} from "@workspace/housing-log";
import { ensureHousingLogSchema } from "../housingLogs/db";
import {
  getHousingLogRepository,
  type HousingLogRepository,
} from "../housingLogs/repository";

export type HousingLogsRouterOptions = {
  repository?: HousingLogRepository;
};

/**
 * Officer-facing Housing Log API.
 *
 * There is intentionally only one route: officers keep their one working
 * Housing Log entirely in local (IndexedDB) browser storage — see
 * `housingLogLocalStore.ts` in cdc-coach — and the server never stores,
 * lists, or authorizes access to an in-progress draft. The only server
 * interaction is a single atomic submit-to-finalize call. There is no
 * officer-facing GET/PATCH/list/unlock endpoint, and no draft UUID is ever
 * handed back as something the officer could use to resume or browse
 * anything — admin's separate archive is the only place stored Housing Logs
 * can be read back.
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
