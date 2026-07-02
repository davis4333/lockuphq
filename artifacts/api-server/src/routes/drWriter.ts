import { Router, type IRouter } from "express";
import {
  evaluate6_1,
  generate6_1,
  createClaudeClient,
  type IntakeFacts6_1,
} from "@workspace/dr-writer";

// LOCKUPHQ DR Writer — HTTP routes. Only Charge 6-1 is enabled.
//
// SECURITY / PRIVACY:
// - ANTHROPIC_API_KEY is read from the server environment only. It is never
//   returned to the client, and never logged.
// - Officer intake facts and generated narratives are NEVER logged. Only the
//   request method/url (via pino-http) and an error's class name are logged.
const router: IRouter = Router();

router.get("/dr-writer/6-1/config", (_req, res) => {
  // Report whether server-side live drafting is available, without exposing the key.
  res.json({ liveEnabled: Boolean(process.env.ANTHROPIC_API_KEY) });
});

router.post("/dr-writer/6-1/validate", (req, res) => {
  // The evaluator IS the validator — it is intentionally permissive and handles
  // messy / partial / null input by design, so no rigid schema gate is applied.
  const intake = req.body as IntakeFacts6_1;
  res.json(evaluate6_1(intake));
});

router.post("/dr-writer/6-1/generate", async (req, res) => {
  const intake = (req.body?.intake ?? req.body) as IntakeFacts6_1;

  // RED status is decided locally by the pipeline and returns immediately —
  // Claude is never called for a RED result, so no key is required.
  const evaluation = evaluate6_1(intake);
  if (evaluation.status !== "RED" && !process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({
      error:
        "Live drafting is not configured on the server. An administrator must set ANTHROPIC_API_KEY.",
    });
    return;
  }

  try {
    const output = await generate6_1(intake, createClaudeClient());
    res.json(output);
  } catch (err) {
    // Log only the error class name — never the message (defense in depth) or any content.
    req.log.error(
      { err: err instanceof Error ? err.name : "UnknownError" },
      "DR Writer 6-1 generation failed",
    );
    res.status(502).json({
      error:
        "The drafting service could not complete the request. Please review your facts and try again.",
    });
  }
});

export default router;
