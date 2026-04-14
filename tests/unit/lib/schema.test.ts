import { describe, it, expect } from "vitest";
import { getTableName } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

describe("Database Schema", () => {
  it("should export users table", () => {
    expect(schema.users).toBeDefined();
    expect(getTableName(schema.users)).toBe("users");
  });

  it("should export assistants table", () => {
    expect(schema.assistants).toBeDefined();
    expect(getTableName(schema.assistants)).toBe("assistants");
  });

  it("should export subscriptions table", () => {
    expect(schema.subscriptions).toBeDefined();
    expect(getTableName(schema.subscriptions)).toBe("subscriptions");
  });

  it("should export snapshots table", () => {
    expect(schema.snapshots).toBeDefined();
    expect(getTableName(schema.snapshots)).toBe("snapshots");
  });

  it("should export assistant status enum values", () => {
    expect(schema.assistantStatusEnum.enumValues).toEqual([
      "creating",
      "provisioning",
      "running",
      "stopped",
      "error",
    ]);
  });

  it("should export provider enum values", () => {
    expect(schema.providerEnum.enumValues).toEqual(["hetzner"]);
  });

  it("should export assistant_credentials table", () => {
    expect(schema.assistantCredentials).toBeDefined();
    expect(getTableName(schema.assistantCredentials)).toBe("assistant_credentials");
  });
});
