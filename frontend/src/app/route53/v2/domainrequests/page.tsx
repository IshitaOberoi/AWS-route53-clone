import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Requests' };

export default function Page() {
  return (
    <ComingSoon
      title="Requests"
      description="Track the status of domain registration and transfer requests."
    />
  );
}
