import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  HousingLogEvent,
  HousingLogSignatures,
  HousingLogValue,
} from "@workspace/housing-log";
import {
  HOUSING_LOG_FINALIZATION_CHECK_SQL,
  HOUSING_LOG_FINALIZATION_CONSTRAINT,
  HOUSING_LOG_STATUS_CHECK_SQL,
  HOUSING_LOG_STATUS_CONSTRAINT,
} from "./schemaMigrations";

export const housingLogs = pgTable(
  "housing_logs",
  {
    id: text("id").primaryKey(),
    logDate: date("log_date", { mode: "string" }).notNull(),
    shift: text("shift").notNull(),
    housingUnit: text("housing_unit").notNull(),
    templateVersion: text("template_version").notNull(),
    formValues: jsonb("form_values")
      .$type<Record<string, HousingLogValue>>()
      .notNull(),
    events: jsonb("events").$type<HousingLogEvent[]>().notNull(),
    signatures: jsonb("signatures").$type<HousingLogSignatures>().notNull(),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => [
    index("housing_logs_date_idx").on(table.logDate),
    index("housing_logs_status_idx").on(table.status),
    index("housing_logs_unit_shift_idx").on(table.housingUnit, table.shift),
    check(HOUSING_LOG_STATUS_CONSTRAINT, sql.raw(HOUSING_LOG_STATUS_CHECK_SQL)),
    check(
      HOUSING_LOG_FINALIZATION_CONSTRAINT,
      sql.raw(HOUSING_LOG_FINALIZATION_CHECK_SQL),
    ),
  ],
);
