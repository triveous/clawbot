"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface UseAsyncActionOptions {
  successToast?: string | ((result: unknown) => string) | false;
  errorToast?: string | ((err: unknown) => string) | false;
  minLoadingMs?: number;
  loadingDelayMs?: number;
}

export interface UseAsyncAction<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  loading: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * Wrap an async function with loading / error state and optional toasts.
 * - Defers the `loading=true` flip by `loadingDelayMs` (default 120ms) so
 *   sub-200ms requests never flash a spinner.
 * - Holds `loading=true` for at least `minLoadingMs` once it has been shown.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: UseAsyncActionOptions = {},
): UseAsyncAction<TArgs, TResult> {
  const {
    successToast,
    errorToast,
    minLoadingMs = 0,
    loadingDelayMs = 120,
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: TArgs) => {
      setError(null);
      const startedAt = Date.now();
      let shownAt: number | null = null;
      const showTimer: ReturnType<typeof setTimeout> = setTimeout(() => {
        if (mounted.current) {
          shownAt = Date.now();
          setLoading(true);
        }
      }, loadingDelayMs);

      try {
        const result = await fn(...args);
        if (successToast !== false && successToast !== undefined) {
          const msg =
            typeof successToast === "function"
              ? successToast(result)
              : successToast;
          if (msg) toast.success(msg);
        }
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (mounted.current) setError(e);
        if (errorToast === false) {
          // explicitly suppressed
        } else if (errorToast !== undefined) {
          const msg = typeof errorToast === "function" ? errorToast(e) : errorToast;
          if (msg) toast.error(msg);
        } else {
          toast.error(e.message || "Something went wrong");
        }
        throw e;
      } finally {
        clearTimeout(showTimer);
        const finish = () => {
          if (mounted.current) setLoading(false);
        };
        if (shownAt !== null) {
          const shownFor = Date.now() - shownAt;
          const remaining = Math.max(0, minLoadingMs - shownFor);
          if (remaining > 0) setTimeout(finish, remaining);
          else finish();
        } else {
          // never flipped to true (fast path)
          const elapsed = Date.now() - startedAt;
          void elapsed;
          finish();
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return { run, loading, error, reset };
}
