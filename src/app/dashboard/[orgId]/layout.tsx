import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ThemeInit } from "@/components/dashboard/theme-init";
import "@/styles/dashboard/dashboard.css";
import "@/styles/dashboard/first-assistant.css";
import "@/styles/dashboard/docs.css";
import { OrgActivator } from "./OrgActivator";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  return (
    <>
      <ThemeInit />
      <OrgActivator orgId={orgId} />
      <div className="dashboard-root">
        <DashboardShell orgId={orgId}>{children}</DashboardShell>
      </div>
    </>
  );
}
