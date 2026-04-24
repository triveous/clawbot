import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { instances } from "./instances";

export const instanceEvents = sqliteTable(
  "instance_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    status: text("status").notNull(),
    message: text("message"),
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("instance_events_instance_created_idx").on(
      t.instanceId,
      t.createdAt,
    ),
  ],
);

export type InstanceEvent = typeof instanceEvents.$inferSelect;
export type NewInstanceEvent = typeof instanceEvents.$inferInsert;
