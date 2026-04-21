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

## 4e — UI overhaul + Design System 🔜 NEXT

Design system first, then all dashboard surfaces get rebuilt consistently.

- [ ] Define design tokens (color, spacing, radius, shadow) in `src/styles/tokens.css` or Tailwind config
- [ ] Build shared component library: `StatusPill`, `CopyableCode`, `SectionCard`, `EmptyState`, `SkeletonRow`, `ConfirmDialog`
- [ ] Dashboard list page (`/dashboard/[orgId]`) — full redesign: plan badge, status pill, empty state, create form as drawer/modal
- [ ] Assistant detail page — consistent card layout, polished typography, loading skeletons
- [ ] Credits page — plan card design matching pricing
- [ ] Pricing page (`/dashboard/[orgId]/pricing`) — plan cards with benefits bullets, resource limits, CTA (disabled until Phase 5)
- [ ] Admin page — consistent table/form patterns
- [ ] Members page — polished member list + invite flow
- [ ] Dark mode — dashboard forced dark; respect system preference on marketing pages
- [ ] Mobile layout — all pages usable on small screens

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
