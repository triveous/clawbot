/**
 * Builds a cloud-init user-data script for a new OpenClaw server.
 *
 * The snapshot already has everything installed under the openclaw user
 * (Node.js, Docker rootless, OpenClaw binary at ~/.local/bin). Cloud-init
 * only injects the per-server secrets (SSH public key + gateway token) and
 * starts the gateway.
 *
 * Principle: root does the absolute minimum — essentially just the `su -`
 * hand-off. All file writes and service starts happen as the openclaw user.
 * No root SSH key is injected; emergency access goes through Hetzner's
 * out-of-band noVNC console.
 *
 * We drive `openclaw gateway install` with `--port` and `--token` flags
 * rather than hand-writing `openclaw.json`. The CLI owns its own schema;
 * writing a JSON file whose shape we guessed at broke `openclaw doctor`.
 *
 * Note: sshd hardening lives in the snapshot (sshd_config.d/99-openclaw.conf);
 * no ssh config edits during provisioning.
 */
export function buildCloudInit(
  publicKey: string,
  gatewayToken: string,
): string {
  return `#!/bin/bash
set -euo pipefail

# All work delegated to openclaw user — no root touches OpenClaw state.
su - openclaw -s /bin/bash <<'OPENCLAW_SHELL'
set -euo pipefail

# --- 1. Inject per-server SSH key ---
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat > ~/.ssh/authorized_keys <<'SSHKEY'
${publicKey}
SSHKEY
chmod 600 ~/.ssh/authorized_keys

# --- 2. Save gateway token for operator retrieval ---
mkdir -p ~/.openclaw
chmod 700 ~/.openclaw
echo "${gatewayToken}" > ~/.openclaw/.gateway-token
chmod 600 ~/.openclaw/.gateway-token

# --- 3. Persist gateway config via the CLI (correct schema, version-stable) ---
# 'gateway install' only installs the systemd unit — it does NOT persist the
# token to the config file. We use 'config set' so the token survives restarts
# and matches the schema OpenClaw's own setup wizard produces.
openclaw config set gateway.mode local
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token "${gatewayToken}"
openclaw config set gateway.port 18789 --strict-json
chmod 600 ~/.openclaw/openclaw.json

# --- 4. Install the gateway service ---
openclaw gateway install
OPENCLAW_SHELL
`;
}
