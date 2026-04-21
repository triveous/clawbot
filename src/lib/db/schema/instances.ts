import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { assistants, providerEnum } from "./assistants";

export const instanceStatusEnum = pgEnum("instance_status", [
  "creating",
  "provisioning",
  "running",
  "stopped",
  "error",
  "destroyed",
]);

export const instances = pgTable("instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  assistantId: uuid("assistant_id")
    .notNull()
    .references(() => assistants.id, { onDelete: "cascade" }),
  provider: providerEnum("provider").notNull().default("hetzner"),
  providerServerId: text("provider_server_id"),
  providerSnapshotId: text("provider_snapshot_id").notNull(),
  firewallId: text("firewall_id"),
  ipv4: text("ipv4"),
  region: text("region").notNull(),
  gatewayPort: integer("gateway_port"),
  status: instanceStatusEnum("status").notNull().default("creating"),
  lastError: text("last_error"),
  workflowRunId: text("workflow_run_id"),
  destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Instance = typeof instances.$inferSelect;
export type NewInstance = typeof instances.$inferInsert;
export type InstanceStatus = (typeof instanceStatusEnum.enumValues)[number];
