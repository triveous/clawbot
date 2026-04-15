# Phase 5 — Billing (Stripe)

Reference: [Phase 5 Docs](../docs/phase-5-billing.md)

## Stripe Setup

- [ ] Replace `src/lib/stripe/stubs.ts` with `src/lib/stripe/index.ts`
- [ ] Define plan configurations in `src/lib/stripe/plans.ts` (Starter, Pro, Power)
- [ ] Add Stripe env vars to `.env.example`

## Checkout & Portal

- [ ] Implement `createCheckoutSession`
- [ ] Implement `createPortalSession`

## Webhooks

- [ ] Wire Stripe webhook handler at POST /api/webhooks/stripe with signature verification
- [ ] Handle `checkout.session.completed` → create subscription row
- [ ] Handle `invoice.paid` → update `currentPeriodEnd`
- [ ] Handle `invoice.payment_failed` → mark `past_due`
- [ ] Handle `customer.subscription.deleted` → mark `canceled` (do NOT auto-destroy assistant)

## Business Logic

- [ ] Implement real `canProvision()` (replace stub) — count active assistants, compare to plan limit
- [ ] Wire `canProvision()` into POST /api/assistants; return 402 when over limit

## API Endpoints

- [ ] POST /api/billing/checkout
- [ ] POST /api/billing/portal
- [ ] GET /api/billing/subscriptions

## Dashboard Integration

- [ ] `src/app/dashboard/billing/page.tsx` — subscription table, Manage Billing button

## Testing

- [ ] Unit: plan logic, webhook signature verification
- [ ] Integration: Stripe test mode end-to-end (checkout → webhook → canProvision → provision)
- [ ] Integration: cancel subscription → verify new provisioning blocked
