# Phase 4: Billing

## Goal

Integrate Stripe for per-agent subscriptions, implement the real `canProvision()` guard, and surface OpenRouter usage data (queried live, not stored).

## Plans

| Plan | Price | Limits |
|------|-------|--------|
| Starter | $19/mo | 1 agent, 3 channels, community support |
| Pro | $39/mo | 3 agents, 5 channels, email support |
| Power | $79/mo | 10 agents, all channels, priority support |

Each agent gets its own Stripe subscription. Plan limits are enforced via `canProvision()`.

## Stripe Integration

### `src/lib/stripe/client.ts`

Stripe SDK client initialized with `STRIPE_SECRET_KEY`.

### `src/lib/stripe/checkout.ts`

```ts
export async function createCheckoutSession(opts: {
  userId: string;
  agentId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string>  // returns Stripe Checkout URL
```

### `src/lib/stripe/portal.ts`

```ts
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string
): Promise<string>  // returns Stripe Customer Portal URL
```

### `src/lib/stripe/webhook.ts`

Handles Stripe webhook events at `/api/webhooks/stripe`:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create subscription record in DB, link to agent |
| `invoice.paid` | Update `currentPeriodEnd` on subscription |
| `invoice.payment_failed` | Mark subscription status as `past_due` |
| `customer.subscription.deleted` | Mark subscription as `canceled`, optionally stop agent |

Webhook signature verification via `STRIPE_WEBHOOK_SECRET`.

## canProvision() -- Real Implementation

Replaces the Phase 1 stub in `src/lib/billing/guards.ts`:

```ts
export async function canProvision(userId: string): Promise<boolean> {
  // 1. Count user's active agents
  // 2. Look up user's highest plan tier
  // 3. Compare against plan's agent limit
  // 4. Return true if under limit
}
```

Called by `POST /api/agents` before triggering provisioning.

## OpenRouter Usage

### `src/lib/openrouter/usage.ts`

```ts
export async function getAgentUsage(
  openRouterApiKey: string
): Promise<{
  totalCost: number;
  totalTokens: number;
  periodStart: string;
  periodEnd: string;
}>
```

- Queries OpenRouter's API directly using the agent's API key
- Usage data is **never stored** in our database -- always fetched live
- The OpenRouter API key lives on the VPS (part of OpenClaw config), retrieved via SSH when the dashboard requests usage
- Displayed on the billing page alongside Stripe subscription info

## API Endpoints

```
POST   /api/billing/checkout
  Body: { agentId: string, plan: "starter" | "pro" | "power" }
  Auth: Clerk session required
  Returns: { url: string }  -- Stripe Checkout redirect URL

POST   /api/billing/portal
  Auth: Clerk session required
  Returns: { url: string }  -- Stripe Customer Portal URL

GET    /api/billing/subscriptions
  Auth: Clerk session required
  Returns: { subscriptions: Subscription[] }

GET    /api/agents/:id/usage
  Auth: Clerk session, must own agent
  Returns: { cost: number, tokens: number, period: string }

POST   /api/webhooks/stripe
  Auth: Stripe webhook signature
  Body: Stripe event payload
```

## Files Owned

```
src/lib/stripe/client.ts
src/lib/stripe/checkout.ts
src/lib/stripe/portal.ts
src/lib/stripe/webhook.ts
src/lib/stripe/plans.ts          -- Plan definitions and price IDs
src/lib/billing/guards.ts        -- canProvision() real implementation
src/lib/openrouter/usage.ts
src/server/routes/billing.ts
src/app/api/webhooks/stripe/route.ts
```

## Environment Variables

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_STARTER
STRIPE_PRICE_PRO
STRIPE_PRICE_POWER
```

## Definition of Done

- Stripe Checkout creates a subscription linked to an agent
- Webhook handler processes all 4 event types correctly
- `canProvision()` enforces plan-based agent limits
- Customer Portal allows plan changes and cancellation
- OpenRouter usage displays on dashboard via live API query
- All billing endpoints handle edge cases (no subscription, expired, etc.)
