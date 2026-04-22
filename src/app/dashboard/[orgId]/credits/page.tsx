import { redirect } from "next/navigation";

// Credits were merged into /billing per the design. Keep this route so any
// bookmarks or in-app deep-links still resolve somewhere useful.
export default async function CreditsRedirect({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/dashboard/${orgId}/billing`);
}
