import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk before importing app
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkMiddleware: vi.fn(),
  clerkClient: vi.fn(),
}));

// Mock DB to avoid needing a real database in unit tests
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      organizations: {
        findFirst: vi.fn(),
      },
      assistants: {
        findMany: vi.fn(),
      },
      snapshots: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      invoices: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    insert: vi.fn(),
  },
}));

// Mock providers (assistants routes import this)
vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(),
}));

// Mock billing credits (imported by assistants route)
vi.mock("@/lib/billing/credits", () => ({
  canProvision: vi.fn().mockResolvedValue(true),
  consumeCredit: vi.fn().mockResolvedValue("credit-id"),
  releaseCredit: vi.fn().mockResolvedValue(undefined),
}));

// Mock workflow/api
vi.mock("workflow/api", () => ({
  start: vi.fn(),
}));

// Mock provisioning workflow
vi.mock("@/lib/workflows/provisioning", () => ({
  provisionAssistant: vi.fn(),
}));

// Mock bootstrap workflow
vi.mock("@/lib/workflows/bootstrap", () => ({
  buildSnapshot: vi.fn(),
}));

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import app from "@/server";

const mockAuth = vi.mocked(auth);
const mockCurrentUser = vi.mocked(currentUser);
const mockFindFirstUser = vi.mocked(db.query.users.findFirst);
const mockFindFirstOrg = vi.mocked(db.query.organizations.findFirst);

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

describe("Hono API — public routes", () => {
  it("GET /api/health returns 200 without auth", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("Hono API — protected routes (unauthenticated)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: null } as never);
  });

  it("GET /api/assistants returns 401 without auth", async () => {
    const res = await app.request("/api/assistants");
    expect(res.status).toBe(401);
  });

  it("GET /api/channels returns 401 without auth", async () => {
    const res = await app.request("/api/channels");
    expect(res.status).toBe(401);
  });

  it("GET /api/billing/invoices returns 401 without auth", async () => {
    const res = await app.request("/api/billing/invoices");
    expect(res.status).toBe(401);
  });
});

describe("Hono API — protected routes (user exists in DB)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "user_test123", orgId: "org_test456" } as never);
    mockFindFirstUser.mockResolvedValue(MOCK_DB_USER as never);
    mockFindFirstOrg.mockResolvedValue(MOCK_ORG as never);
  });

  it("GET /api/assistants returns 200 with assistants array", async () => {
    vi.mocked(db.query.assistants.findMany).mockResolvedValue([] as never);

    const res = await app.request("/api/assistants");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assistants).toEqual([]);
  });

  it("GET /api/channels returns 200", async () => {
    const res = await app.request("/api/channels");
    expect(res.status).toBe(200);
  });

  it("GET /api/billing/invoices returns 200", async () => {
    const res = await app.request("/api/billing/invoices");
    expect(res.status).toBe(200);
  });
});

describe("Hono API — lazy user creation (webhook never fired)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "user_new456", orgId: "org_test456" } as never);
    // User NOT in DB — simulates webhook never having fired
    mockFindFirstUser.mockResolvedValue(undefined as never);
    mockFindFirstOrg.mockResolvedValue(MOCK_ORG as never);
    // Clerk profile is available from session
    mockCurrentUser.mockResolvedValue({
      id: "user_new456",
      firstName: "Jane",
      lastName: "Doe",
      primaryEmailAddressId: "email_1",
      emailAddresses: [{ id: "email_1", emailAddress: "jane@example.com" }],
      imageUrl: "https://example.com/avatar.jpg",
    } as never);
    // Mock the insert chain
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            ...MOCK_DB_USER,
            clerkId: "user_new456",
            email: "jane@example.com",
            name: "Jane Doe",
          }]),
        }),
      }),
    } as never);
  });

  it("creates user from Clerk profile when not in DB", async () => {
    vi.mocked(db.query.assistants.findMany).mockResolvedValue([] as never);

    const res = await app.request("/api/assistants");
    expect(res.status).toBe(200);
    // Verify currentUser was called to fetch the profile
    expect(mockCurrentUser).toHaveBeenCalled();
    // Verify insert was called to create the user
    expect(db.insert).toHaveBeenCalled();
  });
});
