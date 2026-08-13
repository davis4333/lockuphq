import { Router, type IRouter } from "express";
import {
  getHousingLogConfig,
  hasMeaningfulHousingLogContent,
  housingLogDraftInputSchema,
  housingLogDraftUnlockSchema,
  housingLogListFiltersSchema,
  housingLogUpdateSchema,
  type HousingLogDraftCreated,
  type HousingLogDraftInput,
} from "@workspace/housing-log";
import { ensureHousingLogSchema } from "../housingLogs/db";
import {
  draftSessionCookieValue,
  DraftAccessSessions,
  DraftUnlockRateLimiter,
  generateDraftAccessCode,
  hashDraftAccessCode,
  normalizeDraftAccessCode,
  rateLimitKeyForRequest,
  requireDraftAccess,
  setDraftSessionCookie,
} from "../housingLogs/draftAccess";
import {
  getHousingLogRepository,
  type HousingLogRepository,
} from "../housingLogs/repository";

export type HousingLogsRouterOptions = {
  repository?: HousingLogRepository;
  sessions?: DraftAccessSessions;
  rateLimiter?: DraftUnlockRateLimiter;
  secureCookies?: boolean;
};

export function createHousingLogsRouter(
  optionsOrRepository?: HousingLogsRouterOptions | HousingLogRepository,
): IRouter {
  const options: HousingLogsRouterOptions =
    optionsOrRepository && "create" in optionsOrRepository
      ? { repository: optionsOrRepository }
      : (optionsOrRepository ?? {});
  const router: IRouter = Router();
  const requiresConfiguredDatabase = options.repository === undefined;
  const records = options.repository ?? getHousingLogRepository();
  const sessions = options.sessions ?? new DraftAccessSessions();
  const rateLimiter = options.rateLimiter ?? new DraftUnlockRateLimiter();
  const secureCookies =
    options.secureCookies ?? process.env["NODE_ENV"] === "production";

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
    const code = generateDraftAccessCode();
    const record = await records.create(
      parsed.data,
      hashDraftAccessCode(normalizeDraftAccessCode(code)),
    );
    const token = sessions.authorize(
      draftSessionCookieValue(req),
      record.id,
    );
    setDraftSessionCookie(res, token, secureCookies);
    const body: HousingLogDraftCreated = { ...record, accessCode: code };
    return res.status(201).json(body);
  });

  // Session-scoped: only drafts already unlocked in this browser. This is
  // intentionally NOT a public directory of every draft in the system.
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
    const authorizedIds = new Set(
      sessions.authorizedDraftIds(draftSessionCookieValue(req)),
    );
    if (authorizedIds.size === 0) return res.json([]);
    const all = await records.list({ ...parsed.data, status: "draft" });
    return res.json(all.filter((item) => authorizedIds.has(item.id)));
  });

  router.post("/housing-logs/unlock", async (req, res) => {
    const parsed = housingLogDraftUnlockSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Enter the draft access code." });

    const rateLimitKey = rateLimitKeyForRequest(req);
    const lockedForMs = rateLimiter.lockedForMilliseconds(rateLimitKey);
    if (lockedForMs > 0) {
      res.setHeader("Retry-After", String(Math.ceil(lockedForMs / 1000)));
      return res.status(429).json({
        error: `Too many incorrect access codes. Try again in ${Math.ceil(
          lockedForMs / 1000,
        )} seconds.`,
      });
    }

    const hash = hashDraftAccessCode(
      normalizeDraftAccessCode(parsed.data.code),
    );
    const match = await records.findDraftByAccessCodeHash(hash);
    if (!match) {
      rateLimiter.registerFailure(rateLimitKey);
      return res.status(401).json({ error: "Incorrect access code." });
    }
    if (match.status !== "draft") {
      rateLimiter.registerFailure(rateLimitKey);
      return res.status(409).json({
        error:
          "This Housing Log has already been finalized. View it in the admin archive.",
      });
    }
    rateLimiter.registerSuccess(rateLimitKey);
    const token = sessions.authorize(
      draftSessionCookieValue(req),
      match.id,
    );
    setDraftSessionCookie(res, token, secureCookies);
    return res.status(200).json({ draftId: match.id });
  });

  router.get(
    "/housing-logs/:id",
    requireDraftAccess(sessions),
    async (req, res) => {
      const record = await records.get(String(req.params["id"]));
      if (!record)
        return res.status(404).json({ error: "Housing Log not found." });
      if (record.status === "finalized")
        return res.status(403).json({
          error:
            "Finalized Housing Logs are available only in the admin archive.",
        });
      return res.json(record);
    },
  );

  router.patch(
    "/housing-logs/:id",
    requireDraftAccess(sessions),
    async (req, res) => {
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
    },
  );

  router.post(
    "/housing-logs/:id/finalize",
    requireDraftAccess(sessions),
    async (req, res) => {
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
    },
  );

  return router;
}

export default createHousingLogsRouter();
