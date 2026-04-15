/**
 * Builds a cloud-init user-data script for a new OpenClaw server.
 *
 * The snapshot already has everything installed (Node.js, Docker, OpenClaw
 * binary under the openclaw user's ~/.local). Cloud-init only does the
 * per-server work that cannot be baked into the snapshot:
 *
 * 1. Inject the per-server SSH public key for the openclaw user
 * 2. Write openclaw.json with the unique gateway token
 * 3. Save the gateway token to a known path for easy retrieval
 * 4. Set startup optimisations via environment.d
 * 5. Enable lingering so the systemd user service survives logout
 * 6. Start the gateway (openclaw gateway install)
 * 7. Lock down SSH — key-only for openclaw, no root login
 */
export function buildCloudInit(
  publicKey: string,
  gatewayToken: string,
): string {
  return `#!/bin/bash
set -euo pipefail

# --- 1. Inject per-server SSH key for openclaw user ---
mkdir -p /home/openclaw/.ssh
cat > /home/openclaw/.ssh/authorized_keys <<'SSHKEY'
${publicKey}
SSHKEY
chown -R openclaw:openclaw /home/openclaw/.ssh
chmod 700 /home/openclaw/.ssh
chmod 600 /home/openclaw/.ssh/authorized_keys

# --- 2. Write per-server gateway configuration ---
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
  },
  "skills": {
    "allowBundled": []
  }
}
CONF

# --- 3. Save gateway token for easy retrieval ---
echo "${gatewayToken}" > /home/openclaw/.openclaw/.gateway-token

chown -R openclaw:openclaw /home/openclaw/.openclaw
chmod 600 /home/openclaw/.openclaw/openclaw.json
chmod 600 /home/openclaw/.openclaw/.gateway-token

# --- 4. Startup optimisations ---
# NODE_COMPILE_CACHE speeds up repeated CLI invocations on small VMs.
# OPENCLAW_NO_RESPAWN avoids self-respawn overhead.
# environment.d is picked up by the systemd user manager automatically.
mkdir -p /home/openclaw/.config/environment.d
cat > /home/openclaw/.config/environment.d/openclaw.conf <<'ENVD'
NODE_COMPILE_CACHE=/var/tmp/openclaw-compile-cache
OPENCLAW_NO_RESPAWN=1
ENVD
chown -R openclaw:openclaw /home/openclaw/.config

# --- 5. Enable lingering ---
# Allows systemd user services to run without an active login session.
loginctl enable-linger openclaw

# --- 6. Start the gateway ---
# The binary is already installed at ~/.local/bin/openclaw (baked into snapshot).
# su - loads the full login environment so ~/.local/bin is in PATH.
su - openclaw -c "openclaw gateway install"

# --- 7. Harden SSH ---
# Disable root login and password auth for the openclaw user entirely.
cat >> /etc/ssh/sshd_config <<'SSHCONF'

PermitRootLogin no

Match User openclaw
    PasswordAuthentication no
SSHCONF

systemctl restart sshd
`;
}
