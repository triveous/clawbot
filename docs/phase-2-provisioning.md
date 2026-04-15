# Phase 2: Provisioning

Status: **Complete**

## Goal

Provision OpenClaw instances from Hetzner snapshots, configure the gateway automatically on first boot, and manage assistant lifecycle.

---

## Architecture Overview

```
POST /api/assistants
       │
       ▼
assistants row (status: creating)
       │
       ▼
useworkflow.dev durable workflow
  ├── prepareCredentials  →  assistant_credentials row (SSH key pair, gateway token)
  ├── createServer        →  Hetzner API (register key, boot from snapshot, cloud-init)
  ├── waitForReady        →  SSH health poll
  └── finalize            →  status: running, store server IP
```

---

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
    sshKeyId: string;
    userData: string;
  }): Promise<ProviderServer>;
  destroy(serverId: string): Promise<void>;
  restart(serverId: string): Promise<void>;
  stop(serverId: string): Promise<void>;
  getStatus(serverId: string): Promise<ProviderServer>;
  registerSshKey(name: string, publicKey: string): Promise<string>;
  deleteSshKey(keyId: string): Promise<void>;
}
```

### `src/lib/providers/hetzner.ts`

Implements `ProviderInterface` using the Hetzner Cloud API (`HETZNER_API_TOKEN`). SSH keys are registered transiently — created before server boot, deleted immediately after so they are baked into `authorized_keys` via cloud-init and the Hetzner key resource is gone.

---

## Snapshot Bootstrap

`scripts/bootstrap.sh` runs once on a clean Ubuntu 24.04 instance to produce a base snapshot:

1. System update + essential deps (curl, git, openssl, etc.)
2. Docker CE installed and enabled
3. `openclaw` system user created (added to `docker` group, restricted sudoers)
4. **OpenClaw installed via official installer** (`https://openclaw.ai/install.sh`) — no `npm install -g`
5. `/var/tmp/openclaw-compile-cache` created for `NODE_COMPILE_CACHE`
6. UFW firewall: allow 22 (SSH) + 18789 (gateway), deny all else
7. fail2ban with SSH protection
8. unattended-upgrades (security only, no auto-reboot)
9. Cleanup: remove root SSH keys, `cloud-init clean`, `apt-get clean`

The workflow in `src/lib/workflows/bootstrap.ts` SSHes in as root, runs the script with `OPENCLAW_VERSION` injected, waits for completion, then takes a Hetzner snapshot. `validateVersion()` rejects any version string containing characters outside `[a-zA-Z0-9._-]` to prevent shell injection.

---

## Cloud-Init (Per-Server First Boot)

`src/lib/workflows/cloud-init.ts` builds the `user-data` script injected when Hetzner creates the server. Runs as root on first boot:

1. **SSH setup** — write assistant's ed25519 public key to `/home/openclaw/.ssh/authorized_keys`
2. **Gateway config** — write `/home/openclaw/.openclaw/openclaw.json`:
   ```json
   {
     "gateway": {
       "mode": "local",
       "auth": { "token": "<per-server token>" },
       "port": 18789
     },
     "session": {
       "dmScope": "per-channel-peer"
     }
   }
   ```
3. **Token file** — write `/home/openclaw/.openclaw/.gateway-token` (readable by the openclaw user)
4. **Startup optimisations** — write `~/.config/environment.d/openclaw.conf`:
   ```
   NODE_COMPILE_CACHE=/var/tmp/openclaw-compile-cache
   OPENCLAW_NO_RESPAWN=1
   ```
   Picked up automatically by the systemd user manager.
5. **Linger** — `loginctl enable-linger openclaw` so the user's systemd instance persists on headless servers
6. **Gateway service** — `su - openclaw -c "openclaw gateway install"` installs openclaw's native systemd user service at `~/.config/systemd/user/openclaw-gateway.service` and starts it
7. **SSH hardening** — append `Match User openclaw / PasswordAuthentication no` to `sshd_config`, restart sshd

---

## Provisioning Workflow

`src/lib/workflows/provisioning.ts` — durable useworkflow.dev workflow.

