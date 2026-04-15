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

# --- 2. Write per-server gateway config ---
mkdir -p ~/.openclaw
cat > ~/.openclaw/openclaw.json <<'CONF'
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "${gatewayToken}"
    },
    "port": 18789
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "skills": {
    "allowBundled": []
  }
}
CONF
chmod 600 ~/.openclaw/openclaw.json

# --- 3. Save gateway token for easy retrieval ---
echo "${gatewayToken}" > ~/.openclaw/.gateway-token
chmod 600 ~/.openclaw/.gateway-token

# --- 4. Start the gateway ---
# openclaw is at ~/.local/bin/openclaw (baked into snapshot). su - loads the
# login environment so ~/.local/bin is in PATH automatically.
openclaw gateway install
OPENCLAW_SHELL
`;
}
