# Phase 4 — Org Layer, Plans, Credits & Dashboard Foundations

## What shipped in Phase 4 (Parts 1–4)

Phase 4 landed the production foundations the product was missing before any UI polish could matter:

- **Org layer** — Clerk Organizations; every resource is org-owned; org ID is in every URL; personal org auto-created for new users
- **Plans catalog** — `plans` table, admin-editable, no seed scripts; Hetzner server type selected from a dropdown (cx33 minimum — 40 GB disk required for snapshot)
- **Credit system** — `assistant_credits` table; `canProvision` / `consumeCredit` / `releaseCredit` atomic helpers; 402 if no free credit; credit released on delete
- **Instance split** — `instances` table separates VPS lifecycle from the user-facing `assistants` entity; `instance_events` append-only step trace drives error visibility
- **Provisioning rewrite** — instance-scoped step writes; plan-driven `serverType` from `plans.providerSpec.hetzner.serverType`; every step emits an `instanceEvent`; `POST /:id/retry` path
- **Credential encryption** — AES-256-GCM envelope on `rootCredential` and `gatewayToken`; Tailscale auth key is ephemeral (verified, used in cloud-init, never persisted)
- **Hetzner primitives** — `getMetrics`, `updateFirewall`, `detachFirewall`, `deleteFirewall`
- **Dashboard restructure** — all routes under `[orgId]`; `OrgActivator` syncs URL → Clerk active org; `NEXT_PUBLIC_FF_ORGS` gates org switcher and Members nav
- **Assistant detail** — SSH key download; firewall IP allowlist editor; CPU sparkline; **Connect to Gateway** card (SSH tunnel command or Tailscale URL, both with real port/IP/hostname/token)

---

## Decisions Made

| Topic                             | Decision                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Org primary key                   | Clerk org ID string (`org_xxx`) — no extra `clerkOrgId` column                              |
| No-active-org UX                  | Middleware auto-creates personal org; redirects to `/onboarding/org` on failure             |
| Plan slug keys                    | `go` / `pro` / `max` — stable in code; `displayName` is the user-facing label               |
| Plan editing                      | Admin UI only — no seed data, no migration scripts                                          |
| Hetzner minimum                   | `cx33` (4 vCPU, 8 GB, 40 GB disk) — `cx22`/`cx23` rejected; snapshot image > 20 GB          |
| Tailscale auth key                | Ephemeral — verified once, forwarded to cloud-init, never written to DB                     |
| Credential storage                | AES-256-GCM envelope; column values are `v1:<iv>:<tag>:<ct>`                                |
| Plan upgrade / access-mode change | Delete + recreate (credit released); no in-place rebuild                                    |
| Org feature flag                  | `NEXT_PUBLIC_FF_ORGS=true` shows org switcher + Members nav                                 |
| Platform admin                    | Clerk `publicMetadata.role === "admin"` — independent of any org role                       |
| Retry path                        | Reuses existing credit; if no VPS exists reuses instance row, otherwise creates a fresh one |

---

## Architecture Overview

```
Clerk (auth + orgs)
  └─ middleware: lazy-upsert organizations → dbOrg on Hono context
       └─ routes scoped to dbOrg.id

DB Tables (Drizzle / Neon PostgreSQL)
  organizations      id = Clerk org ID (text PK)
  plans              slug · tier · providerSpec · billingProviderIds · resourceLimits · benefits
  assistant_credits  orgId · planId · status · consumedByAssistantId
  assistants         orgId · planId · instanceId · status · hostname · accessMode · deletedAt
  instances          assistantId · providerServerId · firewallId · ipv4 · gatewayPort · status
  instance_events    instanceId · step · status · message (append-only trace)
  assistant_credentials  assistantId · rootCredential (encrypted) · gatewayToken (encrypted)

Provisioning workflow (useworkflow.dev)
  provisionAssistant(orgId, assistantId, instanceId, planId, region, hostname, accessMode, sshAllowedIps, tailscaleAuthKey?)
  - reads providerSpec.hetzner.serverType from plans
  - writes to instances (not assistants) at every step
  - emits instanceEvents per step
  - finalizes: sets assistants.instanceId + status=active
  - on error: sets both instances.status=error + assistants.status=error + lastErrorAt

Encryption
  src/lib/crypto/envelope.ts — AES-256-GCM, CREDENTIALS_MASTER_KEY env (base64 32 bytes)
```

---

## Phase 4e — UI Overhaul + Design System (NEXT)

The Phase 1–4d infrastructure is solid. The dashboard UI was built as functional scaffolding — it works, but it's not visually consistent. Phase 4e rebuilds every dashboard surface with a shared design system before Phase 5 (Stripe) adds checkout flows on top.

### Goals

- Consistent visual language across all dashboard pages
- Design tokens defined once, referenced everywhere
- Shared component library so new pages look right by default
- Dark mode as the dashboard default
- Mobile-friendly layouts

### Scope

**Design system foundations**

- Design tokens in Tailwind config: semantic color aliases (`--color-surface`, `--color-border`, `--color-accent`), spacing scale, border radius, shadow levels
- Shared primitives: `StatusPill`, `CopyableCode`, `SectionCard`, `EmptyState`, `SkeletonRow`, `ConfirmDialog`

**Dashboard pages (redesign)**

- `/dashboard/[orgId]` — assistant list + create form (draw/modal pattern); plan badge; empty state when no credits
- `/dashboard/[orgId]/assistant/[assistantId]` — consistent card layout; loading skeletons; polished Connect + Access cards
- `/dashboard/[orgId]/credits` — plan card design; status + renewal date; linked plan details
- `/dashboard/[orgId]/pricing` — plan cards with benefits bullets, resource limits, price; CTA disabled until Phase 5
- `/dashboard/[orgId]/admin` — consistent table/form patterns; snappier plan edit UX
- `/dashboard/[orgId]/members` — polished member list + invite flow

**Global**

- Dashboard layout forced dark; marketing pages respect system preference
- All pages mobile-usable

### Deferred until after 4e

- SSH exec: logs, files, terminal, ssh-key rotate — pending control-plane egress decision
- xterm.js terminal — stretch goal or Phase 5 addition
- Volume / Storage tab — post-MVP
- Versions tab — post-MVP
- Clerk org webhook handler (org name/slug sync) — low priority, middleware handles it

---

## Out of Scope for Phase 4 (permanent deferrals)

These were explicitly cut to keep blast radius small:

- **Stripe checkout / webhooks** — Phase 5 owns this
- **In-place rebuild / plan upgrade / access-mode change** — delete + recreate; credit is released
- **File editing** — read-only file tree if/when Files tab lands
- **Volume creation / attach UX** — existing volumes shown; create/attach is stretch

---

## Environment Variables Added in Phase 4

```bash
CREDENTIALS_MASTER_KEY=    # openssl rand -base64 32 — required for credential encryption
TAILSCALE_API_KEY=         # optional — only needed for tailscale_serve mode
TAILSCALE_TAILNET=         # optional — only needed for tailscale_serve mode
NEXT_PUBLIC_FF_ORGS=false  # set true to show org switcher + Members nav
```
