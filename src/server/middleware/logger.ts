import type { Context, Next } from "hono";
import { getLogger, type Logger } from "@/lib/logger";

const log = getLogger("server");

export function requestLogger() {
  return async (c: Context, next: Next) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const method = c.req.method;
    const path = c.req.path;

    const requestLog = log.with({ requestId, method, path });

    c.set("requestId", requestId);
    c.set("logger", requestLog);
    c.header("X-Request-Id", requestId);

    const start = performance.now();

    await next();

    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;

    if (status >= 500) {
      requestLog.error("Request completed", { status, durationMs });
    } else if (status >= 400) {
      requestLog.warn("Request completed", { status, durationMs });
    } else {
      requestLog.info("Request completed", { status, durationMs });
    }
  };
}

// Extend Hono context type
declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
    logger: Logger;
  }
}
