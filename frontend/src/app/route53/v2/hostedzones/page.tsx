import type { Metadata } from 'next';
import { Suspense } from 'react';

import HostedZonesTable from '@/components/hosted-zones/HostedZonesTable';
import ConsoleLayout from '@/components/shell/ConsoleLayout';

export const metadata: Metadata = { title: 'Hosted zones' };

export default function HostedZonesPage() {
  return (
    <ConsoleLayout
      contentType="table"
      helpTopic="hosted-zones"
      breadcrumbs={[{ text: 'Hosted zones', href: '/route53/v2/hostedzones' }]}
    >
      <Suspense>
        <HostedZonesTable />
      </Suspense>
    </ConsoleLayout>
  );
}
