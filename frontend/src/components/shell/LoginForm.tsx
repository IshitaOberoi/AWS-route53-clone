'use client';

import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { colorBackgroundLayoutMain } from '@cloudscape-design/design-tokens';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { useAuth } from '@/context/AuthContext';
import { errorMessage } from '@/hooks/useFlash';
import { ApiError } from '@/lib/api';

const DEFAULT_DESTINATION = '/route53/v2/hostedzones';

/** Only allow same-site relative destinations (prevents open redirects via ?next=). */
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return DEFAULT_DESTINATION;
}

export default function LoginForm() {
  const { status, signIn } = useAuth();
  const router = useRouter();
  const destination = safeNext(useSearchParams().get('next'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});

  useEffect(() => {
    if (status === 'authenticated') router.replace(destination);
  }, [status, destination, router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) errors.username = 'Enter your username.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    setFormError(null);
    if (errors.username || errors.password) return;

    setSubmitting(true);
    try {
      await signIn({ username: username.trim(), password });
      router.replace(destination);
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.status === 401
          ? 'Invalid username or password.'
          : errorMessage(error),
      );
      setSubmitting(false);
    }
  };

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
      <div style={{ width: '100%', maxWidth: 440 }}>
        <SpaceBetween size="l">
          <Box variant="h1" textAlign="center">
            Route 53 Clone
          </Box>
          <form onSubmit={onSubmit} noValidate>
            <Form
              errorText={formError}
              errorIconAriaLabel="Error"
              actions={
                <Button variant="primary" formAction="submit" loading={submitting} fullWidth>
                  Sign in
                </Button>
              }
            >
              <Container header={<Header variant="h2">Sign in</Header>}>
                <SpaceBetween size="l">
                  <Alert type="info" header="Demo environment">
                    Demo environment with mocked authentication. Do not enter real AWS credentials.
                    <Box variant="p" padding={{ top: 'xs' }}>
                      Username: <Box variant="code">demo</Box> · Password:{' '}
                      <Box variant="code">demo1234</Box>
                    </Box>
                  </Alert>
                  <FormField label="Username" errorText={fieldErrors.username}>
                    <Input
                      value={username}
                      onChange={({ detail }) => setUsername(detail.value)}
                      autoComplete="username"
                      name="username"
                      autoFocus
                      disabled={submitting}
                    />
                  </FormField>
                  <FormField label="Password" errorText={fieldErrors.password}>
                    <Input
                      value={password}
                      onChange={({ detail }) => setPassword(detail.value)}
                      type="password"
                      autoComplete="current-password"
                      name="password"
                      disabled={submitting}
                    />
                  </FormField>
                </SpaceBetween>
              </Container>
            </Form>
          </form>
        </SpaceBetween>
      </div>
    </main>
  );
}
