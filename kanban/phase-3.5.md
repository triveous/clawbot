# Phase 3.5 — Network Access Modes

Two access modes selectable at assistant creation time. `tailscale_direct` was evaluated and dropped — Tailscale Serve covers both use cases more cleanly.

## Access Modes

| Mode            | Internal name     | Display           | Access method                                                   |
| --------------- | ----------------- | ----------------- | --------------------------------------------------------------- |
| SSH Tunnel      | `ssh`             | SSH Tunnel        | `ssh -L` port-forward gateway; Hetzner firewall TCP 22 only     |
| Tailscale Serve | `tailscale_serve` | Tailscale (Serve) | `tailscale serve` → HTTPS at `https://<slug>.<tailnet>.ts.net/` |

Gateway port randomized per assistant (20000–29999), stored in both `assistant_credentials.gatewayPort` and `assistants.gatewayPort` (response without join).

## SSH Key Model

Single root Ed25519 keypair per assistant — no separate openclaw keypair:

- Root public key registered with Hetzner → injected into `/root/.ssh/authorized_keys` automatically
- Same root public key injected into `/home/openclaw/.ssh/authorized_keys` via cloud-init
- Operator SSHs directly as `openclaw@<ipv4>` (ssh mode) or `openclaw@<slug>.<tailnet>.ts.net` (tailscale_serve via Tailscale SSH)
- No `su` hop needed; openclaw has no sudo, so sharing the root key carries no escalation risk
- Root private key stored in `assistant_credentials.rootCredential` and surfaced to operator via dashboard

## Firewall Rules by Mode

| Mode              | Protocol | Port  | Source                                             |
| ----------------- | -------- | ----- | -------------------------------------------------- |
| `ssh`             | TCP      | 22    | `sshAllowedIps` (default `0.0.0.0/0, ::/0`)        |
| `tailscale_serve` | UDP      | 41641 | `0.0.0.0/0, ::/0` (WireGuard; falls back to relay) |

## Completed

### Bootstrap (`scripts/bootstrap.sh`)

- [x] Remove UFW — all inbound access control via Hetzner cloud firewall API; UFW risks permanent lockout in tailscale mode
- [x] Install Tailscale; disable `tailscaled` by default (cloud-init enables per-mode)
- [x] Seed `{}` into `~/.openclaw/openclaw.json` before `openclaw doctor --fix --yes` — doctor creates a zero-byte file if the file is missing, which gets baked into the snapshot and causes a JSON5 parse abort in cloud-init
- [x] `tailscale set --operator=openclaw` — grants openclaw user operator rights so it can run `tailscale serve` without root; applied at snapshot time (start tailscaled briefly, apply, stop)

### Infrastructure (`src/lib/providers/`)

- [x] `FirewallRule` interface
- [x] `createFirewall`, `attachFirewall`, `detachFirewall`, `deleteFirewall` on `HetznerProvider`
- [x] `detachFirewall` on `ProviderInterface` — required before `deleteFirewall` to avoid Hetzner 409 (firewall still attached to resources)
- [x] `firewalls` option on `CreateServerOptions` — firewall attached at server creation (zero exposure window)

### Database Schema

- [x] `access_mode` enum (`ssh`, `tailscale_serve`) on `assistants`
- [x] `ssh_allowed_ips`, `firewall_id`, `gateway_port` columns on `assistants`
- [x] `tailscale_auth_key` column on `assistant_credentials`
- [x] Removed `ssh_private_key`, `ssh_public_key` columns — single root keypair only
- [x] Migration: `0001_network-access-mode.sql`

### Cloud-init (`src/lib/workflows/cloud-init.ts`)

