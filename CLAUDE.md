@AGENTS.md

# SnapClaw — Claude Working Instructions

## What this project is

SnapClaw is a **managed hosting platform for OpenClaw personal AI agents**. We are a **setup platform, not a proxy** — we configure OpenClaw on Hetzner VPS instances, push channel credentials once, then forget them. We do not relay messages, store credentials, or store OpenRouter usage.

---

## Runtime & Package Manager

- **Bun** is the runtime and package manager. Always use `bun` / `bunx`, never `npm` / `npx` / `yarn`.
- Dev server: `bun run dev` (Next.js + Turbopack on port 3000)
- Tests: `bun test` or `bun run test`

---

## Tech Stack

| Concern     | Tool                               | Notes                                                                        |
| ----------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Framework   | Next.js 16 (App Router)            | See AGENTS.md — read docs before writing code                                |
| API         | Hono 4 at `/api/[[...route]]`      | `hono/vercel` adapter, RPC via `hc<AppType>`                                 |
| ORM         | Drizzle ORM + `postgres` driver    | 5 tables: users, assistants, assistant_credentials, subscriptions, snapshots |
| Database    | Neon PostgreSQL                    | `bun run db:push` for schema changes in dev                                  |
| Auth        | Clerk (`@clerk/nextjs` v7)         | ClerkProvider in root layout, `clerkMiddleware` in middleware.ts             |
| Billing     | Stripe                             | Subscriptions per assistant, not per account                                 |
| UI          | shadcn/ui + Magic UI + Tailwind v4 | Linear-like aesthetic                                                        |
| Fonts       | Geist Sans + Geist Mono            | Applied to both app and Clerk components via `appearance` prop               |
| Testing     | Vitest (unit) + Playwright (E2E)   | Tests in `tests/unit/` and `tests/e2e/`                                      |
| Async tasks | useworkflow.dev                    | Only for genuinely async work (VPS provisioning); not forced elsewhere       |
| Infra       | Hetzner Cloud                      | Snapshot-based provisioning, provider-abstracted schema                      |
| Deploy      | Vercel                             |                                                                              |

---

## Project Structure

```
src/
  app/
    (marketing)/          # Phase 5 — landing, pricing
    (auth)/               # Clerk SignIn/SignUp (catch-all routes)
    dashboard/            # Phase 6 — NOT a route group (avoids parallel route conflict)
    api/[[...route]]/     # Hono catch-all
  server/
    index.ts              # Hono app + AppType export
    rpc.ts                # createApiClient() wrapping hc<AppType>
    middleware/clerk.ts   # clerkAuth() — validates session, lazy-upserts user to DB
    routes/               # assistants, channels, billing, webhooks
  lib/
    db/
      schema/             # users, assistants, assistant-credentials, subscriptions, snapshots
      index.ts            # Drizzle client — throws if DATABASE_URL missing
    auth/clerk-webhook.ts # Clerk webhook handlers (user CRUD)
    stripe/stubs.ts       # canProvision() stub — Phase 4 replaces
  types/                  # Shared types: AgentStatus, Provider, PlanId, ChannelType
  hooks/
    use-rpc.ts            # useRpc() — memoized Hono RPC client
  components/
    ui/                   # shadcn components
```

---

## Key Patterns

### Clerk Auth Middleware (`src/server/middleware/clerk.ts`)

Every protected route gets `userId` (Clerk) and `dbUser` (DB row) on context. The middleware lazy-upserts the user on first authenticated request — solves the "webhook never fired" case without requiring the webhook to work.

```ts
c.get("userId"); // Clerk user ID string
c.get("dbUser"); // Full DB user row
```

### Hono RPC

`hc()` returns a JS Proxy. Tests must access route properties directly (not `toHaveProperty`):

```ts
expect(client.assistants).toBeDefined(); // correct
expect(client).toHaveProperty("assistants"); // wrong — Proxy, not own property
```

### Auth Routes

Login and sign-up use **catch-all routes** for Clerk multi-step flows:

- `src/app/(auth)/login/[[...sign-in]]/page.tsx`
- `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`

### Dashboard

`/dashboard` is a **regular route**, not a route group `(dashboard)`. Route groups at the same segment level conflict in Next.js App Router.

### Cross-Phase Stubs

`src/lib/stripe/stubs.ts` exports `canProvision()` returning `true`. Phase 2 imports this; Phase 4 replaces it with real Stripe logic.

---

## Database Schema (5 tables)

| Table                   | Purpose                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | Clerk user sync. Lazy-upserted by Hono middleware.                                                                          |
| `assistants`            | Provider-abstracted (`provider` enum + `provider_server_id`). Status: `creating → provisioning → running → stopped → error` |
| `assistant_credentials` | Per-assistant credentials (SSH keys, gateway token). One row per assistant, cascade-deleted.                                |
| `subscriptions`         | Per-assistant Stripe subscriptions (not per-account)                                                                        |
| `snapshots`             | Versioned Hetzner snapshots. `is_active` marks which is used for new provisioning.                                          |

---

## Environment Variables

See `.env.example` for all required vars. Key ones:

- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` + `CLERK_WEBHOOK_SECRET`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding/name`

---

## Scripts

```bash
bun run dev          # Next.js dev server (Turbopack, port 3000)
bun test             # Run all Vitest tests
bun run typecheck    # tsc --noEmit
bun run lint:fix     # eslint --fix
bun run db:push      # Apply schema to DB (dev)
bun run db:generate  # Generate migration files
bun run db:studio    # Drizzle Studio on port 4983
```

---

## Pre-commit Hook

Husky runs lint-staged on every commit:

- `*.{ts,tsx}` → `eslint --fix` then `vitest related --run`
- `*.{json,md,css}` → `prettier --write`

All tests must pass before a commit lands.

---

## Phase Status

| Phase             | Status      | Owner                                                |
| ----------------- | ----------- | ---------------------------------------------------- |
| 1 — Foundation    | Complete    | All routes, schema, auth, RPC, tests                 |
| 2 — Provisioning  | Complete    | Hetzner VPS, snapshot-based, useworkflow.dev         |
| 3 — Channel Setup | Not started | SSH config push, health monitoring                   |
| 4 — Billing       | Not started | Stripe per-assistant subscriptions, OpenRouter usage |
| 5 — Marketing     | Not started | Landing page, pricing, onboarding wizard             |
| 6 — Dashboard     | Not started | Agent management UI, Magic UI                        |
