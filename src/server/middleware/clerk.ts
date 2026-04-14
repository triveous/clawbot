import { auth, currentUser } from "@clerk/nextjs/server";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";

/**
 * Ensures the authenticated Clerk user has a corresponding row in the `users`
 * table. Called on every protected request.
 *
 * Why: Clerk webhooks (user.created) sync users to DB, but webhooks can be
 * delayed or misconfigured. This guarantees the user record always exists
 * before any DB operation that references users.id via FK.
 */
async function ensureUser(clerkId: string): Promise<User> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (existing) return existing;

  // User not in DB yet — fetch profile from Clerk session (no extra API call)
  const clerkUser = await currentUser();
  if (!clerkUser) throw new HTTPException(401, { message: "Unauthorized" });

  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) throw new HTTPException(400, { message: "User has no email" });

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      name:
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        null,
      avatarUrl: clerkUser.imageUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email,
        name:
          [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null,
        avatarUrl: clerkUser.imageUrl ?? null,
      },
    })
    .returning();

  return created;
}

/**
 * Hono middleware that:
 * 1. Validates Clerk session (401 if missing)
 * 2. Guarantees user row exists in DB (creates from Clerk profile if needed)
 * 3. Sets `userId` (Clerk ID) and `dbUser` on context for downstream handlers
 */
export function clerkAuth() {
  return async (c: Context, next: Next) => {
    const { userId } = await auth();

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const dbUser = await ensureUser(userId);

    c.set("userId", userId);
    c.set("dbUser", dbUser);
    await next();
  };
}

// Extend Hono context type
declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    dbUser: User;
  }
}
