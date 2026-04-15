import { describe, it, expect } from "vitest";
import { buildCloudInit } from "@/lib/workflows/cloud-init";

describe("buildCloudInit", () => {
  const publicKey =
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey openclaw@snapclaw";
  const gatewayToken = "abc123def456";

  it("returns a valid bash script", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toMatch(/^#!\/bin\/bash/);
    expect(script).toContain("set -euo pipefail");
  });

  it("delegates work to the openclaw user via su", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    // Entire useful payload runs inside a `su - openclaw` heredoc — root
    // context only exists to perform the hand-off.
    expect(script).toContain("su - openclaw -s /bin/bash <<'OPENCLAW_SHELL'");
    expect(script).toContain("OPENCLAW_SHELL");
  });

  it("includes the SSH public key in authorized_keys", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain(publicKey);
    expect(script).toContain("~/.ssh/authorized_keys");
  });

  it("sets correct SSH permissions", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("chmod 700 ~/.ssh");
    expect(script).toContain("chmod 600 ~/.ssh/authorized_keys");
  });

  it("writes gateway token to openclaw.json", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain(`"token": "${gatewayToken}"`);
    expect(script).toContain("~/.openclaw/openclaw.json");
  });

  it("sets gateway mode to local", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"mode": "local"');
  });

  it("saves gateway token to .gateway-token file", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("~/.openclaw/.gateway-token");
  });

  it("sets correct permissions on openclaw config", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("chmod 600 ~/.openclaw/openclaw.json");
    expect(script).toContain("chmod 600 ~/.openclaw/.gateway-token");
  });

  it("starts the gateway via openclaw gateway install", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("openclaw gateway install");
  });

  it("configures gateway on port 18789", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"port": 18789');
  });

  it("sets session dmScope to per-channel-peer", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"dmScope": "per-channel-peer"');
  });

  it("suppresses default bundled skills", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"allowBundled": []');
  });

  it("does not create a custom system service", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).not.toContain("/etc/systemd/system/openclaw.service");
  });

  it("does not edit sshd_config at provision time (hardening lives in snapshot)", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).not.toContain("sshd_config");
    expect(script).not.toContain("systemctl restart sshd");
  });

  it("does not install packages or run apt/sudo at provision time", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).not.toContain("apt-get");
    expect(script).not.toContain("sudo ");
  });
});
