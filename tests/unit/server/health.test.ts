import { describe, it, expect } from "vitest";
import app from "@/server";

describe("Hono API", () => {
  it("should return 200 on health check", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("should return agents stub on GET /api/agents", async () => {
    const res = await app.request("/api/agents");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("agents");
  });

  it("should return channels stub on GET /api/channels", async () => {
    const res = await app.request("/api/channels");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("channels");
  });

  it("should return billing stub on GET /api/billing", async () => {
    const res = await app.request("/api/billing");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("message");
  });
});
