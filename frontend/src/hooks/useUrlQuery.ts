'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export type QueryPatch = Record<string, string | string[] | number | null | undefined>;

/**
 * Table state (page, sort, filters) lives in the URL so it's shareable and the back button
 * works. `update` merges a patch into the current query string.
 */
export function useUrlQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const update = useCallback(
    (patch: QueryPatch, { replace = false }: { replace?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (value === null || value === undefined || value === '') continue;
        if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
        else next.set(key, String(value));
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router],
  );

  return { params, update };
}

export function intParam(value: string | null, fallback: number, allowed?: number[]): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  if (allowed && !allowed.includes(parsed)) return fallback;
  return parsed;
}
