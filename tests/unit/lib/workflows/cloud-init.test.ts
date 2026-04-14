import { describe, it, expect } from "vitest";
import { buildCloudInit } from "@/lib/workflows/cloud-init";

describe("buildCloudInit", () => {
  const publicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITestKey openclaw@snapclaw";
  const gatewayToken = "abc123def456";

  it("returns a valid bash script", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toMatch(/^#!\/bin\/bash/);
    expect(script).toContain("set -euo pipefail");
  });

  it("includes the SSH public key in authorized_keys", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain(publicKey);
    expect(script).toContain("/home/openclaw/.ssh/authorized_keys");
  });

  it("sets correct SSH permissions", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("chmod 700 /home/openclaw/.ssh");
    expect(script).toContain("chmod 600 /home/openclaw/.ssh/authorized_keys");
  });

  it("writes gateway token to openclaw.json", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain(`"token": "${gatewayToken}"`);
    expect(script).toContain("/home/openclaw/.openclaw/openclaw.json");
  });

  it("sets gateway mode to local", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"mode": "local"');
  });

  it("saves gateway token to .gateway-token file", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("/home/openclaw/.openclaw/.gateway-token");
  });

  it("sets correct permissions on openclaw config", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("chmod 600 /home/openclaw/.openclaw/openclaw.json");
    expect(script).toContain("chmod 600 /home/openclaw/.openclaw/.gateway-token");
  });

  it("enables lingering for openclaw user", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("loginctl enable-linger openclaw");
  });

  it("installs gateway via openclaw gateway install as openclaw user", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('su - openclaw -c "openclaw gateway install"');
  });

  it("hardens SSH for openclaw user", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("Match User openclaw");
    expect(script).toContain("PasswordAuthentication no");
  });

  it("restarts sshd", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("systemctl restart sshd");
  });

  it("configures gateway on port 18789", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"port": 18789');
  });

  it("sets session dmScope to per-channel-peer", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain('"dmScope": "per-channel-peer"');
  });

  it("does not create a custom system service", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).not.toContain("/etc/systemd/system/openclaw.service");
  });
});
