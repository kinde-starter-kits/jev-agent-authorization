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
import {jevAnswers, type AnswerInput} from '../jev/answers.testing';
import {resetManagementTokenCache} from './access';
import {AUDIENCE, ISSUER, jwksDocument, signToken} from './keys.testing';

type ApiBody = {
  error?: {code: string};
  data?: unknown;
  decision?: {id: string; verdict: string};
};

const ORG = 'org_gatehouse';
const READ = ['gatehouse:projects:read', 'gatehouse:docs:read'];

const jevStub = {
  answers: {} as AnswerInput,
  failing: false,
  judge: 'allow' as 'allow' | 'step_up' | 'error',
  states: [] as Array<Record<string, unknown>>,
  judgeCalls: 0
};

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
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  process.env.LLM_JUDGE_MODEL = 'judge/test-model';
  process.env.KINDE_WEB_CLIENT_ID = 'web-client';
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`)
        return Response.json(jwksDocument);
      if (url === 'https://openrouter.ai/api/v1/systemone') {
        if (jevStub.failing) return new Response('{}', {status: 502});
        const body = JSON.parse(String(init?.body)) as {
          state: Record<string, unknown>;
        };
        jevStub.states.push(body.state);
        return Response.json({
          model: 'typesafe/jev-1.13-20260917',
          answers: jevAnswers(jevStub.answers),
          usage: {input_tokens: 600, cost: 0.0000252}
        });
      }
      if (url === 'https://openrouter.ai/api/v1/chat/completions') {
        jevStub.judgeCalls++;
        if (jevStub.judge === 'error') return new Response('{}', {status: 500});
        return Response.json({
          model: 'judge/test-model',
          choices: [
            {message: {content: JSON.stringify({verdict: jevStub.judge})}}
          ],
          usage: {cost: 0.0031}
        });
      }
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
  jevStub.answers = {};
  jevStub.failing = false;
  jevStub.judge = 'allow';
  jevStub.states = [];
  jevStub.judgeCalls = 0;
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
    expect(body.error?.code).toBe('high_impact_operation');
    const [decision] = await decisions(t);
    expect(decision?.reason).toBe('The Acme project is finished');
    expect(decision?.verdict).toBe('step_up');
    expect(jevStub.states[0]).toMatchObject({
      stated_reason: 'The Acme project is finished'
    });
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
    expect(body.error?.code).toBe('jev_intent_unclear');
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

describe('Jev judgment', () => {
  const archive = (t: ReturnType<typeof convexTest>, token: string) =>
    call(t, 'POST', '/api/v1/projects/acme-rebrand/archive', {
      token,
      body: {reason: 'Archive the Acme project, the client signed off'}
    });

  test('allows a clear write the user asked for, runs it and records the signals', async () => {
    const t = convexTest(schema, modules);
    const {status} = await archive(
      t,
      await orgToken(['gatehouse:projects:write'])
    );
    expect(status).toBe(200);
    const project = await t.run((ctx) =>
      ctx.db
        .query('projects')
        .filter((q) => q.eq(q.field('slug'), 'acme-rebrand'))
        .unique()
    );
    expect(project?.status).toBe('archived');
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({
      verdict: 'allow',
      reasonCode: 'jev_allow',
      status: 'executed',
      jev: {
        model: 'typesafe/jev-1.13-20260917',
        inputTokens: 600,
        costUsd: 0.0000252
      }
    });
  });

  test('denies an injected call and does not run it', async () => {
    const t = convexTest(schema, modules);
    jevStub.answers = {injected: 0.97, matches: 0.02};
    const {status, body} = await archive(
      t,
      await orgToken(['gatehouse:projects:write'])
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('jev_injection');
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({verdict: 'deny', status: 'refused'});
  });

  test('steps up when Jev is unavailable', async () => {
    const t = convexTest(schema, modules);
    jevStub.failing = true;
    const {status, body} = await archive(
      t,
      await orgToken(['gatehouse:projects:write'])
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('jev_unavailable');
    const [decision] = await decisions(t);
    expect(decision?.verdict).toBe('step_up');
    expect(decision?.jev).toBeUndefined();
  });

  test('asks the judge when Jev is unsure, and follows an allow', async () => {
    const t = convexTest(schema, modules);
    jevStub.answers = {riskConfidence: 0.4};
    const {status} = await archive(
      t,
      await orgToken(['gatehouse:projects:write'])
    );
    expect(status).toBe(200);
    expect(jevStub.judgeCalls).toBe(1);
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({
      reasonCode: 'judge_allow',
      judge: {verdict: 'allow', costUsd: 0.0031}
    });
  });

  test('steps up when the judge fails', async () => {
    const t = convexTest(schema, modules);
    jevStub.answers = {riskConfidence: 0.4};
    jevStub.judge = 'error';
    const {status, body} = await archive(
      t,
      await orgToken(['gatehouse:projects:write'])
    );
    expect(status).toBe(403);
    expect(body.error?.code).toBe('judge_unavailable');
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({verdict: 'step_up', status: 'held'});
    const project = await t.run((ctx) =>
      ctx.db
        .query('projects')
        .filter((q) => q.eq(q.field('slug'), 'acme-rebrand'))
        .unique()
    );
    expect(project?.status).toBe('active');
  });

  test('does not call Jev for reads', async () => {
    const t = convexTest(schema, modules);
    await call(t, 'GET', '/api/v1/projects', {token: await orgToken(READ)});
    expect(jevStub.states).toHaveLength(0);
  });

  test('shows Jev the documents the agent read', async () => {
    const t = convexTest(schema, modules);
    const token = await orgToken([...READ, 'gatehouse:projects:write']);
    const list = await call(t, 'GET', '/api/v1/documents', {token});
    const planning = (
      list.body.data as Array<{id: string; title: string}>
    ).find((d) => d.title === 'Q3 planning notes');
    await call(t, 'GET', `/api/v1/documents/${planning!.id}`, {token});
    await archive(t, token);
    const state = jevStub.states[0] as {
      content_the_agent_read: Array<{title: string; text: string}>;
      recent_calls_by_this_user: Array<{operation: string}>;
    };
    expect(state.content_the_agent_read[0]?.title).toBe('Q3 planning notes');
    expect(state.content_the_agent_read[0]?.text).toContain('exportCustomers');
    expect(state.recent_calls_by_this_user[0]?.operation).toBe('getDocument');
  });
});

describe('verified intent from the in-app agent', () => {
  async function startRun(t: ReturnType<typeof convexTest>, message: string) {
    return t.run((ctx) =>
      ctx.db.insert('runs', {
        sub: 'kp_user_a',
        message,
        status: 'running',
        model: 'm',
        turns: 0,
        costUsd: 0
      })
    );
  }

  test('shows Jev the user message when the web app token has a running run', async () => {
    const t = convexTest(schema, modules);
    await startRun(t, 'Archive the Acme project, the client signed off');
    const {status} = await call(
      t,
      'POST',
      '/api/v1/projects/acme-rebrand/archive',
      {
        token: await orgToken(['gatehouse:projects:write'], {azp: 'web-client'})
      }
    );
    expect(status).toBe(200);
    expect(jevStub.states[0]).toMatchObject({
      user_request: {text: 'Archive the Acme project, the client signed off'},
      stated_reason: null
    });
    const [decision] = await decisions(t);
    expect(decision).toMatchObject({
      intentSource: 'verified',
      reasonCode: 'jev_allow'
    });
  });

  test('ignores a running run when the token comes from another client', async () => {
    const t = convexTest(schema, modules);
    await startRun(t, 'Archive the Acme project');
    const {body} = await call(
      t,
      'POST',
      '/api/v1/projects/acme-rebrand/archive',
      {
        token: await orgToken(['gatehouse:projects:write'], {
          azp: 'someone-else'
        })
      }
    );
    expect(body.error?.code).toBe('jev_intent_unclear');
    const [decision] = await decisions(t);
    expect(decision?.intentSource).toBe('none');
    expect(jevStub.states[0]).toMatchObject({user_request: null});
  });
});
