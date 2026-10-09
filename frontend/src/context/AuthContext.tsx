'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import * as api from '@/lib/api';
import type { LoginInput, User } from '@/lib/types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  signIn: (input: LoginInput) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    api
      .getCurrentUser(controller.signal)
      .then((current) => {
        setUser(current);
        setStatus('authenticated');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof api.ApiError && error.status === 401) {
          setUser(null);
          setStatus('anonymous');
          return;
        }
        // Backend unreachable: treat as signed out so the login page can show the error.
        setUser(null);
        setStatus('anonymous');
      });
    return () => controller.abort();
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const signedIn = await api.login(input);
    setUser(signedIn);
    setStatus('authenticated');
    return signedIn;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Even if the session was already gone, finish signing out locally.
    }
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
    router.refresh();
  }, [router]);

  const value = useMemo(() => ({ user, status, signIn, signOut }), [user, status, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** Sends anonymous visitors of a protected page to /login?next=<current path>. */
export function useRequireAuth(): AuthContextValue {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (auth.status === 'anonymous') {
      const next = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [auth.status, pathname, router]);

  return auth;
}
