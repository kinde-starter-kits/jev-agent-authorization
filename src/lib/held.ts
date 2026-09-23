import {getKindeServerSession} from '@kinde-oss/kinde-auth-nextjs/server';

export const MAX_AUTH_AGE_SECONDS = 120;

export type HeldCall = {
  id: string;
  status: 'pending' | 'executed' | 'failed' | 'denied' | 'expired';
  createdAt: number;
  expiresAt: number;
  resolvedAt: number | null;
  authAgeSeconds: number | null;
  errorCode: string | null;
  operation: {id: string; summary: string; effect: string; tier: string | null};
  args: Record<string, unknown>;
  reason: string | null;
  reasonCode: string | null;
  jev: {
    ms: number;
    matchesIntent: number;
    destructive: number;
    injected: number;
    exfiltration: number;
    risk: number;
    riskConfidence: number;
  } | null;
};

export type ApiResult<T> =
  | {ok: true; data: T}
  | {ok: false; status: number; code: string; message: string};

function siteUrl() {
  const url = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_CONVEX_SITE_URL is not set');
  return url;
}

export async function signInState() {
  const session = getKindeServerSession();
  if (!(await session.isAuthenticated())) return {signedIn: false as const};
  const idToken = await session.getIdToken();
  const raw = await session.getIdTokenRaw();
  const authTime =
    typeof idToken?.auth_time === 'number' ? idToken.auth_time : null;
  return {signedIn: true as const, raw, authTime};
}

export function isFreshFor(authTime: number | null, heldCreatedAt: number) {
  if (authTime === null) return false;
  const ageSeconds = Date.now() / 1000 - authTime;
  return (
    ageSeconds <= MAX_AUTH_AGE_SECONDS && authTime >= heldCreatedAt / 1000 - 5
  );
}

export async function heldRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  idToken: string
): Promise<ApiResult<T>> {
  const response = await fetch(new URL(`/api/held/${path}`, siteUrl()), {
    method,
    headers: {authorization: `Bearer ${idToken}`},
    cache: 'no-store'
  });
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: {code?: string; message?: string};
  };
  if (response.ok && body.data !== undefined)
    return {ok: true, data: body.data};
  return {
    ok: false,
    status: response.status,
    code: body.error?.code ?? 'request_failed',
    message: body.error?.message ?? 'The request failed.'
  };
}
