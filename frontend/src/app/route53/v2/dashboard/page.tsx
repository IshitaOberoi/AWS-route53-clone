import type { Metadata } from 'next';

import ComingSoon from '@/components/common/ComingSoon';

export const metadata: Metadata = { title: 'Dashboard' };

export default function Page() {
  return <ComingSoon title="Dashboard" description="Get an overview of your Route 53 resources." />;
}
