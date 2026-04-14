# Phase 1 — Foundation

Reference: [Phase 1 Docs](../docs/phase-1-foundation.md)

## Project Setup

- [x] Initialize Next.js project with Bun
- [x] Set up git repository
- [x] Install all dependencies (Hono, Drizzle, Clerk, Stripe, Vitest etc.)
- [x] Create .env.example

## Database

- [x] Create Drizzle schema (users, agents, subscriptions, snapshots)
- [x] Create Drizzle DB client

## API Layer

- [x] Set up Hono at /api/[[...route]] catch-all
- [x] Create Hono route stubs (agents, channels, billing, webhooks)
- [x] Export Hono RPC types + client hook

## Auth

- [x] Set up Clerk auth (root layout, middleware, webhook handler)

## UI Foundation

- [~] Initialize shadcn/ui + Magic UI
- [x] Create route group layouts ((marketing), (auth), (dashboard))
- [x] Create placeholder pages for all routes

## Shared Code

- [x] Create shared types (agent, billing, channel)
- [x] Create cross-phase stubs (canProvision)

## Testing & Verification

- [x] Set up Vitest config
- [ ] Write Phase 1 tests (Hono health check, schema validation)
- [ ] Verify build passes (bun run build)
- [ ] Initial git commit
