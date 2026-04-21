import { listPlans } from "@/lib/plans/catalog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/db/schema";

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function ResourceLimits({ limits }: { limits: Record<string, number> }) {
  const entries = Object.entries(limits);
  if (!entries.length) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
      {entries.map(([k, v]) => (
        <li key={k}>
          {k}: {v.toLocaleString()}
        </li>
      ))}
    </ul>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const benefits = plan.benefits as string[];
  const limits = plan.resourceLimits as Record<string, number>;

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>{plan.displayName}</CardTitle>
            {plan.tagline && (
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
            )}
          </div>
          <Badge variant="outline">Tier {plan.tier}</Badge>
        </div>
        <p className="text-2xl font-bold">
          {formatPrice(plan.priceCents, plan.currency)}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {benefits.length > 0 && (
          <ul className="space-y-1 text-sm">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 text-primary">✓</span>
                {b}
              </li>
            ))}
          </ul>
        )}
        <ResourceLimits limits={limits} />
        <div className="mt-auto">
          <Button className="w-full" disabled>
            Coming soon
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PricingPage() {
  const plans = await listPlans({ activeOnly: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pricing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Checkout available in a future release.
        </p>
      </div>

      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plans configured yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
