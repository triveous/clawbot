# Phase 6: Dashboard

## Goal

Build the authenticated dashboard for managing agents, channels, billing, and settings. Consumes RPC endpoints from Phases 2, 3, and 4. Polished with Magic UI components.

## Route Structure

```
src/app/(dashboard)/
  page.tsx                          # Agent overview (default)
  agents/
    [id]/
      page.tsx                      # Agent detail
      channels/page.tsx             # Channel management
      settings/page.tsx             # Agent settings
  billing/page.tsx                  # Subscriptions + usage
  settings/page.tsx                 # User profile + notifications
```

## Agent Overview

**Route:** `src/app/(dashboard)/page.tsx`

- Grid of agent status cards
- Each card shows: agent name, status badge (running/stopped/error/provisioning), server region, uptime
- "New Agent" button (respects `canProvision()` -- disabled with tooltip if at plan limit)
- Empty state for first-time users with link to onboarding

### RPC Calls

```ts
const agents = await client.api.agents.$get();
```

### Components

```
src/components/dashboard/
  AgentCard.tsx           -- Status badge, quick actions menu
  AgentGrid.tsx           -- Responsive grid layout
  NewAgentButton.tsx      -- Plan-aware create button
  EmptyState.tsx          -- First-time user prompt
```

## Agent Detail

**Route:** `src/app/(dashboard)/agents/[id]/page.tsx`

Tabbed interface:

### Overview Tab
- Server status with live indicator (Magic UI `Pulse`)
- IP address, region, uptime
- Quick actions: Restart, Stop, Destroy (with confirmation dialog)
- Recent activity log (future)

### Channels Tab
- List of connected channels with health badges (`connected | disconnected | error`)
- "Add Channel" button opens `ChannelSetupWizard` in a dialog
- Per-channel actions: reconfigure, remove

### Settings Tab
- Rename agent
- Change plan (redirects to Stripe portal)
- Danger zone: destroy agent

### RPC Calls

```ts
const agent = await client.api.agents[":id"].$get({ param: { id } });
const health = await client.api.agents[":id"].channels.health.$get({ param: { id } });
await client.api.agents[":id"].restart.$post({ param: { id } });
await client.api.agents[":id"].stop.$post({ param: { id } });
await client.api.agents[":id"].$delete({ param: { id } });
```

### Components

```
src/components/dashboard/
  AgentDetail.tsx
  AgentActions.tsx        -- Restart/Stop/Destroy buttons
  ChannelList.tsx         -- Connected channels with health
  ChannelHealthBadge.tsx  -- Status indicator per channel
  DestroyConfirm.tsx      -- Confirmation dialog for destroy
```

## Billing Page

**Route:** `src/app/(dashboard)/billing/page.tsx`

- Active subscriptions table: agent name, plan, status, next billing date
- OpenRouter usage card: total cost and tokens for current period (live query)
- "Manage Billing" button -> Stripe Customer Portal
- Plan comparison for upgrade prompts

### RPC Calls

```ts
const subs = await client.api.billing.subscriptions.$get();
const usage = await client.api.agents[":id"].usage.$get({ param: { id } });
const portal = await client.api.billing.portal.$post();
```

### Components

```
src/components/dashboard/
  SubscriptionTable.tsx
  UsageCard.tsx           -- OpenRouter cost + token display
  PlanBadge.tsx           -- Starter/Pro/Power badge
```

## Settings Page

**Route:** `src/app/(dashboard)/settings/page.tsx`

- Profile: name, email (synced from Clerk, editable via Clerk components)
- Notifications: email preferences for agent health alerts (future)
- API keys: view/regenerate (future)

### Components

```
src/components/dashboard/
  ProfileSettings.tsx
  NotificationSettings.tsx
```

## Magic UI Components

Used throughout the dashboard for polish:

- `AnimatedList` for activity feeds
- `Pulse` for live status indicators
- `NumberTicker` for usage stats
- `BorderBeam` on active/highlighted cards
- `ShimmerButton` for primary CTAs
- Skeleton loading states on all data-fetching views

## Files Owned

```
src/app/(dashboard)/page.tsx
src/app/(dashboard)/agents/[id]/page.tsx
src/app/(dashboard)/agents/[id]/channels/page.tsx
src/app/(dashboard)/agents/[id]/settings/page.tsx
src/app/(dashboard)/billing/page.tsx
src/app/(dashboard)/settings/page.tsx
src/components/dashboard/AgentCard.tsx
src/components/dashboard/AgentGrid.tsx
src/components/dashboard/AgentDetail.tsx
src/components/dashboard/AgentActions.tsx
src/components/dashboard/ChannelList.tsx
src/components/dashboard/ChannelHealthBadge.tsx
src/components/dashboard/SubscriptionTable.tsx
src/components/dashboard/UsageCard.tsx
src/components/dashboard/PlanBadge.tsx
src/components/dashboard/NewAgentButton.tsx
src/components/dashboard/EmptyState.tsx
src/components/dashboard/DestroyConfirm.tsx
src/components/dashboard/ProfileSettings.tsx
src/components/dashboard/NotificationSettings.tsx
```

## Definition of Done

- Agent overview renders all user agents with correct status
- Agent detail shows live status, channels, and working lifecycle actions
- Channel management: add, view health, remove -- all functional
- Billing page shows subscriptions and live OpenRouter usage
- Stripe Customer Portal accessible from billing page
- All views have loading skeletons and error states
- Responsive design works on mobile and desktop
