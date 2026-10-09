import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Health checks' };

export default function Page() {
  return (
    <ComingSoon
      title="Health checks"
      description="Monitor the health and performance of your web applications, web servers and other resources."
    />
  );
}
