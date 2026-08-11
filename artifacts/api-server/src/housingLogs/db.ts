import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;
let housingLogDatabaseAvailable = false;

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

export function getHousingLogDatabase(): NodePgDatabase<typeof schema> {
  database ??= drizzle(getPool(), { schema });
  return database;
}

export async function ensureHousingLogSchema(): Promise<void> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS housing_logs (
      id text PRIMARY KEY,
      log_date date NOT NULL,
      shift text NOT NULL,
      housing_unit text NOT NULL,
      template_version text NOT NULL,
      form_values jsonb NOT NULL,
      events jsonb NOT NULL,
      signatures jsonb NOT NULL,
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      finalized_at timestamptz NULL
    );
    CREATE INDEX IF NOT EXISTS housing_logs_date_idx ON housing_logs (log_date);
    CREATE INDEX IF NOT EXISTS housing_logs_status_idx ON housing_logs (status);
    CREATE INDEX IF NOT EXISTS housing_logs_unit_shift_idx ON housing_logs (housing_unit, shift);
  `);
  housingLogDatabaseAvailable = true;
}

export function isHousingLogDatabaseAvailable(): boolean {
  return housingLogDatabaseAvailable;
}

export function markHousingLogDatabaseUnavailable(): void {
  housingLogDatabaseAvailable = false;
}
