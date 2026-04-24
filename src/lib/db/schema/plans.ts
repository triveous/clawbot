import {
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  tier: integer("tier").notNull(),
  providerSpec: text("provider_spec", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  billingProviderIds: text("billing_provider_ids", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  resourceLimits: text("resource_limits", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  benefits: text("benefits", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
