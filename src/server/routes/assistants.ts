import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, desc } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { assistants, snapshots } from "@/lib/db/schema";
import type { User, Assistant } from "@/lib/db/schema";
import { canProvision } from "@/lib/stripe/stubs";
import { getProvider } from "@/lib/providers";
import {
  createDnsRecord,
  deleteDnsRecord,
} from "@/lib/providers/cloudflare";
import { provisionAssistant } from "@/lib/workflows/provisioning";
import { generateHostnameSlug, buildFqdn } from "@/lib/workflows/slug";
import type { AssistantResponse } from "@/types/assistant";

const VALID_REGIONS = ["fsn1", "nbg1", "hel1"] as const;
const MAX_NAME_LENGTH = 64;

function toAssistantResponse(assistant: Assistant): AssistantResponse {
  return {
    id: assistant.id,
    name: assistant.name,
    status: assistant.status,
    provider: assistant.provider,
    ipv4: assistant.ipv4,
    hostname: assistant.hostname,
    region: assistant.region,
    createdAt: assistant.createdAt.toISOString(),
  };
}

async function getOwnedAssistant(
  dbUser: User,
  assistantId: string,
): Promise<Assistant | null> {
  const assistant = await db.query.assistants.findFirst({
    where: and(eq(assistants.id, assistantId), eq(assistants.userId, dbUser.id)),
  });
  return assistant ?? null;
}

