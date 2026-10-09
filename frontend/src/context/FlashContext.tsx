'use client';

import type { FlashbarProps } from '@cloudscape-design/components/flashbar';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export const SUCCESS_AUTO_DISMISS_MS = 8000;

export interface FlashInput {
  type: 'success' | 'error' | 'info' | 'warning' | 'in-progress';
  content: ReactNode;
  header?: ReactNode;
  /** Optional stable id so a later message can replace an earlier one (e.g. loading → done). */
  id?: string;
}

interface FlashContextValue {
  items: FlashbarProps.MessageDefinition[];
  push: (flash: FlashInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const FlashContext = createContext<FlashContextValue | null>(null);

let counter = 0;
const nextId = () => `flash-${Date.now()}-${(counter += 1)}`;

export function FlashProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (flash: FlashInput) => {
      const id = flash.id ?? nextId();
      const loading = flash.type === 'in-progress';
      const item: FlashbarProps.MessageDefinition = {
        id,
        type: loading ? 'info' : flash.type,
        loading,
        header: flash.header,
        content: flash.content,
        dismissible: !loading,
        dismissLabel: 'Dismiss message',
        onDismiss: () => dismiss(id),
      };
      setItems((current) => [item, ...current.filter((existing) => existing.id !== id)]);
      const existingTimer = timers.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      timers.current.delete(id);
      if (flash.type === 'success') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), SUCCESS_AUTO_DISMISS_MS),
        );
      }
      return id;
    },
    [dismiss],
  );

  const clear = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ items, push, dismiss, clear }), [items, push, dismiss, clear]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useFlashContext(): FlashContextValue {
  const context = useContext(FlashContext);
  if (!context) throw new Error('useFlash must be used inside FlashProvider');
  return context;
}
