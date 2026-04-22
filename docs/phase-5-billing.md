# Phase 5: Billing (Stripe) — Shipped

Stripe-backed billing on top of the Phase 4 credits model. Each agent ↔ one Stripe subscription ↔ one `assistant_credits` row. Stripe is source of truth; we keep local mirrors of `subscriptions` and `invoices` so the dashboard never round-trips on every page view.

## Architecture

```
Stripe Checkout                        ┌──────────────────────┐
  └─► customer + subscription ───────► │ subscriptions (mirror) │
       └─► invoice ──────────────────► │ invoices (mirror)      │
                                        │ assistant_credits      │ ← consumed by an assistant
                                        └──────────────────────┘
                ▲                              ▲
                │                              │
                └── reconciled by /api/webhooks/stripe ──┘
```

**Key design decisions** (locked in during planning):

| #   | Decision               | Choice                                                                                      |
| --- | ---------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Seat model             | One Stripe subscription per agent (quantity=1). N agents → N subscriptions → N credit rows. |
| 2   | Cancel effect on agent | Release credit, leave server alive. Owner destroys manually.                                |
| 3   | Cancel timing          | `cancel_at_period_end=true`. Access continues until paid period ends.                       |
| 4   | Stripe plan sync       | Auto-create only. Admin form creates Product + Price; no manual ID paste.                   |
| 5   | Local mirror           | `subscriptions` + `invoices` tables. Stripe remains source of truth.                        |

## Schema

### `subscriptions`

Canonical local row for a Stripe subscription. Webhooks write here first.

```
id, orgId (FK), planId (FK), stripeSubscriptionId (unique), stripeCustomerId,
stripeScheduleId (set during pending downgrade), status (enum),
currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt
```

### `invoices`

```
id, orgId (FK), subscriptionId (nullable FK), stripeInvoiceId (unique),
number, status (enum), amountDue, amountPaid, currency,
periodStart, periodEnd, hostedInvoiceUrl, invoicePdf, issuedAt, paidAt
```

### `assistant_credits` (modified)

