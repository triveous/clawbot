# Phase 4 — Billing (Stripe)

Reference: [Phase 4 Docs](../docs/phase-4-billing.md)

## Stripe Setup

- [ ] Set up Stripe client
- [ ] Define plan configurations (Starter, Pro, Power)

## Checkout & Portal

- [ ] Implement Stripe Checkout session creation
- [ ] Implement Stripe Customer Portal redirect

## Webhooks

- [ ] Implement Stripe webhook handler + signature verification
- [ ] Handle subscription lifecycle events (created, updated, deleted)

## Business Logic

- [ ] Implement canProvision() with real Stripe check (replace stub)
- [ ] Implement OpenRouter usage query (hit API directly)

## API Endpoints

- [ ] Implement POST /api/billing/checkout endpoint
- [ ] Implement GET /api/billing/subscriptions endpoint
- [ ] Implement GET /api/billing/usage endpoint

## Client

- [ ] Create billing React hook (use-billing.ts)

## Testing

- [ ] Write unit tests (plan logic, webhook verification)
- [ ] Write integration tests (Stripe test mode)
