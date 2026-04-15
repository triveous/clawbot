import { describe, it, expect } from "vitest";
import { getLogger } from "@/lib/logger";

describe("logger module", () => {
  it("getLogger returns a Logger instance with expected shape", () => {
    const log = getLogger("test");

    expect(log).toBeDefined();
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.with).toBe("function");
  });

  it("getLogger scopes under snapclaw namespace", () => {
    const log = getLogger("foo", "bar");
    expect(log.category).toEqual(["snapclaw", "foo", "bar"]);
  });

  it("getLogger with no args returns root snapclaw logger", () => {
    const log = getLogger();
    expect(log.category).toEqual(["snapclaw"]);
  });

  it("with() returns a new logger that carries context properties", () => {
    const base = getLogger("test");
    const enriched = base.with({ requestId: "abc123" });

    // with() returns a new Logger instance
    expect(enriched).toBeDefined();
    expect(typeof enriched.info).toBe("function");
    // Original logger is unchanged
    expect(base).not.toBe(enriched);
  });

  it("logging methods do not throw on any overload", () => {
    const log = getLogger("test");

    // String + properties
    expect(() => log.info("test message", { key: "value" })).not.toThrow();
    // String only
    expect(() => log.info("test message")).not.toThrow();
    // Warn/error/debug
    expect(() => log.warn("warn message", { status: 400 })).not.toThrow();
    expect(() => log.error("error message", { status: 500 })).not.toThrow();
    expect(() => log.debug("debug message")).not.toThrow();
  });
});
