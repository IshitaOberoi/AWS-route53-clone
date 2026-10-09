'use client';

import EditHostedZoneForm from '@/components/hosted-zones/EditHostedZoneForm';
import ConsoleLayout from '@/components/shell/ConsoleLayout';
import { BASE } from '@/components/shell/Navigation';
import { useHostedZone } from '@/hooks/useHostedZone';
import { displayZoneName } from '@/lib/format';

export default function EditHostedZonePage() {
  const { zoneId, data: zone, loading, error } = useHostedZone();
  const detailsHref = `${BASE}/hostedzones/${zoneId}`;
  return (
    <ConsoleLayout
      contentType="form"
      helpTopic="edit-hosted-zone"
      breadcrumbs={[
        { text: 'Hosted zones', href: `${BASE}/hostedzones` },
        { text: zone ? displayZoneName(zone.name) : zoneId, href: detailsHref },
        { text: 'Edit hosted zone', href: `${detailsHref}/edit` },
      ]}
    >
      <EditHostedZoneForm zone={zone} loading={loading} loadError={error} />
    </ConsoleLayout>
  );
}
