import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk before importing app
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkMiddleware: vi.fn(),
}));

// Mock DB to avoid needing a real database in unit tests
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(),
      },
      assistants: {
        findMany: vi.fn(),
      },
      snapshots: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(),
  },
}));

// Mock providers (assistants routes import this)
vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(),
}));

// Mock canProvision stub
vi.mock("@/lib/stripe/stubs", () => ({
  canProvision: vi.fn().mockResolvedValue(true),
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
const mockFindFirst = vi.mocked(db.query.users.findFirst);

const MOCK_DB_USER = {
  id: "db-uuid-123",
  clerkId: "user_test123",
  email: "test@example.com",
  name: "Test User",
  avatarUrl: null,
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

  it("GET /api/billing returns 401 without auth", async () => {
    const res = await app.request("/api/billing");
    expect(res.status).toBe(401);
  });
});

describe("Hono API — protected routes (user exists in DB)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "user_test123" } as never);
    // User already in DB — no Clerk profile fetch needed
    mockFindFirst.mockResolvedValue(MOCK_DB_USER as never);
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

  it("GET /api/billing returns 200", async () => {
    const res = await app.request("/api/billing");
    expect(res.status).toBe(200);
  });
});

describe("Hono API — lazy user creation (webhook never fired)", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: "user_new456" } as never);
    // User NOT in DB — simulates webhook never having fired
    mockFindFirst.mockResolvedValue(undefined as never);
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
