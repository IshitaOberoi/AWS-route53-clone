import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Policy records' };

export default function Page() {
  return (
    <ComingSoon
      title="Policy records"
      description="Records that associate a traffic policy with a domain name."
    />
  );
}
