# Phase 7 — Post-MVP Hardening & Advanced Features

Everything here was explicitly deferred during Phases 1–6. Pick up after the full product ships.

---

## Infrastructure / DNS / Networking

- [ ] **Orphan DNS reconciliation job** _(from Phase 3)_ — `DELETE` swallows Cloudflare teardown errors. Add a periodic job that lists records in the configured zone, matches to assistant rows, and deletes unmatched records.
- [ ] **Firewall orphan reconciliation** _(from Phase 3.5)_ — `DELETE` swallows Hetzner firewall errors. Same pattern as DNS orphan job.
- [ ] **Nginx reverse proxy + Let's Encrypt + UFW 80/443 + cloud-init hardening** _(from Phase 3)_ — Phase 3 assistants have a hostname resolving to VPS IPv4 but nothing on 80/443.
- [ ] **Tailscale device cleanup on delete** _(from Phase 3.5)_ — Deleting an assistant does not remove the device from the tailnet. Requires Tailscale API call + storing device ID at provision time.
- [ ] **`tailscale serve --bg` in openclaw user block** _(from Phase 3.5)_ — Currently runs as root because the existing snapshot lacks operator rights. Once a new snapshot is built with `tailscale set --operator=openclaw` baked in, move this command to the openclaw user block.

---

## Assistant Management

- [ ] **In-place plan upgrade** _(from Phase 4)_ — Currently requires delete + recreate. Add a workflow that snapshots current state, rebuilds on the new server type, and switches DNS atomically.
- [ ] **In-place access-mode change** _(from Phase 4)_ — SSH ↔ Tailscale switch without deleting the assistant.
- [ ] **In-place rebuild** _(from Phase 4)_ — Re-provision against the latest snapshot without losing the assistant record or DNS.
- [ ] **SSH key rotation** _(from Phase 3.5 / 4)_ — Generate a new Ed25519 keypair, push it to the VPS via the existing key, update `assistant_credentials`, revoke the old key.

---

## Dashboard Tabs (Control-plane egress decision required first)

Transport decision needed: OpenClaw HTTP surface / SSH exec / lightweight side daemon.

- [ ] **Terminal tab** — xterm.js shell to the VPS via SSH or WebSocket tunnel
- [ ] **Logs tab** — tail `openclaw logs` CLI output streaming to the browser
- [ ] **Files tab** — read-only file tree + viewer for `~/openclaw/` config and data directory; editing is stretch
- [ ] **Versions tab** — show installed OpenClaw version + upgrade action
- [ ] **Storage tab** — volume listing with disk usage; attach/detach (Hetzner volumes API)

---

## Billing / Org

- [ ] **Clerk organization webhooks** _(from Phase 4)_ — Add `POST /api/webhooks/clerk/organization` handler for `organization.updated` / `organization.deleted` to keep org name/slug fresh. Middleware lazy-upsert covers dev; production needs this.
- [ ] **Stripe per-seat or usage-based billing** _(post Phase 5)_ — Current model: one credit = one assistant slot. Future: seat-based or usage-based billing tiers.
- [ ] **Volume creation / attach UX** _(from Phase 4)_ — Storage tab shows existing volumes; create/attach is stretch.

---

## Onboarding / Marketing

- [ ] **Channel Setup Simplification** _(from CLAUDE.md)_ — Direct OpenClaw access for now; post-MVP simplify the channel credential push flow.
- [ ] **Mobile app / PWA** — Dashboard as a PWA with push notifications for assistant status changes.

---

## Dashboard content / notifications backend _(from Phase 4e)_

- [ ] **Notifications backend** — `/api/notifications` endpoint backed by `notifications` table; mark-read / dismiss mutations; per-user + per-org feed; webhook-driven sources (billing, provisioning, platform announcements). Today the top-bar bell and the `/notifications` page both render a clearly-labelled seed list; the UI is ready to swap for a real endpoint.
- [ ] **Notification preferences backend** — move `cb:notifprefs` and `cb:notif-prefs` (settings + delivery toggles) to a `user_notification_prefs` table. The Settings → Notifications tab and the notifications-page delivery panel both write to localStorage today.
- [ ] **In-dashboard docs rendering** — Markdown renderer for `docs/*.md` surfaced under `/dashboard/:org/docs/:slug`. The cards grid is live and already points at hash anchors; wiring just needs a markdown loader + syntax highlighting.
- [ ] **Notifications bell → shared store with notifications page** — right now both sources seed their own list; once `/api/notifications` exists, consolidate them behind a single `useNotifications` hook so mark-read in one surface reflects in the other.

---

## Ops / Reliability

- [ ] **Idempotency key on provisioning `start()`** — Pass `instanceId` as workflow run key to prevent duplicate runs on retry. Requires confirming useworkflow.dev `start()` supports a run key; otherwise add `instances.workflowRunId` guard.
- [ ] **Metrics retention / alerting** — Wire Hetzner metrics to a time-series store; set up alerts for high CPU / low disk.
- [ ] **Multi-cloud support** — Schema is provider-agnostic (`providerSpec` jsonb per cloud). Add DigitalOcean or Vultr as second provider.
