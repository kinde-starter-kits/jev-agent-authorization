import type {KindeClaims} from './token';

export type AccessSource = 'token' | 'kinde_api';

export type Access = {
  orgCode: string;
  permissions: string[];
  featureFlags: Record<string, boolean>;
  source: AccessSource;
};

export type AccessFailure =
  'kinde_org_mismatch' | 'kinde_unavailable' | 'kinde_not_configured';

export type ManagementConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
};

type Fetch = typeof fetch;

const TOKEN_EARLY_REFRESH_MS = 60_000;
let cachedToken: {key: string; token: string; expiresAt: number} | null = null;

export function resetManagementTokenCache() {
  cachedToken = null;
}

export async function managementToken(
  config: ManagementConfig,
  fetchImpl: Fetch = fetch,
  now = Date.now()
) {
  const key = `${config.issuer}|${config.clientId}`;
  if (cachedToken && cachedToken.key === key && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }
  const response = await fetchImpl(new URL('/oauth2/token', config.issuer), {
    method: 'POST',
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      audience: new URL('/api', config.issuer).toString()
    })
  });
  if (!response.ok)
    throw new Error(`Kinde token request failed: ${response.status}`);
  const body = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof body.access_token !== 'string')
    throw new Error('Kinde token response has no access_token');
  const lifetimeMs =
    typeof body.expires_in === 'number' ? body.expires_in * 1000 : 0;
  cachedToken = {
    key,
    token: body.access_token,
    expiresAt: now + Math.max(0, lifetimeMs - TOKEN_EARLY_REFRESH_MS)
  };
  return body.access_token;
}

async function managementGet(
  config: ManagementConfig,
  path: string,
  fetchImpl: Fetch
) {
  const token = await managementToken(config, fetchImpl);
  return fetchImpl(new URL(path, config.issuer), {
    headers: {authorization: `Bearer ${token}`, accept: 'application/json'}
  });
}

export async function fetchOrgAccess(
  config: ManagementConfig,
  orgCode: string,
  sub: string,
  fetchImpl: Fetch = fetch
): Promise<Access> {
  const org = encodeURIComponent(orgCode);
  const user = encodeURIComponent(sub);

  const permissionsResponse = await managementGet(
    config,
    `/api/v1/organizations/${org}/users/${user}/permissions`,
    fetchImpl
  );
  let permissions: string[] = [];
  if (permissionsResponse.ok) {
    const body = (await permissionsResponse.json()) as {
      permissions?: Array<{key?: unknown}>;
    };
    permissions = (body.permissions ?? [])
      .map((p) => p.key)
      .filter((key): key is string => typeof key === 'string');
  } else if (
    permissionsResponse.status !== 400 &&
    permissionsResponse.status !== 404
  ) {
    throw new Error(
      `Kinde permissions request failed: ${permissionsResponse.status}`
    );
  }

  const flagsResponse = await managementGet(
    config,
    `/api/v1/organizations/${org}/feature_flags`,
    fetchImpl
  );
  if (!flagsResponse.ok) {
    throw new Error(
      `Kinde feature flag request failed: ${flagsResponse.status}`
    );
  }
  const flagsBody = (await flagsResponse.json()) as {
    feature_flags?: Record<string, {type?: unknown; value?: unknown}>;
  };
  const featureFlags: Record<string, boolean> = {};
  for (const [key, flag] of Object.entries(flagsBody.feature_flags ?? {})) {
    if (flag.type === 'bool')
      featureFlags[key] = flag.value === 'true' || flag.value === true;
  }

  return {orgCode, permissions, featureFlags, source: 'kinde_api'};
}

export function accessFromToken(
  claims: KindeClaims,
  orgCode: string
): Access | AccessFailure | null {
  if (claims.orgCode === null) return null;
  if (claims.orgCode !== orgCode) return 'kinde_org_mismatch';
  return {
    orgCode,
    permissions: claims.permissions,
    featureFlags: claims.featureFlags,
    source: 'token'
  };
}
