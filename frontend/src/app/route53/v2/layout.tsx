import type { ReactNode } from 'react';

import ConsoleChrome from '@/components/shell/ConsoleChrome';

export default function ConsoleRootLayout({ children }: { children: ReactNode }) {
  return <ConsoleChrome>{children}</ConsoleChrome>;
}
