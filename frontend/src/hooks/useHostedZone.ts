'use client';

import { useParams } from 'next/navigation';

import { useApi } from '@/hooks/useApi';
import { getHostedZone } from '@/lib/api';

/** Loads the hosted zone named by the `[zoneId]` route segment. */
export function useHostedZone() {
  const params = useParams<{ zoneId: string }>();
  const zoneId = params.zoneId;
  const state = useApi((signal) => getHostedZone(zoneId, signal), `zone:${zoneId}`);
  return { zoneId, ...state };
}
