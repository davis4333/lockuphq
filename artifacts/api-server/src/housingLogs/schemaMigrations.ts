export const HOUSING_LOG_STATUS_CONSTRAINT = "housing_logs_status_check";
export const HOUSING_LOG_FINALIZATION_CONSTRAINT =
  "housing_logs_finalization_check";
export const HOUSING_LOG_STATUS_CHECK_SQL = "status IN ('draft', 'finalized')";
export const HOUSING_LOG_FINALIZATION_CHECK_SQL =
  "(status = 'draft' AND finalized_at IS NULL) OR (status = 'finalized' AND finalized_at IS NOT NULL)";
export const HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CONSTRAINT =
  "housing_log_delivery_settings_singleton_check";
export const HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CHECK_SQL =
  "id = 'default'";
export const HOUSING_LOG_DELIVERY_ATTEMPT_STATUS_CONSTRAINT =
  "housing_log_delivery_attempts_status_check";
export const HOUSING_LOG_DELIVERY_ATTEMPT_STATUS_CHECK_SQL =
  "status IN ('sending', 'sent', 'failed')";
export const HOUSING_LOG_DELIVERY_ATTEMPT_TRIGGER_CONSTRAINT =
  "housing_log_delivery_attempts_trigger_check";
export const HOUSING_LOG_DELIVERY_ATTEMPT_TRIGGER_CHECK_SQL =
  "trigger_type = 'manual'";
export const HOUSING_LOG_DELIVERY_ATTEMPT_COMPLETENESS_CONSTRAINT =
  "housing_log_delivery_attempts_completeness_check";
export const HOUSING_LOG_DELIVERY_ATTEMPT_COMPLETENESS_CHECK_SQL =
  "package_completeness IN ('COMPLETE', 'INCOMPLETE')";
export const HOUSING_LOG_DELIVERY_ATTEMPT_LIFECYCLE_CONSTRAINT =
  "housing_log_delivery_attempts_lifecycle_check";
export const HOUSING_LOG_DELIVERY_ATTEMPT_LIFECYCLE_CHECK_SQL =
  "(status = 'sending' AND completed_at IS NULL AND provider_message_id IS NULL AND failure_category IS NULL AND failure_message IS NULL) OR (status = 'sent' AND completed_at IS NOT NULL AND provider_message_id IS NOT NULL AND failure_category IS NULL AND failure_message IS NULL) OR (status = 'failed' AND completed_at IS NOT NULL AND provider_message_id IS NULL AND failure_category IS NOT NULL AND failure_message IS NOT NULL)";
export const HOUSING_LOG_ACCESS_CODE_HASH_UNIQUE_INDEX =
  "housing_logs_access_code_hash_unique_idx";
export const HOUSING_LOG_SUBMISSION_ID_UNIQUE_INDEX =
  "housing_logs_submission_id_unique_idx";
