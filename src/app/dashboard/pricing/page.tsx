import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/login");
  if (!orgId) redirect("/onboarding/org");
  redirect(`/dashboard/${orgId}/pricing`);
}
