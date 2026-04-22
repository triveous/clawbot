import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
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
        <div className="app">
          <Sidebar orgId={orgId} />
          <main className="main">
            <Topbar orgId={orgId} />
            <div className="page">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}
