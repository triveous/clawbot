# Phase 2 — Provisioning Engine

Reference: [Phase 2 Docs](../docs/phase-2-provisioning.md)

## Provider Layer

- [ ] Create provider interface (src/lib/providers/types.ts)
- [ ] Implement Hetzner provider client
- [ ] Configure firewall rules

## Snapshot Management

- [ ] Implement snapshot management (list, version tracking, mark active)

## Provisioning Workflow

- [ ] Set up useworkflow.dev integration for async provisioning
- [ ] Implement provisioning workflow (create from snapshot -> configure -> enable backups -> verify)
- [ ] Implement agent lifecycle endpoints (restart, stop, destroy)

## Monitoring

- [ ] Set up Vercel cron for health monitoring

## API Endpoints

- [ ] Implement POST /api/agents endpoint (async)
- [ ] Implement GET /api/agents/:id endpoint
- [ ] Implement POST /api/agents/:id/restart endpoint
- [ ] Implement POST /api/agents/:id/stop endpoint
- [ ] Implement DELETE /api/agents/:id endpoint

## Testing

- [ ] Write unit tests (provider interface, snapshot logic)
- [ ] Write integration tests (provisioning flow with mocked Hetzner)
