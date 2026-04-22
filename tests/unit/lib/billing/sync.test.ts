import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/plans/catalog", () => ({ getPlanByStripePriceId: vi.fn() }));
vi.mock("@/lib/billing/credits", () => ({ releaseCredit: vi.fn() }));

import {
  mapStripeSubscriptionStatus,
  subStatusToCreditStatus,
} from "@/lib/billing/sync";

describe("mapStripeSubscriptionStatus", () => {
  it.each([
    ["active", "active"],
    ["trialing", "trialing"],
    ["past_due", "past_due"],
    ["canceled", "canceled"],
    ["unpaid", "unpaid"],
    ["incomplete", "incomplete"],
    ["incomplete_expired", "incomplete_expired"],
    ["paused", "past_due"],
  ])("%s → %s", (stripe, expected) => {
    expect(mapStripeSubscriptionStatus(stripe)).toBe(expected);
  });

  it("falls back to incomplete for unknown statuses", () => {
    expect(mapStripeSubscriptionStatus("totally-new-status")).toBe("incomplete");
  });
});

describe("subStatusToCreditStatus", () => {
  it.each([
    ["active", "active"],
    ["trialing", "trialing"],
    ["past_due", "past_due"],
    ["canceled", "canceled"],
    ["unpaid", "canceled"],
    ["incomplete", "incomplete"],
    ["incomplete_expired", "expired"],
  ] as const)("%s → %s", (sub, credit) => {
    expect(subStatusToCreditStatus(sub)).toBe(credit);
  });
});
