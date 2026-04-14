/**
 * Builds a cloud-init user-data script for a new OpenClaw server.
 *
 * This script runs on first boot and:
 * 1. Sets up SSH key auth for the openclaw user
 * 2. Writes the gateway config with the unique token
 * 3. Enables lingering so systemd user services persist without a login session
 * 4. Installs and starts the gateway via `openclaw gateway install` (systemd user service)
 * 5. Hardens SSH (key-only for openclaw user)
 */
export function buildCloudInit(
  publicKey: string,
  gatewayToken: string,
): string {
  return `#!/bin/bash
set -euo pipefail

# --- 1. SSH setup for openclaw user ---
mkdir -p /home/openclaw/.ssh
cat > /home/openclaw/.ssh/authorized_keys <<'SSHKEY'
${publicKey}
SSHKEY
chown -R openclaw:openclaw /home/openclaw/.ssh
chmod 700 /home/openclaw/.ssh
chmod 600 /home/openclaw/.ssh/authorized_keys

# --- 2. Write gateway configuration ---
mkdir -p /home/openclaw/.openclaw
cat > /home/openclaw/.openclaw/openclaw.json <<'CONF'
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
  }
}
CONF

# --- 3. Save gateway token for easy retrieval ---
echo "${gatewayToken}" > /home/openclaw/.openclaw/.gateway-token

chown -R openclaw:openclaw /home/openclaw/.openclaw
chmod 600 /home/openclaw/.openclaw/openclaw.json
chmod 600 /home/openclaw/.openclaw/.gateway-token

# --- 4. Enable lingering for openclaw user ---
# This allows systemd user services to run without an active login session.
loginctl enable-linger openclaw

# --- 5. Install and start the gateway (openclaw's native systemd user service) ---
su - openclaw -c "openclaw gateway install"

# --- 6. Harden SSH for openclaw user (key-only) ---
cat >> /etc/ssh/sshd_config <<'SSHCONF'

Match User openclaw
    PasswordAuthentication no
SSHCONF

# --- 7. Restart sshd to apply Match block ---
systemctl restart sshd
`;
}
