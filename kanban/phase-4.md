# Phase 4 — Org Layer, Plans, Credits, Dashboard Foundations

Reference: [Phase 4 Docs](../docs/phase-4-dashboard.md)

---

## 4a — Org layer + schema foundations ✅ DONE

- [x] Schema: `organizations`, `plans`, `instances`, `assistant_credits`, `instance_events`
- [x] Schema: rewrite `assistants` — `orgId`, `createdByUserId`, `planId`, `instanceId`, `lastErrorAt`, `deletedAt`; strip VPS cols; new status enum `creating|active|stopped|error`
- [x] Schema: `assistant_credentials` — remove `tailscaleAuthKey`; envelope encryption at call sites
- [x] Drop `subscriptions.ts`; update schema barrel `src/lib/db/schema/index.ts`
- [x] `src/lib/crypto/envelope.ts` — AES-256-GCM encrypt/decrypt; `CREDENTIALS_MASTER_KEY` env
- [x] Destructive DB reset + `bun run db:push`
- [x] Extend `src/server/middleware/clerk.ts` — lazy-upsert `organizations`, set `dbOrg` on context; auto-create personal org if user has no active org
- [x] `src/server/middleware/org-admin.ts` — gate mutations behind `org:admin` role
- [x] `src/server/middleware/platform-admin.ts` — gate plans/credits admin behind `publicMetadata.role === "admin"`
- [x] `src/server/routes/organizations.ts` — `GET /api/orgs/current`, `PATCH /api/orgs/current`
- [x] `src/app/onboarding/org/page.tsx` — Clerk `<CreateOrganization>` for users with no active org
- [x] `src/lib/flags.ts` — `NEXT_PUBLIC_FF_ORGS` feature flag gates org switcher + Members nav
- [x] Dashboard restructured under `src/app/dashboard/[orgId]/` — all URLs include org ID
- [x] `src/app/dashboard/[orgId]/OrgActivator.tsx` — syncs URL orgId → Clerk active org on navigation
- [x] `src/app/dashboard/[orgId]/layout.tsx` — sidebar with org-prefixed links, `<OrganizationSwitcher>`, feature-flagged Members link
- [x] Three-way auth redirect (`!userId → /login`, `!orgId → /onboarding/org`, else `→ /dashboard/:orgId`)

---

## 4b — Plans catalog + credit system ✅ DONE

- [x] `src/lib/plans/catalog.ts` — `getPlan(planId)`, `listPlans({ activeOnly })`, 60s in-process cache + `invalidatePlanCache()`
- [x] `src/lib/billing/credits.ts` — `canProvision(orgId, planId)`, `consumeCredit(orgId, planId, assistantId, tx)`, `releaseCredit(assistantId, tx)`
- [x] `src/server/routes/plans.ts` — `GET /api/plans`, `GET /api/plans/:slug`
- [x] `src/server/routes/credits.ts` — `GET /api/credits`, `GET /api/credits/:id` (org-scoped)
- [x] `src/server/routes/admin.ts` — `GET/POST /admin/plans`, `PATCH /admin/plans/:id`, `POST /admin/credits/mint`, `POST /admin/credits/:id/revoke`, `GET /admin/credits`
- [x] `src/app/dashboard/[orgId]/admin/page.tsx` — Plans panel (create/edit/toggle-active) with Hetzner server type dropdown; Credits panel (mint/revoke/list)
- [x] `src/app/dashboard/[orgId]/admin/actions.ts` — `getPlans`, `createPlan`, `updatePlan`, `togglePlanActive`, `mintCredit`, `revokeCredit`, `getCreditsForOrg`
- [x] `src/app/dashboard/[orgId]/credits/page.tsx` — org credit list
- [x] Admin plan form: providerSpec uses structured Hetzner server type `<select>` (cx23/cx33/cx43/cpx11/cpx21/cax11/cax21) instead of raw JSON textarea

---

## 4c — Instance split + provisioning rewrite ✅ DONE

- [x] Rewrite `src/lib/workflows/provisioning.ts` — instance-scoped step writes; plan-driven `serverType` from `plans.providerSpec.hetzner.serverType`; `recordEvent` instrumentation on every step
- [x] Rewrite `src/server/routes/assistants.ts` — org-scoped; `planId` required on create; atomic tx (insert assistant + instance + consumeCredit); `POST /:id/retry`; soft delete + credit release
- [x] Encrypt `rootCredential` + `gatewayToken` via envelope on write; decrypt on read
- [x] Tailscale auth key is ephemeral — verified, passed through to cloud-init, never persisted to DB
- [x] `GET /:id/gateway-token` — decrypts and returns token
- [x] `GET /:id/ssh-key` — decrypts private key, returns as `.pem` download

---

## 4d — Hetzner primitives + access features ✅ DONE

