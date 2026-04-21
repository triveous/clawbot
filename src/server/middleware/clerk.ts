import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, organizations } from "@/lib/db/schema";
import type { User, Organization } from "@/lib/db/schema";
import { upsertOrganization } from "@/lib/clerk/org-sync";

async function ensureUser(clerkId: string): Promise<User> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });

  if (existing) return existing;

  const clerkUser = await currentUser();
  if (!clerkUser) throw new HTTPException(401, { message: "Unauthorized" });

  const email =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId,
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

async function ensureOrg(
  clerkUserId: string,
  clerkOrgId: string,
): Promise<Organization> {
  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.id, clerkOrgId),
  });
  if (existing) return existing;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  return upsertOrganization({
    id: org.id,
    name: org.name,
    slug: org.slug ?? null,
  });
}

async function autoCreatePersonalOrg(
  clerkUserId: string,
): Promise<Organization> {
  const client = await clerkClient();
  const clerkUser = await currentUser();
  const displayName = clerkUser
    ? `${[clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || "My"}'s Workspace`
    : "My Workspace";

  const org = await client.organizations.createOrganization({
    name: displayName,
    createdBy: clerkUserId,
  });

  await client.organizations.updateOrganizationMembership({
    organizationId: org.id,
    userId: clerkUserId,
    role: "org:admin",
  });

  return upsertOrganization({ id: org.id, name: org.name, slug: org.slug ?? null });
}

/**
 * Hono middleware that:
 * 1. Validates Clerk session (401 if missing)
 * 2. Guarantees user row exists in DB
 * 3. Guarantees an active org exists; auto-creates a personal org if none
 * 4. Sets userId, dbUser, orgId, dbOrg on context
 */
export function clerkAuth() {
  return async (c: Context, next: Next) => {
    const { userId, orgId } = await auth();

    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const dbUser = await ensureUser(userId);

    let resolvedOrgId = orgId;
    let dbOrg: Organization;

    if (resolvedOrgId) {
      dbOrg = await ensureOrg(userId, resolvedOrgId);
    } else {
      dbOrg = await autoCreatePersonalOrg(userId);
      resolvedOrgId = dbOrg.id;
    }

    c.set("userId", userId);
    c.set("dbUser", dbUser);
    c.set("orgId", resolvedOrgId);
    c.set("dbOrg", dbOrg);

    const logger = c.get("logger");
    if (logger) {
      c.set("logger", logger.with({ userId, orgId: resolvedOrgId }));
    }

    await next();
  };
}

declare module "hono" {
  interface ContextVariableMap {
    userId: string;
    dbUser: User;
    orgId: string;
    dbOrg: Organization;
  }
}
