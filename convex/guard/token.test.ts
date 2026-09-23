import {createLocalJWKSet} from 'jose';
import {describe, expect, test} from 'vitest';
import {AUDIENCE, ISSUER, jwksDocument, signToken} from './keys.testing';
import {bearerToken, verifyKindeToken} from './token';

const options = {
  issuer: ISSUER,
  audience: AUDIENCE,
  jwks: createLocalJWKSet(jwksDocument)
};

describe('bearerToken', () => {
  test('reads a bearer token and rejects other schemes', () => {
    expect(bearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    expect(bearerToken('bearer abc')).toBe('abc');
    expect(bearerToken('Basic abc')).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe('verifyKindeToken', () => {
  test('accepts a valid token and reads Kinde claims', async () => {
    const token = await signToken({
      azp: 'client-1',
      org_code: 'org_1',
      permissions: ['gatehouse:projects:read', 42],
      feature_flags: {
        bulk_export: {t: 'b', v: true},
        theme: {t: 's', v: 'dark'}
      }
    });
    const result = await verifyKindeToken(token, options);
    expect(result).toEqual({
      ok: true,
      claims: expect.objectContaining({
        sub: 'kp_user_a',
        azp: 'client-1',
        orgCode: 'org_1',
        permissions: ['gatehouse:projects:read'],
        featureFlags: {bulk_export: true}
      })
    });
  });

  test.each([
    ['token_missing', () => Promise.resolve(null)],
    ['token_malformed', () => Promise.resolve('not-a-jwt')],
    [
      'token_expired',
      () => signToken({}, {expiresIn: Math.floor(Date.now() / 1000) - 60})
    ],
    [
      'token_issuer_mismatch',
      () => signToken({}, {issuer: 'https://other.kinde.com'})
    ],
    [
      'token_audience_mismatch',
      () => signToken({}, {audience: ['https://other.api']})
    ],
    ['token_invalid', () => signToken({}, {wrongKey: true})]
  ] as const)('returns %s', async (code, make) => {
    const result = await verifyKindeToken(await make(), options);
    expect(result).toEqual({ok: false, code});
  });
});
