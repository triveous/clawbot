/**
 * Builds a cloud-init user-data script for a new OpenClaw server.
 *
 * The snapshot already has everything installed under the openclaw user
 * (Node.js, Docker rootless, OpenClaw binary at ~/.local/bin, Tailscale).
 * Cloud-init only injects the per-server gateway config and starts the gateway.
 *
 * Two access modes:
 *
 *   ssh            — Gateway binds to loopback. Access via SSH tunnel to root;
 *                    root switches to openclaw user via `su - openclaw`.
 *                    No openclaw SSH key — root SSH key injected by Hetzner.
 *                    Hetzner cloud firewall allows TCP 22 only.
 *
 *   tailscale_serve — Gateway binds to loopback; Tailscale Serve exposes it
 *                     within the tailnet at https://<slug>.<tailnet>.ts.net/.
 *                     No SSH needed — Tailscale auth handles identity.
 *                     Hetzner cloud firewall allows UDP 41641 (WireGuard) only.
 *
 * Principle: root does the minimum — Tailscale setup (when needed), then `su -`
 * hand-off to the openclaw user. Root SSH key is managed by Hetzner; openclaw
 * user has no SSH key and no sudo access.
 *
 * Config is driven via `openclaw config set` — the CLI owns its schema.
 * Note: sshd hardening lives in the snapshot (sshd_config.d/99-openclaw.conf).
 */

export type AccessMode = "ssh" | "tailscale_serve";

export function buildCloudInit(
  rootPublicKey: string,
  gatewayToken: string,
  gatewayPort: number,
  accessMode: AccessMode,
  tailscaleAuthKey?: string,
  assistantSlug?: string,
): string {
  const tailscaleRootBlock =
    accessMode === "tailscale_serve"
      ? buildTailscaleRootBlock(tailscaleAuthKey!, assistantSlug!, gatewayPort)
      : "";

  const tailscaleUserBlock =
    accessMode === "tailscale_serve"
      ? `
# --- Tailscale Serve: expose gateway within tailnet via HTTPS ---
# Derive the MagicDNS FQDN from tailscaled (we don't know the tailnet name at
# provisioning time). Without controlUi.allowedOrigins, the dashboard browser
# code is CORS-blocked when calling /v1/* endpoints.
TS_FQDN=$(tailscale status --self --json | jq -r '.Self.DNSName' | sed 's/\\.$//')
openclaw config set gateway.tailscale.mode serve
openclaw config set gateway.auth.allowTailscale true --strict-json
openclaw config set gateway.controlUi.allowedOrigins "[\\"https://\${TS_FQDN}\\"]" --strict-json
`
      : "";

  return `#!/bin/bash
set -euo pipefail
${tailscaleRootBlock}
# All OpenClaw work delegated to openclaw user — no root touches OpenClaw state.
su - openclaw -s /bin/bash <<'OPENCLAW_SHELL'
set -euo pipefail

# --- 1. Inject root public key so operator can SSH directly as openclaw ---
# Same key as root — one key, two users. openclaw has no escalation path
# (no sudoers entry) so sharing the key carries no privilege-escalation risk.
# This avoids the root → su hop for routine operations.
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat > ~/.ssh/authorized_keys <<'SSHKEY'
${rootPublicKey}
SSHKEY
chmod 600 ~/.ssh/authorized_keys

# --- 2. Save gateway token for operator retrieval ---
mkdir -p ~/.openclaw
chmod 700 ~/.openclaw
echo "${gatewayToken}" > ~/.openclaw/.gateway-token
chmod 600 ~/.openclaw/.gateway-token

# --- 3. Persist gateway config via the CLI (correct schema, version-stable) ---
# Always seed with valid empty JSON — the snapshot may leave a zero-byte or
# stale openclaw.json. openclaw config set edits the file in place; starting
# from {} avoids a JSON5 parse error that would abort the script via pipefail.
echo '{}' > ~/.openclaw/openclaw.json
chmod 600 ~/.openclaw/openclaw.json

openclaw config set gateway.mode local
openclaw config set gateway.bind loopback
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token "${gatewayToken}"
openclaw config set gateway.port ${gatewayPort} --strict-json
${tailscaleUserBlock}

# --- 4. Install the gateway service ---
openclaw gateway install
OPENCLAW_SHELL
`;
}

function buildTailscaleRootBlock(authKey: string, slug: string, servePort?: number): string {
  // tailscale serve requires root or operator rights. Run it here as root so it
  // works even before the snapshot has been rebuilt with tailscale set --operator=openclaw.
  const serveCmd = servePort !== undefined
    ? `\n# Wire HTTPS Serve proxy — must run as root until operator is set in snapshot.\ntailscale serve --bg http://127.0.0.1:${servePort}\n`
    : "";

  return `
# --- Tailscale: enable daemon, auth device, configure hostname ---
# Auth key is one-time-use; device cert persists in /var/lib/tailscale/ across reboots.
# Write key to tmpfs, use it, then remove immediately.
echo "${authKey}" > /tmp/ts-authkey
chmod 600 /tmp/ts-authkey
systemctl enable tailscaled
systemctl start tailscaled
tailscale up --authkey "$(cat /tmp/ts-authkey)" --ssh --accept-routes --hostname "${slug}"
rm -f /tmp/ts-authkey${serveCmd}`;
}
