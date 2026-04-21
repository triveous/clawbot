import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { plans } from "./plans";

export const assistantStatusEnum = pgEnum("assistant_status", [
  "creating",
  "active",
  "error",
  "stopped",
]);

export const providerEnum = pgEnum("provider", ["hetzner"]);

export const accessModeEnum = pgEnum("access_mode", [
  "ssh",
  "tailscale_serve",
]);

export const assistants = pgTable("assistants", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),
  // FK to instances.id is added via raw SQL in a follow-up migration to avoid
  // the drizzle-kit circular import headache. The column type and semantics
  // match instances.id (uuid). We enforce the relationship at the
  // application layer until the migration lands.
  instanceId: uuid("instance_id"),
  name: text("name").notNull(),
  status: assistantStatusEnum("status").notNull().default("creating"),
  provider: providerEnum("provider").notNull().default("hetzner"),
  hostname: text("hostname"),
  dnsRecordId: text("dns_record_id"),
  dnsZoneId: text("dns_zone_id"),
  dnsBaseDomain: text("dns_base_domain"),
  accessMode: accessModeEnum("access_mode").notNull().default("ssh"),
  sshAllowedIps: text("ssh_allowed_ips"),
  region: text("region").notNull().default("fsn1"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
