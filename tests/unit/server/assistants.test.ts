import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk before importing app
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkMiddleware: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock DB
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      organizations: { findFirst: vi.fn() },
      assistants: { findFirst: vi.fn(), findMany: vi.fn() },
      instances: { findFirst: vi.fn() },
      snapshots: { findFirst: vi.fn() },
      instanceEvents: { findMany: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock providers
vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(),
  getHetznerProvider: vi.fn(),
}));

// Mock Cloudflare provider
vi.mock("@/lib/providers/cloudflare", () => ({
  createDnsRecord: vi.fn(),
  deleteDnsRecord: vi.fn(),
}));

// Mock billing credits
vi.mock("@/lib/billing/credits", () => ({
  canProvision: vi.fn(),
  consumeCredit: vi.fn().mockResolvedValue("credit-id"),
  releaseCredit: vi.fn().mockResolvedValue(undefined),
}));

// Keep stubs re-export working
vi.mock("@/lib/stripe/stubs", () => ({
  canProvision: vi.fn(),
}));

// Mock workflow/api
vi.mock("workflow/api", () => ({
  start: vi.fn(),
}));

// Mock provisioning workflow
vi.mock("@/lib/workflows/provisioning", () => ({
  provisionAssistant: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { getProvider, getHetznerProvider } from "@/lib/providers";
import {
  createDnsRecord as mockedCreateDnsRecord,
  deleteDnsRecord as mockedDeleteDnsRecord,
} from "@/lib/providers/cloudflare";
import { canProvision } from "@/lib/billing/credits";
import { start } from "workflow/api";
import app from "@/server";

const mockAuth = vi.mocked(auth);
const mockFindFirstUser = vi.mocked(db.query.users.findFirst);
const mockFindFirstOrg = vi.mocked(db.query.organizations.findFirst);
const mockFindFirstAssistant = vi.mocked(db.query.assistants.findFirst);
const mockFindManyAssistants = vi.mocked(db.query.assistants.findMany);
const mockFindFirstInstance = vi.mocked(db.query.instances.findFirst);
const mockFindFirstSnapshot = vi.mocked(db.query.snapshots.findFirst);
const mockCanProvision = vi.mocked(canProvision);
const mockStart = vi.mocked(start);
const mockGetProvider = vi.mocked(getProvider);
const mockGetHetznerProvider = vi.mocked(getHetznerProvider);
const mockCfCreate = vi.mocked(mockedCreateDnsRecord);
const mockCfDelete = vi.mocked(mockedDeleteDnsRecord);

const MOCK_DB_USER = {
  id: "db-uuid-123",
  clerkId: "user_test123",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_ORG = {
  id: "org_test456",
  name: "Test Workspace",
  slug: "test-workspace",
  billingCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_INSTANCE = {
  id: "instance-uuid-1",
  assistantId: "assistant-uuid-1",
  provider: "hetzner" as const,
  providerServerId: "42",
  providerSnapshotId: "snap-1",
  firewallId: "fw-1",
  ipv4: "1.2.3.4",
  region: "fsn1",
  gatewayPort: 8080,
  status: "running" as const,
  lastError: null,
  workflowRunId: null,
  destroyedAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MOCK_ASSISTANT = {
  id: "assistant-uuid-1",
  orgId: "org_test456",
  createdByUserId: "db-uuid-123",
  name: "My Assistant",
  status: "active" as const,
  provider: "hetzner" as const,
  planId: "plan-uuid-1",
  instanceId: "instance-uuid-1",
  hostname: "my-assistant-abcd1234.example.io",
  dnsRecordId: null as string | null,
  dnsZoneId: null as string | null,
  dnsBaseDomain: "example.io",
  accessMode: "ssh" as const,
  sshAllowedIps: null as string | null,
  region: "fsn1",
  lastErrorAt: null,
  deletedAt: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MOCK_SNAPSHOT = {
  id: "snap-uuid-1",
  provider: "hetzner" as const,
  providerSnapshotId: "12345",
  version: "v1.0",
  openclawVersion: "1.0.0",
  description: "test snapshot",
  isActive: true,
  createdAt: new Date(),
};

function setupAuth() {
  mockAuth.mockResolvedValue({ userId: "user_test123", orgId: "org_test456" } as never);
  mockFindFirstUser.mockResolvedValue(MOCK_DB_USER as never);
  mockFindFirstOrg.mockResolvedValue(MOCK_ORG as never);
}

function mockInsertChain(returnValue: unknown) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([returnValue]),
    }),
  } as never);
}

function mockUpdateReturningChain(returnValue: unknown) {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnValue]),
      }),
    }),
  } as never);
}

function mockUpdateChain() {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  } as never);
}

function mockTransactionWith(tx: unknown) {
  vi.mocked(db.transaction).mockImplementation(async (fn) => fn(tx as never));
}

