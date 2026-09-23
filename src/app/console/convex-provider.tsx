'use client';

import {useKindeBrowserClient} from '@kinde-oss/kinde-auth-nextjs';
import {ConvexProviderWithAuth, ConvexReactClient} from 'convex/react';
import {useCallback, useMemo, type ReactNode} from 'react';

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function useKindeConvexAuth() {
  const {isLoading, isAuthenticated, accessTokenRaw, refreshData} =
    useKindeBrowserClient();
  const fetchAccessToken = useCallback(
    async ({forceRefreshToken}: {forceRefreshToken: boolean}) => {
      if (forceRefreshToken) await refreshData();
      return accessTokenRaw ?? null;
    },
    [accessTokenRaw, refreshData]
  );
  return useMemo(
    () => ({
      isLoading: isLoading ?? true,
      isAuthenticated: isAuthenticated === true && accessTokenRaw !== null,
      fetchAccessToken
    }),
    [isLoading, isAuthenticated, accessTokenRaw, fetchAccessToken]
  );
}

export function ConvexWithKinde({children}: {children: ReactNode}) {
  if (!convex) throw new Error('NEXT_PUBLIC_CONVEX_URL is not set');
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useKindeConvexAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
