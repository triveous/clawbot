import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { PROVIDERS } from "./assistants";

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: text("provider", { enum: PROVIDERS }).notNull().default("hetzner"),
  providerSnapshotId: text("provider_snapshot_id").notNull(),
  version: text("version").notNull(),
  openclawVersion: text("openclaw_version").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
