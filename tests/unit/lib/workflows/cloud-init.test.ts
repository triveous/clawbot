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

  it("does not inject an SSH key for root (emergencies go through Hetzner console)", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).not.toContain("/root/.ssh");
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

  it("saves gateway token to .gateway-token for operator retrieval", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    expect(script).toContain("~/.openclaw/.gateway-token");
    expect(script).toContain(gatewayToken);
    expect(script).toContain("chmod 600 ~/.openclaw/.gateway-token");
  });

  it("persists gateway config via `openclaw config set` (not by hand-writing JSON)", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    // The CLI owns its own schema — driving config via `config set` avoids
    // schema drift that previously broke `openclaw doctor`. `gateway install`
    // alone does NOT persist the token, so we must `config set` it first.
    expect(script).toContain("openclaw config set gateway.mode local");
    expect(script).toContain("openclaw config set gateway.auth.mode token");
    expect(script).toContain(
      `openclaw config set gateway.auth.token "${gatewayToken}"`,
    );
    expect(script).toContain(
      "openclaw config set gateway.port 18789 --strict-json",
    );
    expect(script).toContain("openclaw gateway install");
    expect(script).not.toContain("openclaw.json");
  });

  it("does not hand-write gateway / session / skills config keys", () => {
    const script = buildCloudInit(publicKey, gatewayToken);
    // These keys were guessed at and broke doctor; let the CLI manage them.
    expect(script).not.toContain("dmScope");
    expect(script).not.toContain("allowBundled");
    expect(script).not.toMatch(/"mode":\s*"local"/);
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
