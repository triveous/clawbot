import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  tagline: text("tagline"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  tier: integer("tier").notNull(),
  providerSpec: jsonb("provider_spec")
    .$type<Record<string, unknown>>()
    .notNull(),
  billingProviderIds: jsonb("billing_provider_ids")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  resourceLimits: jsonb("resource_limits")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
