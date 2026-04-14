import { describe, it, expect } from "vitest";
import { canProvision } from "@/lib/stripe/stubs";

describe("Cross-phase stubs", () => {
  it("canProvision should return true (stub)", async () => {
    const result = await canProvision("test-user-id");
    expect(result).toBe(true);
  });
});
