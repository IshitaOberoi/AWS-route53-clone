import '@cloudscape-design/global-styles/index.css';
import './globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import Providers from '@/app/providers';
import { THEME_BOOT_SCRIPT } from '@/context/theme-boot';

export const metadata: Metadata = {
  title: {
    default: 'Route 53 Clone',
    template: '%s | Route 53 Clone',
  },
  description: 'A functional clone of the Amazon Route 53 console (hosted zones and DNS records).',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Apply the saved light/dark mode before first paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
