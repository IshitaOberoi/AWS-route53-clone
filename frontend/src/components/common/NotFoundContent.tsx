'use client';

import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { colorBackgroundLayoutMain } from '@cloudscape-design/design-tokens';
import { useRouter } from 'next/navigation';

export default function NotFoundContent() {
  const router = useRouter();
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        background: colorBackgroundLayoutMain,
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <Container header={<Header variant="h1">Page not found</Header>}>
          <SpaceBetween size="m">
            <Box variant="p" color="text-body-secondary">
              The page you&apos;re looking for doesn&apos;t exist or has moved. Check the URL, or go
              back to the Route 53 console.
            </Box>
            <Button variant="primary" onClick={() => router.push('/route53/v2/hostedzones')}>
              Go to Hosted zones
            </Button>
          </SpaceBetween>
        </Container>
      </div>
    </main>
  );
}
