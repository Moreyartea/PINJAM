import { useCallback, useEffect, useState } from "react";
import { ApiClientError, normalizeUnknownError } from "@/lib/api/errors";

export interface UseAsyncQueryOptions {
  enabled?: boolean;
}

export interface UseAsyncQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: ApiClientError | null;
  reload: () => void;
}

/**
 * Shared async data loader managing loading, normalized error, and manual reload
 * without triggering synchronous setState inside effects.
 */
export function useAsyncQuery<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
  options: UseAsyncQueryOptions = {}
): UseAsyncQueryResult<T> {
  const { enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    async function execute() {
      try {
        const result = await fetcher();
        if (!active) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(normalizeUnknownError(err));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void execute();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadTick, ...deps]);

  return {
    data,
    loading: enabled ? loading : false,
    error,
    reload,
  };
}
