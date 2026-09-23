'use client';

import {ConvexProviderWithAuth, ConvexReactClient} from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

type SessionToken = {
  token: string | null;
  isLoading: boolean;
  refresh: () => Promise<string | null>;
};

const SessionTokenContext = createContext<SessionToken | null>(null);

async function readToken() {
  const response = await fetch('/api/session-token', {cache: 'no-store'});
  if (!response.ok) return null;
  const body = (await response.json()) as {token?: string | null};
  return body.token ?? null;
}

function SessionTokenProvider({children}: {children: ReactNode}) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await readToken().catch(() => null);
    setToken(next);
    setIsLoading(false);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    readToken()
      .catch(() => null)
      .then((next) => {
        if (!active) return;
        setToken(next);
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({token, isLoading, refresh}),
    [token, isLoading, refresh]
  );
  return (
    <SessionTokenContext.Provider value={value}>
      {children}
    </SessionTokenContext.Provider>
  );
}

export function useSessionToken() {
  const value = useContext(SessionTokenContext);
  if (!value)
    throw new Error('useSessionToken must be used inside ConvexWithKinde');
  return value;
}

function useConvexAuthFromSession() {
  const {token, isLoading, refresh} = useSessionToken();
  const fetchAccessToken = useCallback(
    async ({forceRefreshToken}: {forceRefreshToken: boolean}) =>
      forceRefreshToken ? refresh() : token,
    [token, refresh]
  );
  return useMemo(
    () => ({isLoading, isAuthenticated: token !== null, fetchAccessToken}),
    [isLoading, token, fetchAccessToken]
  );
}

export function ConvexWithKinde({children}: {children: ReactNode}) {
  if (!convex) throw new Error('NEXT_PUBLIC_CONVEX_URL is not set');
  return (
    <SessionTokenProvider>
      <ConvexProviderWithAuth
        client={convex}
        useAuth={useConvexAuthFromSession}
      >
        {children}
      </ConvexProviderWithAuth>
    </SessionTokenProvider>
  );
}
