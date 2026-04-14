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
  rootCredentialType: text("root_credential_type").notNull(),
  rootCredential: text("root_credential").notNull(),
  sshPrivateKey: text("ssh_private_key").notNull(),
  sshPublicKey: text("ssh_public_key").notNull(),
  gatewayToken: text("gateway_token").notNull(),
  gatewayPort: integer("gateway_port").notNull().default(18789),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AssistantCredentials = typeof assistantCredentials.$inferSelect;
export type NewAssistantCredentials = typeof assistantCredentials.$inferInsert;
