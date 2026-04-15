import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Clerk before importing app
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkMiddleware: vi.fn(),
}));

// Mock DB
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: { findFirst: vi.fn() },
      assistants: { findFirst: vi.fn(), findMany: vi.fn() },
      snapshots: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock providers
vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(),
}));

// Mock Cloudflare provider
vi.mock("@/lib/providers/cloudflare", () => ({
  createDnsRecord: vi.fn(),
  deleteDnsRecord: vi.fn(),
}));

// Mock canProvision
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
import { getProvider } from "@/lib/providers";
import {
  createDnsRecord as mockedCreateDnsRecord,
  deleteDnsRecord as mockedDeleteDnsRecord,
} from "@/lib/providers/cloudflare";
import { canProvision } from "@/lib/stripe/stubs";
import { start } from "workflow/api";
import app from "@/server";

const mockAuth = vi.mocked(auth);
const mockFindFirstUser = vi.mocked(db.query.users.findFirst);
const mockFindFirstAssistant = vi.mocked(db.query.assistants.findFirst);
const mockFindManyAssistants = vi.mocked(db.query.assistants.findMany);
const mockFindFirstSnapshot = vi.mocked(db.query.snapshots.findFirst);
const mockCanProvision = vi.mocked(canProvision);
const mockStart = vi.mocked(start);
const mockGetProvider = vi.mocked(getProvider);
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

const MOCK_ASSISTANT = {
  id: "assistant-uuid-1",
  userId: "db-uuid-123",
  name: "My Assistant",
  status: "running" as const,
  provider: "hetzner" as const,
  providerServerId: "42",
  providerSnapshotId: "snap-1",
  ipv4: "1.2.3.4",
  hostname: null as string | null,
  dnsRecordId: null as string | null,
  dnsZoneId: null as string | null,
  dnsBaseDomain: null as string | null,
  region: "fsn1",
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
  mockAuth.mockResolvedValue({ userId: "user_test123" } as never);
  mockFindFirstUser.mockResolvedValue(MOCK_DB_USER as never);
}

function mockInsertChain(returnValue: unknown) {
  vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([returnValue]),
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

// update().set().where().returning() → resolves [returnValue]
function mockUpdateReturningChain(returnValue: unknown) {
  vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([returnValue]),
      }),
    }),
  } as never);
}

