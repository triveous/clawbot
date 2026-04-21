# Phase 2 — Provisioning Engine

Reference: [Phase 2 Docs](../docs/phase-2-provisioning.md)

Status: **Complete**

## Provider Layer

- [x] Create provider interface (`src/lib/providers/types.ts`)
- [x] Implement Hetzner provider client (`src/lib/providers/hetzner.ts`)
- [x] Firewall rules applied in bootstrap snapshot (UFW: allow 22, 18789; deny all else)

## Snapshot Management

- [x] `snapshots` DB table with `is_active` flag and version tracking
- [x] Bootstrap workflow (`src/lib/workflows/bootstrap.ts`) — provisions a base image via the official openclaw installer and takes a Hetzner snapshot
- [x] Admin routes for snapshot management (`src/server/routes/admin.ts`)
- [x] `validateVersion()` — shell-injection guard for `OPENCLAW_VERSION` input

## Provisioning Workflow

- [x] useworkflow.dev durable workflow (`src/lib/workflows/provisioning.ts`)
  - `prepareCredentials` — generate ed25519 SSH key pair + gateway token, stored in `assistant_credentials`
  - `createServer` — register SSH key with Hetzner, create server from active snapshot with cloud-init, delete transient key resource
  - `waitForReady` — SSH health check polling until server accepts connections
  - `finalize` — mark assistant `running`, persist server IP
  - `markError` — catch-all error handler updates assistant to `error` status
- [x] Cloud-init template (`src/lib/workflows/cloud-init.ts`) runs on first boot:
  - SSH key auth for `openclaw` user
  - Writes `openclaw.json` with `gateway.mode`, `gateway.auth.token`, `gateway.port`, `session.dmScope`
  - Startup optimisations via `~/.config/environment.d/openclaw.conf` (`NODE_COMPILE_CACHE`, `OPENCLAW_NO_RESPAWN`)
  - `loginctl enable-linger openclaw` for headless systemd user services
  - `openclaw gateway install` — native systemd user service
  - SSH hardening (`Match User openclaw`, key-only)
- [x] Progress logging throughout workflow (`[provisioning:<step>]` pattern)
- [x] Assistant lifecycle endpoints: restart, stop, delete

## API Endpoints

- [x] `POST   /api/assistants` — create assistant, trigger provisioning workflow
- [x] `GET    /api/assistants` — list user's assistants
- [x] `GET    /api/assistants/:id` — get assistant details and status
- [x] `POST   /api/assistants/:id/restart` — restart
- [x] `POST   /api/assistants/:id/stop` — stop
- [x] `DELETE /api/assistants/:id` — destroy

## Schema

- [x] `assistants` table (renamed from `agents`): `provider`, `provider_server_id`, status machine (`creating → provisioning → running → stopped → error`)
- [x] `assistant_credentials` table: SSH key pair, gateway token, gateway port (cascade-deleted with assistant)

## Rename

- [x] `agents` → `assistants` across schema, routes, RPC, dashboard UI, tests, CLAUDE.md

## Testing

- [x] Unit tests for provider interface, snapshot logic, provisioning workflow, cloud-init template
- [x] 80 tests passing (vitest)

## Completed in later phases

- [x] Credit consumption on provisioning — landed in Phase 4 (`consumeCredit` in creation transaction)
