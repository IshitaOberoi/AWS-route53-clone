'use client';

import { I18nProvider } from '@cloudscape-design/components/i18n';
import enMessages from '@cloudscape-design/components/i18n/messages/all.en';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/context/AuthContext';
import { FlashProvider } from '@/context/FlashContext';
import { ShellProvider } from '@/context/ShellContext';
import { ThemeProvider } from '@/context/ThemeContext';

export default function Providers({ children }: { children: ReactNode }) {
  return (
    // Built-in English strings for every Cloudscape component (aria labels, filter texts…).
    <I18nProvider locale="en" messages={[enMessages]}>
      <ThemeProvider>
        <AuthProvider>
          <FlashProvider>
            <ShellProvider>{children}</ShellProvider>
          </FlashProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
