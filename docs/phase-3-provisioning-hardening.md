# Phase 3: Provisioning Hardening + Dynamic DNS

## Goal

Every newly provisioned assistant comes up already hardened (Nginx + TLS + UFW + OpenClaw systemd unit) and reachable on a real hostname under whatever base domain the operator configures. Cherry-pick cloud-init hardening content from [clawhost](https://github.com/bfzli/clawhost) and add Cloudflare DNS automation to the existing provisioning workflow.

Channel setup (old Phase 3) is **deferred** — users SSH into their VPS and configure channels against OpenClaw directly for MVP.

## Cloud-init Hardening

Port content from clawhost's `scripts/cloud-init.yaml` into our snapshot build (NOT into cloud-init-at-boot — keep snapshot-based provisioning for fast cold boots).

Bake into the snapshot:

- Nginx reverse proxy — fronts OpenClaw gateway port 18789 on ports 80/443
- UFW firewall — allow 22, 80, 443, terminal transport port; default deny inbound
- Let's Encrypt certbot — auto-renewal cron, webroot challenge via Nginx
- Node 22 LTS baseline
- OpenClaw systemd unit (already exists; harden restart policy + logs)
- `openclaw` user with locked password; SSH access via key only

## Cloudflare DNS Automation (Fully Dynamic)

No hardcoded domain anywhere in code. Driven by env vars only, so the operator can change the base domain by flipping env vars with no code change.

### Env vars

```
CLOUDFLARE_API_TOKEN     # scoped to Zone.DNS:Edit
CLOUDFLARE_ZONE_ID       # which zone to write into
CLOUDFLARE_BASE_DOMAIN   # e.g. clawhost.cloud or agents.example.io
```

### `src/lib/providers/cloudflare.ts`

```ts
export async function createDnsRecord(opts: {
  name: string; // subdomain slug
  ipv4: string;
}): Promise<{ recordId: string; fqdn: string }>;

export async function deleteDnsRecord(recordId: string): Promise<void>;
```

Module reads `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_BASE_DOMAIN` at call time. Throws if any are missing. Builds the FQDN as `${name}.${CLOUDFLARE_BASE_DOMAIN}`.

### Workflow integration

Extend `src/lib/workflows/provisioning.ts` with a new durable step `createDnsRecord` between `waitForReady` and `finalize`:

```
prepareCredentials → createServer → waitForReady → createDnsRecord → finalize
                                                                    ↘
                                                                      markError
```

Symmetric teardown on assistant delete: `src/server/routes/assistants.ts` DELETE handler calls `deleteDnsRecord` before destroying the server.

### Schema change

Add to `src/lib/db/schema/assistants.ts`:

```ts
hostname: text("hostname"),              // fqdn, e.g. personal-claw.clawhost.cloud
dnsRecordId: text("dns_record_id"),      // Cloudflare record ID for teardown
```

Store the final FQDN so we never reconstruct it from env vars (survives base-domain changes without breaking existing assistants).

## API / UI Impact

- `POST /api/assistants` still returns immediately — DNS step runs inside the durable workflow
- `GET /api/assistants` and `/api/assistants/:id` include `hostname` in response
- Dashboard agent list + detail show hostname as a clickable link (built properly in Phase 4)

## Files Owned

```
src/lib/providers/cloudflare.ts          # new
src/lib/workflows/provisioning.ts        # extend with createDnsRecord step
src/lib/workflows/cloud-init.ts          # merge clawhost hardening content
src/lib/workflows/bootstrap.ts           # use hardened cloud-init for new snapshots
src/lib/db/schema/assistants.ts          # add hostname, dnsRecordId
src/server/routes/assistants.ts          # DELETE tears down DNS
```

## Environment Variables

```
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ZONE_ID
CLOUDFLARE_BASE_DOMAIN
```

## Definition of Done

- Snapshot built via admin flow boots with Nginx + LE + UFW active
- Provisioning a test assistant creates a Cloudflare A record for `{slug}.${CLOUDFLARE_BASE_DOMAIN}` within 60s of workflow completion
- `dig {slug}.{base}` resolves to the VPS IPv4
- `https://{slug}.{base}` serves a valid Let's Encrypt cert and proxies to OpenClaw
- Changing `CLOUDFLARE_BASE_DOMAIN` env and provisioning a new assistant uses the new base domain; existing assistants keep their recorded hostname
- Deleting an assistant removes the Cloudflare record
