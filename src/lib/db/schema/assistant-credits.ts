import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { plans } from "./plans";
import { assistants } from "./assistants";
import { subscriptions } from "./subscriptions";

export const creditStatusEnum = pgEnum("credit_status", [
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "expired",
]);

export const assistantCredits = pgTable(
  "assistant_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: creditStatusEnum("status").notNull().default("incomplete"),
    source: text("source").notNull().default("stripe"),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    externalSubscriptionId: text("external_subscription_id").unique(),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    consumedByAssistantId: uuid("consumed_by_assistant_id").references(
      () => assistants.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("assistant_credits_org_status_plan_idx").on(t.orgId, t.status, t.planId)],
);

export type AssistantCredit = typeof assistantCredits.$inferSelect;
export type NewAssistantCredit = typeof assistantCredits.$inferInsert;
export type CreditStatus = (typeof creditStatusEnum.enumValues)[number];
