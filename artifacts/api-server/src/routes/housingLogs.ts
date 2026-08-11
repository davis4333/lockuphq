import { Router, type IRouter } from "express";
import {
  housingLogDraftInputSchema,
  housingLogUpdateSchema,
  housingShifts,
  housingUnits,
  validateHousingLog,
  type HousingLogDraftInput,
  type HousingLogStatus,
  type HousingShift,
  type HousingUnit,
} from "@workspace/housing-log";
import { getHousingLogRepository, type HousingLogRepository } from "../housingLogs/repository";

const isHousingUnit = (value: unknown): value is HousingUnit =>
  typeof value === "string" && housingUnits.includes(value as HousingUnit);
const isHousingShift = (value: unknown): value is HousingShift =>
  typeof value === "string" && housingShifts.includes(value as HousingShift);
const isStatus = (value: unknown): value is HousingLogStatus => value === "draft" || value === "finalized";

export function createHousingLogsRouter(repository?: HousingLogRepository): IRouter {
  const router: IRouter = Router();
  const requiresConfiguredDatabase = repository === undefined;
  const records = repository ?? getHousingLogRepository();

  router.use("/housing-logs", (_req, res, next) => {
    if (requiresConfiguredDatabase && !process.env["DATABASE_URL"]) {
      return res.status(503).json({ error: "Housing Log persistence is not configured. Set DATABASE_URL to enable this module." });
    }
    return next();
  });

  router.post("/housing-logs", async (req, res) => {
    const parsed = housingLogDraftInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid Housing Log draft.", issues: parsed.error.issues });
    const record = await records.create(parsed.data);
    return res.status(201).json(record);
  });

  router.get("/housing-logs", async (req, res) => {
    const filters = {
      ...(isStatus(req.query["status"]) ? { status: req.query["status"] } : {}),
      ...(isHousingUnit(req.query["housingUnit"]) ? { housingUnit: req.query["housingUnit"] } : {}),
      ...(isHousingShift(req.query["shift"]) ? { shift: req.query["shift"] } : {}),
      ...(typeof req.query["logDate"] === "string" ? { logDate: req.query["logDate"] } : {}),
    };
    return res.json(await records.list(filters));
  });

  router.get("/housing-logs/:id", async (req, res) => {
    const record = await records.get(String(req.params["id"]));
    return record ? res.json(record) : res.status(404).json({ error: "Housing Log not found." });
  });

  router.patch("/housing-logs/:id", async (req, res) => {
    const id = String(req.params["id"]);
    const existing = await records.get(id);
    if (!existing) return res.status(404).json({ error: "Housing Log not found." });
    if (existing.status === "finalized") return res.status(409).json({ error: "Finalized Housing Logs cannot be modified." });
    const parsed = housingLogUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid Housing Log update.", issues: parsed.error.issues });
    const merged: HousingLogDraftInput = {
      logDate: parsed.data.logDate ?? existing.logDate,
      shift: parsed.data.shift ?? existing.shift,
      housingUnit: parsed.data.housingUnit ?? existing.housingUnit,
      templateVersion: parsed.data.templateVersion ?? existing.templateVersion,
      values: parsed.data.values ?? existing.values,
      events: parsed.data.events ?? existing.events,
      signatures: parsed.data.signatures ?? existing.signatures,
    };
    const record = await records.updateDraft(id, merged);
    return record ? res.json(record) : res.status(409).json({ error: "Housing Log is no longer editable." });
  });

  router.post("/housing-logs/:id/finalize", async (req, res) => {
    const id = String(req.params["id"]);
    const existing = await records.get(id);
    if (!existing) return res.status(404).json({ error: "Housing Log not found." });
    if (existing.status === "finalized") return res.status(409).json({ error: "Housing Log is already finalized." });
    const input: HousingLogDraftInput = {
      logDate: existing.logDate,
      shift: existing.shift,
      housingUnit: existing.housingUnit,
      templateVersion: existing.templateVersion,
      values: existing.values,
      events: existing.events,
      signatures: existing.signatures,
    };
    const issues = validateHousingLog(input);
    if (issues.length) return res.status(422).json({ error: "Housing Log is not ready to finalize.", issues });
    const record = await records.finalizeDraft(id);
    return record ? res.json(record) : res.status(409).json({ error: "Housing Log is no longer editable." });
  });

  return router;
}

export default createHousingLogsRouter();
