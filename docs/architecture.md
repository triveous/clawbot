# SnapClaw Architecture

## Overview

SnapClaw is a managed OpenClaw hosting platform. Users configure and deploy OpenClaw instances on dedicated VPS infrastructure. We are a **setup platform** -- we configure OpenClaw instances, we do not proxy messages.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Runtime | Bun |
| API | Hono RPC at `/api/[[...route]]` |
| Database | PostgreSQL via Drizzle ORM |
| Auth | Clerk |
| Billing | Stripe (subscriptions per agent) |
| Infrastructure | Hetzner Cloud (snapshot-based provisioning) |
| UI | shadcn/ui + Magic UI + Tailwind CSS v4 |

## Route Group Structure

```
src/app/
  (marketing)/       # Landing, pricing, docs -- public
  (auth)/            # Sign-in, sign-up, onboarding -- Clerk-managed
  (dashboard)/       # Agent management, billing, settings -- authenticated
  api/[[...route]]/  # Hono RPC API
```

## API Layer

All server logic lives in Hono, mounted at `/api/[[...route]]`. The client consumes typed RPC endpoints via `hc<AppType>`.

```
src/server/
  index.ts           # Hono app, mounts all route files
  routes/
    agents.ts        # CRUD + lifecycle (restart, stop, destroy)
    channels.ts      # Channel setup + health
    billing.ts       # Stripe checkout, portal, webhooks
```

## Database Schema (Drizzle)

Four tables in `src/db/schema.ts`:

| Table | Purpose |
|-------|---------|
| `users` | Clerk user sync, plan tier, Stripe customer ID |
| `agents` | OpenClaw instances: name, status, server IP, provider metadata |
| `subscriptions` | Stripe subscription per agent, plan tier, billing period |
| `snapshots` | Versioned OpenClaw server images, tracks active snapshot per region |

## Provider Abstraction

```
src/lib/providers/
  types.ts           # ProviderInterface: create, destroy, restart, stop, health
  hetzner.ts         # Hetzner Cloud implementation
```

Designed for multi-cloud future (DigitalOcean, Vultr, etc.). Each provider implements the same interface.

## Key Architectural Decisions

1. **Snapshot-based provisioning** -- OpenClaw instances are created from pre-built server snapshots, not configured from scratch. Faster deploys, consistent environments.
2. **No credential storage** -- Channel credentials (Telegram token, Discord bot token, etc.) are injected via SSH directly into the VPS OpenClaw config. We never persist them in our database.
3. **No message proxying** -- Messages flow directly between the channel platform and the OpenClaw instance. SnapClaw is out of the hot path.
4. **Subscriptions per agent** -- Each agent has its own Stripe subscription. Users can have multiple agents on different plans.
5. **Async only where needed** -- Provisioning is async (via useworkflow.dev). Lifecycle operations (restart, stop) are synchronous API calls. Health checks run on Vercel cron.
6. **OpenRouter usage queried live** -- We query OpenRouter's API directly for usage stats. No usage data is stored in our database.
