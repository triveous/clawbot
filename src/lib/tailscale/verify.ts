export interface TailscaleKeyInfo {
  valid: boolean;
  expiresAt: string | null;
  tags: string[];
  reusable: boolean;
}

export async function verifyTailscaleAuthKey(
  authKey: string,
): Promise<TailscaleKeyInfo> {
  const apiKey = process.env.TAILSCALE_API_KEY;
  const tailnet = process.env.TAILSCALE_TAILNET;

  if (!apiKey || !tailnet) {
    throw new Error("TAILSCALE_API_KEY and TAILSCALE_TAILNET must be set");
  }

  // Auth keys are opaque — list all keys and match by key prefix.
  // Tailscale auth keys have format tskey-auth-<id>-<secret>.
  // We can only check the key's existence/validity by attempting to list
  // and matching on the first segment of the key ID.
  const res = await fetch(
    `https://api.tailscale.com/api/v2/tailnet/${tailnet}/keys`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tailscale API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    keys: Array<{
      id: string;
      key?: string;
      capabilities: { devices: { create: { reusable: boolean; tags?: string[] } } };
      expiryDate: string;
      invalid: boolean;
    }>;
  };

  // Extract the key ID portion from the auth key (tskey-auth-<id>-...)
  const keyIdMatch = authKey.match(/^tskey-auth-([^-]+)/);
  if (!keyIdMatch) {
    return { valid: false, expiresAt: null, tags: [], reusable: false };
  }
  const keyId = keyIdMatch[1];

  const found = data.keys.find((k) => k.id === keyId);
  if (!found) {
    return { valid: false, expiresAt: null, tags: [], reusable: false };
  }

  if (found.invalid) {
    return { valid: false, expiresAt: null, tags: [], reusable: false };
  }

  const tags = found.capabilities?.devices?.create?.tags ?? [];
  const reusable = found.capabilities?.devices?.create?.reusable ?? false;

  return {
    valid: true,
    expiresAt: found.expiryDate ?? null,
    tags,
    reusable,
  };
}
