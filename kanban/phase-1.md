# Phase 1 — Foundation

Reference: [Phase 1 Docs](../docs/phase-1-foundation.md)

---

## Project Setup

- [x] **Initialize Next.js project with Bun**
  - `bun create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-bun`
  - App Router, TypeScript strict mode, Tailwind v4, `@/*` alias pointing to `src/`

- [x] **Set up git repository**
  - `git init` in project root; two commits: `250a08b` (initial scaffold), `66282bd` (husky + tests)

- [x] **Install all dependencies**
  - Runtime: `hono @hono/node-server drizzle-orm postgres @clerk/nextjs stripe @stripe/stripe-js`
  - Dev: `drizzle-kit vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @playwright/test husky lint-staged prettier`
  - shadcn adds its own: `class-variance-authority clsx tailwind-merge lucide-react tw-animate-css`

- [x] **Create `.env.example`** — `src/.env.example` documents all required env vars across all phases (DATABASE_URL, Clerk keys, Hetzner, OpenRouter, Stripe, app URL)

- [x] **Configure `.gitignore`** — preserves `.env.example`, ignores `.env*`, `.clerk/`, `.idea/`, `.vscode/`

- [x] **Configure `.claude/launch.json`** — defines two servers: `Next.js Dev (Turbopack)` on port 3000, `Drizzle Studio` on port 4983

---

## Database

- [x] **Drizzle schema — 4 tables** in `src/lib/db/schema/`
  - `users.ts` — synced from Clerk webhooks (clerk_id, email, name, avatar_url)
  - `agents.ts` — provider-abstracted (provider enum starts with `hetzner`, provider_server_id for future multi-cloud), status enum: `creating | provisioning | running | stopped | error`
  - `subscriptions.ts` — per-agent (not per-account); references both `agents` and `users`
  - `snapshots.ts` — versioned Hetzner snapshots we maintain; `is_active` flag marks which one gets used for new provisioning
  - All tables use `uuid` PKs with `defaultRandom()`, `timestamp` with timezone, `$onUpdate` for `updated_at`
  - `src/lib/db/schema/index.ts` re-exports all

- [x] **Drizzle DB client** — `src/lib/db/index.ts`
  - Uses `postgres` driver + `drizzle(client, { schema })` for typed queries
  - Throws at import time if `DATABASE_URL` not set (fail-fast)

- [x] **DB scripts in `package.json`**
  - `db:generate` → `drizzle-kit generate` (create migration files)
  - `db:migrate` → `drizzle-kit migrate` (apply to DB)
  - `db:push` → `drizzle-kit push` (dev shortcut, no migration files)
  - `db:studio` → `drizzle-kit studio` (visual DB browser on port 4983)
  - Config in `drizzle.config.ts` pointing to `src/lib/db/schema/index.ts`

---

## API Layer

