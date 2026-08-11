import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { housingLogs } from "./schema";
import {
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