export const assistantsRoute = new Hono()

  // List assistants
  .get("/", async (c) => {
    const dbUser = c.get("dbUser");

    const userAssistants = await db.query.assistants.findMany({
      where: eq(assistants.userId, dbUser.id),
      orderBy: desc(assistants.createdAt),
    });

    return c.json({ assistants: userAssistants.map(toAssistantResponse) });
  })

  // Create assistant
  .post("/", async (c) => {
    const dbUser = c.get("dbUser");
    const body = await c.req.json<{ name?: string; region?: string }>();

    if (!body.name || body.name.trim().length === 0) {
      throw new HTTPException(400, { message: "Assistant name is required" });
    }
    if (body.name.length > MAX_NAME_LENGTH) {
      throw new HTTPException(400, {
        message: `Assistant name must be ${MAX_NAME_LENGTH} characters or less`,
      });
    }

    const region = body.region ?? "fsn1";
    if (!VALID_REGIONS.includes(region as (typeof VALID_REGIONS)[number])) {
      throw new HTTPException(400, {
        message: `Invalid region. Must be one of: ${VALID_REGIONS.join(", ")}`,
      });
    }

    const allowed = await canProvision(dbUser.id);
    if (!allowed) {
      throw new HTTPException(403, {
        message: "Not allowed to provision new assistants",
      });
    }

    const activeSnapshot = await db.query.snapshots.findFirst({
      where: and(
        eq(snapshots.isActive, true),
        eq(snapshots.provider, "hetzner"),
      ),
    });
    if (!activeSnapshot) {
      throw new HTTPException(503, {
        message: "No active snapshot available for provisioning",
      });
    }

    const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;
    if (!baseDomain) {
      throw new HTTPException(503, {
        message: "CLOUDFLARE_BASE_DOMAIN is not configured",
      });
    }

    const [inserted] = await db
      .insert(assistants)
      .values({
        userId: dbUser.id,
        name: body.name.trim(),
        status: "creating",
        provider: "hetzner",
        region,
      })
      .returning();

    const slug = generateHostnameSlug(inserted.name, inserted.id);
    const hostname = buildFqdn(slug, baseDomain);

    const [assistant] = await db
      .update(assistants)
      .set({ hostname, dnsBaseDomain: baseDomain })
      .where(eq(assistants.id, inserted.id))
      .returning();

    await start(provisionAssistant, [
      assistant.id,
      activeSnapshot.providerSnapshotId,
      region,
      hostname,
    ]);

    return c.json(toAssistantResponse(assistant), 201);
  })

  // Get single assistant
  .get("/:id", async (c) => {
    const dbUser = c.get("dbUser");
    const assistantId = c.req.param("id");

    const assistant = await getOwnedAssistant(dbUser, assistantId);
    if (!assistant) {
      throw new HTTPException(404, { message: "Assistant not found" });
    }

    return c.json(toAssistantResponse(assistant));
  })

  // Restart assistant
  .post("/:id/restart", async (c) => {
    const dbUser = c.get("dbUser");
    const assistantId = c.req.param("id");

    const assistant = await getOwnedAssistant(dbUser, assistantId);
    if (!assistant) {
      throw new HTTPException(404, { message: "Assistant not found" });
    }

    if (assistant.status !== "running" && assistant.status !== "stopped") {
      throw new HTTPException(409, {
        message: `Cannot restart assistant in "${assistant.status}" state`,
      });
    }
    if (!assistant.providerServerId) {
      throw new HTTPException(409, { message: "Assistant has no server" });
    }

    const provider = getProvider(assistant.provider);
    await provider.reboot(assistant.providerServerId);

    await db
      .update(assistants)
      .set({ status: "running" })
      .where(eq(assistants.id, assistantId));

    return c.json(toAssistantResponse({ ...assistant, status: "running" }));
  })

  // Stop assistant
  .post("/:id/stop", async (c) => {
    const dbUser = c.get("dbUser");
    const assistantId = c.req.param("id");

    const assistant = await getOwnedAssistant(dbUser, assistantId);
    if (!assistant) {
      throw new HTTPException(404, { message: "Assistant not found" });
    }

    if (assistant.status !== "running") {
      throw new HTTPException(409, {
        message: `Cannot stop assistant in "${assistant.status}" state`,
      });
    }
    if (!assistant.providerServerId) {
      throw new HTTPException(409, { message: "Assistant has no server" });
    }

    const provider = getProvider(assistant.provider);
    await provider.powerOff(assistant.providerServerId);

    await db
      .update(assistants)
      .set({ status: "stopped" })
      .where(eq(assistants.id, assistantId));

    return c.json(toAssistantResponse({ ...assistant, status: "stopped" }));
  })

  // Delete assistant
  .delete("/:id", async (c) => {
    const dbUser = c.get("dbUser");
    const assistantId = c.req.param("id");

    const assistant = await getOwnedAssistant(dbUser, assistantId);
    if (!assistant) {
      throw new HTTPException(404, { message: "Assistant not found" });
    }

    if (assistant.dnsRecordId && assistant.dnsZoneId) {
      try {
        await deleteDnsRecord({
          recordId: assistant.dnsRecordId,
          zoneId: assistant.dnsZoneId,
        });
      } catch {
        // Orphan DNS record — acceptable; reconciliation job will clean up (see kanban Deferred)
      }
    }

    if (assistant.providerServerId) {
      try {
        const provider = getProvider(assistant.provider);
        await provider.deleteServer(assistant.providerServerId);
      } catch {
        // Server may already be deleted — that's fine
      }
    }

    await db.delete(assistants).where(eq(assistants.id, assistantId));

    return c.json({ deleted: true });
  })

  // Regenerate hostname / DNS record
  .post("/:id/regenerate-hostname", async (c) => {
    const dbUser = c.get("dbUser");
    const assistantId = c.req.param("id");

    const assistant = await getOwnedAssistant(dbUser, assistantId);
    if (!assistant) {
      throw new HTTPException(404, { message: "Assistant not found" });
    }

    if (!assistant.ipv4) {
      throw new HTTPException(409, {
        message: "Assistant has no IPv4 yet — cannot create DNS record",
      });
    }

    const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;
    if (!baseDomain) {
      throw new HTTPException(503, {
        message: "CLOUDFLARE_BASE_DOMAIN is not configured",
      });
    }

    // If an existing record is on file, tear it down first (best-effort).
    if (assistant.dnsRecordId && assistant.dnsZoneId) {
      try {
        await deleteDnsRecord({
          recordId: assistant.dnsRecordId,
          zoneId: assistant.dnsZoneId,
        });
      } catch {
        // best-effort; fall through and create the new record
      }
    }

    const slug = generateHostnameSlug(assistant.name, assistant.id);
    const { recordId, zoneId, fqdn } = await createDnsRecord({
      name: slug,
      ipv4: assistant.ipv4,
    });

    const [updated] = await db
      .update(assistants)
      .set({
        hostname: fqdn,
        dnsRecordId: recordId,
        dnsZoneId: zoneId,
        dnsBaseDomain: baseDomain,
      })
      .where(eq(assistants.id, assistantId))
      .returning();

    return c.json(toAssistantResponse(updated));
  });
