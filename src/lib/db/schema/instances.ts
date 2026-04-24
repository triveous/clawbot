import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { assistants, PROVIDERS } from "./assistants";

export const INSTANCE_STATUSES = [
  "creating",
  "provisioning",
  "running",
  "stopped",
  "error",
  "destroyed",
] as const;
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number];

export const instances = sqliteTable("instances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  assistantId: text("assistant_id")
    .notNull()
    .references(() => assistants.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: PROVIDERS }).notNull().default("hetzner"),
  providerServerId: text("provider_server_id"),
  providerSnapshotId: text("provider_snapshot_id").notNull(),
  firewallId: text("firewall_id"),
  ipv4: text("ipv4"),
  region: text("region").notNull(),
  gatewayPort: integer("gateway_port"),
  status: text("status", { enum: INSTANCE_STATUSES })
    .notNull()
    .default("creating"),
  lastError: text("last_error"),
  workflowRunId: text("workflow_run_id"),
  destroyedAt: integer("destroyed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export type Instance = typeof instances.$inferSelect;
export type NewInstance = typeof instances.$inferInsert;
