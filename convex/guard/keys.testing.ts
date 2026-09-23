import {exportJWK, generateKeyPair, SignJWT, type JWTPayload} from 'jose';

export const ISSUER = 'https://gatehouse-test.kinde.com';
export const AUDIENCE = 'https://gatehouse.api';

const KID = 'test-key';
const keys = await generateKeyPair('RS256');
const otherKeys = await generateKeyPair('RS256');

export const jwksDocument = {
  keys: [
    {...(await exportJWK(keys.publicKey)), kid: KID, alg: 'RS256', use: 'sig'}
  ]
};

export async function signToken(
  payload: JWTPayload,
  options: {
    issuer?: string;
    audience?: string | string[];
    expiresIn?: string | number;
    wrongKey?: boolean;
  } = {}
) {
  return new SignJWT({sub: 'kp_user_a', ...payload})
    .setProtectedHeader({alg: 'RS256', kid: KID})
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? [AUDIENCE])
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.wrongKey ? otherKeys.privateKey : keys.privateKey);
}