function mockDeleteChain() {
  vi.mocked(db.delete).mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  } as never);
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

    it("returns empty array for user with no assistants", async () => {
      setupAuth();
      mockFindManyAssistants.mockResolvedValue([] as never);

      const res = await app.request("/api/assistants");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.assistants).toEqual([]);
    });

    it("returns user assistants", async () => {
      setupAuth();
      mockFindManyAssistants.mockResolvedValue([MOCK_ASSISTANT] as never);

      const res = await app.request("/api/assistants");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.assistants).toHaveLength(1);
      expect(body.assistants[0].name).toBe("My Assistant");
      expect(body.assistants[0].status).toBe("running");
    });
  });

  describe("POST /api/assistants", () => {
    it("creates assistant, computes hostname, and starts provisioning", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(MOCK_SNAPSHOT as never);
      const insertedRow = {
        ...MOCK_ASSISTANT,
        id: "assistant-uuid-1",
        name: "New Assistant",
        status: "creating",
        providerServerId: null,
        ipv4: null,
      };
      mockInsertChain(insertedRow);
      mockUpdateReturningChain({
        ...insertedRow,
        hostname: "new-assistant-assistan.example.io",
        dnsBaseDomain: "example.io",
      });
      mockStart.mockResolvedValue({ runId: "run-1" } as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Assistant" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("New Assistant");
      expect(body.hostname).toBe("new-assistant-assistan.example.io");

      expect(mockStart).toHaveBeenCalled();
      const startArgs = mockStart.mock.calls[0]?.[1] as unknown[];
      // [assistantId, snapshotId, region, hostname]
      expect(startArgs).toHaveLength(4);
      expect(startArgs[0]).toBe("assistant-uuid-1");
      expect(startArgs[2]).toBe("fsn1");
      expect(startArgs[3]).toBe(
        `new-assistant-${"assistant-uuid-1".slice(0, 8)}.example.io`,
      );
    });

    it("returns 503 when CLOUDFLARE_BASE_DOMAIN is unset", async () => {
      setupAuth();
      vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "");
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(MOCK_SNAPSHOT as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      expect(res.status).toBe(503);
    });

    it("returns 400 when name is missing", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when name is too long", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "a".repeat(65) }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid region", async () => {
      setupAuth();

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", region: "invalid" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 403 when provisioning not allowed", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(false);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      expect(res.status).toBe(403);
    });

    it("returns 503 when no active snapshot", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(undefined as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test" }),
      });

      expect(res.status).toBe(503);
    });
  });

  describe("GET /api/assistants/:id", () => {
    it("returns assistant owned by user", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);

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
    it("restarts a running assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockGetProvider.mockReturnValue({
        reboot: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockUpdateChain();

      const res = await app.request("/api/assistants/assistant-uuid-1/restart", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      expect(mockGetProvider).toHaveBeenCalledWith("hetzner");
    });

    it("restarts a stopped assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        status: "stopped",
      } as never);
      mockGetProvider.mockReturnValue({
        reboot: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockUpdateChain();

      const res = await app.request("/api/assistants/assistant-uuid-1/restart", {
        method: "POST",
      });

      expect(res.status).toBe(200);
    });

    it("returns 409 for provisioning assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        status: "provisioning",
      } as never);

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
    it("stops a running assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockGetProvider.mockReturnValue({
        powerOff: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockUpdateChain();

      const res = await app.request("/api/assistants/assistant-uuid-1/stop", {
        method: "POST",
      });

      expect(res.status).toBe(200);
    });

    it("returns 409 for stopped assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        status: "stopped",
      } as never);

      const res = await app.request("/api/assistants/assistant-uuid-1/stop", {
        method: "POST",
      });

      expect(res.status).toBe(409);
    });
  });

  describe("DELETE /api/assistants/:id", () => {
    it("deletes assistant and destroys server", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      const mockDelete = vi.fn().mockResolvedValue(undefined);
      mockGetProvider.mockReturnValue({
        deleteServer: mockDelete,
      } as never);
      mockDeleteChain();

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith("42");
    });

    it("deletes assistant even if server is already gone", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockGetProvider.mockReturnValue({
        deleteServer: vi.fn().mockRejectedValue(new Error("Not found")),
      } as never);
      mockDeleteChain();

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
    });

    it("deletes assistant without server", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        providerServerId: null,
      } as never);
      mockDeleteChain();

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

    it("tears down the Cloudflare DNS record before destroying the server", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        hostname: "my-assistant-abcd1234.example.io",
        dnsRecordId: "rec-xyz",
        dnsZoneId: "zone-abc",
      } as never);
      const deleteServer = vi.fn().mockResolvedValue(undefined);
      mockGetProvider.mockReturnValue({ deleteServer } as never);
      mockCfDelete.mockResolvedValue(undefined as never);
      mockDeleteChain();

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      expect(mockCfDelete).toHaveBeenCalledWith({
        recordId: "rec-xyz",
        zoneId: "zone-abc",
      });
      expect(deleteServer).toHaveBeenCalledWith("42");
    });

    it("does not call deleteDnsRecord when dnsRecordId is null", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue(MOCK_ASSISTANT as never);
      mockGetProvider.mockReturnValue({
        deleteServer: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockDeleteChain();

      await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(mockCfDelete).not.toHaveBeenCalled();
    });

    it("swallows Cloudflare teardown errors and still deletes the assistant", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        dnsRecordId: "rec-xyz",
        dnsZoneId: "zone-abc",
      } as never);
      mockGetProvider.mockReturnValue({
        deleteServer: vi.fn().mockResolvedValue(undefined),
      } as never);
      mockCfDelete.mockRejectedValue(new Error("CF unreachable"));
      mockDeleteChain();

      const res = await app.request("/api/assistants/assistant-uuid-1", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
    });
  });

  describe("POST /api/assistants/:id/regenerate-hostname", () => {
    it("creates a fresh DNS record and persists it on the assistant", async () => {
      setupAuth();
      const existing = {
        ...MOCK_ASSISTANT,
        ipv4: "5.6.7.8",
        hostname: null,
        dnsRecordId: null,
        dnsZoneId: null,
      };
      mockFindFirstAssistant.mockResolvedValue(existing as never);
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
      expect(mockCfDelete).not.toHaveBeenCalled();
    });

    it("tears down an existing DNS record first when present", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        dnsRecordId: "rec-old",
        dnsZoneId: "zone-old",
      } as never);
      mockCfDelete.mockResolvedValue(undefined as never);
      mockCfCreate.mockResolvedValue({
        recordId: "rec-new",
        zoneId: "zone-abc",
        baseDomain: "example.io",
        fqdn: "my-assistant-assistan.example.io",
      });
      mockUpdateReturningChain({
        ...MOCK_ASSISTANT,
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
      expect(mockCfDelete).toHaveBeenCalledWith({
        recordId: "rec-old",
        zoneId: "zone-old",
      });
      expect(mockCfCreate).toHaveBeenCalled();
    });

    it("returns 409 when assistant has no IPv4", async () => {
      setupAuth();
      mockFindFirstAssistant.mockResolvedValue({
        ...MOCK_ASSISTANT,
        ipv4: null,
      } as never);

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

      const res = await app.request(
        "/api/assistants/assistant-uuid-1/regenerate-hostname",
        { method: "POST" },
      );

      expect(res.status).toBe(503);
      expect(mockCfCreate).not.toHaveBeenCalled();
    });
  });
});
