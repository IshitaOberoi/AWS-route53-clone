'use client';

import { useMemo } from 'react';

import { useFlashContext } from '@/context/FlashContext';
import { ApiError } from '@/lib/api';

/** Convenience helpers around the global Flashbar. */
export function useFlash() {
  const { push, dismiss, clear } = useFlashContext();
  return useMemo(
    () => ({
      success: (content: string) => push({ type: 'success', content }),
      info: (content: string) => push({ type: 'info', content }),
      loading: (content: string, id?: string) => push({ type: 'in-progress', content, id }),
      error: (error: unknown, header?: string) =>
        push({
          type: 'error',
          header,
          content: errorMessage(error),
        }),
      dismiss,
      clear,
    }),
    [push, dismiss, clear],
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}
