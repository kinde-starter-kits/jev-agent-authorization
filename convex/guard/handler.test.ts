import {convexTest} from 'convex-test';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from 'vitest';
import schema from '../schema';
import {modules} from '../test.setup';
import {resetManagementTokenCache} from './access';
import {AUDIENCE, ISSUER, jwksDocument, signToken} from './keys.testing';

type ApiBody = {
  error?: {code: string};
  data?: unknown;
  decision?: {id: string; verdict: string};
};

const ORG = 'org_gatehouse';
const READ = ['gatehouse:projects:read', 'gatehouse:docs:read'];

const kindeApi = {
  permissions: ['gatehouse:projects:read'] as string[],
  flags: {} as Record<string, {type: string; value: string}>,
  failing: false,
  calls: 0
};

beforeAll(() => {
  process.env.KINDE_ISSUER_URL = ISSUER;
  process.env.GATEHOUSE_AUDIENCE = AUDIENCE;
  process.env.GATEHOUSE_ORG_CODE = ORG;
  process.env.KINDE_M2M_CLIENT_ID = 'm2m-id';
  process.env.KINDE_M2M_CLIENT_SECRET = 'm2m-secret';
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`)
        return Response.json(jwksDocument);
      if (url === `${ISSUER}/oauth2/token`) {
        return Response.json({access_token: 'm2m-token', expires_in: 3600});
      }
      if (url.startsWith(`${ISSUER}/api/v1/organizations/${ORG}/`)) {
        kindeApi.calls++;
        if (kindeApi.failing) return new Response('{}', {status: 500});
        if (url.endsWith('/permissions')) {
          return Response.json({
            permissions: kindeApi.permissions.map((key) => ({key}))
          });
        }
        if (url.endsWith('/feature_flags')) {
          return Response.json({feature_flags: kindeApi.flags});
        }
      }
      return realFetch(input, init);
    }
  );
});

beforeEach(() => {
  resetManagementTokenCache();
  kindeApi.permissions = ['gatehouse:projects:read'];
  kindeApi.flags = {};
  kindeApi.failing = false;
  kindeApi.calls = 0;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

async function call(
  t: ReturnType<typeof convexTest>,
  method: string,
  path: string,
  options: {
    token?: string | null;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {...options.headers};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await t.fetch(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  return {status: response.status, body: (await response.json()) as ApiBody};
}

function orgToken(permissions: string[], extra: Record<string, unknown> = {}) {
  return signToken({org_code: ORG, permissions, ...extra});
}

async function decisions(t: ReturnType<typeof convexTest>) {
  return t.run((ctx) => ctx.db.query('decisions').collect());
}

describe('token and identity checks', () => {
  test('rejects a missing token without recording a decision', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(t, 'GET', '/api/v1/projects');
    expect(status).toBe(401);
    expect(body.error?.code).toBe('token_missing');
    expect(await decisions(t)).toHaveLength(0);
  });

  test('returns 404 for an unknown route', async () => {
    const t = convexTest(schema, modules);
    const {status} = await call(t, 'GET', '/api/v1/nothing');
    expect(status).toBe(404);
  });

  test('rejects a user header that does not match the token', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {
      token: await orgToken(READ),
      headers: {'x-kinde-user-id': 'kp_someone_else'}
    });
    expect(status).toBe(401);
    expect(body.error?.code).toBe('identity_mismatch');
  });
});

describe('Kinde access from the token', () => {
  test('allows a permitted read, provisions a workspace and records the decision', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {
      token: await orgToken(READ)
    });
    expect(status).toBe(200);
    expect(body.data as unknown[]).toHaveLength(3);
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({
      operationId: 'listProjects',
      verdict: 'allow',
      status: 'executed',
      kinde: {orgCode: ORG, source: 'token', permissionGranted: true}
    });
    expect(kindeApi.calls).toBe(0);
  });

  test('denies a call without the Kinde permission and does not run it', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(
      t,
      'DELETE',
      '/api/v1/projects/acme-rebrand',
      {
        token: await orgToken(READ)
      }
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('kinde_permission_missing');
    expect(
      await t.run((ctx) => ctx.db.query('projects').collect())
    ).toHaveLength(3);
  });

  test('refuses a token issued for another organization', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {
      token: await signToken({org_code: 'org_other', permissions: READ})
    });
    expect(status).toBe(403);
    expect(body.error?.code).toBe('kinde_org_mismatch');
  });
});

describe('Kinde access from the Management API', () => {
  test('resolves permissions for a token without an organization and caches them', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({});
    const first = await call(t, 'GET', '/api/v1/projects', {token});
    expect(first.status).toBe(200);
    const callsAfterFirst = kindeApi.calls;
    expect(callsAfterFirst).toBe(2);
    const second = await call(t, 'GET', '/api/v1/projects', {token});
    expect(second.status).toBe(200);
    expect(kindeApi.calls).toBe(callsAfterFirst);
    const [decision] = await decisions(t);
    expect(decision?.kinde).toMatchObject({orgCode: ORG, source: 'kinde_api'});
  });

  test('denies when the user has no permission in the organization', async () => {
    const t = convexTest(schema, modules);
    kindeApi.permissions = [];
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {
      token: await signToken({})
    });
    expect(status).toBe(403);
    expect(body.error?.code).toBe('kinde_permission_missing');
  });

  test('reads the organization feature flag for exports', async () => {
    const t = convexTest(schema, modules);
    kindeApi.permissions = ['gatehouse:customers:export'];
    const denied = await call(t, 'POST', '/api/v1/exports/customers', {
      token: await signToken({}),
      body: {destination: 'https://backup.example/customers', scope: 'all'}
    });
    expect(denied.body.error?.code).toBe('kinde_flag_disabled');
  });

  test('fails closed when Kinde is unavailable', async () => {
    const t = convexTest(schema, modules);
    kindeApi.failing = true;
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {
      token: await signToken({})
    });
    expect(status).toBe(403);
    expect(body.error?.code).toBe('kinde_unavailable');
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({verdict: 'deny', status: 'refused'});
  });
});

describe('request shapes sent by Kinde Secure MCP', () => {
  test('reads the reason for a delete from the query string', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(
      t,
      'DELETE',
      '/api/v1/projects/acme-rebrand?reason=The%20Acme%20project%20is%20finished',
      {token: await orgToken(['gatehouse:projects:delete'])}
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('judgment_unavailable');
    const [decision] = await decisions(t);
    expect(decision?.reason).toBe('The Acme project is finished');
    expect(
      await t.run((ctx) => ctx.db.query('projects').collect())
    ).toHaveLength(3);
  });

  test('accepts a write with no body and records no stated reason', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(
      t,
      'POST',
      '/api/v1/projects/acme-rebrand/archive',
      {
        token: await orgToken(['gatehouse:projects:write'])
      }
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('judgment_unavailable');
    const [decision] = await decisions(t);
    expect(decision?.reason).toBeUndefined();
  });

  test('rejects reserved fields in the body', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(
      t,
      'POST',
      '/api/v1/projects/acme-rebrand/archive',
      {
        token: await orgToken(['gatehouse:projects:write']),
        body: {reason: 'Archive it', workspaceId: 'x'}
      }
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe('invalid_body');
  });
});

describe('operations', () => {
  test('maps operation errors and records the failure', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(
      t,
      'GET',
      '/api/v1/projects/no-such-project',
      {
        token: await orgToken(READ)
      }
    );
    expect(status).toBe(404);
    expect(body.error?.code).toBe('not_found');
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({status: 'failed', errorCode: 'not_found'});
  });

  test('keeps each user in their own workspace', async () => {
    const t = convexTest(schema, modules);
    const a = await call(t, 'GET', '/api/v1/documents', {
      token: await orgToken(READ)
    });
    const [first] = a.body.data as Array<{id: string}>;
    const b = await call(t, 'GET', `/api/v1/documents/${first!.id}`, {
      token: await orgToken(READ, {sub: 'kp_user_b'})
    });
    expect(b.status).toBe(404);
  });
});
