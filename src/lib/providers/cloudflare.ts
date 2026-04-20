import { ProviderError } from "./types";

/**
 * Cloudflare DNS provider.
 *
 * Manages A records under a zone configured via env vars:
 * - CLOUDFLARE_API_TOKEN — scoped to Zone.DNS:Edit
 * - CLOUDFLARE_ZONE_ID — target zone for record creation
 * - CLOUDFLARE_BASE_DOMAIN — base domain (used only to build the returned FQDN)
 *
 * `createDnsRecord` reads all three at call time. `deleteDnsRecord` takes the
 * stored zoneId explicitly, so records created under a previous
 * CLOUDFLARE_ZONE_ID can still be cleanly torn down after an env flip.
 *
 * Records are created gray-cloud (proxied:false) so future HTTP-01 TLS
 * issuance works without Cloudflare intercepting port 80.
 */

const BASE_URL = "https://api.cloudflare.com/client/v4";

interface CloudflareDnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");
  return token;
}

async function cfRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<CloudflareResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await res.json().catch(() => null)) as
    | CloudflareResponse<T>
    | null;

  if (!res.ok || !body?.success) {
    const message =
      body?.errors?.map((e) => `${e.code}: ${e.message}`).join(", ") ??
      `HTTP ${res.status}`;
    throw new ProviderError(
      `Cloudflare API error: ${message}`,
      res.status,
      "cloudflare",
    );
  }

  return body;
}

export interface CreateDnsRecordOpts {
  /** Subdomain slug (without base domain) — e.g. "my-agent-a1b2c3d4" */
  name: string;
  /** IPv4 address the A record should point at */
  ipv4: string;
}

export interface CreateDnsRecordResult {
  recordId: string;
  zoneId: string;
  baseDomain: string;
  fqdn: string;
}

export async function createDnsRecord(
  opts: CreateDnsRecordOpts,
): Promise<CreateDnsRecordResult> {
  const token = getToken();
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const baseDomain = process.env.CLOUDFLARE_BASE_DOMAIN;
  if (!zoneId) throw new Error("CLOUDFLARE_ZONE_ID is required");
  if (!baseDomain) throw new Error("CLOUDFLARE_BASE_DOMAIN is required");

  const fqdn = `${opts.name}.${baseDomain}`;
  const body = await cfRequest<CloudflareDnsRecord>(
    token,
    `/zones/${zoneId}/dns_records`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: fqdn,
        content: opts.ipv4,
        ttl: 60,
        proxied: false,
      }),
    },
  );

  return {
    recordId: body.result.id,
    zoneId,
    baseDomain,
    fqdn,
  };
}

export interface DeleteDnsRecordOpts {
  recordId: string;
  zoneId: string;
}

export async function deleteDnsRecord(
  opts: DeleteDnsRecordOpts,
): Promise<void> {
  const token = getToken();
  const res = await fetch(
    `${BASE_URL}/zones/${opts.zoneId}/dns_records/${opts.recordId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  // 404 → already gone, treat as success (idempotent delete)
  if (res.status === 404) return;

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ProviderError(
      `Cloudflare API error: ${res.status} ${text}`,
      res.status,
      "cloudflare",
    );
  }
}
