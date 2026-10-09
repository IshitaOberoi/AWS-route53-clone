import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Traffic policies' };

export default function Page() {
  return (
    <ComingSoon
      title="Traffic policies"
      description="Create complex routing configurations with a visual editor."
    />
  );
}
