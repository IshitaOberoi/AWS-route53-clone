'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  /** Re-run the request (e.g. after a mutation). Keeps showing the previous data meanwhile. */
  reload: () => void;
}

/**
 * Runs `fetcher` whenever `key` changes, aborting the previous request. `key` should be a
 * stable string describing the request (e.g. the URL query), so effects re-run only when the
 * request actually changes.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, key: string): ApiState<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetcherRef
      .current(controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, loading, error, reload };
}
