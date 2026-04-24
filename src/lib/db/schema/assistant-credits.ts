import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { organizations } from "./organizations";
import { plans } from "./plans";
import { assistants } from "./assistants";
import { subscriptions } from "./subscriptions";

export const CREDIT_STATUSES = [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
] as const;
export type CreditStatus = (typeof CREDIT_STATUSES)[number];

export const assistantCredits = sqliteTable(
  "assistant_credits",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status", { enum: CREDIT_STATUSES })
      .notNull()
      .default("incomplete"),
    source: text("source").notNull().default("stripe"),
    subscriptionId: text("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    externalSubscriptionId: text("external_subscription_id").unique(),
    currentPeriodStart: integer("current_period_start", { mode: "timestamp" }),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp" }),
    consumedByAssistantId: text("consumed_by_assistant_id").references(
      () => assistants.id,
      { onDelete: "set null" },
    ),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("assistant_credits_org_status_plan_idx").on(
      t.orgId,
      t.status,
      t.planId,
    ),
  ],
);

export type AssistantCredit = typeof assistantCredits.$inferSelect;
export type NewAssistantCredit = typeof assistantCredits.$inferInsert;
