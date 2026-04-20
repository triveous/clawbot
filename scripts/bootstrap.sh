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
  fail2ban unattended-upgrades

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
# Note: no sudo for openclaw — OpenClaw is designed to never run as root or
# escalate to root. System packages needed by plugins should be pre-installed
# in the snapshot, not installed at runtime via sudo.

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

# --- Tailscale (pre-installed for all modes; cloud-init enables+starts it per-mode) ---
echo ">>> [root] Installing Tailscale..."
curl -fsSL https://tailscale.com/install.sh | sh
# Don't autostart — cloud-init enables it only for tailscale_serve / tailscale_direct modes.
# In ssh mode the daemon is never started, saving memory and avoiding a spurious device
# registration. On reboot after cloud-init, enabled units start automatically via stored
# device cert in /var/lib/tailscale/ (auth key is one-time-use; cert is not).
systemctl disable tailscaled

# Grant the openclaw user operator rights so it can run `tailscale serve` and other
# tailscale CLI commands without sudo. Start tailscaled briefly to apply the setting
# (the operator config is persisted in /var/lib/tailscale/tailscaled.state).
systemctl start tailscaled
tailscale set --operator=openclaw
systemctl stop tailscaled

# Note: UFW is intentionally NOT configured here. All inbound access control lives in the
# Hetzner cloud firewall (one resource per assistant), managed via API. UFW in the snapshot
# would risk permanent lockout: a Tailscale-mode assistant with port 22 blocked at the OS
# layer cannot be recovered via SSH, and there is no platform API that can reopen it.

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
# enable-linger kicks off user@1000.service async; wait for it to be active so
# the subsequent `su -` hand-off can reach systemctl --user.
loginctl enable-linger openclaw
systemctl start user@1000.service
until systemctl is-active --quiet user@1000.service; do sleep 0.2; done

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

# Make ~/.local/bin visible in PATH for:
#   (a) the rest of THIS script (installer checks PATH post-install)
#   (b) future interactive shells (bashrc sources it; profile already handles it
#       once the directory exists at login)
#   (c) systemd user services (via ~/.config/environment.d/path.conf below)
export PATH="$HOME/.local/bin:$PATH"
if ! grep -q 'HOME/.local/bin' ~/.bashrc 2>/dev/null; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
fi

echo ">>> [openclaw] Installing Docker rootless..."
# Point at the already-running user systemd instance (lingered in Phase A).
# `su -` doesn't wire these up automatically, and without them the setuptool
# falls back to non-systemd mode and prints:
#   "WARNING: systemd not found. You have to remove XDG_RUNTIME_DIR manually..."
# which means docker.service is NOT installed as a user unit and rootless
# Docker won't auto-start on boot.
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
dockerd-rootless-setuptool.sh install --skip-iptables

echo ">>> [openclaw] Installing OpenClaw (${OPENCLAW_VERSION}) via npm directly..."
# We skip openclaw.ai/install.sh — it just wraps `npm install -g openclaw` with
# Node.js detection, prefix setup, and onboarding flags, all of which we've
# already handled (Node is pre-installed system-wide, prefix is ~/.local, no
# onboarding wanted). Going direct is fewer moving parts and easier to debug.
#
# Clear npm cache first: a prior 0-byte EINTEGRITY response (transient
# registry hiccup) can poison the cache and make every retry fail the same
# way. Cleaning before install avoids that class of failure entirely.
npm cache clean --force
npm install -g "openclaw@${OPENCLAW_VERSION}"

# Seed a valid empty config before running doctor — openclaw loads the config
# at startup, so if the file is missing or zero-byte, doctor itself fails.
# Without this, doctor creates a zero-byte openclaw.json which gets baked into
# the snapshot and breaks cloud-init on every provisioned server.
mkdir -p ~/.openclaw
echo '{}' > ~/.openclaw/openclaw.json
chmod 600 ~/.openclaw/openclaw.json

# Self-heal: `openclaw doctor --fix --yes` repairs anything the install left
# in a bad state (corrupted node_modules, missing config, etc.) without
# bumping the pinned version. Run after install — doctor needs openclaw on
# disk to inspect it.
echo ">>> [openclaw] Running openclaw doctor --fix --yes..."
openclaw doctor --fix --yes

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
cat > ~/.config/environment.d/path.conf <<'ENVD'
PATH=/home/openclaw/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENVD

# Verify the binary exists and reports a version — fail loudly otherwise.
echo ">>> [openclaw] Verifying install..."
if ! ~/.local/bin/openclaw --version >/dev/null 2>&1; then
  echo "ERROR: openclaw binary missing or non-functional — do NOT snapshot."
  exit 1
fi

# Verify the dependency tree is intact. `--version` doesn't load axios so
# can't catch the EINTEGRITY corruption above; `doctor` exercises real
# imports and exits non-zero on broken package configs.
echo ">>> [openclaw] Running doctor as smoke test..."
if ! openclaw doctor < /dev/null; then
  echo "ERROR: openclaw doctor failed — do NOT snapshot."
  exit 1
fi

# Verify rootless docker.service was installed as a systemd user unit.
# If the setuptool fell back to non-systemd mode, Docker won't auto-start on
# boot and the snapshot is unusable for containerized skills.
if ! systemctl --user is-enabled docker.service >/dev/null 2>&1; then
  echo "ERROR: rootless docker.service not installed as user unit — do NOT snapshot."
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