### Steps

| Step                 | What happens                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `prepareCredentials` | Generate ed25519 SSH key pair (OpenSSH format via JWK export). Generate 32-byte hex gateway token. Upsert `assistant_credentials` row. |
| `createServer`       | Register public key with Hetzner. Create server from active snapshot with cloud-init user-data. Delete transient Hetzner key resource. |
| `waitForReady`       | Poll SSH connectivity every 15 s, up to 20 attempts (~5 min). Marks assistant `provisioning` when server IP is known.                  |
| `finalize`           | Store server IP in `assistant.providerServerId`. Update status to `running`.                                                           |
| `markError`          | Called on any step failure. Updates assistant status to `error`.                                                                       |

All steps log with `[provisioning:<step>]` prefix, mirroring bootstrap's `[bootstrap:<step>]` pattern.

---

## Assistant Lifecycle

Synchronous API calls — no workflow needed:

| Action  | Provider Call                | DB Update                         |
| ------- | ---------------------------- | --------------------------------- |
| Restart | `provider.restart(serverId)` | `status = "running"`              |
| Stop    | `provider.stop(serverId)`    | `status = "stopped"`              |
| Delete  | `provider.destroy(serverId)` | Row deleted (credentials cascade) |

---

## Database Schema

### `assistants`

| Column             | Type      | Notes                                                 |
| ------------------ | --------- | ----------------------------------------------------- |
| `id`               | uuid      | PK                                                    |
| `userId`           | text      | FK → users                                            |
| `name`             | text      |                                                       |
| `provider`         | enum      | `"hetzner"`                                           |
| `providerServerId` | text      | Hetzner server ID / IP                                |
| `status`           | enum      | `creating → provisioning → running → stopped → error` |
| `createdAt`        | timestamp |                                                       |
| `updatedAt`        | timestamp |                                                       |

### `assistant_credentials`

| Column               | Type    | Notes                                      |
| -------------------- | ------- | ------------------------------------------ |
| `id`                 | uuid    | PK                                         |
| `assistantId`        | uuid    | FK → assistants (unique, cascade delete)   |
| `rootCredentialType` | text    | `"ssh-key"`                                |
| `rootCredential`     | text    | SSH private key (ed25519, OpenSSH PEM)     |
| `sshPrivateKey`      | text    | ed25519 private key                        |
| `sshPublicKey`       | text    | ed25519 public key                         |
| `gatewayToken`       | text    | 32-byte hex token written to openclaw.json |
| `gatewayPort`        | integer | Default 18789                              |

---

## API Endpoints

```
POST   /api/assistants              Create assistant (triggers provisioning workflow)
  Body: { name: string }
  Auth: Clerk session required
  Guard: canProvision() must return true
  Returns: { assistant } (status: "creating")

GET    /api/assistants              List user's assistants
GET    /api/assistants/:id          Get assistant + status
POST   /api/assistants/:id/restart  Restart assistant
POST   /api/assistants/:id/stop     Stop assistant
DELETE /api/assistants/:id          Destroy assistant
```

---

## Files

```
src/lib/providers/types.ts
src/lib/providers/hetzner.ts
src/lib/providers/index.ts
src/lib/workflows/provisioning.ts
src/lib/workflows/bootstrap.ts
src/lib/workflows/cloud-init.ts
src/lib/db/schema/assistants.ts
src/lib/db/schema/assistant-credentials.ts
src/server/routes/assistants.ts
src/server/routes/admin.ts
scripts/bootstrap.sh
tests/unit/lib/workflows/cloud-init.test.ts
tests/unit/server/assistants.test.ts
```

---

## Definition of Done

- [x] Creating an assistant triggers the full provisioning workflow
- [x] Assistant transitions: `creating → provisioning → running`
- [x] Restart, stop, delete work and update DB status
- [x] Gateway starts automatically on first boot via native systemd user service
- [x] All endpoints return proper error codes (401, 403, 404, 500)
- [x] 80 unit tests passing

## Not in scope

- Stripe subscription on provision — Phase 4