- [x] Extend `src/lib/providers/hetzner.ts` — `getMetrics`, `updateFirewall`, `detachFirewall`, `deleteFirewall`
- [x] `src/server/routes/tailscale.ts` — `POST /api/tailscale/verify` (ephemeral; never stores key)
- [x] `GET /:id/metrics?type=cpu|disk|network&window=1h|6h|24h` — Hetzner server metrics
- [x] `PATCH /:id/firewall` — update SSH allowed IPs + sync to Hetzner firewall
- [x] Assistant detail page — Connect to Gateway card:
  - SSH mode: exact `ssh -i <name>.pem -N -L 8888:localhost:<gatewayPort> root@<ipv4>` command with copy button
  - Tailscale mode: direct `https://<hostname>` link
  - Gateway token with reveal/mask toggle + copy button
- [x] `src/app/dashboard/[orgId]/assistant/[assistantId]/page.tsx` — SSH key download link; firewall IP allowlist editor; CPU sparkline metrics; Connect to Gateway card; Danger Zone

---

## 4e — UI overhaul + Design System 🚧 IN PROGRESS

Built from the Claude Design handoff bundle (`clawbot-handoff`) — all surfaces get the same chrome (sidebar, topbar, notifications, theme toggle) and every primitive is a typed TSX component. Shipped in small stages so each commit can be reviewed independently.

### Foundation + Shell ✅ Stage 1

- [x] Instrument Serif added via `next/font/google` → `--font-instrument-serif`; Geist Sans + Geist Mono kept
- [x] `src/app/globals.css` rewritten to a warm palette: `--primary` = OpenClaw red (`oklch(0.63 0.195 28)`), paper-warm light mode, warm near-black dark mode; shadcn sidebar/chart vars follow
- [x] Design CSS copied to `src/styles/dashboard/` (`dashboard.css`, `first-assistant.css`, `docs.css`) — all `--db-*` and `--claw-*` tokens aliased to standard shadcn vars via a `.dashboard-root` bridge, so there is no parallel design system
- [x] `src/components/dashboard/icon.tsx` — typed `<Icon name={...}>` with all Lucide paths from the bundle (~60 icons)
- [x] Primitives ported to TSX: `Pill`, `StatusPill`, `SectionCard`, `CodeBlock`, `Callout`, `Field`, `RowMenu`, `Sparkline`, `LineChart`, `EmptyStage`
- [x] Brand assets copied to `public/brand/` (`logo-mark.svg`, `logo-mark-light.svg`, `logo-wordmark.svg`)
- [x] `src/components/dashboard/sidebar.tsx` — Clerk `OrganizationSwitcher` + `UserButton` behind design chrome, nav items backed by `next/link` with active-route detection
- [x] `src/components/dashboard/topbar.tsx` — pathname-derived breadcrumb, search trigger placeholder (Stage 5 wires command palette), help link, theme toggle, notification bell
- [x] `src/components/dashboard/theme-toggle.tsx` — swaps `.dark` class on `<html>`; `theme-init.tsx` inlines a pre-paint script so the first frame uses the stored theme
- [x] `src/components/dashboard/notif-bell.tsx` — tabbed inbox (All/Unread/Alerts) with grouped buckets; seed list stubbed until a notifications API lands
- [x] `src/app/dashboard/[orgId]/layout.tsx` — new shell replacing the previous simple aside; wraps all existing pages without changing their code
- [x] Placeholder pages for nav items not yet implemented: `settings/`, `quickstart/`, `docs/`, `notifications/`

**Design-token → shadcn-var mapping** (applied in `src/styles/dashboard/dashboard.css` under `.dashboard-root`):

| Design token       | shadcn var                                                      |
| ------------------ | --------------------------------------------------------------- |
| `--db-bg`          | `--background`                                                  |
| `--db-bg-2`        | `--muted`                                                       |
| `--db-surface`     | `--card`                                                        |
| `--db-surface-2`   | `--muted`                                                       |
| `--db-surface-3`   | `--accent`                                                      |
| `--db-hair`        | `--border`                                                      |
| `--db-hair-strong` | `color-mix(in oklab, var(--foreground) 18%, transparent)`       |
| `--db-ring`        | `--ring`                                                        |
| `--db-text`        | `--foreground`                                                  |
| `--db-text-dim`    | `--muted-foreground`                                            |
| `--db-text-faint`  | `color-mix(in oklab, var(--muted-foreground) 70%, transparent)` |
| `--db-red`         | `--primary`                                                     |
| `--db-red-dim`     | `color-mix(in oklab, var(--primary) 16%, transparent)`          |
| `--claw-red`       | `--primary`                                                     |
| `--claw-red-hover` | `color-mix(in oklab, var(--primary) 88%, black 12%)`            |
| `--claw-ink-50`    | `--foreground`                                                  |
| `--claw-ink-950`   | `--background`                                                  |
| `--font-sans`      | `--font-geist-sans`                                             |
| `--font-mono`      | `--font-geist-mono`                                             |
| `--font-display`   | `--font-instrument-serif`                                       |

### Assistants list + tabbed detail ✅ Stage 2

