import { describe, it, expect } from "vitest";
import { PLANS } from "@/types/billing";

describe("Billing types", () => {
  it("should define all plan tiers", () => {
    expect(PLANS.starter).toBeDefined();
    expect(PLANS.pro).toBeDefined();
    expect(PLANS.power).toBeDefined();
  });

  it("should have correct pricing", () => {
    expect(PLANS.starter.priceMonthly).toBe(19);
    expect(PLANS.pro.priceMonthly).toBe(39);
    expect(PLANS.power.priceMonthly).toBe(79);
  });

  it("should have features for each plan", () => {
    expect(PLANS.starter.features.length).toBeGreaterThan(0);
    expect(PLANS.pro.features.length).toBeGreaterThan(0);
    expect(PLANS.power.features.length).toBeGreaterThan(0);
  });
});
