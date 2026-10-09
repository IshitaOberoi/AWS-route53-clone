'use client';

import ComingSoon from '@/components/common/ComingSoon';
import { BASE, NAV_SECTIONS } from '@/components/shell/Navigation';

/**
 * Placeholder for a whole navigation section (Resolver, DNS Firewall): one route family,
 * with the page title taken from the matching side-navigation item.
 */
export default function SectionPlaceholder({
  section,
  slug,
  segments,
}: {
  section: string;
  slug: string;
  segments: string[];
}) {
  const nav = NAV_SECTIONS.find((item) => item.text === section);
  const sectionHref = `${BASE}/${slug}`;
  const href = segments.length ? `${sectionHref}/${segments.join('/')}` : sectionHref;
  const page = nav?.items.find((item) => item.href === href);
  const title = page ? `${section}: ${page.text}` : section;
  return (
    <ComingSoon
      title={title}
      breadcrumbs={
        page
          ? [
              { text: section, href: nav?.items[0]?.href ?? sectionHref },
              { text: page.text, href },
            ]
          : [{ text: section, href: sectionHref }]
      }
    />
  );
}