- [x] `/dashboard/[orgId]/page.tsx` — assistants table driven by `GET /api/assistants`; filter segment (All/Active/Provisioning/Error/Stopped); empty state with CTA to `/pricing`; credits summary; retry action wired to `POST /api/assistants/:id/retry`
- [x] `/dashboard/[orgId]/assistant/[id]/page.tsx` — tabbed detail (Overview, Access, Connect, Monitor, Terminal, Logs, Files, Versions, Settings) with refresh + open-gateway actions
- [x] `tabs/overview-tab.tsx` — provisioning step list, error callout, or active stat strip (CPU from real metrics API, Memory + Disk rendered from a preview trace until the metrics API adds those types) + Connect-to-Gateway card
- [x] `tabs/access-tab.tsx` — SSH key download via `/api/assistants/:id/ssh-key`, allowed-IPs editor wired to `PATCH /api/assistants/:id/firewall`; Tailscale mode shows hostname + MagicDNS facts
- [x] `tabs/connect-tab.tsx` — terminal and SDK snippets + gateway-token reveal/copy via `/api/assistants/:id/gateway-token`
- [x] `tabs/metrics-tab.tsx` — LineChart wired to `/api/assistants/:id/metrics?type=cpu&window=...`; window segment (15m/1h/6h/24h/7d); memory/network/request-rate panes render preview traces until the metrics API exposes them
- [x] `tabs/settings-tab.tsx` — retry (error state), identity facts, danger-zone delete with typed-name confirmation wired to `DELETE /api/assistants/:id`
- [x] `components/dashboard/create-assistant-drawer.tsx` — design-spec drawer (name, plan radio-cards, region, access mode segment, SSH CIDR or Tailscale auth-key with `POST /api/tailscale/verify`), wired to `POST /api/assistants`; opens from the list page&rsquo;s "New assistant" button and the empty-state CTA; on success the page re-fetches and routes to the new detail. This is the minimum create flow — the full first-run wizard lands in Stage 5
- [x] `tabs/stub-tabs.tsx` — Terminal / Logs / Files / Versions shells with the design&rsquo;s "coming soon" treatment (kept per handoff instruction: don&rsquo;t remove the UI component even if the feature isn&rsquo;t wired yet)
- [x] `sidebar-facts.tsx` — shared plan/region/provider card + gateway-token card used by Overview

### Billing + Pricing 🔜 Stage 3

- [ ] `/dashboard/[orgId]/billing` — summary (MRR, active subscriptions, next invoice), subscriptions table driven by `GET /api/billing/subscriptions`, invoices table driven by `GET /api/billing/invoices`, payment method section with Stripe Customer Portal link
- [ ] `/dashboard/[orgId]/pricing` — plan cards (Starter/Growth/Pro/Business) with benefits bullets, resource limits, price; "Buy plan" wired to checkout

### Members + Settings + Onboarding + Admin + Docs + Notifications 🔜 Stage 4

- [ ] Members — styled member list + Clerk invite flow
- [ ] Settings — account, organization, notification prefs
- [ ] Quickstart — guided pick-plan → deploy → connect-channel
- [ ] Admin — plan and credit management (existing wiring, new chrome)
- [ ] Docs — in-dashboard reference (markdown files already in `/docs`)
- [ ] Notifications — full inbox view with filters and bulk actions

### First-assistant wizard + Command palette 🔜 Stage 5

- [ ] `FirstAssistantWizard` modal — pick plan → region → access mode → deploy; wired to `POST /api/assistants`
- [ ] Command palette (⌘K) — global search + jump-to-route
- [ ] `NewOrgDialog` — create-organization modal inside the design chrome

### Dark mode + mobile

- [x] Dark-mode toggle in topbar; persists via `cb:theme` localStorage; pre-paint script in layout avoids FOUC
- [ ] Mobile breakpoints — sidebar → drawer, topbar wraps, cards stack (tracked per stage)

---

## Deferred

→ See [phase-7.md](./phase-7.md)

---

## Decisions Made

| Decision             | Choice                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Org primary key      | Clerk org ID string (`org_xxx`) — no separate `clerkOrgId` column                         |
| No-org UX            | Auto-create personal org in middleware; redirect to `/onboarding/org` if Clerk call fails |
| Plan IDs             | Stored as UUID in DB; `slug` is the stable code key (`go`/`pro`/`max`)                    |
| Plan editing         | Admin UI only — no seed scripts                                                           |
| Hetzner server types | Dropdown in admin UI: cx33 minimum (40 GB disk required for snapshot)                     |
| Tailscale auth key   | Ephemeral — verified, used in cloud-init, never written to DB                             |
| Credential storage   | AES-256-GCM envelope encryption (`rootCredential`, `gatewayToken`)                        |
| Plan upgrade path    | Delete + recreate — credit released, user picks new plan                                  |
| Access mode change   | Delete + recreate — no in-place rebuild                                                   |
| Org feature flag     | `NEXT_PUBLIC_FF_ORGS=true` enables org switcher + Members nav                             |
