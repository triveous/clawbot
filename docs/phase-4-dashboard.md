# Phase 4: Dashboard (Tabbed Agent Detail)

## Goal

Production-quality per-agent detail page modeled on the [clawhost](https://github.com/bfzli/clawhost) dashboard — tabbed IA covering Overview, Preview, Terminal, Logs, Versions, Files, Monitor, Storage, Server, Security. This is the most visible surface of the product; treat tab quality as the top priority.

## Target IA (agent detail page)

### Header

- Assistant name (large)
- Hostname link below name, small, with external-link icon — links to `https://{hostname}`
- Status pill top-right: green "Running" / red "Error" / amber "Provisioning" / gray "Stopped"

### Tab bar

Icon + label per tab, active tab shown with subtle box/border. Section headers within a tab carry a "Live" pill when the data streams (Overview, Logs, Monitor).

| Tab          | Content                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** | Gateway Status card (Service, Port, Ready) + Instance Status card (Version, Model, Agents, Sessions, Memory, Heartbeat, Uptime). Live-updating. |
| **Preview**  | Embedded preview of the OpenClaw web UI (`<iframe src="https://{hostname}">`)                                                                   |
| **Terminal** | xterm.js shell to the VPS                                                                                                                       |
| **Logs**     | Tail of OpenClaw gateway logs (source: `openclaw logs` CLI — see [docs.openclaw.ai/cli/logs](https://docs.openclaw.ai/cli/logs))                |
| **Versions** | Installed OpenClaw version + upgrade action                                                                                                     |
| **Files**    | Read-only file tree + viewer of `~/openclaw/` config + data directory                                                                           |
| **Monitor**  | CPU / memory / disk graphs                                                                                                                      |
| **Storage**  | Volume listing, disk usage, attach/detach (Hetzner volumes API)                                                                                 |
| **Server**   | Hetzner server metadata — region, plan, created date, reboot/stop/rebuild actions                                                               |
| **Security** | SSH credentials view (public key display, rotate keypair), gateway token (reveal/regenerate), IP allowlist                                      |

### Dark theme

Dashboard uses a dark default matching clawhost aesthetics. shadcn theming already supports this — set dashboard layout to force dark mode.

## Implementation Note — No Fixed Bridge Architecture

The transport mechanism by which the Next.js API reaches each VPS (for status, logs, files, terminal) is **intentionally left open**. Decide during Phase 4 execution. Options:

- Call OpenClaw's own HTTP surface on the gateway port
- Short-lived SSH commands from the Next.js server
- A lightweight side daemon on the VPS
- Mix approaches per tab

No commitment to a persistent bridge service yet. We don't want a second always-on process per VPS to maintain.

## Backend Endpoints (Shape)

Extend `src/server/routes/assistants.ts` with per-tab sub-routes:

```
GET  /api/assistants/:id/status              # Overview — gateway + instance status
GET  /api/assistants/:id/logs                # Logs tab (openclaw logs CLI output)
GET  /api/assistants/:id/files?path=         # Files tab — read-only listing
GET  /api/assistants/:id/metrics             # Monitor tab — CPU/mem/disk snapshot
GET  /api/assistants/:id/versions            # Versions tab — installed + latest
POST /api/assistants/:id/versions/upgrade    # Versions tab — upgrade action
POST /api/assistants/:id/credentials/rotate  # Security tab — rotate SSH keypair
```

Terminal session endpoint — shape TBD (depends on transport decision above).

## RPC Usage (Client)

```ts
const client = useRpc();
const status = useSWR(
  `/api/assistants/${id}/status`,
  () => client.assistants[":id"].status.$get({ param: { id } }),
  { refreshInterval: 3000 },
);
```

## Files Owned

```
src/app/dashboard/assistant/[assistantId]/page.tsx        # rewrite — tabbed shell
src/components/dashboard/agent/
  Overview.tsx
  Preview.tsx
  Terminal.tsx
  Logs.tsx
  Versions.tsx
  Files.tsx
  Monitor.tsx
  Storage.tsx
  Server.tsx
  Security.tsx
  TabBar.tsx             # shared tab navigation
  StatusPill.tsx         # shared header pill
  LiveBadge.tsx          # small "Live" pill
src/hooks/use-agent-status.ts                              # SWR wrapper
src/server/routes/assistants.ts                            # add per-tab endpoints
```

Snapshot-side additions: scope decided during Phase 4 execution (may be zero new services if we call OpenClaw's own HTTP surface).

## Out of Scope for Phase 4 (defer)

- File **editing** — Files tab is read-only for MVP; clawhost has editing, we don't need it yet
- Volume **creation/attach** UX — Storage tab shows existing volumes; create/attach is stretch
- IP allowlist **editing** — Security tab shows current state only

## Environment Variables

TBD during execution — depends on terminal/log transport decision.

## Definition of Done

- `/dashboard/assistant/:id` renders with all 10 tabs, no console errors
- Overview live-updates Gateway + Instance cards within 5s of VPS state change; "Live" pill visible
- Terminal tab: xterm.js opens shell to `openclaw@{hostname}`, `openclaw status` echoes numbers matching Overview
- Logs tab streams new lines as OpenClaw emits them
- Files tab renders `/home/openclaw/` tree, click-to-view, read-only
- Monitor tab shows non-zero CPU + memory + disk values
- Versions tab: current version matches snapshot metadata; upgrade action triggers the flow
- Security tab: SSH public key visible; rotate produces a new keypair and old key stops working
- Server tab: reboot/stop/rebuild actions work and reflect within 5s
- Dark theme applied consistently
- Mobile layout usable
