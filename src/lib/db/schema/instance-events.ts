import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { instances } from "./instances";

export const instanceEvents = pgTable(
  "instance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    status: text("status").notNull(),
    message: text("message"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("instance_events_instance_created_idx").on(t.instanceId, t.createdAt)],
);

export type InstanceEvent = typeof instanceEvents.$inferSelect;
export type NewInstanceEvent = typeof instanceEvents.$inferInsert;
