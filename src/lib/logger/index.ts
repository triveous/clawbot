import {
  configureSync,
  getConsoleSink,
  getLogger as _getLogger,
  getJsonLinesFormatter,
  getAnsiColorFormatter,
  isLogLevel,
  type Logger,
  type LogLevel,
} from "@logtape/logtape";

const isProduction = process.env.NODE_ENV === "production";
const isTest = !!process.env.VITEST;

function resolveLogLevel(): LogLevel {
  const env = process.env.LOG_LEVEL;
  if (env && isLogLevel(env)) return env;
  return isProduction ? "info" : "debug";
}

/**
 * Dev formatter: ANSI-colored default + structured properties appended as
 * `key=value` pairs, so context (requestId, status, durationMs, etc.) is
 * visible in the terminal, not silently dropped.
 */
const prettyFormatter = getAnsiColorFormatter({
  format: ({ timestamp, level, category, message, record }) => {
    const base = `${timestamp} ${level} ${category}: ${message}`;
    const props = record.properties;
    if (!props || Object.keys(props).length === 0) return base;
    const pairs = Object.entries(props)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    return `${base} \x1b[2m${pairs}\x1b[0m`;
  },
});

configureSync({
  reset: true,
  sinks: {
    console: getConsoleSink({
      formatter: isProduction
        ? getJsonLinesFormatter({ properties: "flatten" })
        : prettyFormatter,
    }),
  },
  loggers: [
    {
      category: ["snapclaw"],
      sinks: isTest ? [] : ["console"],
      lowestLevel: resolveLogLevel(),
    },
    // Silence LogTape's internal meta logger (startup noise, sink diagnostics).
    // It inherits "console" sink by default; setting lowestLevel: "warning"
    // suppresses the startup "LogTape loggers are configured" info message.
    {
      category: ["logtape", "meta"],
      sinks: ["console"],
      lowestLevel: "warning",
    },
  ],
});

export function getLogger(...category: string[]): Logger {
  return _getLogger(["snapclaw", ...category]);
}

export type { Logger };
