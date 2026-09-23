import type {AuthConfig} from 'convex/server';

const issuer = process.env.KINDE_ISSUER_URL ?? 'https://unset.kinde.com';

export default {
  providers: [
    {
      type: 'customJwt',
      issuer,
      jwks: `${issuer}/.well-known/jwks.json`,
      algorithm: 'RS256',
      applicationID: process.env.GATEHOUSE_AUDIENCE ?? 'https://gatehouse.api'
    }
  ]
} satisfies AuthConfig;
