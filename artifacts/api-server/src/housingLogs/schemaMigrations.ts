export const HOUSING_LOG_STATUS_CONSTRAINT = "housing_logs_status_check";
export const HOUSING_LOG_FINALIZATION_CONSTRAINT =
  "housing_logs_finalization_check";
export const HOUSING_LOG_STATUS_CHECK_SQL = "status IN ('draft', 'finalized')";
export const HOUSING_LOG_FINALIZATION_CHECK_SQL =
  "(status = 'draft' AND finalized_at IS NULL) OR (status = 'finalized' AND finalized_at IS NOT NULL)";

export type HousingLogSchemaMigration = {
  version: number;
  description: string;
  sql: string;
};

// Keep applied entries immutable; append the next numbered migration for every
// future schema change so CREATE TABLE IF NOT EXISTS cannot hide drift.
export const housingLogSchemaMigrations: HousingLogSchemaMigration[] = [
  {
    version: 1,
    description: "Create Housing Logs and enforce lifecycle invariants",
    sql: `
      CREATE TABLE IF NOT EXISTS housing_logs (
        id text PRIMARY KEY,
        log_date date NOT NULL,
        shift text NOT NULL,
        housing_unit text NOT NULL,
        template_version text NOT NULL,
        form_values jsonb NOT NULL,
        events jsonb NOT NULL,
        signatures jsonb NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        finalized_at timestamptz NULL
      );

      UPDATE housing_logs
      SET finalized_at = CASE
        WHEN status = 'finalized' THEN COALESCE(finalized_at, updated_at, created_at, now())
        ELSE NULL
      END;

      ALTER TABLE housing_logs
        DROP CONSTRAINT IF EXISTS ${HOUSING_LOG_STATUS_CONSTRAINT};
      ALTER TABLE housing_logs
        ADD CONSTRAINT ${HOUSING_LOG_STATUS_CONSTRAINT}
        CHECK (${HOUSING_LOG_STATUS_CHECK_SQL});

      ALTER TABLE housing_logs
        DROP CONSTRAINT IF EXISTS ${HOUSING_LOG_FINALIZATION_CONSTRAINT};
      ALTER TABLE housing_logs
        ADD CONSTRAINT ${HOUSING_LOG_FINALIZATION_CONSTRAINT}
        CHECK (${HOUSING_LOG_FINALIZATION_CHECK_SQL});

      CREATE INDEX IF NOT EXISTS housing_logs_date_idx ON housing_logs (log_date);
      CREATE INDEX IF NOT EXISTS housing_logs_status_idx ON housing_logs (status);
      CREATE INDEX IF NOT EXISTS housing_logs_unit_shift_idx ON housing_logs (housing_unit, shift);
    `,
  },
];