export const HOUSING_LOG_REMOVAL_CONSTRAINT = "housing_logs_removal_check";
export const HOUSING_LOG_REMOVAL_CHECK_SQL =
  "removed_at IS NULL OR status = 'finalized'";

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
  {
    version: 2,
    description: "Create Housing Log delivery recipient settings",
    sql: `
      CREATE TABLE IF NOT EXISTS housing_log_delivery_settings (
        id text PRIMARY KEY,
        primary_email text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ${HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CONSTRAINT}
          CHECK (${HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CHECK_SQL})
      );

      CREATE TABLE IF NOT EXISTS housing_log_delivery_recipients (
        id text PRIMARY KEY,
        settings_id text NOT NULL REFERENCES housing_log_delivery_settings(id) ON DELETE CASCADE,
        email text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS housing_log_delivery_recipients_email_ci_idx
        ON housing_log_delivery_recipients (lower(email));
      CREATE INDEX IF NOT EXISTS housing_log_delivery_recipients_active_idx
        ON housing_log_delivery_recipients (active);
    `,
  },
  {
    version: 3,
    description: "Create Housing Log delivery attempt ledger",
    sql: `
      CREATE TABLE IF NOT EXISTS housing_log_delivery_attempts (
        id text PRIMARY KEY,
        log_date date NOT NULL,
        shift text NOT NULL,
        trigger_type text NOT NULL,
        started_at timestamptz NOT NULL,
        completed_at timestamptz NULL,
        package_completeness text NOT NULL,
        package_sha256 text NOT NULL,
        recipients jsonb NOT NULL,
        provider_message_id text NULL,
        status text NOT NULL,
        failure_category text NULL,
        failure_message text NULL,
        initiated_by text NOT NULL,
        CONSTRAINT ${HOUSING_LOG_DELIVERY_ATTEMPT_STATUS_CONSTRAINT}
          CHECK (${HOUSING_LOG_DELIVERY_ATTEMPT_STATUS_CHECK_SQL}),
        CONSTRAINT ${HOUSING_LOG_DELIVERY_ATTEMPT_TRIGGER_CONSTRAINT}
          CHECK (${HOUSING_LOG_DELIVERY_ATTEMPT_TRIGGER_CHECK_SQL}),
        CONSTRAINT ${HOUSING_LOG_DELIVERY_ATTEMPT_COMPLETENESS_CONSTRAINT}
          CHECK (${HOUSING_LOG_DELIVERY_ATTEMPT_COMPLETENESS_CHECK_SQL}),
        CONSTRAINT ${HOUSING_LOG_DELIVERY_ATTEMPT_LIFECYCLE_CONSTRAINT}
          CHECK (${HOUSING_LOG_DELIVERY_ATTEMPT_LIFECYCLE_CHECK_SQL}),
        CONSTRAINT housing_log_delivery_attempts_checksum_check
          CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
        CONSTRAINT housing_log_delivery_attempts_recipients_check
          CHECK (jsonb_typeof(recipients) = 'array' AND jsonb_array_length(recipients) > 0),
        CONSTRAINT housing_log_delivery_attempts_initiator_check
          CHECK (initiated_by = 'admin')
      );

      CREATE INDEX IF NOT EXISTS housing_log_delivery_attempts_date_shift_idx
        ON housing_log_delivery_attempts (log_date, shift, started_at);
      CREATE INDEX IF NOT EXISTS housing_log_delivery_attempts_status_idx
        ON housing_log_delivery_attempts (status);
    `,
  },
  {
    version: 4,
    description: "Add per-draft access-code protection to Housing Logs",
    sql: `
      ALTER TABLE housing_logs ADD COLUMN IF NOT EXISTS access_code_hash text NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS ${HOUSING_LOG_ACCESS_CODE_HASH_UNIQUE_INDEX}
        ON housing_logs (access_code_hash) WHERE access_code_hash IS NOT NULL;
    `,
  },
  {
    version: 5,
    description:
      "Add client submission-id idempotency key for direct finalize-only writes",
    sql: `
      ALTER TABLE housing_logs ADD COLUMN IF NOT EXISTS submission_id text NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS ${HOUSING_LOG_SUBMISSION_ID_UNIQUE_INDEX}
        ON housing_logs (submission_id) WHERE submission_id IS NOT NULL;
    `,
  },
  {
    version: 6,
    description:
      "Add admin-only soft-delete marker for an accidentally finalized duplicate Housing Log",
    sql: `
      ALTER TABLE housing_logs ADD COLUMN IF NOT EXISTS removed_at timestamptz NULL;

      ALTER TABLE housing_logs
        DROP CONSTRAINT IF EXISTS ${HOUSING_LOG_REMOVAL_CONSTRAINT};
      ALTER TABLE housing_logs
        ADD CONSTRAINT ${HOUSING_LOG_REMOVAL_CONSTRAINT}
        CHECK (${HOUSING_LOG_REMOVAL_CHECK_SQL});
    `,
  },
];
