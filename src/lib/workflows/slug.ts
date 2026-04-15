/**
 * Generates a hostname slug for an assistant.
 *
 * Slugifies the user-provided name and appends the first 8 chars of the
 * assistant UUID for uniqueness. Used as the DNS subdomain under
 * CLOUDFLARE_BASE_DOMAIN.
 *
 * Example: generateHostnameSlug("My Agent!", "a1b2c3d4-e5f6-...") → "my-agent-a1b2c3d4"
 */
export function generateHostnameSlug(
  name: string,
  assistantId: string,
): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      // strip combining marks (accents)
      .replace(/[\u0300-\u036f]/g, "")
      // anything not a-z or 0-9 becomes a hyphen
      .replace(/[^a-z0-9]+/g, "-")
      // trim leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/^-+|-+$/g, "") || "agent";

  return `${base}-${assistantId.slice(0, 8)}`;
}

/**
 * Builds the fully-qualified domain name from a slug and base domain.
 */
export function buildFqdn(slug: string, baseDomain: string): string {
  return `${slug}.${baseDomain}`;
}

/**
 * Extracts the subdomain from a stored FQDN given the stored base domain.
 * Returns null if the FQDN does not end with `.${baseDomain}`.
 */
export function extractSubdomain(
  fqdn: string,
  baseDomain: string,
): string | null {
  const suffix = `.${baseDomain}`;
  if (!fqdn.endsWith(suffix)) return null;
  return fqdn.slice(0, -suffix.length);
}
