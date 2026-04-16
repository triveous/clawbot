import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assistants } from "./assistants";

export const assistantCredentials = pgTable("assistant_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  assistantId: uuid("assistant_id")
    .notNull()
    .unique()
    .references(() => assistants.id, { onDelete: "cascade" }),
  // Root access credential. Type is "ssh" (Ed25519 OpenSSH private key) or
  // "password" (plain text). Always "ssh" for newly provisioned assistants.
  // Root key is registered with Hetzner and injected into /root/.ssh/authorized_keys.
  // No openclaw user SSH key — root switches to openclaw via `su - openclaw`.
  rootCredentialType: text("root_credential_type").notNull(),
  rootCredential: text("root_credential").notNull(),
  gatewayToken: text("gateway_token").notNull(),
  // Randomized per assistant in prepareCredentials (range 20000–29999).
  gatewayPort: integer("gateway_port").notNull().default(18789),
  tailscaleAuthKey: text("tailscale_auth_key"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AssistantCredentials = typeof assistantCredentials.$inferSelect;
export type NewAssistantCredentials = typeof assistantCredentials.$inferInsert;
