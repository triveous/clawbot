import { describe, it, expect } from "vitest";
import {
  generateHostnameSlug,
  buildFqdn,
  extractSubdomain,
} from "@/lib/workflows/slug";

const ID = "a1b2c3d4-e5f6-7890-abcd-ef0123456789";
const ID_SHORT = "a1b2c3d4";

describe("generateHostnameSlug", () => {
  it("slugifies basic name and appends id suffix", () => {
    expect(generateHostnameSlug("My Agent", ID)).toBe(`my-agent-${ID_SHORT}`);
  });

  it("lowercases and converts symbols to hyphens", () => {
    expect(generateHostnameSlug("My Agent!!!", ID)).toBe(
      `my-agent-${ID_SHORT}`,
    );
  });

  it("strips unicode accents", () => {
    expect(generateHostnameSlug("Café Déjà vu", ID)).toBe(
      `cafe-deja-vu-${ID_SHORT}`,
    );
  });

  it("collapses runs of whitespace and punctuation", () => {
    expect(generateHostnameSlug("   foo   ---  bar  ", ID)).toBe(
      `foo-bar-${ID_SHORT}`,
    );
  });

  it("falls back to 'agent' when name contains no alphanumerics", () => {
    expect(generateHostnameSlug("!!!", ID)).toBe(`agent-${ID_SHORT}`);
    expect(generateHostnameSlug("", ID)).toBe(`agent-${ID_SHORT}`);
    expect(generateHostnameSlug("   ", ID)).toBe(`agent-${ID_SHORT}`);
  });

  it("clamps base to 40 characters", () => {
    const long = "a".repeat(100);
    const slug = generateHostnameSlug(long, ID);
    const base = slug.slice(0, slug.lastIndexOf(`-${ID_SHORT}`));
    expect(base.length).toBe(40);
    expect(slug).toBe(`${"a".repeat(40)}-${ID_SHORT}`);
  });

  it("does not leave a trailing hyphen after truncation", () => {
    // 39 'a's, then hyphen, then more — truncation at 40 would land on the hyphen
    const name = `${"a".repeat(39)} bravo`;
    const slug = generateHostnameSlug(name, ID);
    const base = slug.slice(0, slug.lastIndexOf(`-${ID_SHORT}`));
    expect(base.endsWith("-")).toBe(false);
  });

  it("handles numbers correctly", () => {
    expect(generateHostnameSlug("agent-42", ID)).toBe(`agent-42-${ID_SHORT}`);
  });
});

describe("buildFqdn", () => {
  it("joins slug and base with a dot", () => {
    expect(buildFqdn("foo-a1b2c3d4", "example.io")).toBe(
      "foo-a1b2c3d4.example.io",
    );
  });
});

describe("extractSubdomain", () => {
  it("strips the base domain suffix", () => {
    expect(
      extractSubdomain("my-agent-a1b2c3d4.example.io", "example.io"),
    ).toBe("my-agent-a1b2c3d4");
  });

  it("returns null when suffix does not match", () => {
    expect(
      extractSubdomain("my-agent-a1b2c3d4.other.io", "example.io"),
    ).toBeNull();
  });
});
