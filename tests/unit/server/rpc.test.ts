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
    expect(client.agents).toBeDefined();
    expect(client.channels).toBeDefined();
    expect(client.billing).toBeDefined();
    expect(client.webhooks).toBeDefined();
  });
});
