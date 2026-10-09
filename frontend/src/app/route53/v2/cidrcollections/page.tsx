import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'CIDR collections' };

export default function Page() {
  return (
    <ComingSoon
      title="CIDR collections"
      description="Route traffic based on the IP addresses that DNS queries originate from."
    />
  );
}
