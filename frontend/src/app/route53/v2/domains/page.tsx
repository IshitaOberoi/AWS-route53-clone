import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Registered domains' };

export default function Page() {
  return <ComingSoon title="Registered domains" description="Register and manage domain names." />;
}
