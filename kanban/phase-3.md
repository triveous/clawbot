# Phase 3 — Dynamic DNS (Cloudflare only)

Reference: [Phase 3 Docs](../docs/phase-3-provisioning-hardening.md)

Nginx + TLS + UFW 80/443 + cloud-init hardening are **deferred to Phase 7**; only DNS automation lands in this phase.

## Cloudflare DNS Provider

- [x] Create `src/lib/providers/cloudflare.ts` with `createDnsRecord` and `deleteDnsRecord`
- [x] Read env vars at call time (fail fast on missing); throw clear errors
- [x] `deleteDnsRecord` accepts a stored `zoneId` so records still tear down after env flips
- [x] Create gray-cloud (`proxied: false`) A records — required for future HTTP-01 TLS
- [x] Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_BASE_DOMAIN` to `.env.example`

## Slug / FQDN helper

- [x] Create `src/lib/workflows/slug.ts` with `generateHostnameSlug`, `buildFqdn`, `extractSubdomain`
- [x] Unit tests covering unicode, punctuation, empty, and length clamping edge cases

## Schema

- [x] Add `hostname`, `dns_record_id`, `dns_zone_id`, `dns_base_domain` columns to `assistants` (all nullable)
- [x] Generate + commit migration file

## Workflow Integration

- [x] Extend `provisionAssistant` to accept `hostname` (4th arg)
- [x] Add `createDnsRecord` durable step between `waitForReady` and `finalize` in `provisioning.ts`
- [x] Make `createDnsRecord` idempotent (skip if `dnsRecordId` already set, for safe workflow replay)
- [x] Derive subdomain from the **stored** `dnsBaseDomain`, not the current env, so mid-workflow env flips don't break the step
- [x] Persist `dns_record_id` and `dns_zone_id` in the DNS step

## Route Surface

- [x] Surface `hostname` in `AssistantResponse` (exposed on list / get / POST / regenerate responses)
- [x] `POST /api/assistants` computes slug + FQDN, persists `hostname` + `dnsBaseDomain` before starting the workflow, returns both in the response
- [x] `DELETE /api/assistants/:id` tears down the Cloudflare record via `{recordId, zoneId}` before destroying the server; swallows CF errors
- [x] New `POST /api/assistants/:id/regenerate-hostname`: recreates a missing or stale DNS record from current env + stored IPv4. Tears down any existing record first (best-effort). Returns 409 when no IPv4 yet. Dashboard-invokable.

## Testing

- [x] Unit tests for `cloudflare.ts` (mocked `fetch`, env-missing throws, 404 swallow on delete)
- [x] Unit tests for slug helper
- [x] Updated `assistants.test.ts`: POST stores `hostname` and calls workflow with 4 args; DELETE calls `deleteDnsRecord` only when set; regenerate endpoint (success, teardown-before-recreate, 409 no-ip, 404, 503 no-base-domain)

## Deferred

→ See [phase-7.md](./phase-7.md)
