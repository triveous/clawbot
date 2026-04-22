# Phase 5 — Billing (Stripe) — ✅ Complete

Reference: [Phase 5 Docs](../docs/phase-5-billing.md)

Shipped in [PR #8](https://github.com/triveous/clawbot/pull/8).

## Schema

- [x] `subscriptions` table — local mirror of Stripe sub state (`stripeSubscriptionId`, `stripeScheduleId`, `cancelAtPeriodEnd`, status, period)
- [x] `invoices` table — local mirror keyed by `stripeInvoiceId`
- [x] `assistant_credits.subscriptionId` FK (nullable; admin-minted credits keep it null)

## Stripe libs (`src/lib/stripe/`)

- [x] `client.ts` — Stripe SDK singleton, pinned apiVersion `2026-03-25.dahlia`
- [x] `customers.ts` — `ensureStripeCustomer(org)` lazy-creates + persists `billingCustomerId`
- [x] `checkout.ts` — `createCheckoutSession`, `createPortalSession`
- [x] `plans.ts` — `createStripePlanArtifacts`, `rotateStripePrice` (archives old → `archivedPriceIds[]`), `archiveStripeProduct`
- [x] `subscriptions.ts` — `cancelAtPeriodEnd`, `changeSubscriptionPlan` (upgrade-now via proration; downgrade-next-period via SubscriptionSchedule + `duration`)
- [x] `webhook.ts` — handler with LRU dedup (cap 500)
- [x] `stubs.ts` deleted; consumers import `canProvision` from `@/lib/billing/credits`

## Sync layer

- [x] `src/lib/billing/sync.ts` — `mapStripeSubscriptionStatus`, `subStatusToCreditStatus`, `upsertSubscriptionFromStripe`, `linkCreditToSubscription`, `markCreditCanceled`, `upsertInvoiceFromStripe`
- [x] `src/lib/plans/catalog.ts` — `getPlanByStripePriceId(priceId)` (cache + SQL fallback; matches `stripePriceId` OR any in `archivedPriceIds[]`)

## Webhook events handled

- [x] `checkout.session.completed`
- [x] `customer.subscription.created` / `.updated` / `.deleted`
- [x] `invoice.created` / `.finalized` / `.paid` / `.payment_succeeded` / `.payment_failed`

## API endpoints

- [x] `POST /api/billing/checkout`
- [x] `POST /api/billing/portal`
- [x] `GET  /api/billing/subscriptions`
- [x] `GET  /api/billing/invoices`
- [x] `POST /api/billing/subscriptions/:id/cancel`
- [x] `POST /api/billing/subscriptions/:id/change-plan`
- [x] `POST /api/webhooks/stripe` — signature-verified, public

## Dashboard

- [x] `/dashboard/[orgId]/billing` — subscriptions list (with cancel + change-plan), invoices list (with PDF + hosted URL), Stripe portal button
- [x] Sidebar link added between Credits and Pricing
- [x] `/dashboard/[orgId]/admin` — "Sync to Stripe" checkbox on plan create; Stripe Price ID shown on each plan row
- [x] `/dashboard/[orgId]/pricing` — Subscribe button wired (only enabled for plans with `stripePriceId`)

## Tests

- [x] Unit: `mapStripeSubscriptionStatus` / `subStatusToCreditStatus` mapper coverage
- [x] Health test updated to `/api/billing/invoices` (old `/api/billing` stub no longer exists)

## Env

- [x] `.env.example` — Phase 5 Stripe block with `sk_test_...`, `pk_test_...`, `whsec_...` placeholders + `stripe listen` hint

## Verification (manual, owner: human)

End-to-end Stripe test-mode walkthrough is the remaining gate before the PR is marked verified — see PR #8 test plan checklist.
