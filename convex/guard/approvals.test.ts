import {convexTest} from 'convex-test';
import {afterAll, beforeAll, describe, expect, test, vi} from 'vitest';
import {internal} from '../_generated/api';
import schema from '../schema';
import {modules} from '../test.setup';
import {jevAnswers} from '../jev/answers.testing';
import {ISSUER, jwksDocument, signToken} from './keys.testing';

const ORG = 'org_gatehouse';
const WEB_CLIENT = 'gatehouse-web-client';

beforeAll(() => {
  process.env.KINDE_ISSUER_URL = ISSUER;
  process.env.GATEHOUSE_AUDIENCE = 'https://gatehouse.api';
  process.env.GATEHOUSE_ORG_CODE = ORG;
  process.env.OPENROUTER_API_KEY = 'or-test-key';
  process.env.KINDE_WEB_CLIENT_ID = WEB_CLIENT;
  process.env.GATEHOUSE_APP_URL = 'https://gatehouse.example';
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/jwks.json`)
        return Response.json(jwksDocument);
      if (url === 'https://openrouter.ai/api/v1/systemone') {
        return Response.json({
          model: 'typesafe/jev-1.13-20260917',
          answers: jevAnswers({destructive: 0.96, risk: 2.8}),
          usage: {input_tokens: 600, cost: 0.00004}
        });
      }
      return realFetch(input, init);
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

type Body = {
  error?: {code: string};
  data?: Record<string, unknown>;
  approval?: {id: string; url: string; expiresAt: string};
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

function idToken(
  options: {sub?: string; authAgeSeconds?: number; audience?: string} = {}
) {
  return signToken(
    {
      sub: options.sub ?? 'kp_user_a',
      auth_time: nowSeconds() - (options.authAgeSeconds ?? 0)
    },
    {audience: options.audience ?? WEB_CLIENT}
  );
}

async function request(
  t: ReturnType<typeof convexTest>,
  method: string,
  path: string,
  token?: string
) {
  const response = await t.fetch(path, {
    method,
    headers: token ? {authorization: `Bearer ${token}`} : {}
  });
  return {status: response.status, body: (await response.json()) as Body};
}

async function holdDelete(t: ReturnType<typeof convexTest>) {
  const token = await signToken({
    org_code: ORG,
    permissions: ['gatehouse:projects:delete']
  });
  const response = await t.fetch(
    '/api/v1/projects/acme-rebrand?reason=The%20Acme%20project%20is%20finished',
    {
      method: 'DELETE',
      headers: {authorization: `Bearer ${token}`}
    }
  );
  const body = (await response.json()) as Body;
  expect(response.status).toBe(403);
  return body.approval!;
}

async function projectCount(t: ReturnType<typeof convexTest>) {
  return (await t.run((ctx) => ctx.db.query('projects').collect())).length;
}

async function heldRow(t: ReturnType<typeof convexTest>) {
  const [held] = await t.run((ctx) => ctx.db.query('heldCalls').collect());
  const decision = await t.run((ctx) =>
    ctx.db.get('decisions', held!.decisionId)
  );
  return {held: held!, decision: decision!};
}

describe('holding a step-up call', () => {
  test('stores the exact call, returns an approval link and runs nothing', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    expect(approval.url).toBe(
      `https://gatehouse.example/approve/${approval.id}`
    );
    const {held, decision} = await heldRow(t);
    expect(held).toMatchObject({
      status: 'pending',
      operationId: 'deleteProject',
      sub: 'kp_user_a'
    });
    expect(JSON.parse(held.argsJson)).toEqual({
      slug: 'acme-rebrand',
      reason: 'The Acme project is finished'
    });
    expect(decision.status).toBe('held');
    expect(await projectCount(t)).toBe(3);
  });
});

