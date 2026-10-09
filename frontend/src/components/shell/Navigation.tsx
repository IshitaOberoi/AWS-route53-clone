'use client';

import SideNavigation from '@cloudscape-design/components/side-navigation';
import type { SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { useFollow } from '@/hooks/useFollow';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export const BASE = '/route53/v2';

interface SectionDef {
  text: string;
  items: { text: string; href: string }[];
}

// Same order as the Route 53 console navigation.
const TOP_LINKS: { text: string; href: string }[] = [
  { text: 'Dashboard', href: `${BASE}/dashboard` },
  { text: 'Hosted zones', href: `${BASE}/hostedzones` },
  { text: 'Health checks', href: `${BASE}/healthchecks` },
  { text: 'Profiles', href: `${BASE}/profiles` },
];

export const NAV_SECTIONS: SectionDef[] = [
  {
    text: 'IP-based routing',
    items: [{ text: 'CIDR collections', href: `${BASE}/cidrcollections` }],
  },
  {
    text: 'Traffic flow',
    items: [
      { text: 'Traffic policies', href: `${BASE}/trafficpolicies` },
      { text: 'Policy records', href: `${BASE}/policyrecords` },
    ],
  },
  {
    text: 'Domains',
    items: [
      { text: 'Registered domains', href: `${BASE}/domains` },
      { text: 'Requests', href: `${BASE}/domainrequests` },
    ],
  },
  {
    text: 'Resolver',
    items: [
      { text: 'VPCs', href: `${BASE}/resolver/vpcs` },
      { text: 'Inbound endpoints', href: `${BASE}/resolver/inbound-endpoints` },
      { text: 'Outbound endpoints', href: `${BASE}/resolver/outbound-endpoints` },
      { text: 'Rules', href: `${BASE}/resolver/rules` },
      { text: 'Query logging', href: `${BASE}/resolver/query-logging` },
    ],
  },
  {
    text: 'DNS Firewall',
    items: [
      { text: 'Rule groups', href: `${BASE}/dnsfirewall/rule-groups` },
      { text: 'Domain lists', href: `${BASE}/dnsfirewall/domain-lists` },
    ],
  },
];

/** The nav item to highlight for a path (detail pages highlight their list page). */
export function activeHrefFor(pathname: string): string {
  if (pathname.startsWith(`${BASE}/hostedzones`)) return `${BASE}/hostedzones`;
  return pathname.replace(/\/$/, '');
}

export default function Navigation() {
  const pathname = usePathname();
  const follow = useFollow();
  const [collapsed, setCollapsed, loaded] = useLocalStorage<string[]>(
    'r53.navCollapsedSections',
    [],
  );

  const items = useMemo<SideNavigationProps.Item[]>(
    () => [
      ...TOP_LINKS.map((link) => ({ type: 'link' as const, ...link })),
      { type: 'divider' as const },
      ...NAV_SECTIONS.map((section) => ({
        type: 'section' as const,
        text: section.text,
        defaultExpanded: !collapsed.includes(section.text),
        items: section.items.map((item) => ({ type: 'link' as const, ...item })),
      })),
    ],
    [collapsed],
  );

  return (
    <SideNavigation
      // Sections are uncontrolled: remount once the saved expanded/collapsed state is loaded.
      key={loaded ? 'restored' : 'default'}
      header={{ text: 'Route 53', href: `${BASE}/dashboard` }}
      activeHref={activeHrefFor(pathname)}
      items={items}
      onFollow={follow}
      onChange={({ detail }) => {
        if (detail.item.type !== 'section') return;
        const name = detail.item.text;
        setCollapsed(
          detail.expanded ? collapsed.filter((text) => text !== name) : [...collapsed, name],
        );
      }}
    />
  );
}
