import type { Metadata } from 'next';

import EditHostedZonePage from '@/components/hosted-zones/EditHostedZonePage';

export const metadata: Metadata = { title: 'Edit hosted zone' };

export default function Page() {
  return <EditHostedZonePage />;
}
