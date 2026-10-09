import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Profiles' };

export default function Page() {
  return (
    <ComingSoon
      title="Profiles"
      description="Share Route 53 configurations across VPCs and AWS accounts."
    />
  );
}
