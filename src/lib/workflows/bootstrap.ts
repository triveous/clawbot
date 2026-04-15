import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "ssh2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { getHetznerProvider } from "@/lib/providers";
import { generateEd25519KeyPair } from "./ssh-keys";

function getBootstrapScript(): string {
  return readFileSync(
    join(process.cwd(), "scripts", "bootstrap.sh"),
    "utf-8",
  );
}

function log(step: string, msg: string) {
  console.log(`[bootstrap:${step}] ${new Date().toISOString()} — ${msg}`);
}

function sshExec(
  ip: string,
  privateKey: string,
  command: string,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let output = "";

    conn
      .on("ready", () => {
        log("ssh", `Connected to ${ip}, executing script…`);
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream
            .on("close", (code: number) => {
              conn.end();
              log("ssh", `Script exited with code ${code}`);
              resolve({ exitCode: code, output });
            })
            .on("data", (data: Buffer) => {
              const text = data.toString();
              process.stdout.write(`[bootstrap:script] ${text}`);
              output += text;
            });

          stream.stderr.on("data", (data: Buffer) => {
            const text = data.toString();
            process.stderr.write(`[bootstrap:script:stderr] ${text}`);
            output += text;
          });
        });
      })
      .on("error", (err) => {
        log("ssh", `Connection error: ${err.message}`);
        reject(err);
      })
      .connect({
        host: ip,
        port: 22,
        username: "root",
        privateKey,
        readyTimeout: 30_000,
      });
  });
}

async function createBootstrapServer() {
  "use step";

  log("createServer", "Generating SSH keypair for bootstrap…");
  const { opensshPrivate, opensshPublic } = generateEd25519KeyPair("openclaw-bootstrap");

  const hetzner = getHetznerProvider();

  log("createServer", "Registering SSH public key with Hetzner…");
  const { keyId: sshKeyId } = await hetzner.createSshKey(
    `openclaw-bootstrap-${Date.now()}`,
    opensshPublic,
  );
  log("createServer", `SSH key registered: keyId=${sshKeyId}`);

  log("createServer", "Creating bootstrap server (ubuntu-24.04, cx33, fsn1)…");
  const result = await hetzner.createServer({
    name: "openclaw-bootstrap-temp",
    image: "ubuntu-24.04",
    region: "fsn1",
    serverType: "cx33",
    sshKeys: [sshKeyId],
  });

  log(
    "createServer",
    `Server created: id=${result.server.id} ip=${result.server.ip} status=${result.server.status}`,
  );

  return {
    serverId: result.server.id,
    ip: result.server.ip,
    sshKeyId,
    opensshPrivate,
  };
}

