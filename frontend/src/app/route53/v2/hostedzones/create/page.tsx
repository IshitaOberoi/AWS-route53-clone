import type { Metadata } from 'next';

import CreateHostedZoneForm from '@/components/hosted-zones/CreateHostedZoneForm';
import ConsoleLayout from '@/components/shell/ConsoleLayout';

export const metadata: Metadata = { title: 'Create hosted zone' };

export default function CreateHostedZonePage() {
  return (
    <ConsoleLayout
      contentType="form"
      helpTopic="create-hosted-zone"
      breadcrumbs={[
        { text: 'Hosted zones', href: '/route53/v2/hostedzones' },
        { text: 'Create hosted zone', href: '/route53/v2/hostedzones/create' },
      ]}
    >
      <CreateHostedZoneForm />
    </ConsoleLayout>
  );
}