describe('viewing a held call', () => {
  test('shows the call to its owner', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const {status, body} = await request(
      t,
      'GET',
      `/api/held/${approval.id}`,
      await idToken()
    );
    expect(status).toBe(200);
    expect(body.data).toMatchObject({
      status: 'pending',
      operation: {id: 'deleteProject', tier: 'destructive'},
      args: {slug: 'acme-rebrand'},
      reason: 'The Acme project is finished'
    });
  });

  test('hides the call from another user', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const {status} = await request(
      t,
      'GET',
      `/api/held/${approval.id}`,
      await idToken({sub: 'kp_user_b'})
    );
    expect(status).toBe(404);
  });

  test('rejects an API access token in place of an ID token', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const token = await idToken({audience: 'https://gatehouse.api'});
    const {status, body} = await request(
      t,
      'GET',
      `/api/held/${approval.id}`,
      token
    );
    expect(status).toBe(401);
    expect(body.error?.code).toBe('token_audience_mismatch');
  });
});

describe('approving a held call', () => {
  test('runs the stored call once after a fresh sign-in', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const token = await idToken();
    const first = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      token
    );
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      status: 'executed',
      result: {slug: 'acme-rebrand', deleted: true}
    });
    expect(await projectCount(t)).toBe(2);
    const {held, decision} = await heldRow(t);
    expect(held.status).toBe('executed');
    expect(held.authAgeSeconds).toBeLessThanOrEqual(1);
    expect(decision.status).toBe('executed');

    const second = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      token
    );
    expect(second.status).toBe(409);
    expect(second.body.error?.code).toBe('held_not_pending');
  });

  test('refuses a sign-in older than the limit and keeps the call pending', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const token = await idToken({authAgeSeconds: 150});
    const {status, body} = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      token
    );
    expect(status).toBe(401);
    expect(body.error?.code).toBe('auth_stale');
    expect((await heldRow(t)).held.status).toBe('pending');
    expect(await projectCount(t)).toBe(3);
  });

  test('refuses a sign-in that happened before the call was held', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const {status, body} = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      await idToken({authAgeSeconds: 60})
    );
    expect(status).toBe(401);
    expect(body.error?.code).toBe('auth_before_hold');
    expect(await projectCount(t)).toBe(3);
  });

  test('refuses another user', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const {status} = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      await idToken({sub: 'kp_user_b'})
    );
    expect(status).toBe(404);
    expect(await projectCount(t)).toBe(3);
  });

  test('refuses an expired call and marks it expired', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    await t.run(async (ctx) => {
      const [held] = await ctx.db.query('heldCalls').collect();
      await ctx.db.patch('heldCalls', held!._id, {expiresAt: Date.now() - 1});
    });
    const {status, body} = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      await idToken()
    );
    expect(status).toBe(410);
    expect(body.error?.code).toBe('held_expired');
    const {held, decision} = await heldRow(t);
    expect(held.status).toBe('expired');
    expect(decision.status).toBe('expired');
    expect(await projectCount(t)).toBe(3);
  });
});

describe('denying and expiring', () => {
  test('a denied call can never be approved', async () => {
    const t = convexTest(schema, modules);
    const approval = await holdDelete(t);
    const denied = await request(
      t,
      'POST',
      `/api/held/${approval.id}/deny`,
      await idToken()
    );
    expect(denied.body.data).toEqual({status: 'denied'});
    const approved = await request(
      t,
      'POST',
      `/api/held/${approval.id}/approve`,
      await idToken()
    );
    expect(approved.status).toBe(409);
    expect((await heldRow(t)).decision.status).toBe('denied');
    expect(await projectCount(t)).toBe(3);
  });

  test('the cron expires stale pending calls', async () => {
    const t = convexTest(schema, modules);
    await holdDelete(t);
    await t.run(async (ctx) => {
      const [held] = await ctx.db.query('heldCalls').collect();
      await ctx.db.patch('heldCalls', held!._id, {expiresAt: Date.now() - 1});
    });
    expect(await t.mutation(internal.held.expireStale, {})).toBe(1);
    expect((await heldRow(t)).held.status).toBe('expired');
  });
});
