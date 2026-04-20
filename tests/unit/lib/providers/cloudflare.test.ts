import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDnsRecord,
  deleteDnsRecord,
} from "@/lib/providers/cloudflare";
import { ProviderError } from "@/lib/providers/types";

function okResponse(result: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, errors: [], result }),
    { status },
  );
}

function cfErrorResponse(
  errors: { code: number; message: string }[],
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ success: false, errors, result: null }),
    { status },
  );
}

describe("cloudflare provider", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");
    vi.stubEnv("CLOUDFLARE_ZONE_ID", "zone-abc");
    vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "example.io");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("createDnsRecord", () => {
    it("creates an A record and returns record + zone + fqdn", async () => {
      vi.mocked(fetch).mockResolvedValue(
        okResponse({
          id: "rec-123",
          name: "my-agent-a1b2c3d4.example.io",
          type: "A",
          content: "1.2.3.4",
        }),
      );

      const result = await createDnsRecord({
        name: "my-agent-a1b2c3d4",
        ipv4: "1.2.3.4",
      });

      expect(result).toEqual({
        recordId: "rec-123",
        zoneId: "zone-abc",
        baseDomain: "example.io",
        fqdn: "my-agent-a1b2c3d4.example.io",
      });

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records",
      );
      expect(init?.method).toBe("POST");

      const body = JSON.parse(init?.body as string);
      expect(body).toEqual({
        type: "A",
        name: "my-agent-a1b2c3d4.example.io",
        content: "1.2.3.4",
        ttl: 60,
        proxied: false,
      });

      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-token");
    });

    it("throws if CLOUDFLARE_API_TOKEN is missing", async () => {
      vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
      await expect(
        createDnsRecord({ name: "x", ipv4: "1.2.3.4" }),
      ).rejects.toThrow("CLOUDFLARE_API_TOKEN is required");
    });

    it("throws if CLOUDFLARE_ZONE_ID is missing", async () => {
      vi.stubEnv("CLOUDFLARE_ZONE_ID", "");
      await expect(
        createDnsRecord({ name: "x", ipv4: "1.2.3.4" }),
      ).rejects.toThrow("CLOUDFLARE_ZONE_ID is required");
    });

    it("throws if CLOUDFLARE_BASE_DOMAIN is missing", async () => {
      vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "");
      await expect(
        createDnsRecord({ name: "x", ipv4: "1.2.3.4" }),
      ).rejects.toThrow("CLOUDFLARE_BASE_DOMAIN is required");
    });

    it("throws ProviderError on Cloudflare 4xx", async () => {
      vi.mocked(fetch).mockResolvedValue(
        cfErrorResponse(
          [{ code: 81057, message: "Record already exists" }],
          400,
        ),
      );

      await expect(
        createDnsRecord({ name: "dupe", ipv4: "1.2.3.4" }),
      ).rejects.toThrow(ProviderError);
    });
  });

  describe("deleteDnsRecord", () => {
    it("sends DELETE request to the stored zone + record", async () => {
      vi.mocked(fetch).mockResolvedValue(
        okResponse({ id: "rec-123" }, 200),
      );

      await deleteDnsRecord({ recordId: "rec-123", zoneId: "zone-abc" });

      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records/rec-123",
      );
      expect(init?.method).toBe("DELETE");
    });

    it("works without CLOUDFLARE_ZONE_ID / BASE_DOMAIN env set (uses passed zoneId)", async () => {
      vi.stubEnv("CLOUDFLARE_ZONE_ID", "");
      vi.stubEnv("CLOUDFLARE_BASE_DOMAIN", "");
      vi.mocked(fetch).mockResolvedValue(
        okResponse({ id: "rec-123" }, 200),
      );

      await deleteDnsRecord({ recordId: "rec-123", zoneId: "old-zone" });

      const [url] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/zones/old-zone/dns_records/rec-123",
      );
    });

    it("swallows 404 (idempotent)", async () => {
      vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

      await expect(
        deleteDnsRecord({ recordId: "rec-gone", zoneId: "zone-abc" }),
      ).resolves.toBeUndefined();
    });

    it("throws ProviderError on non-404 failure", async () => {
      vi.mocked(fetch).mockResolvedValue(
        new Response("forbidden", { status: 403 }),
      );

      await expect(
        deleteDnsRecord({ recordId: "rec-x", zoneId: "zone-abc" }),
      ).rejects.toThrow(ProviderError);
    });

    it("throws if CLOUDFLARE_API_TOKEN is missing", async () => {
      vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
      await expect(
        deleteDnsRecord({ recordId: "rec-x", zoneId: "zone-abc" }),
      ).rejects.toThrow("CLOUDFLARE_API_TOKEN is required");
    });
  });
});
