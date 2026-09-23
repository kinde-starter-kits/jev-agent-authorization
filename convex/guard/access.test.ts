import {beforeEach, describe, expect, test, vi} from 'vitest';
import {
  accessFromToken,
  fetchOrgAccess,
  managementToken,
  resetManagementTokenCache
} from './access';
import type {KindeClaims} from './token';

const config = {
  issuer: 'https://gatehouse-test.kinde.com',
  clientId: 'm2m-id',
  clientSecret: 'm2m-secret'
};

function claims(orgCode: string | null): KindeClaims {
  return {
    sub: 'kp_user_a',
    azp: null,
    orgCode,
    permissions: ['gatehouse:projects:read'],
    featureFlags: {bulk_export: true},
    authTime: null,
    expiresAt: 0
  };
}

function kindeApi(overrides: {permissionsStatus?: number} = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/oauth2/token')) {
      return Response.json({access_token: 'm2m-token', expires_in: 3600});
    }
    if (url.includes('/users/') && url.endsWith('/permissions')) {
      if (overrides.permissionsStatus) {
        return new Response('{}', {status: overrides.permissionsStatus});
      }
      return Response.json({
        permissions: [
          {key: 'gatehouse:projects:read'},
          {key: 'gatehouse:projects:delete'}
        ]
      });
    }
    if (url.endsWith('/feature_flags')) {
      return Response.json({
        feature_flags: {
          bulk_export: {type: 'bool', value: 'true'},
          theme: {type: 'str', value: 'dark'}
        }
      });
    }
    return new Response('not found', {status: 404});
  });
}

beforeEach(() => resetManagementTokenCache());

describe('accessFromToken', () => {
  test('uses the token when it carries the configured organization', () => {
    expect(accessFromToken(claims('org_a'), 'org_a')).toMatchObject({
      source: 'token',
      permissions: ['gatehouse:projects:read']
    });
  });

  test('returns null when the token has no organization', () => {
    expect(accessFromToken(claims(null), 'org_a')).toBeNull();
  });

  test('refuses a token from another organization', () => {
    expect(accessFromToken(claims('org_b'), 'org_a')).toBe(
      'kinde_org_mismatch'
    );
  });
});

describe('fetchOrgAccess', () => {
  test('reads permissions and boolean flags from the Management API', async () => {
    const fetchImpl = kindeApi();
    const access = await fetchOrgAccess(
      config,
      'org_a',
      'kp_user_a',
      fetchImpl
    );
    expect(access).toEqual({
      orgCode: 'org_a',
      source: 'kinde_api',
      permissions: ['gatehouse:projects:read', 'gatehouse:projects:delete'],
      featureFlags: {bulk_export: true}
    });
  });

  test('treats a user outside the organization as having no permissions', async () => {
    const access = await fetchOrgAccess(
      config,
      'org_a',
      'kp_user_a',
      kindeApi({permissionsStatus: 404})
    );
    expect(access.permissions).toEqual([]);
  });

  test('throws when Kinde fails', async () => {
    await expect(
      fetchOrgAccess(
        config,
        'org_a',
        'kp_user_a',
        kindeApi({permissionsStatus: 500})
      )
    ).rejects.toThrow();
  });
});

describe('managementToken', () => {
  test('reuses the token until shortly before it expires', async () => {
    const fetchImpl = kindeApi();
    await managementToken(config, fetchImpl, 0);
    await managementToken(config, fetchImpl, 1000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await managementToken(config, fetchImpl, 3_600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
