import app from "./app";
import { logger } from "./lib/logger";
import {
  ensureHousingLogSchema,
  markHousingLogDatabaseUnavailable,
} from "./housingLogs/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  if (process.env["DATABASE_URL"]) {
    try {
      await ensureHousingLogSchema();
    } catch (error) {
      markHousingLogDatabaseUnavailable();
      logger.error(
        { errName: error instanceof Error ? error.name : "UnknownError" },
        "Housing Log database initialization failed; Housing Log routes will return 503",
      );
    }
  } else {
    logger.warn(
      "DATABASE_URL is not configured; Housing Log persistence is unavailable",
    );
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ errName: err.name }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

start().catch((error: unknown) => {
  logger.error(
    { errName: error instanceof Error ? error.name : "UnknownError" },
    "Failed to initialize the API server",
  );
  process.exit(1);
});
