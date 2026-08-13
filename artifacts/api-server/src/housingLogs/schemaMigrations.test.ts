import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  housingLogDeliveryRecipients,
  housingLogDeliverySettings,
  housingLogDeliveryAttempts,
  housingLogs,
} from "./schema";
import {
  HOUSING_LOG_ACCESS_CODE_HASH_UNIQUE_INDEX,
  HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CHECK_SQL,
  HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CONSTRAINT,
  HOUSING_LOG_DELIVERY_ATTEMPT_COMPLETENESS_CONSTRAINT,
  HOUSING_LOG_DELIVERY_ATTEMPT_LIFECYCLE_CONSTRAINT,
  HOUSING_LOG_DELIVERY_ATTEMPT_STATUS_CONSTRAINT,
  HOUSING_LOG_DELIVERY_ATTEMPT_TRIGGER_CONSTRAINT,
  HOUSING_LOG_FINALIZATION_CHECK_SQL,
  HOUSING_LOG_FINALIZATION_CONSTRAINT,
  HOUSING_LOG_STATUS_CHECK_SQL,
  HOUSING_LOG_STATUS_CONSTRAINT,
  housingLogSchemaMigrations,
} from "./schemaMigrations";

test("Drizzle and bootstrap migrations enforce the same lifecycle constraints", () => {
  const drizzleChecks = getTableConfig(housingLogs).checks.map(
    (constraint) => constraint.name,
  );
  assert.ok(drizzleChecks.includes(HOUSING_LOG_STATUS_CONSTRAINT));
  assert.ok(drizzleChecks.includes(HOUSING_LOG_FINALIZATION_CONSTRAINT));

  const migrationSql = housingLogSchemaMigrations
    .map((item) => item.sql)
    .join("\n");
  assert.ok(migrationSql.includes(`CHECK (${HOUSING_LOG_STATUS_CHECK_SQL})`));
  assert.ok(
    migrationSql.includes(`CHECK (${HOUSING_LOG_FINALIZATION_CHECK_SQL})`),
  );
  assert.match(
    migrationSql,
    /COALESCE\(finalized_at, updated_at, created_at, now\(\)\)/,
  );
});

test("delivery settings Drizzle schema matches the append-only migration", () => {
  const settingsConfig = getTableConfig(housingLogDeliverySettings);
  assert.ok(
    settingsConfig.checks.some(
      (constraint) =>
        constraint.name === HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CONSTRAINT,
    ),
  );
  const recipientConfig = getTableConfig(housingLogDeliveryRecipients);
  assert.ok(
    recipientConfig.indexes.some(
      (index) =>
        index.config.name === "housing_log_delivery_recipients_email_ci_idx" &&
        index.config.unique,
    ),
  );
  assert.equal(recipientConfig.foreignKeys.length, 1);

  const migration = housingLogSchemaMigrations.find(
    (item) => item.version === 2,
  );
  assert.ok(migration);
  assert.match(
    migration.sql,
    /CREATE TABLE IF NOT EXISTS housing_log_delivery_settings/,
  );
  assert.match(
    migration.sql,
    /CREATE TABLE IF NOT EXISTS housing_log_delivery_recipients/,
  );
  assert.ok(
    migration.sql.includes(
      `CHECK (${HOUSING_LOG_DELIVERY_SETTINGS_SINGLETON_CHECK_SQL})`,
    ),
  );
  assert.match(
    migration.sql,
    /UNIQUE INDEX IF NOT EXISTS[\s\S]*lower\(email\)/,
  );
  assert.match(migration.sql, /ON DELETE CASCADE/);
  assert.doesNotMatch(migration.sql, /ALTER TABLE housing_logs\b/);
});

test("Housing Log migrations are ordered and uniquely versioned", () => {
  const versions = housingLogSchemaMigrations.map((item) => item.version);
  assert.deepEqual(
    versions,
    [...versions].sort((left, right) => left - right),
  );
  assert.equal(new Set(versions).size, versions.length);
  assert.ok(
    versions.every((version) => Number.isSafeInteger(version) && version > 0),
  );
});

test("delivery-attempt ledger schema matches the append-only lifecycle migration", () => {
  const config = getTableConfig(housingLogDeliveryAttempts);
  const checkNames = config.checks.map((constraint) => constraint.name);
  for (const name of [
    HOUSING_LOG_DELIVERY_ATTEMPT_STATUS_CONSTRAINT,
    HOUSING_LOG_DELIVERY_ATTEMPT_TRIGGER_CONSTRAINT,
    HOUSING_LOG_DELIVERY_ATTEMPT_COMPLETENESS_CONSTRAINT,
    HOUSING_LOG_DELIVERY_ATTEMPT_LIFECYCLE_CONSTRAINT,
    "housing_log_delivery_attempts_checksum_check",
    "housing_log_delivery_attempts_recipients_check",
    "housing_log_delivery_attempts_initiator_check",
  ])
    assert.ok(checkNames.includes(name));

  const migration = housingLogSchemaMigrations.find(
    (item) => item.version === 3,
  );
  assert.ok(migration);
  assert.match(
    migration.sql,
    /CREATE TABLE IF NOT EXISTS housing_log_delivery_attempts/,
  );
  assert.match(migration.sql, /status IN \('sending', 'sent', 'failed'\)/);
  assert.match(migration.sql, /trigger_type = 'manual'/);
  assert.match(
    migration.sql,
    /package_completeness IN \('COMPLETE', 'INCOMPLETE'\)/,
  );
  assert.match(migration.sql, /jsonb_array_length\(recipients\) > 0/);
  assert.doesNotMatch(migration.sql, /ALTER TABLE housing_logs\b/);
  assert.doesNotMatch(
    migration.sql,
    /ALTER TABLE housing_log_delivery_settings\b/,
  );
});

test("draft access-code migration only adds a nullable column and a partial unique index", () => {
  const drizzleIndexes = getTableConfig(housingLogs).indexes;
  assert.ok(
    drizzleIndexes.some(
      (index) => index.config.name === HOUSING_LOG_ACCESS_CODE_HASH_UNIQUE_INDEX,
    ),
  );

  const migration = housingLogSchemaMigrations.find(
    (item) => item.version === 4,
  );
  assert.ok(migration);
  // Additive and idempotent: adds a nullable column, never touches existing
  // columns/rows, and is safe to re-run.
  assert.match(
    migration.sql,
    /ALTER TABLE housing_logs ADD COLUMN IF NOT EXISTS access_code_hash text NULL/,
  );
  assert.doesNotMatch(migration.sql, /DROP COLUMN/i);
  assert.doesNotMatch(migration.sql, /DROP TABLE/i);
  assert.doesNotMatch(migration.sql, /ALTER COLUMN/i);
  assert.doesNotMatch(migration.sql, /\bUPDATE\b/i);
  assert.match(
    migration.sql,
    new RegExp(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${HOUSING_LOG_ACCESS_CODE_HASH_UNIQUE_INDEX}[\\s\\S]*WHERE access_code_hash IS NOT NULL`,
    ),
  );
});
