import type { Metadata } from 'next';

import CreateRecordPage from '@/components/records/CreateRecordPage';

export const metadata: Metadata = { title: 'Create record' };

export default function Page() {
  return <CreateRecordPage />;
}
