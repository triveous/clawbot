# Phase 3.5 — Network Access Modes

Three access modes selectable at assistant creation time.

## Access Modes

| Mode             | Internal name      | Display            | Access method                                                                   |
| ---------------- | ------------------ | ------------------ | ------------------------------------------------------------------------------- |
| SSH Tunnel       | `ssh`              | SSH Tunnel         | `ssh -L` to port-forward gateway; Hetzner firewall TCP 22 only                  |
| Tailscale Serve  | `tailscale_serve`  | Tailscale (Serve)  | `tailscale serve` → HTTPS at `https://<slug>.<tailnet>.ts.net/`; identity-aware |
| Tailscale Direct | `tailscale_direct` | Tailscale (Direct) | Gateway binds to Tailscale IP; HTTP on dynamic port; token auth required        |

Gateway port is randomized per assistant (20000–29999), stored in both `assistant_credentials.gatewayPort` and `assistants.gatewayPort` (for response without join).

## Completed

- [x] Remove UFW from `scripts/bootstrap.sh` — all firewall control via Hetzner cloud API
- [x] Add Tailscale install to `scripts/bootstrap.sh` (pre-installed, `tailscaled` disabled by default)
- [x] `FirewallRule` interface and firewall methods (`createFirewall`, `attachFirewall`, `deleteFirewall`) on `HetznerProvider`
- [x] `firewalls` option on `CreateServerOptions` — firewall attached at server creation (zero exposure window)
- [x] DB schema: `access_mode` enum + `access_mode`, `ssh_allowed_ips`, `firewall_id`, `gateway_port` columns on `assistants`
- [x] DB schema: `tailscale_auth_key` column on `assistant_credentials`
- [x] Migration: `0001_network-access-mode.sql`
- [x] `buildCloudInit` updated — `accessMode`, `gatewayPort`, `tailscaleAuthKey`, `assistantSlug` params; mode-specific Tailscale root block + user block; `gateway.bind loopback|tailnet` per mode
- [x] `provisionAssistant` — `createFirewall` step before `createServer`; random `gatewayPort`; best-effort `deleteFirewall` on error
- [x] `POST /api/assistants` — `accessMode`, `sshAllowedIps`, `tailscaleAuthKey` fields; 422 if Tailscale mode missing key; passes 7 args to workflow
- [x] `DELETE /api/assistants/:id` — best-effort `deleteFirewall` teardown
- [x] `AssistantResponse` exposes `accessMode` and `gatewayPort`
- [x] Dashboard: access mode selector; Tailscale auth key input (shown for Tailscale modes); SSH allowed IPs input (shown for SSH mode); gatewayPort displayed in assistant card
- [x] Tests: hetzner firewall provider (11 cases), cloud-init mode tests (25 cases), assistant route (access mode validation, workflow args, DELETE firewall cleanup)

## Firewall Rules by Mode

| Mode               | Protocol | Port  | Source                                      |
| ------------------ | -------- | ----- | ------------------------------------------- |
| `ssh`              | TCP      | 22    | `sshAllowedIps` (default `0.0.0.0/0, ::/0`) |
| `tailscale_serve`  | UDP      | 41641 | `0.0.0.0/0, ::/0`                           |
| `tailscale_direct` | UDP      | 41641 | `0.0.0.0/0, ::/0`                           |

## Deferred / post-MVP

- [ ] **Mode switching** — set at creation only; re-provisioning required to change mode
- [ ] **Tailscale device cleanup** — on assistant delete, the Tailscale device record in the tailnet is not removed automatically (requires Tailscale API + stored device ID)
- [ ] **Firewall orphan reconciliation** — DELETE swallows Hetzner firewall errors; add periodic cleanup (same pattern as DNS orphan job)
