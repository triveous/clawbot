import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import type { Organization } from "@/lib/db/schema";

export interface ClerkOrgData {
  id: string;
  name: string;
  slug: string | null;
}

export async function upsertOrganization(
  org: ClerkOrgData,
): Promise<Organization> {
  const slug = org.slug ?? org.id;

  const [row] = await db
    .insert(organizations)
    .values({ id: org.id, name: org.name, slug })
    .onConflictDoUpdate({
      target: organizations.id,
      set: { name: org.name, slug },
    })
    .returning();

  return row;
}
