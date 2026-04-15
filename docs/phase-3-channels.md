# Phase 3: Channels

## Goal

Enable users to connect messaging channels (Telegram, WhatsApp, Discord, Slack, Web) to their OpenClaw agents through a guided setup UI. Credentials are injected directly into the VPS -- never stored in our database.

## Channel Definitions

### `src/lib/channels/types.ts`

```ts
export type ChannelType = "telegram" | "whatsapp" | "discord" | "slack" | "web";

export interface ChannelConfig {
  type: ChannelType;
  label: string;
  description: string;
  requiredFields: ChannelField[];
  setupSteps: string[];
}

export interface ChannelField {
  key: string;
  label: string;
  type: "text" | "password";
  placeholder: string;
  helpUrl?: string;
}
```

### Channel-Specific Fields

| Channel  | Required Credentials                                        |
| -------- | ----------------------------------------------------------- |
| Telegram | Bot token (from @BotFather)                                 |
| WhatsApp | Phone number ID, access token, verify token (Meta Business) |
| Discord  | Bot token, application ID (Discord Developer Portal)        |
| Slack    | Bot token, signing secret (Slack API)                       |
| Web      | None (auto-configured, exposes chat widget endpoint)        |

Definitions live in `src/lib/channels/definitions.ts`.

## Guided Setup UI

Each channel has a step-by-step setup wizard at `src/components/channels/`:

```
src/components/channels/
  ChannelSetupWizard.tsx      -- Main wizard shell
  steps/
    TelegramSetup.tsx         -- @BotFather walkthrough + token input
    WhatsAppSetup.tsx         -- Meta Business setup guide
    DiscordSetup.tsx          -- Developer Portal walkthrough
    SlackSetup.tsx            -- Slack App creation guide
    WebSetup.tsx              -- Auto-setup confirmation
```

Each wizard:

1. Shows step-by-step instructions with screenshots/links for creating the bot/app on the platform
2. Collects the required credentials via form fields
3. Submits to the setup API endpoint
4. Shows success/failure status

## Config Injection Flow

This is the core security model -- **credentials never touch our database**.

```
1. User submits credentials via setup wizard
2. API receives credentials in request body
3. SSH into the agent's VPS using stored server IP
4. Write credentials to OpenClaw's channel config file
5. Restart the OpenClaw channel service
6. Verify the channel is connected via health check
7. Return success -- credentials are NOT persisted in our DB
```

Implementation: `src/lib/channels/inject.ts`

```ts
export async function injectChannelConfig(
  serverIp: string,
  channelType: ChannelType,
  credentials: Record<string, string>,
): Promise<{ success: boolean; error?: string }>;
```

Uses SSH2 library to connect to the VPS. SSH key is stored as an environment variable (`SSH_PRIVATE_KEY`), not in the database.

## Health Monitoring

### Assistant health (`src/app/api/cron/health/route.ts`)

Carried over from Phase 2 scope. Runs every 5 minutes via Vercel cron:

- Queries all assistants with status `running`
- Hits each server's gateway health endpoint (port 18789) via the stored server IP
- Updates assistant status to `error` after 3 consecutive failures
- Future: alerting via email/webhook

### Channel health (`src/app/api/cron/channels/route.ts`)

- For each running assistant, SSH in and check which channels are active
- Returns per-channel status: `connected | disconnected | error`
- Dashboard displays real-time channel health badges

## API Endpoints

```
POST   /api/agents/:id/channels/setup
  Body: { type: ChannelType, credentials: Record<string, string> }
  Auth: Clerk session, must own the agent
  Flow: SSH -> inject config -> restart channel -> health check
  Returns: { success: boolean, error?: string }
  Note: credentials are used transiently, never stored

GET    /api/agents/:id/channels/health
  Auth: Clerk session, must own the agent
  Returns: { channels: Array<{ type: ChannelType, status: string }> }

DELETE /api/agents/:id/channels/:type
  Auth: Clerk session, must own the agent
  Flow: SSH -> remove channel config -> restart service
  Returns: { success: boolean }
```

## Files Owned

```
src/lib/channels/types.ts
src/lib/channels/definitions.ts
src/lib/channels/inject.ts
src/server/routes/channels.ts
src/app/api/cron/health/route.ts
src/app/api/cron/channels/route.ts
src/components/channels/ChannelSetupWizard.tsx
src/components/channels/steps/TelegramSetup.tsx
src/components/channels/steps/WhatsAppSetup.tsx
src/components/channels/steps/DiscordSetup.tsx
src/components/channels/steps/SlackSetup.tsx
src/components/channels/steps/WebSetup.tsx
```

## Definition of Done

- Assistant health cron detects unreachable gateways and marks status `error`
- All 5 channel setup wizards render with correct instructions
- Config injection successfully writes to VPS and restarts service
- Health endpoint returns accurate per-channel status
- Channel removal cleans up config on VPS
- No credentials are persisted in SnapClaw's database
