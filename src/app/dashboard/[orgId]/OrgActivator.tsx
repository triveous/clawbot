"use client";

import { useEffect } from "react";
import { useClerk, useOrganization } from "@clerk/nextjs";

export function OrgActivator({ orgId }: { orgId: string }) {
  const { setActive } = useClerk();
  const { organization } = useOrganization();

  useEffect(() => {
    if (organization?.id !== orgId) {
      setActive({ organization: orgId }).catch(() => {
        // org may not exist yet or Clerk isn't ready — ignore
      });
    }
  }, [orgId, organization?.id, setActive]);

  return null;
}
