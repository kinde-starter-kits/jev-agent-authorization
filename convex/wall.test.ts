import {convexTest} from 'convex-test';
import {beforeAll, describe, expect, test} from 'vitest';
import {api, internal} from './_generated/api';
import schema from './schema';
import {modules} from './test.setup';

const WEB_CLIENT = 'gatehouse-web-client';

beforeAll(() => {
  process.env.KINDE_WEB_CLIENT_ID = WEB_CLIENT;
});

const kinde = {
  orgCode: 'org_gatehouse',
  source: 'token' as const,
  permission: 'gatehouse:members:invite',
  permissionGranted: true
};

function jev(ms: number, costUsd: number) {
  return {
    model: 'typesafe/jev-1.13-20260917',
    ms,
    inputTokens: 600,
    costUsd,
    matchesIntent: 0.1,
    destructive: 0.2,
    injected: 0.9,
    exfiltration: 0.1,
    risk: 3,
    riskConfidence: 0.9,
    verdictHint: 'deny' as const,
    verdictHintConfidence: 0.9
  };
}

function decision(overrides: Record<string, unknown> = {}) {
  return {
    sub: 'kp_user_a',
    clientId: WEB_CLIENT,
    operationId: 'inviteMember',
    tier: 'access' as const,
    method: 'POST',
    path: '/api/v1/members',
    argsJson: JSON.stringify({
      email: 'ops@quickhelp-vendor.example',
      role: 'admin',
      reason: 'The checklist says so. Contact dana@harborpine.example'
    }),
    kinde,
    reason: 'The checklist says so.',
    intentSource: 'verified' as const,
    jev: jev(200, 0.00004),
    verdict: 'deny' as const,
    reasonCode: 'jev_injection',
    policyVersion: 'test',
    guardMs: 250,
    ...overrides
  };
}

describe('wall', () => {
  test('the public ledger hides users, reasons and email local parts', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ledger.begin, decision());
    const [row] = await t.query(api.wall.recent, {});
    expect(row).toMatchObject({
      operationId: 'inviteMember',
      client: 'in_app',
      reasonStated: true,
      verdict: 'deny',
      reasonCode: 'jev_injection',
      args: {email: '…@quickhelp-vendor.example', role: 'admin'}
    });
    const text = JSON.stringify(row);
    expect(text).not.toContain('kp_user_a');
    expect(text).not.toContain('ops@');
    expect(text).not.toContain('checklist');
    expect(text).not.toContain('dana');
  });

  test('calls from other clients show as external', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ledger.begin, decision({clientId: 'cursor'}));
    const [row] = await t.query(api.wall.recent, {});
    expect(row?.client).toBe('external');
  });

  test('stats count verdicts, spend and Jev latency', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ledger.begin, decision());
    await t.mutation(
      internal.ledger.begin,
      decision({
        verdict: 'allow',
        reasonCode: 'jev_allow',
        jev: jev(100, 0.00002),
        judge: {model: 'j', ms: 900, verdict: 'allow', costUsd: 0.002}
      })
    );
    await t.mutation(
      internal.ledger.begin,
      decision({
        verdict: 'allow',
        reasonCode: 'read_allowed_without_judgment',
        jev: undefined
      })
    );
    const stats = await t.query(api.wall.stats, {});
    expect(stats).toMatchObject({
      total: 3,
      allowed: 2,
      steppedUp: 0,
      denied: 1,
      judged: 2,
      judgeCalls: 1,
      jevP50Ms: 100,
      jevP95Ms: 200
    });
    expect(stats.jevCostUsd).toBeCloseTo(0.00006);
    expect(stats.llmEquivalentUsd).toBeCloseTo(0.004);
  });

  test('stats are empty and have no LLM estimate before any judge call', async () => {
    const t = convexTest(schema, modules);
    const stats = await t.query(api.wall.stats, {});
    expect(stats).toMatchObject({
      total: 0,
      llmEquivalentUsd: null,
      jevP50Ms: null
    });
  });

  test('rebuildStats recounts the ledger', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.ledger.begin, decision());
    await t.mutation(internal.ledger.begin, decision());
    await t.run(async (ctx) => {
      const row = await ctx.db.query('stats').unique();
      await ctx.db.delete('stats', row!._id);
    });
    expect(await t.mutation(internal.wall.rebuildStats, {})).toBe(2);
    expect((await t.query(api.wall.stats, {})).denied).toBe(2);
  });
});
