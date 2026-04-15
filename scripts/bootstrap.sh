#!/bin/bash
# =============================================================================
# OpenClaw Base Snapshot Bootstrap Script
# =============================================================================
# Run this on a fresh Ubuntu 24.04 LTS server to prepare a base snapshot.
# The snapshot contains all software pre-installed but no user-specific config.
#
# Usage: SSH as root, then: bash bootstrap.sh
# =============================================================================

set -euo pipefail

echo "=== OpenClaw Bootstrap: Starting ==="

# --- 1. System update + essential dependencies ---
echo ">>> Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a   # auto-restart services, suppress interactive prompts
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git ca-certificates gnupg lsb-release \
  software-properties-common openssl

# --- 2. Install Docker CE ---
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

echo "Docker version: $(docker --version)"

# --- 3. Create openclaw system user ---
echo ">>> Creating openclaw user..."
useradd -m -s /bin/bash openclaw
# Temporary placeholder password — cloud-init disables password auth for this user
echo "openclaw:$(openssl rand -base64 32)" | chpasswd
usermod -aG docker openclaw

# --- 4. Configure restricted sudoers ---
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

# --- 5. Install OpenClaw via official installer ---
# OPENCLAW_VERSION is injected by the bootstrap workflow (e.g. "2026.4.1").
# Falls back to "latest" if not set, but the workflow always sets it.
echo ">>> Installing OpenClaw (version: ${OPENCLAW_VERSION:-latest})..."
curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- \
  --version "${OPENCLAW_VERSION:-latest}" \
  --no-onboard \
  --no-prompt

# Verify the binary is reachable and log the installed version
OPENCLAW_BIN="$(which openclaw 2>/dev/null || true)"
if [ -z "$OPENCLAW_BIN" ]; then
  echo "ERROR: openclaw binary not found after install"
  exit 1
fi
echo "OpenClaw installed at: $OPENCLAW_BIN ($(openclaw --version))"

# Ensure the binary is at /usr/bin/openclaw for the systemd service
if [ "$OPENCLAW_BIN" != "/usr/bin/openclaw" ]; then
  ln -sf "$OPENCLAW_BIN" /usr/bin/openclaw
  echo "Symlinked $OPENCLAW_BIN -> /usr/bin/openclaw"
fi

# --- 6. Prepare startup optimization dirs ---
echo ">>> Preparing Node compile cache directory..."
mkdir -p /var/tmp/openclaw-compile-cache
# Ownership set to openclaw so the gateway service can write to it
chown openclaw:openclaw /var/tmp/openclaw-compile-cache

# --- 7. Install and configure UFW ---
echo ">>> Configuring UFW firewall..."

apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 18789/tcp # OpenClaw gateway
ufw --force enable

echo "UFW status:"
ufw status verbose

# --- 8. Install and configure fail2ban ---
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

# --- 9. Configure unattended-upgrades ---
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

# --- 10. Clean up for snapshot ---
echo ">>> Cleaning up for snapshot..."
# Remove root SSH keys so they never end up in servers booted from this snapshot
rm -f /root/.ssh/authorized_keys /root/.ssh/known_hosts
cloud-init clean --logs
history -c
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "=== OpenClaw Bootstrap: Complete ==="
echo "Server is ready for snapshot. Shut down, then create snapshot."
