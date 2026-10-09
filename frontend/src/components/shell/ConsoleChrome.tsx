'use client';

import type { AutosuggestProps } from '@cloudscape-design/components/autosuggest';
import Box from '@cloudscape-design/components/box';
import Spinner from '@cloudscape-design/components/spinner';
import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';

import ShortcutsModal from '@/components/shell/ShortcutsModal';
import TopNav from '@/components/shell/TopNav';
import { useRequireAuth } from '@/context/AuthContext';
import { useShortcuts } from '@/hooks/useShortcuts';

/** Everything shared by console pages: the auth gate and the top navigation. */
export default function ConsoleChrome({ children }: { children: ReactNode }) {
  const { status } = useRequireAuth();
  const searchRef = useRef<AutosuggestProps.Ref>(null);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  useShortcuts(focusSearch);

  // Render optimistically while the session is being verified (middleware already checked the
  // cookie exists); only an anonymous session blanks the page while we redirect to /login.
  if (status === 'anonymous') {
    return (
      <Box textAlign="center" padding={{ top: 'xxxl' }}>
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <>
      <TopNav searchRef={searchRef} />
      {children}
      <ShortcutsModal />
    </>
  );
}
