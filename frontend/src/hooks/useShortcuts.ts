'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { BASE } from '@/components/shell/Navigation';
import { useShell } from '@/context/ShellContext';
import { useTheme } from '@/context/ThemeContext';

export interface ShortcutDefinition {
  keys: string[];
  description: string;
}

/** Shown in the "Keyboard shortcuts" modal (AGENTS.md §8). */
export const SHORTCUTS: ShortcutDefinition[] = [
  { keys: ['?'], description: 'Show keyboard shortcuts' },
  { keys: ['/'], description: 'Focus the filter on the current page' },
  { keys: ['Alt', 'S'], description: 'Focus the search box in the top navigation' },
  {
    keys: ['c'],
    description: 'Create (hosted zone on the list page, record on a hosted zone page)',
  },
  { keys: ['g', 'h'], description: 'Go to Hosted zones' },
  { keys: ['g', 'd'], description: 'Go to Dashboard' },
  { keys: ['Shift', 'D'], description: 'Toggle dark mode' },
  { keys: ['Delete'], description: 'Delete the selected records (hosted zone page)' },
  { keys: ['Esc'], description: 'Close the record details panel or the open dialog' },
];

const SEQUENCE_TIMEOUT_MS = 1200;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(target.closest('[role="combobox"], [role="listbox"], [role="menu"]'));
}

function modalOpen(): boolean {
  // Cloudscape keeps closed modals in the DOM but hidden, so check visibility.
  return Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"]:not([aria-hidden="true"])'),
  ).some((dialog) => dialog.getClientRects().length > 0);
}

/** Global keyboard shortcuts. Ignored while typing or while a modal dialog is open. */
export function useShortcuts(focusSearch: () => void): void {
  const router = useRouter();
  const { setShortcutsOpen, pageActions } = useShell();
  const { toggle } = useTheme();
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;

      // Alt+S works even while typing elsewhere, like the console.
      if (event.altKey && event.code === 'KeyS') {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (event.altKey) return;
      if (modalOpen()) return;
      if (isTyping(event.target)) return;

      const actions = pageActions.current;
      const key = event.key;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        if (key === 'h') {
          event.preventDefault();
          router.push(`${BASE}/hostedzones`);
          return;
        }
        if (key === 'd') {
          event.preventDefault();
          router.push(`${BASE}/dashboard`);
          return;
        }
      }

      switch (key) {
        case '?':
          event.preventDefault();
          setShortcutsOpen(true);
          break;
        case '/':
          event.preventDefault();
          if (actions.focusFilter) actions.focusFilter();
          else focusSearch();
          break;
        case 'c':
          if (actions.create) {
            event.preventDefault();
            actions.create();
          }
          break;
        case 'g':
          pendingG.current = window.setTimeout(() => {
            pendingG.current = null;
          }, SEQUENCE_TIMEOUT_MS);
          break;
        case 'D':
          if (event.shiftKey) {
            event.preventDefault();
            toggle();
          }
          break;
        case 'Delete':
          if (actions.deleteSelection) {
            event.preventDefault();
            actions.deleteSelection();
          }
          break;
        case 'Escape':
          actions.escape?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (pendingG.current !== null) window.clearTimeout(pendingG.current);
    };
  }, [router, setShortcutsOpen, pageActions, toggle, focusSearch]);
}
