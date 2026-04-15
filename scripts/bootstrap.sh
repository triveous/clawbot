#!/bin/bash
# =============================================================================
# OpenClaw Base Snapshot Bootstrap Script
# =============================================================================
# Run this ONCE on a fresh Ubuntu 24.04 LTS server (as root) to build the
# base snapshot. The snapshot ships with all software pre-installed under the
# openclaw system user — no SSH keys, no tokens, no per-server config.
#
# Split of responsibilities:
#   bootstrap.sh  — everything that belongs in the snapshot image
#   cloud-init    — per-server injection: SSH key, openclaw.json, gateway start
#
# Usage:
#   1. SSH into a fresh Ubuntu 24.04 LTS Hetzner server as root
#   2. bash bootstrap.sh
#   3. Shut down the server
#   4. Take a Hetzner snapshot, record the snapshot ID
#   5. Update the active snapshot row in the DB
# =============================================================================

set -euo pipefail

echo "=== OpenClaw Bootstrap: Starting ==="

# --- 1. System update + essential dependencies ---
echo ">>> Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git ca-certificates gnupg lsb-release \
  software-properties-common openssl \
  uidmap dbus-user-session  # required for Docker rootless

# --- 2. Install Node.js (system-wide, as root) ---
# Pre-installing Node.js means the OpenClaw installer (run later as the
# openclaw user) can skip its own Node setup and won't need sudo/TTY.
echo ">>> Installing Node.js 22 LTS via NodeSource..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
echo "Node.js $(node --version), npm $(npm --version)"

# --- 3. Install Docker CE (system daemon) ---
echo ">>> Installing Docker CE..."
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

systemctl enable docker
systemctl start docker
echo "Docker $(docker --version)"

# --- 4. Create openclaw system user (no SSH auth — injected by cloud-init) ---
echo ">>> Creating openclaw user..."
useradd -m -s /bin/bash openclaw
# Lock the password so password-based logins are impossible.
# SSH key auth is injected per-server by cloud-init.
passwd -l openclaw

# subuid/subgid ranges required for Docker rootless
echo "openclaw:100000:65536" >> /etc/subuid
echo "openclaw:100000:65536" >> /etc/subgid

# Add to the system docker group as well — gateway can use either path
usermod -aG docker openclaw

# --- 5. Configure restricted sudoers ---
echo ">>> Configuring restricted sudoers for openclaw..."
cat > /etc/sudoers.d/openclaw <<'SUDOERS'
# openclaw user — restricted to service management only
openclaw ALL=(root) NOPASSWD: /usr/bin/systemctl start openclaw
openclaw ALL=(root) NOPASSWD: /usr/bin/systemctl stop openclaw
openclaw ALL=(root) NOPASSWD: /usr/bin/systemctl restart openclaw
openclaw ALL=(root) NOPASSWD: /usr/bin/systemctl reload openclaw
openclaw ALL=(root) NOPASSWD: /usr/bin/systemctl status openclaw
openclaw ALL=(root) NOPASSWD: /usr/bin/journalctl -u openclaw*
openclaw ALL=(root) NOPASSWD: /usr/sbin/ufw status
SUDOERS
chmod 0440 /etc/sudoers.d/openclaw

# --- 6. Install Docker rootless for the openclaw user ---
# Rootless Docker daemon runs entirely as openclaw — no root socket access needed.
echo ">>> Installing Docker rootless for openclaw user..."
loginctl enable-linger openclaw
su - openclaw -c "dockerd-rootless-setuptool.sh install --skip-iptables"

# Expose the rootless socket path via environment.d so systemd user units pick it up
mkdir -p /home/openclaw/.config/environment.d
cat > /home/openclaw/.config/environment.d/docker-rootless.conf <<'ENVD'
DOCKER_HOST=unix:///run/user/1000/docker.sock
ENVD
chown openclaw:openclaw /home/openclaw/.config/environment.d/docker-rootless.conf

# --- 7. Configure npm prefix for openclaw user ---
# Point the openclaw user's global npm install location at their own home so
# any `npm install -g` (including OpenClaw self-updates) never touches the
# root-owned /usr/lib/node_modules. Ubuntu's default ~/.profile auto-adds
# ~/.local/bin to PATH when the directory exists at login.
echo ">>> Configuring npm prefix for openclaw user..."
su - openclaw -c "mkdir -p ~/.local/bin ~/.local/lib && npm config set prefix ~/.local"

# --- 8. Install OpenClaw as the openclaw user ---
# Node.js is already in PATH (installed system-wide above), so the OpenClaw
# installer skips its own Node setup. npm prefix is ~/.local (set above), so
# the package lands in ~/.local/lib/node_modules/openclaw and the binary at
# ~/.local/bin/openclaw — both user-owned. Self-updates work without sudo.
#
# OPENCLAW_VERSION is injected by the bootstrap workflow (e.g. "2026.4.1").
# Falls back to "latest" if not set.
echo ">>> Installing OpenClaw as openclaw user (version: ${OPENCLAW_VERSION:-latest})..."
su - openclaw -c "curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- \
  --version '${OPENCLAW_VERSION:-latest}' \
  --no-onboard \
  --no-prompt"

# Verify the binary landed in the user's local bin
OPENCLAW_BIN="/home/openclaw/.local/bin/openclaw"
if [ ! -f "$OPENCLAW_BIN" ]; then
  OPENCLAW_BIN="$(su - openclaw -c 'which openclaw 2>/dev/null || true')"
fi
if [ -z "$OPENCLAW_BIN" ]; then
  echo "ERROR: openclaw binary not found after install"
  exit 1
fi
echo "OpenClaw installed at: $OPENCLAW_BIN ($(su - openclaw -c 'openclaw --version'))"

# Symlink into /usr/local/bin so root-context commands can resolve the binary
ln -sf "$OPENCLAW_BIN" /usr/local/bin/openclaw
echo "Symlinked $OPENCLAW_BIN -> /usr/local/bin/openclaw"

# --- 9. Prepare shared compile cache directory ---
echo ">>> Preparing Node compile cache directory..."
mkdir -p /var/tmp/openclaw-compile-cache
chown openclaw:openclaw /var/tmp/openclaw-compile-cache

# --- 10. Install and configure UFW ---
echo ">>> Configuring UFW firewall..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 18789/tcp # OpenClaw gateway
ufw --force enable
echo "UFW status:"
ufw status verbose

# --- 11. Install and configure fail2ban ---
echo ">>> Installing fail2ban..."
apt-get install -y fail2ban

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

# --- 12. Configure unattended-upgrades (security patches only) ---
echo ">>> Configuring unattended-upgrades..."
apt-get install -y unattended-upgrades

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

# --- 13. Clean up for snapshot ---
echo ">>> Cleaning up for snapshot..."
# Remove root SSH keys so they never end up in servers booted from this snapshot
rm -f /root/.ssh/authorized_keys /root/.ssh/known_hosts
# Remove any openclaw SSH keys — cloud-init injects the per-server key
rm -f /home/openclaw/.ssh/authorized_keys
cloud-init clean --logs
history -c
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "=== OpenClaw Bootstrap: Complete ==="
echo "Shut down this server, then create a Hetzner snapshot."
