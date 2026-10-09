'use client';

import type { AutosuggestProps } from '@cloudscape-design/components/autosuggest';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import type { TopNavigationProps } from '@cloudscape-design/components/top-navigation';
import { useRouter } from 'next/navigation';
import type { RefObject } from 'react';

import { BASE } from '@/components/shell/Navigation';
import TopNavSearch from '@/components/shell/TopNavSearch';
import { useAuth } from '@/context/AuthContext';
import { useShell } from '@/context/ShellContext';
import { useTheme } from '@/context/ThemeContext';
import type { ThemePreference } from '@/context/ThemeContext';
import { useFlash } from '@/hooks/useFlash';
import { formatAccountId } from '@/lib/format';

export const TOP_NAV_ID = 'r53-top-navigation';

const THEME_OPTIONS: { id: ThemePreference; text: string }[] = [
  { id: 'light', text: 'Light' },
  { id: 'dark', text: 'Dark' },
  { id: 'system', text: 'System' },
];

export default function TopNav({
  searchRef,
}: {
  searchRef: RefObject<AutosuggestProps.Ref | null>;
}) {
  const { user, signOut } = useAuth();
  const { preference, setPreference } = useTheme();
  const { setShortcutsOpen } = useShell();
  const flash = useFlash();
  const router = useRouter();
  const accountId = user ? formatAccountId(user.account_id) : '';

  const utilities: TopNavigationProps.Utility[] = [
    {
      type: 'menu-dropdown',
      text: 'Global',
      description: 'Route 53 is a global service',
      ariaLabel: 'Region: Global',
      items: [
        {
          id: 'global',
          text: 'Global',
          description: 'Route 53 does not require a Region selection',
          disabled: true,
        },
      ],
    },
    {
      type: 'button',
      iconName: 'notification',
      title: 'Notifications',
      ariaLabel: 'Notifications',
      disableUtilityCollapse: false,
      onClick: () => flash.info('You have no new notifications.'),
    },
    {
      type: 'menu-dropdown',
      iconName: 'settings',
      title: 'Settings',
      ariaLabel: 'Settings',
      items: [
        {
          id: 'theme',
          text: 'Theme',
          items: THEME_OPTIONS.map((option) => ({
            id: `theme-${option.id}`,
            text: option.text,
            itemType: 'checkbox' as const,
            checked: preference === option.id,
          })),
        },
        { id: 'shortcuts', text: 'Keyboard shortcuts' },
      ],
      onItemClick: ({ detail }) => {
        if (detail.id === 'shortcuts') {
          setShortcutsOpen(true);
          return;
        }
        const theme = THEME_OPTIONS.find((option) => `theme-${option.id}` === detail.id);
        if (theme) setPreference(theme.id);
      },
    },
    {
      type: 'menu-dropdown',
      text: user?.display_name ?? 'Account',
      description: accountId ? `Account ID: ${accountId}` : undefined,
      iconName: 'user-profile',
      ariaLabel: 'Account menu',
      items: [
        {
          id: 'account-id',
          text: `Account ID: ${accountId}`,
          iconName: 'copy',
          description: 'Copy account ID',
        },
        { id: 'signout', text: 'Sign out' },
      ],
      onItemClick: ({ detail }) => {
        if (detail.id === 'signout') {
          void signOut();
        } else if (detail.id === 'account-id' && user) {
          void navigator.clipboard
            ?.writeText(user.account_id)
            .then(() => flash.success('Account ID copied to clipboard.'))
            .catch(() => flash.info(`Account ID: ${accountId}`));
        }
      },
    },
  ];

  return (
    <div id={TOP_NAV_ID} className="r53-top-navigation">
      <TopNavigation
        identity={{
          href: `${BASE}/hostedzones`,
          title: 'Route 53 Clone',
          onFollow: (event) => {
            event.preventDefault();
            router.push(`${BASE}/hostedzones`);
          },
        }}
        search={<TopNavSearch ref={searchRef} />}
        utilities={utilities}
        i18nStrings={{
          searchIconAriaLabel: 'Search',
          searchDismissIconAriaLabel: 'Close search',
          overflowMenuTriggerText: 'More',
          overflowMenuTitleText: 'All',
          overflowMenuBackIconAriaLabel: 'Back',
          overflowMenuDismissIconAriaLabel: 'Close menu',
        }}
      />
    </div>
  );
}
