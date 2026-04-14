# Phase 2: Provisioning

## Goal

Provision OpenClaw instances from snapshots on Hetzner Cloud, manage their lifecycle, and monitor health.

## Provider Abstraction

### `src/lib/providers/types.ts`

```ts
export interface ProviderServer {
  id: string;
  ip: string;
  status: "running" | "stopped" | "error";
  metadata: Record<string, unknown>;
}

export interface ProviderInterface {
  createFromSnapshot(opts: {
    name: string;
    snapshotId: string;
    region: string;
    size: string;
  }): Promise<ProviderServer>;

  destroy(serverId: string): Promise<void>;
  restart(serverId: string): Promise<void>;
  stop(serverId: string): Promise<void>;
  getStatus(serverId: string): Promise<ProviderServer>;
  enableBackups(serverId: string): Promise<void>;
  configureFirewall(serverId: string): Promise<void>;
}
```

### `src/lib/providers/hetzner.ts`

Implements `ProviderInterface` using the Hetzner Cloud API (`HETZNER_API_TOKEN`).

### `src/lib/providers/index.ts`

Factory function: `getProvider(name: "hetzner"): ProviderInterface`

## Snapshot Management

- Snapshots are pre-built Hetzner images with OpenClaw pre-installed
- `snapshots` table tracks versions and active status per region
- Admin flow (future): create new snapshot, mark active, deprecate old ones
- Provisioning always uses the latest active snapshot for the target region

## Async Provisioning Flow

Orchestrated via **useworkflow.dev** at `src/lib/workflows/provisioning.ts`:

```
Step 1: createFromSnapshot  -- Create server from active snapshot
Step 2: configureFirewall   -- HTTPS only, bind OpenClaw to 127.0.0.1
Step 3: enableBackups       -- Enable automated backups
Step 4: healthCheck         -- Poll until OpenClaw responds on HTTPS
Step 5: markReady           -- Update agent status to "running" in DB
```

Each step is idempotent. If the workflow fails, it can be retried from the last successful step. Agent status is `provisioning` until Step 5 completes.

## Agent Lifecycle (Synchronous)

These are direct API calls -- no workflow needed:

| Action | Provider Call | DB Update |
|--------|-------------|-----------|
| Restart | `provider.restart(serverId)` | status = "running" |
| Stop | `provider.stop(serverId)` | status = "stopped" |
| Destroy | `provider.destroy(serverId)` | status = "destroyed" |

Destroy also cancels the Stripe subscription (Phase 4 integration).

## Health Monitoring

- Vercel cron job runs every 5 minutes: `src/app/api/cron/health/route.ts`
- Queries all agents with status `running`
- Hits each server's health endpoint via HTTPS
- Updates agent status to `error` if unreachable after 3 consecutive failures
- Future: alerting via email/webhook

## Firewall Rules

- Allow inbound HTTPS (443) from anywhere
- Allow inbound SSH (22) from SnapClaw server IPs only
- OpenClaw binds to `127.0.0.1`, exposed via reverse proxy (Caddy/nginx on the VPS)
- All other ports blocked

## API Endpoints

```
POST   /api/agents              -- Create agent (triggers provisioning workflow)
  Body: { name: string, region?: string }
  Auth: Clerk session required
  Guard: canProvision(userId) must return true
  Returns: { agent: Agent } (status: "provisioning")

GET    /api/agents              -- List user's agents
GET    /api/agents/:id          -- Get agent details + status
POST   /api/agents/:id/restart  -- Restart agent
POST   /api/agents/:id/stop     -- Stop agent
DELETE /api/agents/:id          -- Destroy agent + cancel subscription
```

## Files Owned

```
src/lib/providers/types.ts
src/lib/providers/hetzner.ts
src/lib/providers/index.ts
src/lib/workflows/provisioning.ts
src/server/routes/agents.ts
src/app/api/cron/health/route.ts
```

## Definition of Done

- Creating an agent triggers the full provisioning workflow
- Agent transitions through: provisioning -> running
- Restart, stop, destroy work and update DB status
- Health cron detects unreachable agents
- All endpoints return proper error codes (401, 403, 404, 500)
