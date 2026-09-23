'use client';

import {LoginLink} from '@kinde-oss/kinde-auth-nextjs/components';
import {useSessionToken} from './convex-provider';

/** Shows a sign-in prompt when the server session has ended. */
export function SessionNotice({returnTo}: {returnTo: string}) {
  const {token, isLoading} = useSessionToken();
  if (isLoading || token) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stepup/40 bg-stepup-soft p-4 text-sm text-stepup"
    >
      <span>Your session ended. Sign in again to use the agent.</span>
      <LoginLink
        postLoginRedirectURL={returnTo}
        className="rounded-md bg-ink px-3 py-1.5 font-medium text-paper"
      >
        Sign in again
      </LoginLink>
    </div>
  );
}
