import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ assistantId: string }> }) {
  const { userId, orgId } = await auth();
  const { assistantId } = await params;
  if (!userId) redirect("/login");
  if (!orgId) redirect("/onboarding/org");
  redirect(`/dashboard/${orgId}/assistant/${assistantId}`);
}