- [x] **Hono at `/api/[[...route]]`** — `src/app/api/[[...route]]/route.ts`
  - Uses `hono/vercel` adapter: `handle(app)` exported as `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
  - Hono app defined in `src/server/index.ts` with `.basePath("/api")`
  - Global middleware: `hono/logger`, `hono/cors`
  - Health check: `GET /api/health` → `{ status: "ok" }`

- [x] **Hono route stubs** — each in `src/server/routes/`
  - `agents.ts` — Phase 2 will implement provisioning endpoints
  - `channels.ts` — Phase 3 will implement channel setup endpoints
  - `billing.ts` — Phase 4 will implement Stripe endpoints
  - `webhooks.ts` — thin dispatcher skeleton; Phase 4 registers Stripe handler here

- [x] **Hono RPC type export**
  - `src/server/index.ts` — chains all routes onto `appWithRoutes`, exports `type AppType = typeof appWithRoutes`
  - `src/server/rpc.ts` — `createApiClient()` wraps `hc<AppType>(baseUrl)` from `hono/client`
  - `src/hooks/use-rpc.ts` — `useRpc()` React hook, memoized client instance
  - Pattern: import `AppType` on client for full type safety without sharing runtime code

---

## Auth

- [x] **Clerk root layout** — `src/app/layout.tsx` wraps everything in `<ClerkProvider>`

- [x] **Clerk middleware** — `src/middleware.ts`
  - Uses `clerkMiddleware` + `createRouteMatcher`
  - Protected routes: `/dashboard(.*)` and `/onboarding(.*)`
  - Calls `auth.protect()` which redirects unauthenticated users to sign-in
  - Matcher skips static files and Next.js internals

- [x] **Clerk webhook handler** — `src/lib/auth/clerk-webhook.ts`
  - `handleUserCreated` — inserts into `users` table
  - `handleUserUpdated` — updates email, name, avatar
  - `handleUserDeleted` — deletes user (cascades to agents + subscriptions via FK)
  - Webhook route to be wired in `src/server/routes/webhooks.ts` (Phase 1 skeleton ready)

- [x] **Login page** — `src/app/(auth)/login/page.tsx` renders `<SignIn />` from `@clerk/nextjs`

---

## UI Foundation

- [x] **shadcn/ui init** — `bunx --bun shadcn@latest init -d` (default config, Tailwind v4 detected)
  - Components added: `button`, `badge`, `card`, `input`, `label`
  - `src/lib/utils.ts` — `cn()` utility using `clsx` + `tailwind-merge`
  - `components.json` config at project root

- [x] **Route group layouts**
  - `src/app/(marketing)/layout.tsx` — full-width with flex col, placeholder for navbar/footer
  - `src/app/(auth)/layout.tsx` — centered flex, gray-50 background (login/onboarding container)
  - `src/app/dashboard/layout.tsx` — sidebar + main layout (sidebar hidden on mobile, 64px wide on lg+)
  - Note: Dashboard uses `/dashboard` path (not a route group) to avoid Next.js parallel route conflict with `(marketing)` at `/`

- [x] **Placeholder pages** — all 12 routes have pages with phase labels indicating who builds them:
  - `/` → Phase 5 (marketing), `/pricing` → Phase 5
  - `/login` → Phase 1 (Clerk SignIn)
  - `/onboarding/name`, `/onboarding/channels`, `/onboarding/deploy` → Phase 5
  - `/dashboard`, `/dashboard/billing`, `/dashboard/settings` → Phase 6
  - `/dashboard/agent/[agentId]` → Phase 6 (dynamic route, async params)

---

## Shared Code

- [x] **Shared types** — `src/types/`
  - `agent.ts` — `AgentStatus`, `Provider`, `AgentResponse`, `CreateAgentRequest`
  - `billing.ts` — `PlanId`, `Plan`, `PLANS` constant (Starter $19, Pro $39, Power $79 with features)
  - `channel.ts` — `ChannelType`, `ChannelDefinition`, `ChannelField`, `ChannelHealthStatus`
  - `index.ts` — re-exports all

- [x] **Cross-phase stubs** — `src/lib/stripe/stubs.ts`
  - `canProvision(userId)` → always returns `true`; Phase 4 replaces with real Stripe check
  - Phase 2 imports this before Phase 4 is built, preventing circular dependencies

- [x] **Webhook dispatcher skeleton** — `src/server/routes/webhooks.ts`
  - Empty `Hono` instance with comment blocks for Phase 4 to register `POST /stripe`
  - Pattern avoids merge conflicts: each phase registers its own handler

---

## Code Quality

- [x] **Husky** — `bunx husky init`, hook at `.husky/pre-commit`
  - Runs `bunx lint-staged` on every commit

- [x] **lint-staged** config in `package.json`
  - `*.{ts,tsx}` → `eslint --fix` then `vitest related --run`
  - `*.{json,md,css}` → `prettier --write`

- [x] **ESLint** — 0 errors, 0 warnings
  - Config: `eslint.config.mjs` using `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
  - Fixed: prefixed unused param with `userId` + `eslint-disable` comment in stubs; restructured `server/index.ts` so `AppType` derives from the named `appWithRoutes` variable

- [x] **Scripts added to `package.json`**
  - `lint:fix` → `eslint --fix`
  - `typecheck` → `tsc --noEmit`

---

## Testing & Verification

- [x] **Vitest config** — `vitest.config.ts`
  - Environment: `jsdom`, globals enabled
  - Path alias `@/*` mirrors tsconfig
  - Test glob: `tests/**/*.test.ts(x)`

- [x] **14 tests across 4 files** — all passing
  - `tests/unit/server/health.test.ts` — Hono health check, agents/channels/billing stubs return correct shapes
  - `tests/unit/lib/schema.test.ts` — all 4 tables exist (verified with `getTableName()`), enum values correct
  - `tests/unit/lib/stubs.test.ts` — `canProvision()` stub returns `true`
  - `tests/unit/types/billing.test.ts` — all 3 plans defined with correct prices and features

- [x] **Build verified** — `bun run build` produces 12 routes, 0 errors
  - Note: Turbopack build shows deprecation warning for `middleware` → `proxy` convention (cosmetic, no impact)

- [x] **Commits**
  - `250a08b` — initial scaffold (auto-generated by `create next-app` + manual additions)
  - `66282bd` — husky/lint-staged, shadcn components, tests, dashboard path fix, ESLint clean
