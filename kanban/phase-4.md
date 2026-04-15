# Phase 4 — Dashboard (Tabbed Agent Detail)

Reference: [Phase 4 Docs](../docs/phase-4-dashboard.md)

## Shell & Navigation

- [ ] Rewrite `src/app/dashboard/assistant/[assistantId]/page.tsx` with tabbed layout
- [ ] Build shared `TabBar.tsx`, `StatusPill.tsx`, `LiveBadge.tsx`
- [ ] Apply dark theme default to dashboard layout
- [ ] Polish `src/app/dashboard/page.tsx` — assistant list with clickable hostname, status pill

## Backend Endpoints

- [ ] Decide transport mechanism (OpenClaw HTTP / SSH / daemon) — record in ADR
- [ ] GET /api/assistants/:id/status
- [ ] GET /api/assistants/:id/logs
- [ ] GET /api/assistants/:id/files?path=
- [ ] GET /api/assistants/:id/metrics
- [ ] GET /api/assistants/:id/versions + POST /:id/versions/upgrade
- [ ] POST /api/assistants/:id/credentials/rotate
- [ ] Terminal session endpoint (shape per transport decision)

## Tab Components

- [ ] Overview — Gateway Status + Instance Status cards, live-updating via SWR (3s)
- [ ] Preview — iframe of `https://{hostname}`
- [ ] Terminal — xterm.js integration
- [ ] Logs — tail OpenClaw gateway logs (via `openclaw logs` CLI)
- [ ] Versions — show current version + upgrade action
- [ ] Files — read-only file tree + viewer (no editing)
- [ ] Monitor — CPU/memory/disk graphs
- [ ] Storage — volume listing with disk usage
- [ ] Server — Hetzner metadata + reboot/stop/rebuild actions
- [ ] Security — SSH public key, gateway token, rotate action

## Hooks

- [ ] `src/hooks/use-agent-status.ts` — SWR wrapper for status polling

## Testing

- [ ] Component tests for each tab (Overview, Security, Logs at minimum)
- [ ] E2E: open agent detail, navigate tabs, verify status live-updates, verify terminal opens
- [ ] E2E: rotate credentials, verify old key stops working
