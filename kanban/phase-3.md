# Phase 3 — Channel Setup

Reference: [Phase 3 Docs](../docs/phase-3-channels.md)

## Channel Definitions

- [ ] Define channel types and required fields

## SSH & Config

- [ ] Create SSH config push utility
- [ ] Implement Telegram channel config template
- [ ] Implement WhatsApp channel config template
- [ ] Implement Discord channel config template
- [ ] Implement Slack channel config template

## UI

- [ ] Create guided setup UI components per channel

## API Endpoints

- [ ] Implement POST /api/agents/:id/channels/setup endpoint
- [ ] Implement GET /api/agents/:id/channels/health endpoint

## Monitoring

- [ ] Set up Vercel cron for assistant health monitoring (`/api/cron/health`) — poll each running assistant's gateway, mark `error` after 3 consecutive failures
- [ ] Set up Vercel cron for channel health monitoring (`/api/cron/channels`)

## Testing

- [ ] Write unit tests (config templates)
- [ ] Write integration tests (SSH push with mock)
