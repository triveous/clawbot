#!/bin/bash
# =============================================================================
# OpenClaw Base Snapshot Bootstrap Script
# =============================================================================
# Builds the base Hetzner snapshot that every provisioned assistant boots from.
#
# Principle: root does the absolute minimum (apt, user creation, UFW, fail2ban,
# systemd integration). Everything OpenClaw-related runs as the `openclaw`
# user via `su - openclaw -c /tmp/openclaw-install.sh`. Root is emergency-access
# only after this bootstrap completes.
#
# Run manually:
#   1. SSH into a fresh Ubuntu 24.04 LTS Hetzner server as root
#   2. OPENCLAW_VERSION=2026.4.1 bash bootstrap.sh
#   3. Review the smoke-test output; fail loudly means DON'T snapshot
#   4. Shut down the server
#   5. Take a Hetzner snapshot; record the ID; update the `snapshots` DB row
#
# Pinned versions (edit here, review in PR, reflected in snapshot manifest):
NODE_MAJOR="22"
OPENCLAW_VERSION="${OPENCLAW_VERSION:-latest}"

# =============================================================================
set -euo pipefail
echo "=== OpenClaw Bootstrap: Starting (openclaw=${OPENCLAW_VERSION}, node=${NODE_MAJOR}) ==="

# =============================================================================
# Phase A — Root-only system setup
# =============================================================================

echo ">>> [root] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git ca-certificates gnupg lsb-release \
  software-properties-common openssl jq \
  uidmap dbus-user-session \
  fail2ban ufw unattended-upgrades

# --- Node.js (system-wide binary; openclaw will own its own npm prefix) ---
echo ">>> [root] Installing Node.js ${NODE_MAJOR}..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y nodejs

# --- Docker CE (kernel modules + containerd); openclaw will use rootless daemon ---
echo ">>> [root] Installing Docker CE (for kernel integration + rootless tooling)..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# System Docker daemon is installed but DISABLED — openclaw runs rootless only.
systemctl disable --now docker.service docker.socket

# --- Create openclaw system user (UID 1000, locked password) ---
echo ">>> [root] Creating openclaw user (UID 1000)..."
useradd --uid 1000 --create-home --shell /bin/bash openclaw
passwd -l openclaw  # no password logins ever

# subuid/subgid ranges for Docker rootless
echo "openclaw:100000:65536" >> /etc/subuid
echo "openclaw:100000:65536" >> /etc/subgid

# Note: no docker group membership — rootless only, no implicit root via docker socket.

# --- Pin runtime packages so unattended-upgrades cannot shift them ---
echo ">>> [root] Pinning runtime package versions..."
apt-mark hold nodejs docker-ce docker-ce-cli containerd.io

# --- SSH config drop-in (idempotent; doesn't edit main sshd_config) ---
echo ">>> [root] Writing SSH hardening drop-in..."
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-openclaw.conf <<'SSHCONF'
# Managed by snapclaw bootstrap — do not edit.
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
Match User openclaw
    PasswordAuthentication no
    PubkeyAuthentication yes
SSHCONF
chmod 0644 /etc/ssh/sshd_config.d/99-openclaw.conf

# --- UFW: only SSH. Gateway binds to 127.0.0.1 so no port 18789 exposure needed ---
echo ">>> [root] Configuring UFW (SSH only; gateway is localhost-bound)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw --force enable

# --- fail2ban ---
echo ">>> [root] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local <<'JAIL'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
findtime = 600
bantime = 3600
JAIL
systemctl enable fail2ban
systemctl restart fail2ban

# --- unattended-upgrades: security patches only (runtime pkgs are held) ---
echo ">>> [root] Configuring unattended-upgrades (security only)..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'UPGRADES'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
UPGRADES
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AUTO'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
AUTO

# --- Enable lingering so openclaw's systemd user services survive logout ---
loginctl enable-linger openclaw

# --- Shared compile cache dir (owned by openclaw) ---
mkdir -p /var/tmp/openclaw-compile-cache
chown openclaw:openclaw /var/tmp/openclaw-compile-cache

# =============================================================================
# Phase B — Hand off to openclaw user
# =============================================================================

echo ">>> [root] Writing openclaw-install script and handing off to openclaw user..."
cat > /tmp/openclaw-install.sh <<'USERSCRIPT'
#!/bin/bash
# Runs entirely as the openclaw user. No sudo, no root.
set -euo pipefail

OPENCLAW_VERSION="${OPENCLAW_VERSION:-latest}"

echo ">>> [openclaw] Configuring npm prefix to ~/.local..."
mkdir -p ~/.local/bin ~/.local/lib
npm config set prefix ~/.local

echo ">>> [openclaw] Installing Docker rootless..."
# Docker CE ships the rootless setup tool; invoke it for our user.
dockerd-rootless-setuptool.sh install --skip-iptables

echo ">>> [openclaw] Installing OpenClaw (${OPENCLAW_VERSION})..."
curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- \
  --version "${OPENCLAW_VERSION}" \
  --no-onboard \
  --no-prompt

# Writing runtime env vars via systemd user environment.d — picked up by
# any user systemd service (gateway, docker rootless, etc.)
echo ">>> [openclaw] Writing environment.d configs..."
mkdir -p ~/.config/environment.d
cat > ~/.config/environment.d/openclaw.conf <<'ENVD'
NODE_COMPILE_CACHE=/var/tmp/openclaw-compile-cache
OPENCLAW_NO_RESPAWN=1
ENVD
cat > ~/.config/environment.d/docker-rootless.conf <<'ENVD'
DOCKER_HOST=unix:///run/user/1000/docker.sock
ENVD

# Verify the binary exists and reports a version — fail loudly otherwise.
echo ">>> [openclaw] Verifying install..."
if ! ~/.local/bin/openclaw --version >/dev/null 2>&1; then
  echo "ERROR: openclaw binary missing or non-functional — do NOT snapshot."
  exit 1
fi

# Snapshot manifest (for later auditing — who built what, when).
echo ">>> [openclaw] Writing snapshot manifest..."
cat > ~/snapshot-manifest.json <<MANIFEST
{
  "openclaw_version": "$(~/.local/bin/openclaw --version 2>/dev/null | head -1)",
  "node_version": "$(node --version)",
  "docker_version": "$(docker --version)",
  "build_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
MANIFEST

echo ">>> [openclaw] Phase B complete."
USERSCRIPT
chmod +x /tmp/openclaw-install.sh
chown openclaw:openclaw /tmp/openclaw-install.sh

OPENCLAW_VERSION="${OPENCLAW_VERSION}" su - openclaw -c "OPENCLAW_VERSION='${OPENCLAW_VERSION}' /tmp/openclaw-install.sh"

# Symlink the user-owned binary into /usr/local/bin so root-context commands
# (diagnostics, support tooling) can resolve `openclaw`. The daemon never
# runs as root — this is for human operators only.
ln -sf /home/openclaw/.local/bin/openclaw /usr/local/bin/openclaw

# =============================================================================
# Phase C — Final root cleanup
# =============================================================================

echo ">>> [root] Cleaning up for snapshot..."
rm -f /tmp/openclaw-install.sh
# Remove any root/openclaw SSH keys — cloud-init injects the per-server key.
rm -f /root/.ssh/authorized_keys /root/.ssh/known_hosts
rm -f /home/openclaw/.ssh/authorized_keys
cloud-init clean --logs
history -c
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "=== OpenClaw Bootstrap: Complete ==="
echo "Review /home/openclaw/snapshot-manifest.json, shut down, then snapshot."
cat /home/openclaw/snapshot-manifest.json
