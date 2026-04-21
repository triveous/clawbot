"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRpc } from "@/hooks/use-rpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Credit = {
  id: string;
  status: string;
  source: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  consumedByAssistantId: string | null;
  plan: {
    displayName: string;
    slug: string;
    priceCents: number;
  } | null;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  trialing: "secondary",
  incomplete: "outline",
  past_due: "destructive",
  canceled: "outline",
  expired: "outline",
};

export default function CreditsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const rpc = useRpc();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await rpc.api.credits.$get();
      if (res.ok) {
        const data = (await res.json()) as { credits: Credit[] };
        setCredits(data.credits);
      }
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => { load(); }, [load]);

  const available = credits.filter(
    (c) =>
      c.status === "active" &&
      !c.consumedByAssistantId &&
      c.currentPeriodEnd &&
      new Date(c.currentPeriodEnd) > new Date(),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Credits</h1>
        {!loading && (
          <p className="mt-1 text-sm text-muted-foreground">
            {available.length} available · {credits.length} total
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : credits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No credits yet. Ask your admin to mint one.</p>
      ) : (
        <div className="space-y-2">
          {credits.map((credit) => (
            <Card key={credit.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={STATUS_VARIANT[credit.status] ?? "outline"}>
                    {credit.status}
                  </Badge>
                  <span className="font-medium">
                    {credit.plan?.displayName ?? credit.plan?.slug ?? "Unknown plan"}
                  </span>
                  <span className="text-xs text-muted-foreground">{credit.source}</span>
                  {credit.currentPeriodEnd && (
                    <span className="text-xs text-muted-foreground">
                      Expires {new Date(credit.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  )}
                  {credit.consumedByAssistantId ? (
                    <span className="text-xs text-muted-foreground">
                      In use by{" "}
                      <Link
                        href={`/dashboard/${orgId}/assistant/${credit.consumedByAssistantId}`}
                        className="underline"
                      >
                        assistant
                      </Link>
                    </span>
                  ) : (
                    <span className="text-xs text-green-600">Available</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
