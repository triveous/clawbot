import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { flags } from "@/lib/flags";
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
      <OrgActivator orgId={orgId} />
      <div className="flex min-h-screen">
        <aside className="hidden w-56 flex-col border-r lg:flex">
          <div className="flex flex-col gap-3 border-b p-4">
            <span className="font-bold">SnapClaw</span>
            {flags.orgs && (
              <OrganizationSwitcher
                hidePersonal={false}
                afterSelectOrganizationUrl="/dashboard/:id"
                afterCreateOrganizationUrl="/dashboard/:id"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger:
                      "w-full rounded-md border border-border px-2 py-1 text-sm hover:bg-muted",
                  },
                }}
              />
            )}
          </div>
          <nav className="flex flex-col gap-1 p-3 text-sm">
            <Link href={`/dashboard/${orgId}`} className="rounded-md px-3 py-2 hover:bg-muted">
              Assistants
            </Link>
            {flags.orgs && (
              <Link href={`/dashboard/${orgId}/members`} className="rounded-md px-3 py-2 hover:bg-muted">
                Members
              </Link>
            )}
            <Link href={`/dashboard/${orgId}/credits`} className="rounded-md px-3 py-2 hover:bg-muted">
              Credits
            </Link>
            <Link href={`/dashboard/${orgId}/pricing`} className="rounded-md px-3 py-2 hover:bg-muted">
              Pricing
            </Link>
            <Link href={`/dashboard/${orgId}/admin`} className="rounded-md px-3 py-2 hover:bg-muted">
              Admin
            </Link>
          </nav>
          <div className="mt-auto border-t p-4">
            <UserButton />
          </div>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </>
  );
}
