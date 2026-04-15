import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { providerEnum } from "./assistants";

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: providerEnum("provider").notNull().default("hetzner"),
  providerSnapshotId: text("provider_snapshot_id").notNull(),
  version: text("version").notNull(),
  openclawVersion: text("openclaw_version").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
