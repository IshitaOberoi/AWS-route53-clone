'use client';

import AppLayoutToolbar from '@cloudscape-design/components/app-layout-toolbar';
import type { AppLayoutProps } from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import Flashbar from '@cloudscape-design/components/flashbar';
import type { ReactNode } from 'react';

import { HelpContent } from '@/components/shell/help-content';
import type { HelpTopic } from '@/components/shell/help-content';
import Navigation from '@/components/shell/Navigation';
import { TOP_NAV_ID } from '@/components/shell/TopNav';
import { useFlashContext } from '@/context/FlashContext';
import { useShell } from '@/context/ShellContext';
import { useFollow } from '@/hooks/useFollow';

export interface Crumb {
  text: string;
  href: string;
}

export const ROOT_CRUMB: Crumb = { text: 'Route 53', href: '/route53/v2/dashboard' };

interface ConsoleLayoutProps {
  breadcrumbs: Crumb[];
  contentType: AppLayoutProps.ContentType;
  helpTopic: HelpTopic;
  children: ReactNode;
  splitPanel?: ReactNode;
  splitPanelOpen?: boolean;
  onSplitPanelToggle?: (open: boolean) => void;
  splitPanelPreferences?: AppLayoutProps.SplitPanelPreferences;
  onSplitPanelPreferencesChange?: (preferences: AppLayoutProps.SplitPanelPreferences) => void;
}

const FLASHBAR_I18N = {
  ariaLabel: 'Notifications',
  notificationBarText: 'Notifications',
  notificationBarAriaLabel: 'View all notifications',
  errorIconAriaLabel: 'Error',
  successIconAriaLabel: 'Success',
  warningIconAriaLabel: 'Warning',
  infoIconAriaLabel: 'Info',
  inProgressIconAriaLabel: 'In progress',
};

/** Route 53 console chrome for one page: navigation, breadcrumbs, flashbar and help panel. */
export default function ConsoleLayout({
  breadcrumbs,
  contentType,
  helpTopic,
  children,
  splitPanel,
  splitPanelOpen,
  onSplitPanelToggle,
  splitPanelPreferences,
  onSplitPanelPreferencesChange,
}: ConsoleLayoutProps) {
  const shell = useShell();
  const { items } = useFlashContext();
  const follow = useFollow();

  return (
    <AppLayoutToolbar
      headerSelector={`#${TOP_NAV_ID}`}
      contentType={contentType}
      navigation={<Navigation />}
      navigationOpen={shell.navigationOpen}
      onNavigationChange={({ detail }) => shell.setNavigationOpen(detail.open)}
      tools={<HelpContent topic={shell.helpTopic ?? helpTopic} />}
      toolsOpen={shell.toolsOpen}
      onToolsChange={({ detail }) => shell.setToolsOpen(detail.open)}
      breadcrumbs={
        <BreadcrumbGroup
          items={[ROOT_CRUMB, ...breadcrumbs]}
          onFollow={follow}
          ariaLabel="Breadcrumbs"
          expandAriaLabel="Show path"
        />
      }
      notifications={<Flashbar items={items} stackItems i18nStrings={FLASHBAR_I18N} />}
      stickyNotifications
      splitPanel={splitPanel}
      splitPanelOpen={splitPanelOpen}
      onSplitPanelToggle={({ detail }) => onSplitPanelToggle?.(detail.open)}
      splitPanelPreferences={splitPanelPreferences}
      onSplitPanelPreferencesChange={({ detail }) => onSplitPanelPreferencesChange?.(detail)}
      ariaLabels={{
        navigation: 'Side navigation',
        navigationClose: 'Close side navigation',
        navigationToggle: 'Open side navigation',
        notifications: 'Notifications',
        tools: 'Help panel',
        toolsClose: 'Close help panel',
        toolsToggle: 'Open help panel',
      }}
      content={children}
    />
  );
}
