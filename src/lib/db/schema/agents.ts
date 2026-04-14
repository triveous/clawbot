import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const agentStatusEnum = pgEnum("agent_status", [
  "creating",
  "provisioning",
  "running",
  "stopped",
  "error",
]);

export const providerEnum = pgEnum("provider", ["hetzner"]);

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: agentStatusEnum("status").notNull().default("creating"),
  provider: providerEnum("provider").notNull().default("hetzner"),
  providerServerId: text("provider_server_id"),
  providerSnapshotId: text("provider_snapshot_id"),
  ipv4: text("ipv4"),
  region: text("region").notNull().default("fsn1"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type AgentStatus = (typeof agentStatusEnum.enumValues)[number];
export type Provider = (typeof providerEnum.enumValues)[number];
