import { notFound } from "next/navigation";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { AdminClient } from "./admin-client";

export default async function Page() {
  if (!(await isPlatformAdmin())) notFound();
  return <AdminClient />;
}
