# Phase 3 — Provisioning Hardening + Dynamic DNS

Reference: [Phase 3 Docs](../docs/phase-3-provisioning-hardening.md)

## Cloud-init Hardening

- [ ] Port clawhost `scripts/cloud-init.yaml` content into `src/lib/workflows/cloud-init.ts`
- [ ] Add Nginx reverse proxy config (port 18789 → 80/443)
- [ ] Add UFW firewall rules (22, 80, 443, default deny inbound)
- [ ] Add Let's Encrypt certbot automation with auto-renewal
- [ ] Harden OpenClaw systemd unit (restart policy, log rotation)
- [ ] Rebuild snapshot via admin flow using updated cloud-init

## Cloudflare DNS Provider

- [ ] Create `src/lib/providers/cloudflare.ts` with `createDnsRecord` and `deleteDnsRecord`
- [ ] Read env vars at call time (fail fast on missing); throw clear errors
- [ ] Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_BASE_DOMAIN` to `.env.example`

## Schema

- [ ] Add `hostname` and `dnsRecordId` columns to `assistants` table
- [ ] Generate + run migration

## Workflow Integration

- [ ] Add `createDnsRecord` durable step between `waitForReady` and `finalize` in `provisioning.ts`
- [ ] Persist `hostname` and `dnsRecordId` in `finalize`
- [ ] Update `src/server/routes/assistants.ts` DELETE handler to call `deleteDnsRecord` before destroying server
- [ ] Surface `hostname` in GET /api/assistants and /api/assistants/:id responses

## Testing

- [ ] Unit tests for `cloudflare.ts` (mocked Cloudflare API)
- [ ] Integration: build new snapshot, SSH in, verify Nginx + LE + UFW
- [ ] Integration: provision a test assistant end-to-end, `dig` resolves to VPS IPv4, `https://{slug}.{base}` serves LE cert
- [ ] Integration: delete assistant, verify Cloudflare record removed
