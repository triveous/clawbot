import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const assistantStatusEnum = pgEnum("assistant_status", [
  "creating",
  "provisioning",
  "running",
  "stopped",
  "error",
]);

export const providerEnum = pgEnum("provider", ["hetzner"]);

export const accessModeEnum = pgEnum("access_mode", [
  "ssh",
  "tailscale_serve",
]);

export const assistants = pgTable("assistants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: assistantStatusEnum("status").notNull().default("creating"),
  provider: providerEnum("provider").notNull().default("hetzner"),
  providerServerId: text("provider_server_id"),
  providerSnapshotId: text("provider_snapshot_id"),
  ipv4: text("ipv4"),
  hostname: text("hostname"),
  dnsRecordId: text("dns_record_id"),
  dnsZoneId: text("dns_zone_id"),
  dnsBaseDomain: text("dns_base_domain"),
  accessMode: accessModeEnum("access_mode").notNull().default("ssh"),
  sshAllowedIps: text("ssh_allowed_ips"),
  firewallId: text("firewall_id"),
  // Persisted from credentials at finalize time so toAssistantResponse needs no join.
  gatewayPort: integer("gateway_port"),
  region: text("region").notNull().default("fsn1"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Assistant = typeof assistants.$inferSelect;
export type NewAssistant = typeof assistants.$inferInsert;
export type AssistantStatus = (typeof assistantStatusEnum.enumValues)[number];
export type Provider = (typeof providerEnum.enumValues)[number];
export type AccessMode = (typeof accessModeEnum.enumValues)[number];
