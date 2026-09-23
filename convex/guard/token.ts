import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey
} from 'jose';

export type KindeClaims = {
  sub: string;
  azp: string | null;
  orgCode: string | null;
  permissions: string[];
  featureFlags: Record<string, boolean>;
  authTime: number | null;
  expiresAt: number;
};

export type TokenFailure =
  | 'token_missing'
  | 'token_malformed'
  | 'token_expired'
  | 'token_issuer_mismatch'
  | 'token_audience_mismatch'
  | 'token_invalid';

export type TokenResult =
  {ok: true; claims: KindeClaims} | {ok: false; code: TokenFailure};

const jwksCache = new Map<string, JWTVerifyGetKey>();

export function remoteJwks(issuer: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL('/.well-known/jwks.json', issuer));
    jwksCache.set(issuer, jwks);
  }
  return jwks;
}

export function bearerToken(header: string | null) {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function booleanFlags(value: unknown) {
  const flags: Record<string, boolean> = {};
  if (!value || typeof value !== 'object') return flags;
  for (const [key, flag] of Object.entries(value)) {
    if (flag && typeof flag === 'object' && 't' in flag && 'v' in flag) {
      if (flag.t === 'b' && typeof flag.v === 'boolean') flags[key] = flag.v;
    }
  }
  return flags;
}

export function readClaims(payload: JWTPayload): KindeClaims | null {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;
  if (typeof payload.exp !== 'number') return null;
  return {
    sub: payload.sub,
    azp: typeof payload.azp === 'string' ? payload.azp : null,
    orgCode: typeof payload.org_code === 'string' ? payload.org_code : null,
    permissions: stringArray(payload.permissions),
    featureFlags: booleanFlags(payload.feature_flags),
    authTime: typeof payload.auth_time === 'number' ? payload.auth_time : null,
    expiresAt: payload.exp
  };
}

export async function verifyKindeToken(
  token: string | null,
  options: {issuer: string; audience: string; jwks: JWTVerifyGetKey}
): Promise<TokenResult> {
  if (!token) return {ok: false, code: 'token_missing'};
  try {
    const {payload} = await jwtVerify(token, options.jwks, {
      issuer: options.issuer,
      audience: options.audience,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp']
    });
    const claims = readClaims(payload);
    return claims ? {ok: true, claims} : {ok: false, code: 'token_malformed'};
  } catch (error) {
    if (error instanceof errors.JWTExpired)
      return {ok: false, code: 'token_expired'};
    if (error instanceof errors.JWTClaimValidationFailed) {
      if (error.claim === 'iss')
        return {ok: false, code: 'token_issuer_mismatch'};
      if (error.claim === 'aud')
        return {ok: false, code: 'token_audience_mismatch'};
      return {ok: false, code: 'token_malformed'};
    }
    if (
      error instanceof errors.JWSInvalid ||
      error instanceof errors.JWTInvalid
    ) {
      return {ok: false, code: 'token_malformed'};
    }
    return {ok: false, code: 'token_invalid'};
  }
}
