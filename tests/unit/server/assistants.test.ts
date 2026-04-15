import { describe, it, expect, vi, beforeEach } from "vitest";

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

function mockDeleteChain() {
  vi.mocked(db.delete).mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  } as never);
}

describe("Assistants API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it("creates assistant and starts provisioning", async () => {
      setupAuth();
      mockCanProvision.mockResolvedValue(true);
      mockFindFirstSnapshot.mockResolvedValue(MOCK_SNAPSHOT as never);
      mockInsertChain({
        ...MOCK_ASSISTANT,
        status: "creating",
        providerServerId: null,
        ipv4: null,
      });
      mockStart.mockResolvedValue({ runId: "run-1" } as never);

      const res = await app.request("/api/assistants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Assistant" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("My Assistant"); // from mock return
      expect(mockStart).toHaveBeenCalled();
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
  });
});
