import { describe, it, expect, vi } from "vitest";

// Mock the DB so importing credits.ts doesn't require DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

// canProvision now requires (orgId, planId) and hits the DB.
// The real integration is tested in credits.spec.ts.
// Here we just verify the module re-exports cleanly.
describe("Billing stubs re-export", () => {
  it("canProvision is exported", async () => {
    const { canProvision } = await import("@/lib/stripe/stubs");
    expect(typeof canProvision).toBe("function");
  });
});
