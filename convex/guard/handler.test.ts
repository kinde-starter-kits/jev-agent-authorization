import {convexTest} from 'convex-test';
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest';
import schema from '../schema';
import {modules} from '../test.setup';
import {AUDIENCE, ISSUER, jwksDocument, signToken} from './keys.testing';

type ApiBody = {
  error?: {code: string};
  data?: unknown;
  decision?: {id: string; verdict: string};
};

const READ = ['gatehouse:projects:read', 'gatehouse:docs:read'];

beforeAll(() => {
  process.env.KINDE_ISSUER_URL = ISSUER;
  process.env.GATEHOUSE_AUDIENCE = AUDIENCE;
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`)
        return Response.json(jwksDocument);
      return realFetch(input, init);
    }
  );
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
  return {
    status: response.status,
    body: (await response.json()) as ApiBody
  };
}

describe('guarded API', () => {
  test('rejects a missing token without recording a decision', async () => {
    const t = convexTest(schema, modules);
    const {status, body} = await call(t, 'GET', '/api/v1/projects');
    expect(status).toBe(401);
    expect(body.error?.code).toBe('token_missing');
    const decisions = await t.run((ctx) => ctx.db.query('decisions').collect());
    expect(decisions).toHaveLength(0);
  });

  test('returns 404 for an unknown route', async () => {
    const t = convexTest(schema, modules);
    const {status} = await call(t, 'GET', '/api/v1/nothing');
    expect(status).toBe(404);
  });

  test('allows a permitted read, provisions a workspace and records the decision', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({permissions: READ});
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {token});
    expect(status).toBe(200);
    expect(body.data as unknown[]).toHaveLength(3);
    expect(body.decision?.verdict).toBe('allow');
    const [decision] = await t.run((ctx) =>
      ctx.db.query('decisions').collect()
    );
    expect(decision).toMatchObject({
      sub: 'kp_user_a',
      operationId: 'listProjects',
      verdict: 'allow',
      status: 'executed'
    });
  });

  test('denies a call without the Kinde permission and does not run it', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({permissions: READ});
    const {status, body} = await call(
      t,
      'DELETE',
      '/api/v1/projects/acme-rebrand',
      {
        token,
        body: {reason: 'Clean up the finished project'}
      }
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('kinde_permission_missing');
    const projects = await t.run((ctx) => ctx.db.query('projects').collect());
    expect(projects).toHaveLength(3);
  });

  test('refuses a permitted write while judgment is unavailable', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({permissions: ['gatehouse:projects:delete']});
    const {status, body} = await call(
      t,
      'DELETE',
      '/api/v1/projects/acme-rebrand',
      {
        token,
        body: {reason: 'Clean up the finished project'}
      }
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('judgment_unavailable');
    const projects = await t.run((ctx) => ctx.db.query('projects').collect());
    expect(projects).toHaveLength(3);
  });

  test('rejects a user header that does not match the token', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({permissions: READ});
    const {status, body} = await call(t, 'GET', '/api/v1/projects', {
      token,
      headers: {'x-kinde-user-id': 'kp_someone_else'}
    });
    expect(status).toBe(401);
    expect(body.error?.code).toBe('identity_mismatch');
  });

  test('rejects reserved fields in the body', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({permissions: ['gatehouse:projects:write']});
    const {status, body} = await call(
      t,
      'POST',
      '/api/v1/projects/acme-rebrand/archive',
      {
        token,
        body: {reason: 'Archive it', workspaceId: 'x'}
      }
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe('invalid_body');
  });

  test('maps operation errors and records the failure', async () => {
    const t = convexTest(schema, modules);
    const token = await signToken({permissions: READ});
    const {status, body} = await call(
      t,
      'GET',
      '/api/v1/projects/no-such-project',
      {token}
    );
    expect(status).toBe(404);
    expect(body.error?.code).toBe('not_found');
    const [decision] = await t.run((ctx) =>
      ctx.db.query('decisions').collect()
    );
    expect(decision).toMatchObject({status: 'failed', errorCode: 'not_found'});
  });

  test('keeps each user in their own workspace', async () => {
    const t = convexTest(schema, modules);
    const tokenA = await signToken({permissions: READ});
    const tokenB = await signToken({sub: 'kp_user_b', permissions: READ});
    const a = await call(t, 'GET', '/api/v1/documents', {token: tokenA});
    const [first] = a.body.data as Array<{id: string}>;
    const documentId = first!.id;
    const b = await call(t, 'GET', `/api/v1/documents/${documentId}`, {
      token: tokenB
    });
    expect(b.status).toBe(404);
  });
});
