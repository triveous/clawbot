import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { plans } from "./plans";

export const ASSISTANT_STATUSES = [
  "creating",
  "active",
  "error",
  "stopped",
] as const;
export type AssistantStatus = (typeof ASSISTANT_STATUSES)[number];

export const PROVIDERS = ["hetzner"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const ACCESS_MODES = ["ssh", "tailscale_serve"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

export const assistants = sqliteTable("assistants", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  // FK to instances.id is added via raw SQL in a follow-up migration to avoid
  // the drizzle-kit circular import headache. The column type and semantics
  // match instances.id (text uuid). We enforce the relationship at the
  // application layer until the migration lands.
  instanceId: text("instance_id"),
  name: text("name").notNull(),
  status: text("status", { enum: ASSISTANT_STATUSES })
    .notNull()
    .default("creating"),
  provider: text("provider", { enum: PROVIDERS })
    .notNull()
    .default("hetzner"),
  hostname: text("hostname"),
  dnsRecordId: text("dns_record_id"),
  dnsZoneId: text("dns_zone_id"),
  dnsBaseDomain: text("dns_base_domain"),
  accessMode: text("access_mode", { enum: ACCESS_MODES })
    .notNull()
    .default("ssh"),
  sshAllowedIps: text("ssh_allowed_ips"),
  region: text("region").notNull().default("fsn1"),
  lastErrorAt: integer("last_error_at", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export type Assistant = typeof assistants.$inferSelect;
export type NewAssistant = typeof assistants.$inferInsert;