async function waitForBootstrapServer(serverId: string) {
  "use step";

  const hetzner = getHetznerProvider();
  const maxAttempts = 60;

  log("waitForServer", `Polling server ${serverId} until running…`);
  for (let i = 0; i < maxAttempts; i++) {
    const server = await hetzner.getServer(serverId);
    log("waitForServer", `Attempt ${i + 1}/${maxAttempts}: status=${server.status}`);
    if (server.status === "running") {
      // Wait for sshd to be ready
      log("waitForServer", "Server running — waiting 20s for sshd…");
      await new Promise((r) => setTimeout(r, 20_000));
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error(
    `Bootstrap server ${serverId} did not become ready after ${maxAttempts} attempts`,
  );
}

function validateVersion(version: string): void {
  // Strict validation: semver or dist-tag (e.g. "2026.4.1", "latest", "next")
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(version)) {
    throw new Error(`Invalid version string: ${version}`);
  }
}

async function runBootstrapScript(
  ip: string,
  opensshPrivate: string,
  openclawVersion: string,
) {
  "use step";

  validateVersion(openclawVersion);

  log("runScript", `Connecting to ${ip} via SSH… (openclawVersion=${openclawVersion})`);
  const script = getBootstrapScript();
  log("runScript", `Script length: ${script.length} bytes, executing…`);

  // Inject OPENCLAW_VERSION so bootstrap.sh installs the exact requested version
  const command = `export OPENCLAW_VERSION='${openclawVersion}'\n${script}`;
  const { exitCode, output } = await sshExec(ip, opensshPrivate, command);

  if (exitCode !== 0) {
    const tail = output.slice(-1000);
    log("runScript", `FAILED (exit code ${exitCode}). Last output:\n${tail}`);
    throw new Error(`Bootstrap script failed with exit code ${exitCode}: ${tail}`);
  }

  log("runScript", "Bootstrap script completed successfully");
  return { output: output.slice(-200) };
}

async function shutdownServer(serverId: string) {
  "use step";

  log("shutdown", `Powering off server ${serverId}…`);
  const hetzner = getHetznerProvider();
  await hetzner.powerOff(serverId);

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    const server = await hetzner.getServer(serverId);
    log("shutdown", `Attempt ${i + 1}/${maxAttempts}: status=${server.status}`);
    if (server.status === "off") {
      log("shutdown", "Server is off");
      return;
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error(`Server ${serverId} did not shut down`);
}

async function takeSnapshot(serverId: string, version: string) {
  "use step";

  log("snapshot", `Creating snapshot for server ${serverId} (openclaw-base-${version})…`);
  const hetzner = getHetznerProvider();
  const { imageId } = await hetzner.createImage(
    serverId,
    `openclaw-base-${version}`,
  );
  log("snapshot", `Snapshot queued: imageId=${imageId}, polling for availability…`);

  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const image = await hetzner.getImage(imageId);
    log("snapshot", `Attempt ${i + 1}/${maxAttempts}: status=${image.status}`);
    if (image.status === "available") {
      log("snapshot", `Snapshot ${imageId} is available`);
      return { imageId };
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }

  throw new Error(`Snapshot ${imageId} did not become available`);
}

async function registerAndCleanup(
  serverId: string,
  sshKeyId: string,
  imageId: string,
  version: string,
  openclawVersion: string,
) {
  "use step";

  log(
    "register",
    `Registering snapshot imageId=${imageId} version=${version} openclawVersion=${openclawVersion}`,
  );

  await db
    .update(snapshots)
    .set({ isActive: false })
    .where(eq(snapshots.provider, "hetzner"));

  await db.insert(snapshots).values({
    providerSnapshotId: imageId,
    version,
    openclawVersion,
    isActive: true,
    provider: "hetzner",
  });
  log("register", "Snapshot registered as active in DB");

  log("register", `Deleting bootstrap server ${serverId}…`);
  const hetzner = getHetznerProvider();
  await hetzner.deleteServer(serverId);
  log("register", "Bootstrap server deleted");

  log("register", `Deleting Hetzner SSH key resource ${sshKeyId}…`);
  await hetzner.deleteSshKey(sshKeyId);
  log("register", "SSH key resource deleted — workflow complete");
}

async function cleanupOnError(serverId: string, sshKeyId: string | null) {
  "use step";

  log("cleanup", `Error cleanup — deleting server ${serverId}…`);
  const hetzner = getHetznerProvider();

  try {
    await hetzner.deleteServer(serverId);
    log("cleanup", "Bootstrap server deleted");
  } catch (err) {
    log("cleanup", `Could not delete server (may not exist): ${String(err)}`);
  }

  if (sshKeyId) {
    try {
      await hetzner.deleteSshKey(sshKeyId);
      log("cleanup", "SSH key resource deleted");
    } catch (err) {
      log("cleanup", `Could not delete SSH key (may not exist): ${String(err)}`);
    }
  }
}

export async function buildSnapshot(
  version: string,
  openclawVersion: string,
) {
  "use workflow";

  log("workflow", `Starting buildSnapshot version=${version} openclawVersion=${openclawVersion}`);
  let serverId: string | null = null;
  let sshKeyId: string | null = null;

  try {
    const server = await createBootstrapServer();
    serverId = server.serverId;
    sshKeyId = server.sshKeyId;

    await waitForBootstrapServer(server.serverId);
    await runBootstrapScript(server.ip, server.opensshPrivate, openclawVersion);
    await shutdownServer(server.serverId);

    const { imageId } = await takeSnapshot(server.serverId, version);
    await registerAndCleanup(server.serverId, server.sshKeyId, imageId, version, openclawVersion);

    log("workflow", `buildSnapshot complete — imageId=${imageId}`);
    return { imageId, version, openclawVersion };
  } catch (error) {
    log("workflow", `buildSnapshot FAILED: ${String(error)}`);
    if (serverId) {
      await cleanupOnError(serverId, sshKeyId);
    }
    throw error;
  }
}
