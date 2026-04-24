import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Platform admin = Clerk user with `publicMetadata.role === "admin"`.
 * Set via Clerk dashboard: User → Public metadata → `{ "role": "admin" }`.
 *
 * Prefers the session claim (configure Clerk session token to embed
 * publicMetadata under "metadata") to avoid a network round-trip; falls
 * back to an API lookup if the claim isn't present.
 */
export async function isPlatformAdmin(): Promise<boolean> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return false;

  const claimMeta = (sessionClaims as Record<string, unknown>)?.metadata as
    | Record<string, unknown>
    | undefined;
  if (claimMeta?.role === "admin") return true;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return (user.publicMetadata as { role?: string })?.role === "admin";
}

export async function requirePlatformAdmin(): Promise<void> {
  if (!(await isPlatformAdmin())) {
    throw new Error("Forbidden — platform admin required");
  }
}