- [x] Injects root public key into `~/.ssh/authorized_keys` for openclaw user (same key as root)
- [x] Always overwrites `openclaw.json` with `{}` before `openclaw config set` — snapshot may contain a zero-byte file left by `openclaw doctor --fix`
- [x] Saves gateway token to `~/.openclaw/.gateway-token` (chmod 600) for operator retrieval
- [x] `gateway.mode local`, `gateway.bind loopback`, `gateway.auth.mode token`, `gateway.auth.token`, `gateway.port` set via `openclaw config set`
- [x] `tailscale_serve` root block: `systemctl enable/start tailscaled`, `tailscale up --authkey ... --ssh --accept-routes --hostname`, auth key written to `/tmp/ts-authkey` and removed after use
- [x] `tailscale serve --bg http://127.0.0.1:<port>` runs as root (before `su - openclaw`) — avoids operator-rights check until snapshot is rebuilt; persists serve config in tailscaled state
- [x] `gateway.tailscale.mode serve`, `gateway.auth.allowTailscale true`, `gateway.controlUi.allowedOrigins` derived from `tailscale status --self --json | jq -r '.Self.DNSName'` at provision time (MagicDNS FQDN unknown at deploy time)

### Provisioning Workflow (`src/lib/workflows/provisioning.ts`)

- [x] `createFirewall` step before `createServer` (firewall rules from `accessMode` + `sshAllowedIps`)
- [x] Random `gatewayPort` (20000–29999) generated in `prepareCredentials`
- [x] `firewallId` passed into `createServer` payload — attached at creation
- [x] `firewallId` persisted to `assistants` row after creation
- [x] Best-effort `deleteFirewall` on provisioning error
- [x] Removed openclaw keypair generation — root keypair only

### Routes (`src/server/routes/assistants.ts`)

- [x] `POST /api/assistants` — `accessMode`, `sshAllowedIps`, `tailscaleAuthKey` body fields; 422 if tailscale mode missing auth key
- [x] `DELETE /api/assistants/:id` — detach firewall from server → delete server → delete firewall (order matters; Hetzner 409 if firewall still attached at delete time)
- [x] `AssistantResponse` exposes `accessMode` and `gatewayPort`

### Dashboard (`src/app/dashboard/page.tsx`)

- [x] Access mode selector (SSH Tunnel / Tailscale Serve)
- [x] Tailscale auth key input (shown when `tailscale_serve` selected)
- [x] SSH allowed IPs input (shown when `ssh` selected; default `0.0.0.0/0`)
- [x] `gatewayPort` displayed in assistant card

### Tests

- [x] `tests/unit/lib/providers/hetzner-firewall.test.ts` — createFirewall, attachFirewall, detachFirewall, deleteFirewall, 404 swallow, 4xx throws
- [x] `tests/unit/lib/workflows/cloud-init.test.ts` — 23 cases across ssh and tailscale_serve modes
- [x] `tests/unit/server/assistants.test.ts` — access mode validation, workflow args, DELETE firewall lifecycle

## Operator Access Reference

### SSH mode

```bash
# Direct shell as openclaw
ssh -i <root_private_key> openclaw@<ipv4>

# Gateway tunnel
ssh -N -L <gatewayPort>:127.0.0.1:<gatewayPort> -i <root_private_key> openclaw@<ipv4>
# then open http://127.0.0.1:<gatewayPort> — gateway token is the password
```

### Tailscale Serve mode

```bash
# Shell access via Tailscale SSH (auth by tailnet identity; no key needed)
ssh openclaw@<slug>.<tailnet>.ts.net
ssh root@<slug>.<tailnet>.ts.net

# Gateway dashboard — no tunnel needed
https://<slug>.<tailnet>.ts.net/
# gateway token still required for /v1/* API endpoints
```

## Snapshot Requirements

A new snapshot must be built before `tailscale set --operator=openclaw` takes effect. Until then, `tailscale serve --bg` runs as root in cloud-init (works correctly; operator rights only matter if openclaw user runs it directly).

## Completed in Phase 4

- [x] Dashboard: SSH key download (`.pem`) from assistant detail page
- [x] Dashboard: SSH tunnel command with exact port/IP/filename — Connect to Gateway card
- [x] SSH allowed IPs update — `PATCH /:id/firewall` endpoint + UI editor

## Deferred

→ See [phase-7.md](./phase-7.md)
