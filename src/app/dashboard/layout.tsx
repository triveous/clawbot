import { UserButton } from "@clerk/nextjs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Phase 6: Sidebar */}
      <aside className="hidden w-64 border-r lg:block">
        <div className="flex items-center justify-between p-4">
          <span className="font-bold">SnapClaw</span>
          <UserButton afterSignOutUrl="/login" />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
