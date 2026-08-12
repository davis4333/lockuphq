import { Router, type IRouter } from "express";
import {
  getHousingLogConfig,
  hasMeaningfulHousingLogContent,
  housingLogDraftInputSchema,
  housingLogListFiltersSchema,
  housingLogUpdateSchema,
  type HousingLogDraftInput,
} from "@workspace/housing-log";
import { ensureHousingLogSchema } from "../housingLogs/db";
import {
  getHousingLogRepository,
  type HousingLogRepository,
} from "../housingLogs/repository";

export function createHousingLogsRouter(
  repository?: HousingLogRepository,
): IRouter {
  const router: IRouter = Router();
  const requiresConfiguredDatabase = repository === undefined;
  const records = repository ?? getHousingLogRepository();

  router.use("/housing-logs", async (_req, res, next) => {
    if (requiresConfiguredDatabase && !(await ensureHousingLogSchema())) {
      return res.status(503).json({
        error:
          "Housing Log persistence is temporarily unavailable and will retry automatically. Other LockUpHQ tools remain available.",
      });
    }
    return next();
  });

  router.post("/housing-logs", async (req, res) => {
    const parsed = housingLogDraftInputSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid Housing Log draft.",
        issues: parsed.error.issues,
      });
    const record = await records.create(parsed.data);
    return res.status(201).json(record);
  });

  router.get("/housing-logs", async (req, res) => {
    const parsed = housingLogListFiltersSchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid Housing Log filters.",
        issues: parsed.error.issues,
      });
    if (parsed.data.status === "finalized")
      return res.status(403).json({
        error:
          "Finalized Housing Logs are available only in the admin archive.",
      });
    return res.json(await records.list({ ...parsed.data, status: "draft" }));
  });

  router.get("/housing-logs/:id", async (req, res) => {
    const record = await records.get(String(req.params["id"]));
    if (!record)
      return res.status(404).json({ error: "Housing Log not found." });
    if (record.status === "finalized")
      return res.status(403).json({
        error:
          "Finalized Housing Logs are available only in the admin archive.",
      });
    return res.json(record);
  });

  router.patch("/housing-logs/:id", async (req, res) => {
    const id = String(req.params["id"]);
    const existing = await records.get(id);
    if (!existing)
      return res.status(404).json({ error: "Housing Log not found." });
    if (existing.status === "finalized")
      return res
        .status(409)
        .json({ error: "Finalized Housing Logs cannot be modified." });

    const parsed = housingLogUpdateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        error: "Invalid Housing Log update.",
        issues: parsed.error.issues,
      });

    const nextUnit = parsed.data.housingUnit ?? existing.housingUnit;
    const nextShift = parsed.data.shift ?? existing.shift;
    const selectionChanged =
      nextUnit !== existing.housingUnit || nextShift !== existing.shift;
    if (selectionChanged && hasMeaningfulHousingLogContent(existing)) {
      return res.status(409).json({
        error:
          "Housing unit or shift cannot be changed after form data, events, or signatures have been entered. Start a new draft instead.",
      });
    }

    const merged: HousingLogDraftInput = {
      logDate: parsed.data.logDate ?? existing.logDate,
      shift: nextShift,
      housingUnit: nextUnit,
      templateVersion: selectionChanged
        ? getHousingLogConfig(nextUnit, nextShift).templateVersion
        : (parsed.data.templateVersion ?? existing.templateVersion),
      values: selectionChanged
        ? (parsed.data.values ?? {})
        : (parsed.data.values ?? existing.values),
      events: selectionChanged
        ? (parsed.data.events ?? [])
        : (parsed.data.events ?? existing.events),
      signatures: selectionChanged
        ? (parsed.data.signatures ?? {})
        : parsed.data.signatures
          ? { ...existing.signatures, ...parsed.data.signatures }
          : existing.signatures,
    };
    const record = await records.updateDraft(
      id,
      merged,
      parsed.data.signatures,
    );
    return record
      ? res.json(record)
      : res.status(409).json({ error: "Housing Log is no longer editable." });
  });

  router.post("/housing-logs/:id/finalize", async (req, res) => {
    const result = await records.finalizeDraft(String(req.params["id"]));
    if (result.outcome === "not_found")
      return res.status(404).json({ error: "Housing Log not found." });
    if (result.outcome === "not_editable")
      return res.status(409).json({
        error: "Housing Log is already finalized or no longer editable.",
      });
    if (result.outcome === "validation_failed") {
      return res.status(422).json({
        error: "Housing Log is not ready to finalize.",
        issues: result.issues,
      });
    }
    return res.json(result.record);
  });

  return router;
}

export default createHousingLogsRouter();
