import { CreateOrganization } from "@clerk/nextjs";

export default function CreateOrgPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">Create your workspace</h1>
        <p className="text-sm text-muted-foreground">
          SnapClaw resources are scoped to a workspace. Create one to get started.
        </p>
      </div>
      <CreateOrganization afterCreateOrganizationUrl="/dashboard" />
    </div>
  );
}
