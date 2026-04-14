import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface ClerkUserEvent {
  id: string;
  email_addresses: Array<{ email_address: string }>;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
}

export async function handleUserCreated(data: ClerkUserEvent) {
  const email = data.email_addresses[0]?.email_address;
  if (!email) return;

  await db.insert(users).values({
    clerkId: data.id,
    email,
    name: [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
    avatarUrl: data.image_url,
  });
}

export async function handleUserUpdated(data: ClerkUserEvent) {
  const email = data.email_addresses[0]?.email_address;
  if (!email) return;

  await db
    .update(users)
    .set({
      email,
      name:
        [data.first_name, data.last_name].filter(Boolean).join(" ") || null,
      avatarUrl: data.image_url,
    })
    .where(eq(users.clerkId, data.id));
}

export async function handleUserDeleted(data: { id: string }) {
  await db.delete(users).where(eq(users.clerkId, data.id));
}
