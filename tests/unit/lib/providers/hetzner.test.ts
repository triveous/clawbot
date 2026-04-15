import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HetznerProvider } from "@/lib/providers/hetzner";
import { ProviderError } from "@/lib/providers/types";

describe("HetznerProvider", () => {
  let provider: HetznerProvider;

  beforeEach(() => {
    vi.stubEnv("HETZNER_API_TOKEN", "test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(),
    );
    provider = new HetznerProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws if HETZNER_API_TOKEN is missing", () => {
    vi.stubEnv("HETZNER_API_TOKEN", "");
    expect(() => new HetznerProvider()).toThrow("HETZNER_API_TOKEN is required");
  });

  describe("createServer", () => {
    it("sends correct request and parses response", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            server: {
              id: 42,
              public_net: { ipv4: { ip: "1.2.3.4" } },
              status: "initializing",
            },
            root_password: "hunter2",
          }),
          { status: 201 },
        ),
      );

      const result = await provider.createServer({
        name: "test-server",
        image: "12345",
        region: "fsn1",
        serverType: "cx33",
        userData: "#!/bin/bash\necho hello",
      });

      expect(result.server.id).toBe("42");
      expect(result.server.ip).toBe("1.2.3.4");
      expect(result.server.status).toBe("initializing");
      expect(result.rootPassword).toBe("hunter2");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("https://api.hetzner.cloud/v1/servers");
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body.name).toBe("test-server");
      expect(body.server_type).toBe("cx33");
      expect(body.image).toBe("12345");
      expect(body.location).toBe("fsn1");
      expect(body.user_data).toBe("#!/bin/bash\necho hello");
      expect(body.start_after_create).toBe(true);
    });

    it("throws ProviderError on failure", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("Invalid image", { status: 422 }),
      );

      await expect(
        provider.createServer({
          name: "test",
          image: "bad",
          region: "fsn1",
          serverType: "cx33",
        }),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe("getServer", () => {
    it("maps running status correctly", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            server: {
              id: 42,
              public_net: { ipv4: { ip: "1.2.3.4" } },
              status: "running",
            },
          }),
          { status: 200 },
        ),
      );

      const server = await provider.getServer("42");
      expect(server.status).toBe("running");
      expect(server.id).toBe("42");
      expect(server.ip).toBe("1.2.3.4");
    });

    it("maps off status correctly", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            server: {
              id: 42,
              public_net: { ipv4: { ip: "1.2.3.4" } },
              status: "off",
            },
          }),
          { status: 200 },
        ),
      );

      const server = await provider.getServer("42");
      expect(server.status).toBe("off");
    });

    it("maps unknown statuses to initializing", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            server: {
              id: 42,
              public_net: { ipv4: { ip: "1.2.3.4" } },
              status: "rebuilding",
            },
          }),
          { status: 200 },
        ),
      );

      const server = await provider.getServer("42");
      expect(server.status).toBe("initializing");
    });
  });

  describe("deleteServer", () => {
    it("sends DELETE request", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(null, { status: 204 }),
      );

      await provider.deleteServer("42");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("https://api.hetzner.cloud/v1/servers/42");
      expect(init?.method).toBe("DELETE");
    });
  });

  describe("power actions", () => {
    it("powerOn sends POST to poweron action", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ action: { id: 1, status: "running" } }),
          { status: 201 },
        ),
      );

      await provider.powerOn("42");

      const [url] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.hetzner.cloud/v1/servers/42/actions/poweron",
      );
    });

    it("powerOff sends POST to poweroff action", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ action: { id: 1, status: "running" } }),
          { status: 201 },
        ),
      );

      await provider.powerOff("42");

      const [url] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.hetzner.cloud/v1/servers/42/actions/poweroff",
      );
    });

    it("reboot sends POST to reboot action", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ action: { id: 1, status: "running" } }),
          { status: 201 },
        ),
      );

      await provider.reboot("42");

      const [url] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.hetzner.cloud/v1/servers/42/actions/reboot",
      );
    });
  });

  describe("createImage", () => {
    it("creates snapshot and returns image ID", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            image: { id: 99, status: "creating", description: "test" },
          }),
          { status: 201 },
        ),
      );

      const result = await provider.createImage("42", "test-snapshot");

      expect(result.imageId).toBe("99");

      const [, init] = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.type).toBe("snapshot");
      expect(body.description).toBe("test-snapshot");
    });
  });

  describe("getImage", () => {
    it("returns image status", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            image: {
              id: 99,
              status: "available",
              description: "test-snapshot",
            },
          }),
          { status: 200 },
        ),
      );

      const result = await provider.getImage("99");
      expect(result.status).toBe("available");
      expect(result.description).toBe("test-snapshot");
    });
  });

  describe("createSshKey", () => {
    it("registers a key and returns keyId", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ ssh_key: { id: 77, name: "test-key" } }),
          { status: 201 },
        ),
      );

      const result = await provider.createSshKey("test-key", "ssh-ed25519 AAAA...");
      expect(result.keyId).toBe("77");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("https://api.hetzner.cloud/v1/ssh_keys");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.name).toBe("test-key");
      expect(body.public_key).toBe("ssh-ed25519 AAAA...");
    });
  });

  describe("deleteSshKey", () => {
    it("sends DELETE request to ssh_keys endpoint", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

      await provider.deleteSshKey("77");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("https://api.hetzner.cloud/v1/ssh_keys/77");
      expect(init?.method).toBe("DELETE");
    });
  });

  describe("auth header", () => {
    it("sends Bearer token in all requests", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            server: {
              id: 1,
              public_net: { ipv4: { ip: "1.1.1.1" } },
              status: "running",
            },
          }),
          { status: 200 },
        ),
      );

      await provider.getServer("1");

      const [, init] = vi.mocked(fetch).mock.calls[0];
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-token");
    });
  });
});
