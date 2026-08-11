import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true, limit: "3mb" }));

app.use("/api", router);

export const jsonErrorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next,
) => {
  const errorType =
    typeof error === "object" && error && "type" in error
      ? String(error.type)
      : "";
  if (errorType === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON request." });
    return;
  }
  if (errorType === "entity.too.large") {
    res.status(413).json({ error: "Request body is too large." });
    return;
  }
  logger.error(
    {
      errName: error instanceof Error ? error.name : "UnknownError",
      requestId: req.id,
      method: req.method,
      path: req.path,
    },
    "API request failed",
  );
  res
    .status(500)
    .json({ error: "The request could not be completed. Try again." });
};

app.use(jsonErrorHandler);

export default app;
