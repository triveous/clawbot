import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { requestLogger } from "@/server/middleware/logger";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkMiddleware: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}));

describe("requestLogger middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use("*", requestLogger());
    app.get("/ok", (c) => c.json({ ok: true }));
    app.get("/bad", (c) => c.json({ error: "bad" }, 400));
    app.get("/boom", (c) => c.json({ error: "boom" }, 500));
    app.get("/ctx", (c) => {
      const requestId = c.get("requestId");
      const logger = c.get("logger");
      return c.json({
        requestId,
        hasLogger: !!logger,
        loggerCategory: logger?.category,
      });
    });
  });

  it("sets X-Request-Id header on response", async () => {
    const res = await app.request("/ok");
    expect(res.status).toBe(200);
    const reqId = res.headers.get("X-Request-Id");
    expect(reqId).toBeTruthy();
    expect(reqId).toMatch(/^[0-9a-f]{8}$/);
  });

  it("generates a unique requestId per request", async () => {
    const r1 = await app.request("/ok");
    const r2 = await app.request("/ok");
    expect(r1.headers.get("X-Request-Id")).not.toBe(
      r2.headers.get("X-Request-Id")
    );
  });

  it("sets requestId and logger on Hono context", async () => {
    const res = await app.request("/ctx");
    const body = await res.json();

    expect(body.requestId).toMatch(/^[0-9a-f]{8}$/);
    expect(body.hasLogger).toBe(true);
    expect(body.loggerCategory).toEqual(["snapclaw", "server"]);
  });

  it("does not throw on 2xx, 4xx, or 5xx responses", async () => {
    await expect(app.request("/ok")).resolves.toMatchObject({ status: 200 });
    await expect(app.request("/bad")).resolves.toMatchObject({ status: 400 });
    await expect(app.request("/boom")).resolves.toMatchObject({ status: 500 });
  });
});
