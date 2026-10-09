'use client';

import Box from '@cloudscape-design/components/box';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';

import ConsoleLayout from '@/components/shell/ConsoleLayout';
import type { Crumb } from '@/components/shell/ConsoleLayout';
import InfoLink from '@/components/shell/InfoLink';
import { BASE } from '@/components/shell/Navigation';
import { useFollow } from '@/hooks/useFollow';

interface ComingSoonProps {
  title: string;
  description?: string;
  /** Breadcrumbs after "Route 53"; defaults to just the page title. */
  breadcrumbs?: Crumb[];
}

/** Reusable placeholder for console sections that aren't implemented in this clone. */
export default function ComingSoon({ title, description, breadcrumbs }: ComingSoonProps) {
  const follow = useFollow();
  return (
    <ConsoleLayout
      contentType="default"
      helpTopic="coming-soon"
      breadcrumbs={breadcrumbs ?? [{ text: title, href: '#' }]}
    >
      <ContentLayout
        header={
          <Header variant="h1" info={<InfoLink topic="coming-soon" />} description={description}>
            {title}
          </Header>
        }
      >
        <Container>
          <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
            <SpaceBetween size="s">
              <Box variant="h2" color="inherit" data-testid="coming-soon">
                Coming soon
              </Box>
              <Box variant="p" color="inherit">
                {title} isn&apos;t available in this Route 53 clone yet. Hosted zones and DNS
                records are fully functional.
              </Box>
              <Link href={`${BASE}/hostedzones`} onFollow={follow}>
                Go to Hosted zones
              </Link>
            </SpaceBetween>
          </Box>
        </Container>
      </ContentLayout>
    </ConsoleLayout>
  );
}
