import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HetznerProvider } from "@/lib/providers/hetzner";
import { ProviderError } from "@/lib/providers/types";

describe("HetznerProvider — firewall methods", () => {
  let provider: HetznerProvider;

  beforeEach(() => {
    vi.stubEnv("HETZNER_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    provider = new HetznerProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("createFirewall", () => {
    it("sends correct request and returns firewallId", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ firewall: { id: 101, name: "openclaw-abc12345" } }),
          { status: 201 },
        ),
      );

      const result = await provider.createFirewall("openclaw-abc12345", [
        { direction: "in", protocol: "tcp", port: "22", source_ips: ["0.0.0.0/0", "::/0"] },
      ]);

      expect(result.firewallId).toBe("101");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("https://api.hetzner.cloud/v1/firewalls");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.name).toBe("openclaw-abc12345");
      expect(body.rules).toHaveLength(1);
      expect(body.rules[0].protocol).toBe("tcp");
      expect(body.rules[0].port).toBe("22");
    });

    it("creates UDP 41641 rules for Tailscale mode", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ firewall: { id: 202, name: "openclaw-tstest1" } }),
          { status: 201 },
        ),
      );

      await provider.createFirewall("openclaw-tstest1", [
        { direction: "in", protocol: "udp", port: "41641", source_ips: ["0.0.0.0/0", "::/0"] },
      ]);

      const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(body.rules[0].protocol).toBe("udp");
      expect(body.rules[0].port).toBe("41641");
    });

    it("throws ProviderError on 4xx", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("Invalid request", { status: 400 }),
      );

      await expect(
        provider.createFirewall("bad-name", []),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe("attachFirewall", () => {
    it("sends correct apply_to_resources request", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response(
          JSON.stringify({ action: { id: 1, status: "running" } }),
          { status: 201 },
        ),
      );

      await provider.attachFirewall("101", "42");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.hetzner.cloud/v1/firewalls/101/actions/apply_to_resources",
      );
      expect(init?.method).toBe("POST");
      const body = JSON.parse(init?.body as string);
      expect(body.apply_to[0].type).toBe("server");
      expect(body.apply_to[0].server.id).toBe(42);
    });

    it("throws ProviderError on 4xx", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("Not found", { status: 404 }),
      );

      await expect(provider.attachFirewall("bad", "bad")).rejects.toThrow(
        ProviderError,
      );
    });
  });

  describe("deleteFirewall", () => {
    it("sends DELETE request to correct endpoint", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

      await provider.deleteFirewall("101");

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("https://api.hetzner.cloud/v1/firewalls/101");
      expect(init?.method).toBe("DELETE");
    });

    it("swallows 404 (already deleted)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("Not found", { status: 404 }),
      );

      await expect(provider.deleteFirewall("gone")).resolves.toBeUndefined();
    });

    it("throws ProviderError on non-404 errors", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("Server error", { status: 500 }),
      );

      await expect(provider.deleteFirewall("101")).rejects.toThrow(ProviderError);
    });
  });
});