Added `subscriptionId` FK (nullable — admin-minted credits don't have a sub). `externalSubscriptionId` retained for direct Stripe lookup.

## Stripe libraries (`src/lib/stripe/`)

| File               | Purpose                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `client.ts`        | Stripe SDK singleton, apiVersion `2026-03-25.dahlia`                                                       |
| `customers.ts`     | `ensureStripeCustomer(org)` — lazy create + persist to `organizations.billingCustomerId`                   |
| `checkout.ts`      | `createCheckoutSession`, `createPortalSession`                                                             |
| `plans.ts`         | `createStripePlanArtifacts`, `rotateStripePrice` (immutable price → archive + new), `archiveStripeProduct` |
| `subscriptions.ts` | `cancelAtPeriodEnd`, `changeSubscriptionPlan` (upgrade-now or downgrade-via-schedule)                      |
| `webhook.ts`       | `handleStripeEvent` — LRU dedup + per-event dispatcher                                                     |

### Plan rotation

Stripe Prices are immutable. Editing a plan's price calls `rotateStripePrice`:

1. Create new Price on the same Product
2. Archive (deactivate) the old Price
3. Push the old Price ID into `plans.billingProviderIds.archivedPriceIds[]`
4. Set the new ID as `stripePriceId`

`getPlanByStripePriceId(priceId)` checks both `stripePriceId` AND `archivedPriceIds[]` so late webhook events after a rotation still resolve to the correct plan.

### Downgrade scheduling

Downgrades use Stripe SubscriptionSchedules with two phases:

- Phase 0: current price, ending at `current_period_end`
- Phase 1: new price, `duration: { interval: "month", interval_count: 1 }`

The local `stripeScheduleId` is persisted so the UI can show "downgrade pending". Stripe fires `customer.subscription.updated` at rollover; the webhook syncs `planId` automatically.

## Webhook reconciler

`POST /api/webhooks/stripe` — signature-verified via `STRIPE_WEBHOOK_SECRET`. Idempotent: a module-level LRU `Set<string>` (cap 500) deduplicates `event.id`; the DB unique constraint on `stripeSubscriptionId` makes upserts safe even past the LRU window.

| Event                                 | subscriptions                                     | credits                                                        | invoices |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------- | -------- |
| `checkout.session.completed`          | upsert (fetches sub)                              | link credit                                                    | —        |
| `customer.subscription.created`       | upsert (idempotent)                               | link credit                                                    | —        |
| `customer.subscription.updated`       | upsert (sync planId via `getPlanByStripePriceId`) | sync planId/status/period                                      | —        |
| `customer.subscription.deleted`       | status=canceled, `canceledAt=now`                 | status=canceled, `consumedByAssistantId=null` (releases agent) | —        |
| `invoice.paid` / `.payment_succeeded` | refresh from sub                                  | status=active, refresh period                                  | upsert   |
| `invoice.payment_failed`              | status=past_due                                   | status=past_due                                                | upsert   |
| `invoice.created` / `.finalized`      | —                                                 | —                                                              | upsert   |

Stripe-status → `CreditStatus` mapping: `trialing`→trialing, `active`→active, `past_due`→past_due, `canceled`/`unpaid`→canceled, `incomplete`/`incomplete_expired`→incomplete/expired, `paused`→past_due.

`canProvision` (in `@/lib/billing/credits`) gates on `status="active"` + unexpired period + unconsumed — so `past_due`/`canceled` automatically block new provisioning.

### Webhook events to subscribe (Stripe Dashboard)

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.created`
- `invoice.finalized`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

For local dev, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` forwards everything; the handler ignores anything outside the list above.

## API endpoints

```
POST /api/billing/checkout                           { planId } → { url }
POST /api/billing/portal                                       → { url }
GET  /api/billing/subscriptions                                → { subscriptions[] }
GET  /api/billing/invoices                                     → { invoices[] }
POST /api/billing/subscriptions/:id/cancel                     → cancel at period end
POST /api/billing/subscriptions/:id/change-plan  { newPlanId, mode: "upgrade"|"downgrade" }

POST /api/webhooks/stripe          (public, signature-verified)
```

All `/billing/*` endpoints sit behind `clerkAuth()` and are org-scoped via `c.get("dbOrg")`. Mutations enforce `subscription.orgId === dbOrg.id`.

## Dashboard surfaces

- **`/dashboard/[orgId]/billing`** — subscriptions list (status, period, cancel/change-plan buttons), invoices list (with hosted URL + PDF), "Manage payment method" button → Stripe Portal.
- **`/dashboard/[orgId]/pricing`** — Subscribe button wired to checkout. Disabled for plans without a `stripePriceId`.
- **`/dashboard/[orgId]/admin`** — "Sync to Stripe" checkbox in the plan create form (default on); Stripe Price ID displayed on each plan row.

## Environment variables

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

For local dev, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and paste the printed signing secret as `STRIPE_WEBHOOK_SECRET`. In production, use the secret from the configured webhook endpoint in the Stripe Dashboard.

## Definition of Done

All checked off in [PR #8](https://github.com/triveous/clawbot/pull/8); end-to-end Stripe test-mode verification is the remaining gate before merge.

- [x] Schema: `subscriptions`, `invoices`, `assistant_credits.subscriptionId`
- [x] Stripe libs (client, customers, checkout, plans, subscriptions, webhook)
- [x] `src/lib/billing/sync.ts` reconciler helpers + `getPlanByStripePriceId`
- [x] Webhook handler covers all 9 events with idempotency
- [x] Billing route: checkout, portal, list, cancel, change-plan
- [x] Admin auto-sync: create + price rotation + product archive on deactivate
- [x] Dashboard billing page; pricing Subscribe wired
- [x] Stubs deleted; tests + typecheck + lint green