describe("Assistants API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone-abc");
    vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "example.io");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/assistants", () => {
    it("returns 401 without auth", async () => {
      mockAuth.mockResolvedValue({ userId: null } as never);
      const res = await app.request("/api/assistants");
      expect(res.status).toBe(401);
    });

    it("returns empty array for org with no assistants", async () => {
      setupAuth();
      mockFindManyAssistants.mockResolvedValue([] as never);

      const res = await app.request("/api/assistants");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.assistants).toEqual([]);
    });

    it("returns org assistants with instance data", async () => {
      setupAuth();
      mockFindManyAssistants.mockResolvedValue([MOCK_ASSISTANT] as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);

      const res = await app.request("/api/assistants");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.assistants).toHaveLength(1);
      expect(body.assistants[0].name).toBe("My Assistant");
      expect(body.assistants[0].status).toBe("active");
      expect(body.assistants[0].ipv4).toBe("1.2.3.4");
    });
  });

  describe("POST /api/assistants", () => {
    it("creates assistant, computes hostname, and starts provisioning", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(MOCK_SNAPSHOT as never);

      const insertedAssistant = {
        ...MOCK_ASSISTANT,
        id: "assistant-uuid-1",
        name: "New Assistant",
        status: "creating",
        instanceId: null,
      };
      const insertedInstance = { ...MOCK_INSTANCE, id: "instance-uuid-1" };
      const assistantWithHostname = {
        ...insertedAssistant,
        hostname: `new-assistant-${"assistant-uuid-1".slice(0, 8)}.example.io`,
        dnsBaseDomain: "example.io",
      };

      // Mock the transaction — run the fn with a mock tx
      const txMock = {
        insert: vi.fn()
          .mockReturnValueOnce({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([insertedAssistant]) }) })
          .mockReturnValueOnce({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([insertedInstance]) }) }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([assistantWithHostname]) }) }),
        }),
        query: {
          plans: { findFirst: vi.fn().mockResolvedValue({ id: "plan-uuid-1", tier: 0 }) },
          assistantCredits: { findFirst: vi.fn() },
        },
      };
      mockTransactionWith(txMock);
      mockStart.mockResolvedValue({ runId: "run-1" } as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Assistant", planId: "plan-uuid-1" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("New Assistant");
      expect(mockStart).toHaveBeenCalled();
    });

    it("returns 503 when CLOUDFLARE_BASE_DOMAIN is unset", async () => {
      setupAuth();
      vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "");
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(MOCK_SNAPSHOT as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", planId: "plan-uuid-1" }),
      });

      expect(res.status).toBe(503);
    });

    it("returns 400 when name is missing", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: "plan-uuid-1" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when name is too long", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(65), planId: "plan-uuid-1" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when planId is missing", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid region", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", planId: "plan-uuid-1", region: "invalid" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 402 when provisioning not allowed", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(false);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", planId: "plan-uuid-1" }),
      });

      expect(res.status).toBe(402);
    });

    it("returns 503 when no active snapshot", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(undefined as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", planId: "plan-uuid-1" }),
      });

      expect(res.status).toBe(503);
    });

    it("returns 422 when Tailscale mode is selected without a tailscaleAuthKey", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(MOCK_SNAPSHOT as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", planId: "plan-uuid-1", accessMode: "tailscale_serve" }),
      });

      expect(res.status).toBe(422);
      expect(mockStart).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid accessMode", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", planId: "plan-uuid-1", accessMode: "invalid_mode" }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/assistants/:id", () => {
    it("returns assistant owned by org", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);

      const res = await app.request("/api/assistants/assistant-uuid-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("My Assistant");
    });

    it("returns 404 for non-existent assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(undefined as never);

      const res = await app.request("/api/assistants/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/assistants/:id/restart", () => {
    it("restarts an active assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);
      mockGetProvider.mockReturnValue({
        reboot: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockUpdateReturningChain(MOCK_ASSISTANT);

      const res = await app.request("/api/assistants/assistant-uuid-1/restart", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(mockGetProvider).toHaveBeenCalledWith("hetzner");
    });

    it("restarts a stopped assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({ ...MOCK_ASSISTANT, status: "stopped" } as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);
      mockGetProvider.mockReturnValue({
        reboot: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockUpdateReturningChain({ ...MOCK_ASSISTANT, status: "active" });

      const res = await app.request("/api/assistants/assistant-uuid-1/restart", {
        method: "POST",
      });

      expect(res.status).toBe(200);
    });

    it("returns 409 for assistant in creating state", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({ ...MOCK_ASSISTANT, status: "creating" } as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);

      const res = await app.request("/api/assistants/assistant-uuid-1/restart", {
        method: "POST",
      });

      expect(res.status).toBe(409);
    });

    it("returns 404 for non-existent assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(undefined as never);

      const res = await app.request("/api/assistants/nonexistent/restart", {
        method: "POST",
      });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/assistants/:id/stop", () => {
    it("stops an active assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);
      mockGetProvider.mockReturnValue({
        powerOff: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockUpdateReturningChain({ ...MOCK_ASSISTANT, status: "stopped" });

      const res = await app.request("/api/assistants/assistant-uuid-1/stop", {
        method: "POST",
      });

      expect(res.status).toBe(200);
    });

    it("returns 409 for stopped assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({ ...MOCK_ASSISTANT, status: "stopped" } as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);

      const res = await app.request("/api/assistants/assistant-uuid-1/stop", {
        method: "POST",
      });

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /api/assistants/:id", () => {
    it("soft-deletes assistant and releases credit", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);
      const mockDeleteServer = vi.fn().mockResolvedValue(undefined);
      const mockDetachFw = vi.fn().mockResolvedValue(undefined);
      const mockDeleteFw = vi.fn().mockResolvedValue(undefined);
      mockGetProvider.mockReturnValue({ deleteServer: mockDeleteServer } as never);
      mockGetHetznerProvider.mockReturnValue({ detachFirewall: mockDetachFw, deleteFirewall: mockDeleteFw } as never);

      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      mockTransactionWith(txMock);

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
      expect(mockDeleteServer).toHaveBeenCalledWith("42");
    });

    it("deletes assistant even if server is already gone", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);
      mockGetProvider.mockReturnValue({
        deleteServer: vi.fn().mockRejectedValue(new Error("Not found")),
      } as never);
      mockGetHetznerProvider.mockReturnValue({
        detachFirewall: vi.fn().mockResolvedValue(undefined),
        deleteFirewall: vi.fn().mockResolvedValue(undefined),
      } as never);

      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      mockTransactionWith(txMock);

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
    });

    it("deletes assistant without server (no instance)", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        instanceId: null,
      } as never);
      mockFindFirstInstance.mockResolvedValue(undefined as never);

      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      mockTransactionWith(txMock);

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      expect(mockGetProvider).not.toHaveBeenCalled();
    });

    it("returns 404 for non-existent assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(undefined as never);

      const res = await app.request("/api/assistants/nonexistent", {
        method: "DELETE",
      });

      expect(res.status).toBe(404);
    });

    it("tears down Cloudflare DNS record before destroying server", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        dnsRecordId: "rec-xyz",
        dnsZoneId: "zone-abc",
      } as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);
      const deleteServer = vi.fn().mockResolvedValue(undefined);
      mockGetProvider.mockReturnValue({ deleteServer } as never);
      mockGetHetznerProvider.mockReturnValue({
        detachFirewall: vi.fn().mockResolvedValue(undefined),
        deleteFirewall: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockCfDelete.mockResolvedValue(undefined as never);

      const txMock = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
        }),
      };
      mockTransactionWith(txMock);

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      expect(mockCfDelete).toHaveBeenCalledWith({ recordId: "rec-xyz", zoneId: "zone-abc" });
      expect(deleteServer).toHaveBeenCalledWith("42");
    });
  });

  describe("POST /api/assistants/:id/regenerate-hostname", () => {
    it("creates a fresh DNS record and persists it on the assistant", async () => {
      setupAuth();
      const existing = {
        ...MOCK_ASSISTANT,
        hostname: null,
        dnsRecordId: null,
        dnsZoneId: null,
      };
      const instanceWithIp = { ...MOCK_INSTANCE, ipv4: "5.6.7.8" };
      mockFindFirstAssistant.mockResolvedValue(existing as never);
      mockFindFirstInstance.mockResolvedValue(instanceWithIp as never);
      mockCfCreate.mockResolvedValue({
        recordId: "rec-new",
        zoneId: "zone-abc",
        baseDomain: "example.io",
        fqdn: "my-assistant-assistan.example.io",
      });
      mockUpdateReturningChain({
        ...existing,
        hostname: "my-assistant-assistan.example.io",
        dnsRecordId: "rec-new",
        dnsZoneId: "zone-abc",
        dnsBaseDomain: "example.io",
      });

      const res = await app.request(
        "/api/assistants/assistant-uuid-1/regenerate-hostname",
        { method: "POST" },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.hostname).toBe("my-assistant-assistan.example.io");
      expect(mockCfCreate).toHaveBeenCalledWith({
        name: expect.stringMatching(/^my-assistant-/),
        ipv4: "5.6.7.8",
      });
    });

    it("returns 409 when assistant has no IPv4", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue({ ...MOCK_INSTANCE, ipv4: null } as never);

      const res = await app.request(
        "/api/assistants/assistant-uuid-1/regenerate-hostname",
        { method: "POST" },
      );

      expect(res.status).toBe(409);
      expect(mockCfCreate).not.toHaveBeenCalled();
    });

    it("returns 404 for non-existent assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(undefined as never);

      const res = await app.request(
        "/api/assistants/nonexistent/regenerate-hostname",
        { method: "POST" },
      );

      expect(res.status).toBe(404);
    });

    it("returns 503 when CLOUDFLARE_BASE_DOMAIN is unset", async () => {
      setupAuth();
      vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "");
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockFindFirstInstance.mockResolvedValue(MOCK_INSTANCE as never);

      const res = await app.request(
        "/api/assistants/assistant-uuid-1/regenerate-hostname",
        { method: "POST" },
      );

      expect(res.status).toBe(503);
      expect(mockCfCreate).not.toHaveBeenCalled();
    });
  });
});
