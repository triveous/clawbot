# Phase 5: Billing (Stripe)

## Goal

Gate provisioning behind paid Stripe subscriptions, implement the real `canProvision()` guard, and expose plan management via Stripe Customer Portal. Deferred from the original Phase 4 ordering — Dashboard (new Phase 4) ships first so we have a real product surface before paywalling it.

## Plans

| Plan    | Price  | Limits                      |
| ------- | ------ | --------------------------- |
| Starter | $19/mo | 1 agent, community support  |
| Pro     | $39/mo | 3 agents, email support     |
| Power   | $79/mo | 10 agents, priority support |

Each agent gets its own Stripe subscription. Plan limits enforced via `canProvision()`.

## Email

**No Resend / SES for MVP.** Stripe sends its own payment notifications — invoices, receipts, failed-payment alerts. That covers the transactional baseline without adding another vendor. Revisit when we need non-Stripe transactional mail (welcome, provisioning-complete, marketing). Not in MVP scope.

## Stripe Integration

### `src/lib/stripe/index.ts`

Replaces `src/lib/stripe/stubs.ts`. Initializes Stripe SDK with `STRIPE_SECRET_KEY`.

### Checkout

```ts
export async function createCheckoutSession(opts: {
  userId: string;
  assistantId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string>; // returns Stripe Checkout URL
```

### Customer Portal

```ts
export async function createPortalSession(
  stripeCustomerId: string,
  returnUrl: string,
): Promise<string>;
```

### Webhooks

`POST /api/webhooks/stripe` — signature verified via `STRIPE_WEBHOOK_SECRET`.

| Event                           | Action                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| `checkout.session.completed`    | Create `subscriptions` row, link to assistant               |
| `invoice.paid`                  | Update `currentPeriodEnd`                                   |
| `invoice.payment_failed`        | Mark subscription `past_due`                                |
| `customer.subscription.deleted` | Mark subscription `canceled`; do not auto-destroy assistant |

### canProvision() — Real Implementation

```ts
export async function canProvision(userId: string): Promise<boolean> {
  // 1. Count user's active assistants
  // 2. Look up user's current plan tier (highest active subscription)
  // 3. Compare against plan's agent limit
  // 4. Return true if under limit
}
```

Called by `POST /api/assistants` before triggering the provisioning workflow.

## API Endpoints

```
POST /api/billing/checkout
  Body: { assistantId?: string, plan: "starter" | "pro" | "power" }
  Returns: { url: string }

POST /api/billing/portal
  Returns: { url: string }

GET  /api/billing/subscriptions
  Returns: { subscriptions: Subscription[] }

POST /api/webhooks/stripe
  Stripe signature verification required
```

## Dashboard Integration

Phase 4's Billing page (built as a top-level dashboard page, not per-agent) shows:

- Active subscriptions table — agent name, plan, status, next billing date
- "Manage Billing" button → Stripe Customer Portal
- Upgrade / downgrade prompts with plan comparison

## Files Owned

```
src/lib/stripe/index.ts            # replaces stubs.ts
src/lib/stripe/plans.ts            # plan definitions + price IDs
src/lib/billing/guards.ts          # canProvision() real impl
src/server/routes/billing.ts       # currently stubbed
src/server/routes/webhooks.ts      # currently stubbed
src/app/dashboard/billing/page.tsx # billing UI
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

- Stripe test mode: checkout creates a subscription linked to an assistant via webhook
- Webhook handler processes all 4 event types correctly with signature verification
- `canProvision()` enforces plan-based agent limits — POST /assistants returns 402 when over limit
- Customer Portal allows plan changes and cancellation; changes reflect in `subscriptions` table
- Canceled subscription blocks new provisioning but does not destroy existing assistants
- Billing page shows accurate subscription list
