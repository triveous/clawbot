# Phase 1: Foundation

## Goal

Scaffold the full project structure, wire up auth, database, API, and UI primitives. Every subsequent phase builds on this foundation.

## Tasks

### 1. Project Scaffold

- Initialize Next.js 15 with App Router + Bun
- Tailwind CSS v4 configuration
- TypeScript strict mode
- Path aliases: `@/` for `src/`

### 2. Clerk Auth Integration

- Install `@clerk/nextjs`
- Middleware at `src/middleware.ts` -- protect `(dashboard)` routes
- Clerk provider in root layout
- Sign-in / sign-up pages under `src/app/(auth)/sign-in/` and `sign-up/`
- Webhook handler to sync Clerk users to our `users` table

### 3. Drizzle ORM + Database

Schema file: `src/db/schema.ts`

```ts
// users
id, clerkId, email, name, stripeCustomerId, createdAt, updatedAt

// agents
id, userId, name, status (provisioning|running|stopped|error|destroyed),
serverId, serverIp, region, snapshotId, providerMetadata, createdAt, updatedAt

// subscriptions
id, agentId, userId, stripeSubscriptionId, stripePriceId,
plan (starter|pro|power), status, currentPeriodEnd, createdAt, updatedAt

// snapshots
id, providerSnapshotId, version, region, isActive, createdAt
```

- Migration scripts via `drizzle-kit`
- DB client at `src/db/index.ts`
- Connection via `DATABASE_URL` env var

### 4. Hono API with RPC

- Hono app at `src/server/index.ts`
- Next.js catch-all route: `src/app/api/[[...route]]/route.ts`
- RPC client factory at `src/lib/api/client.ts` using `hc<AppType>`
- Stub route files: `agents.ts`, `channels.ts`, `billing.ts`

### 5. UI Setup

- shadcn/ui init via CLI (`bunx shadcn@latest init`)
- Install base components: Button, Card, Input, Dialog, Badge, Tabs
- Magic UI setup for animation components
- Global theme tokens in `globals.css`

### 6. Route Group Layouts

```
src/app/(marketing)/layout.tsx    # Navbar + footer
src/app/(auth)/layout.tsx         # Centered card layout
src/app/(dashboard)/layout.tsx    # Sidebar + header
```

Each layout with placeholder content.

### 7. Cross-Phase Stubs

```ts
// src/lib/billing/guards.ts
export async function canProvision(userId: string): Promise<boolean> {
  return true; // Phase 4 replaces with real Stripe check
}
```

### 8. Config Files

- `.env.example` with all required vars (DATABASE_URL, CLERK_*, STRIPE_*, HETZNER_API_TOKEN)
- ESLint + Prettier config
- `.gitignore` (node_modules, .env, .next, drizzle/*.sql)

### 9. Vitest Setup

- `vitest.config.ts` with path aliases
- Test utilities at `src/test/helpers.ts`
- Example test for a utility function

## Files Owned

```
src/app/api/[[...route]]/route.ts
src/app/(marketing)/layout.tsx
src/app/(auth)/layout.tsx
src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
src/app/(dashboard)/layout.tsx
src/db/schema.ts
src/db/index.ts
src/server/index.ts
src/server/routes/*.ts (stubs)
src/lib/api/client.ts
src/lib/billing/guards.ts
src/middleware.ts
vitest.config.ts
.env.example
```

## Definition of Done

- `bun dev` starts the app with no errors
- Clerk sign-in/sign-up flow works end-to-end
- Drizzle migrations run, all 4 tables exist
- Hono API responds at `/api/health`
- RPC client can call the health endpoint with full type safety
- Vitest runs with at least one passing test
