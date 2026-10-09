'use client';

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

import type { HelpTopic } from '@/components/shell/help-content';
import { useLocalStorage } from '@/hooks/useLocalStorage';

/** Actions the current page exposes to keyboard shortcuts (c, /, Delete, Esc). */
export interface PageActions {
  create?: () => void;
  focusFilter?: () => void;
  deleteSelection?: () => void;
  escape?: () => void;
}

interface ShellContextValue {
  navigationOpen: boolean;
  setNavigationOpen: (open: boolean) => void;
  toolsOpen: boolean;
  setToolsOpen: (open: boolean) => void;
  helpTopic: HelpTopic | null;
  /** Opens the help panel (tools drawer) on a topic — what every "Info" link does. */
  openHelp: (topic: HelpTopic) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  pageActions: React.RefObject<PageActions>;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [navigationOpen, setNavigationOpen] = useLocalStorage('r53.navigationOpen', true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const pageActions = useRef<PageActions>({});

  const openHelp = useCallback((topic: HelpTopic) => {
    setHelpTopic(topic);
    setToolsOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      navigationOpen,
      setNavigationOpen,
      toolsOpen,
      setToolsOpen,
      helpTopic,
      openHelp,
      shortcutsOpen,
      setShortcutsOpen,
      pageActions,
    }),
    [navigationOpen, setNavigationOpen, toolsOpen, helpTopic, openHelp, shortcutsOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const context = useContext(ShellContext);
  if (!context) throw new Error('useShell must be used inside ShellProvider');
  return context;
}

/**
 * Registers the current page's shortcut actions while it is mounted. The latest callbacks are
 * always used, so pages can pass inline functions.
 */
export function usePageActions(actions: PageActions): void {
  const { pageActions } = useShell();
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    const proxy: PageActions = {
      create: () => latest.current.create?.(),
      focusFilter: () => latest.current.focusFilter?.(),
      deleteSelection: () => latest.current.deleteSelection?.(),
      escape: () => latest.current.escape?.(),
    };
    pageActions.current = proxy;
    return () => {
      if (pageActions.current === proxy) pageActions.current = {};
    };
  }, [pageActions]);
}
