import { describe, it, expect } from "vitest";
import { createApiClient } from "@/server/rpc";

describe("Hono RPC client", () => {
  it("createApiClient returns a client instance", () => {
    const client = createApiClient("http://localhost:3000");
    expect(client).toBeDefined();
  });

  it("client route namespaces are accessible (Proxy-based)", () => {
    const client = createApiClient("http://localhost:3000");
    // hc() returns a Proxy — accessing routes returns sub-clients, not undefined
    // Routes are nested under api/ due to basePath("/api")
    expect(client.api.assistants).toBeDefined();
    expect(client.api.admin).toBeDefined();
    // channels + billing are untyped stubs (Phase 3/4) — Proxy makes them
    // accessible at runtime but they don't appear in the TypeScript type yet
    const c = client as Record<string, unknown>;
    expect((c.api as Record<string, unknown>).channels).toBeDefined();
    expect((c.api as Record<string, unknown>).billing).toBeDefined();
  });
});
