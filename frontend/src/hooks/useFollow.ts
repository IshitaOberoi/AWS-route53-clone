'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

interface FollowEvent {
  preventDefault: () => void;
  detail: { href?: string; external?: boolean };
}

/**
 * Cloudscape links, breadcrumbs and side navigation render real <a href> elements. This turns
 * a plain click into client-side navigation while keeping cmd/ctrl-click "open in new tab".
 */
export function useFollow() {
  const router = useRouter();
  return useCallback(
    (event: FollowEvent) => {
      const href = event.detail.href;
      if (!href || event.detail.external || href.startsWith('http')) return;
      event.preventDefault();
      router.push(href);
    },
    [router],
  );
}
