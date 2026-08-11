import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";
import { housingLogSchemaMigrations } from "./schemaMigrations";
import { createRetriableInitializer } from "./schemaInitialization";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

function connectionString(): string {
  const value = process.env["DATABASE_URL"];
  if (!value)
    throw new Error("DATABASE_URL is required for Housing Log persistence.");
  return value;
}

function getPool(): Pool {
  pool ??= new Pool({ connectionString: connectionString() });
  return pool;
}

async function applyPendingMigrations(client: PoolClient): Promise<void> {
  await client.query("BEGIN");
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('lockuphq_housing_log_schema'))",
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS housing_log_schema_migrations (
        version integer PRIMARY KEY,
        description text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<{ version: number }>(
      "SELECT version FROM housing_log_schema_migrations",
    );
    const appliedVersions = new Set(applied.rows.map((row) => row.version));

    for (const migration of housingLogSchemaMigrations) {
      if (appliedVersions.has(migration.version)) continue;
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO housing_log_schema_migrations (version, description) VALUES ($1, $2)",
        [migration.version, migration.description],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function initializeSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await applyPendingMigrations(client);
  } finally {
    client.release();
  }
}

const initializer = createRetriableInitializer(initializeSchema);

export function getHousingLogDatabase(): NodePgDatabase<typeof schema> {
  database ??= drizzle(getPool(), { schema });
  return database;
}

export async function ensureHousingLogSchema(force = false): Promise<boolean> {
  if (!process.env["DATABASE_URL"]) return false;
  return initializer.ensureReady(force);
}

export function isHousingLogDatabaseAvailable(): boolean {
  return initializer.isReady();
}

export function getHousingLogInitializationError(): unknown {
  return initializer.lastError();
}

export function markHousingLogDatabaseUnavailable(): void {
  initializer.markUnavailable();
}
