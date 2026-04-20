import { describe, it, expect } from "vitest";
import { buildCloudInit } from "@/lib/workflows/cloud-init";

const ROOT_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey root@snapclaw";
const GATEWAY_TOKEN = "abc123def456";
const GATEWAY_PORT = 24601;
const SLUG = "my-assistant-abc12345";

describe("buildCloudInit", () => {
  describe("ssh mode (default)", () => {
    const script = buildCloudInit(
      ROOT_PUBLIC_KEY,
      GATEWAY_TOKEN,
      GATEWAY_PORT,
      "ssh",
    );

    it("returns a valid bash script", () => {
      expect(script).toMatch(/^#!\/bin\/bash/);
      expect(script).toContain("set -euo pipefail");
    });

    it("delegates work to the openclaw user via su", () => {
      expect(script).toContain("su - openclaw -s /bin/bash <<'OPENCLAW_SHELL'");
      expect(script).toContain("OPENCLAW_SHELL");
    });

    it("injects root public key into openclaw authorized_keys for direct SSH access", () => {
      expect(script).toContain(ROOT_PUBLIC_KEY);
      expect(script).toContain("~/.ssh/authorized_keys");
      expect(script).toContain("chmod 700 ~/.ssh");
      expect(script).toContain("chmod 600 ~/.ssh/authorized_keys");
    });

    it("does not inject a root SSH key at /root/.ssh (Hetzner handles that)", () => {
      expect(script).not.toContain("/root/.ssh");
    });

    it("saves gateway token to .gateway-token for operator retrieval", () => {
      expect(script).toContain("chmod 700 ~/.openclaw");
      expect(script).toContain("~/.openclaw/.gateway-token");
      expect(script).toContain(GATEWAY_TOKEN);
      expect(script).toContain("chmod 600 ~/.openclaw/.gateway-token");
    });

    it("seeds openclaw.json unconditionally so config set never hits an empty/stale file", () => {
      // Snapshot may leave a zero-byte openclaw.json; conditional check skips the
      // seed and openclaw config set then fails with a JSON5 parse error. Always
      // overwrite with {} regardless of whether the file already exists.
      expect(script).toContain("echo '{}' > ~/.openclaw/openclaw.json");
      expect(script).not.toContain("[ -f ~/.openclaw/openclaw.json ]");
    });

    it("persists gateway config via `openclaw config set` (not by hand-writing keys)", () => {
      expect(script).toContain("openclaw config set gateway.mode local");
      expect(script).toContain("openclaw config set gateway.bind loopback");
      expect(script).toContain("openclaw config set gateway.auth.mode token");
      expect(script).toContain(
        `openclaw config set gateway.auth.token "${GATEWAY_TOKEN}"`,
      );
      expect(script).toContain(
        `openclaw config set gateway.port ${GATEWAY_PORT} --strict-json`,
      );
      expect(script).toContain("chmod 600 ~/.openclaw/openclaw.json");
      expect(script).toContain("openclaw gateway install");
    });

    it("does not hand-write gateway / session / skills config keys", () => {
      expect(script).not.toContain("dmScope");
      expect(script).not.toContain("allowBundled");
      expect(script).not.toMatch(/"mode":\s*"local"/);
    });

    it("does not create a custom system service", () => {
      expect(script).not.toContain("/etc/systemd/system/openclaw.service");
    });

    it("does not edit sshd_config at provision time (hardening lives in snapshot)", () => {
      expect(script).not.toContain("sshd_config");
      expect(script).not.toContain("systemctl restart sshd");
    });

    it("does not install packages or run apt/sudo at provision time", () => {
      expect(script).not.toContain("apt-get");
      expect(script).not.toContain("sudo ");
    });

    it("does not include Tailscale commands in ssh mode", () => {
      expect(script).not.toContain("tailscale up");
      expect(script).not.toContain("systemctl enable tailscaled");
      expect(script).not.toContain("tailscale.mode");
      expect(script).not.toContain("controlUi.allowedOrigins");
      expect(script).not.toContain("allowTailscale");
    });
  });

  describe("tailscale_serve mode", () => {
    const TS_AUTH_KEY = "tskey-auth-abc123";
    const script = buildCloudInit(
      ROOT_PUBLIC_KEY,
      GATEWAY_TOKEN,
      GATEWAY_PORT,
      "tailscale_serve",
      TS_AUTH_KEY,
      SLUG,
    );

    it("enables and starts tailscaled in root block", () => {
      expect(script).toContain("systemctl enable tailscaled");
      expect(script).toContain("systemctl start tailscaled");
    });

    it("runs tailscale up with auth key and hostname", () => {
      expect(script).toContain(`--hostname "${SLUG}"`);
      expect(script).toContain(TS_AUTH_KEY);
      expect(script).toContain("--ssh");
    });

    it("removes the auth key file after use", () => {
      expect(script).toContain("rm -f /tmp/ts-authkey");
    });

    it("invokes tailscale serve --bg as root to proxy HTTPS to the gateway port", () => {
      // Must run as root (not openclaw user) until snapshot has operator rights set.
      // Appears in the root block before the su - openclaw handoff.
      expect(script).toContain(
        `tailscale serve --bg http://127.0.0.1:${GATEWAY_PORT}`,
      );
      // Verify it appears BEFORE the su - openclaw handoff (root context)
      const serveIdx = script.indexOf(`tailscale serve --bg http://127.0.0.1:${GATEWAY_PORT}`);
      const suIdx = script.indexOf("su - openclaw -s /bin/bash");
      expect(serveIdx).toBeLessThan(suIdx);
    });

    it("sets gateway.bind loopback (Tailscale Serve handles HTTPS, not direct bind)", () => {
      expect(script).toContain("openclaw config set gateway.bind loopback");
    });

    it("configures tailscale.mode serve", () => {
      expect(script).toContain("openclaw config set gateway.tailscale.mode serve");
    });

    it("enables allowTailscale for automatic login via Tailscale identity", () => {
      expect(script).toContain(
        "openclaw config set gateway.auth.allowTailscale true --strict-json",
      );
    });

    it("derives controlUi.allowedOrigins from tailscale's MagicDNS FQDN (avoids CORS block)", () => {
      // tailscale status gives us <slug>.<tailnet>.ts.net at provision time —
      // we don't know the tailnet name otherwise.
      expect(script).toContain(
        "tailscale status --self --json | jq -r '.Self.DNSName'",
      );
      expect(script).toContain(
        "openclaw config set gateway.controlUi.allowedOrigins",
      );
      expect(script).toContain("--strict-json");
    });

    it("uses the dynamic gateway port", () => {
      expect(script).toContain(
        `openclaw config set gateway.port ${GATEWAY_PORT} --strict-json`,
      );
    });

    it("injects root public key into openclaw authorized_keys", () => {
      expect(script).toContain(ROOT_PUBLIC_KEY);
      expect(script).toContain("~/.ssh/authorized_keys");
    });

    it("does not inject a root SSH key at /root/.ssh", () => {
      expect(script).not.toContain("/root/.ssh");
    });
  });
});
