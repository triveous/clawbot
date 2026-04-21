import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

describe("Database Schema", () => {
  it("should export users table", () => {
    expect(schema.users).toBeDefined();
    expect(getTableName(schema.users)).toBe("users");
  });

  it("should export organizations table", () => {
    expect(schema.organizations).toBeDefined();
    expect(getTableName(schema.organizations)).toBe("organizations");
  });

  it("should export plans table", () => {
    expect(schema.plans).toBeDefined();
    expect(getTableName(schema.plans)).toBe("plans");
  });

  it("should export assistants table", () => {
    expect(schema.assistants).toBeDefined();
    expect(getTableName(schema.assistants)).toBe("assistants");
  });

  it("should export instances table", () => {
    expect(schema.instances).toBeDefined();
    expect(getTableName(schema.instances)).toBe("instances");
  });

  it("should export assistant_credits table", () => {
    expect(schema.assistantCredits).toBeDefined();
    expect(getTableName(schema.assistantCredits)).toBe("assistant_credits");
  });

  it("should export instance_events table", () => {
    expect(schema.instanceEvents).toBeDefined();
    expect(getTableName(schema.instanceEvents)).toBe("instance_events");
  });

  it("should export snapshots table", () => {
    expect(schema.snapshots).toBeDefined();
    expect(getTableName(schema.snapshots)).toBe("snapshots");
  });

  it("should export assistant_credentials table", () => {
    expect(schema.assistantCredentials).toBeDefined();
    expect(getTableName(schema.assistantCredentials)).toBe("assistant_credentials");
  });

  it("should export assistant status enum values", () => {
    expect(schema.assistantStatusEnum.enumValues).toEqual([
      "creating",
      "active",
      "error",
      "stopped",
    ]);
  });

  it("should export instance status enum values", () => {
    expect(schema.instanceStatusEnum.enumValues).toEqual([
      "creating",
      "provisioning",
      "running",
      "stopped",
      "error",
      "destroyed",
    ]);
  });

  it("should export provider enum values", () => {
    expect(schema.providerEnum.enumValues).toEqual(["hetzner"]);
  });

  it("should export credit status enum values", () => {
    expect(schema.creditStatusEnum.enumValues).toEqual([
      "incomplete",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "expired",
    ]);
  });
});
