import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 flex-col border-r lg:flex">
        <div className="flex items-center justify-between border-b p-4">
          <span className="font-bold">SnapClaw</span>
          <UserButton />
        </div>
        <nav className="flex flex-col gap-1 p-3 text-sm">
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-2 hover:bg-muted"
          >
            Assistants
          </Link>
          <Link
            href="/dashboard/admin"
            className="rounded-md px-3 py-2 hover:bg-muted"
          >
            Admin
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
