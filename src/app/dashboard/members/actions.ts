"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

async function requireOrgAdmin() {
  const { userId, orgId, orgRole } = await auth();
  if (!userId || !orgId) throw new Error("Unauthorized");
  if (orgRole !== "org:admin") throw new Error("Forbidden — org admin required");
  return { userId, orgId };
}

export async function listMembers() {
  const { orgId } = await requireOrgAdmin();
  const client = await clerkClient();
  const result = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });
  return result.data.map((m) => ({
    membershipId: m.id,
    userId: m.publicUserData?.userId ?? "",
    role: m.role,
    name: [m.publicUserData?.firstName, m.publicUserData?.lastName]
      .filter(Boolean)
      .join(" ") || null,
    identifier: m.publicUserData?.identifier ?? "",
    imageUrl: m.publicUserData?.imageUrl ?? "",
  }));
}

export async function listInvitations() {
  const { orgId } = await requireOrgAdmin();
  const client = await clerkClient();
  const result = await client.organizations.getOrganizationInvitationList({
    organizationId: orgId,
    status: ["pending"],
  });
  return result.data.map((inv) => ({
    id: inv.id,
    emailAddress: inv.emailAddress,
    role: inv.role,
    createdAt: inv.createdAt,
  }));
}

export async function inviteMember(emailAddress: string, role: string) {
  const { userId, orgId } = await requireOrgAdmin();
  const client = await clerkClient();
  await client.organizations.createOrganizationInvitation({
    organizationId: orgId,
    emailAddress,
    inviterUserId: userId,
    role,
    redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard`,
  });
}

export async function revokeInvitation(invitationId: string) {
  const { userId, orgId } = await requireOrgAdmin();
  const client = await clerkClient();
  await client.organizations.revokeOrganizationInvitation({
    organizationId: orgId,
    invitationId,
    requestingUserId: userId,
  });
}

export async function removeMember(memberUserId: string) {
  const { userId, orgId } = await requireOrgAdmin();
  if (memberUserId === userId) throw new Error("Cannot remove yourself");
  const client = await clerkClient();
  await client.organizations.deleteOrganizationMembership({
    organizationId: orgId,
    userId: memberUserId,
  });
}

export async function updateMemberRole(memberUserId: string, role: string) {
  const { userId, orgId } = await requireOrgAdmin();
  if (memberUserId === userId) throw new Error("Cannot change your own role");
  const client = await clerkClient();
  await client.organizations.updateOrganizationMembership({
    organizationId: orgId,
    userId: memberUserId,
    role,
  });
}
