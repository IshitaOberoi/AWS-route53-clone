import type { Metadata } from 'next';
import { Suspense } from 'react';

import HostedZoneDetailsPage from '@/components/hosted-zones/HostedZoneDetailsPage';

export const metadata: Metadata = { title: 'Hosted zone details' };

export default function Page() {
  return (
    <Suspense>
      <HostedZoneDetailsPage />
    </Suspense>
  );
}
