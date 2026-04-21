import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assistants } from "./assistants";

export const assistantCredentials = pgTable("assistant_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  assistantId: uuid("assistant_id")
    .notNull()
    .unique()
    .references(() => assistants.id, { onDelete: "cascade" }),
  // Root access credential. Always "ssh" (Ed25519 OpenSSH private key) for
  // newly provisioned assistants. Stored as envelope-encrypted ciphertext —
  // see src/lib/crypto/envelope.ts.
  rootCredentialType: text("root_credential_type").notNull(),
  rootCredential: text("root_credential").notNull(),
  // Envelope-encrypted ciphertext.
  gatewayToken: text("gateway_token").notNull(),
  // Randomized per assistant in prepareCredentials (range 20000–29999).
  gatewayPort: integer("gateway_port").notNull().default(18789),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AssistantCredentials = typeof assistantCredentials.$inferSelect;
export type NewAssistantCredentials = typeof assistantCredentials.$inferInsert;
