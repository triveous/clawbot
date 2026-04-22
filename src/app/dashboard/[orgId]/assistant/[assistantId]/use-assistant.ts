"use client";

import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@/hooks/use-rpc";
import type { AssistantResponse } from "@/types/assistant";

export type Plan = {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  providerSpec?: Record<string, unknown>;
};

export type LoadState = "loading" | "ok" | "not-found" | "error";

export function useAssistant(assistantId: string) {
  const rpc = useRpc();
  const [state, setState] = useState<LoadState>("loading");
  const [assistant, setAssistant] = useState<AssistantResponse | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (rpc.api.assistants as any)[":id"].$get({ param: { id: assistantId } });
      if (res.status === 404) {
        setState("not-found");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as AssistantResponse;
      setAssistant(data);
      setState("ok");

      const pRes = await rpc.api.plans.$get();
      if (pRes.ok) {
        const pd = (await pRes.json()) as { plans: Plan[] };
        setPlan(pd.plans.find((p) => p.id === data.planId) ?? null);
      }
    } catch {
      setState("error");
    }
  }, [rpc, assistantId]);

  useEffect(() => {
    // Data fetch — set-state-in-effect is expected here. Swap to a data-
    // fetching library (SWR/React Query) if this grows to need retries,
    // revalidation, or cache coordination across routes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return { state, assistant, plan, reload: load };
}
