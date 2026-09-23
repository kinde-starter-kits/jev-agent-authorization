import {convexTest} from 'convex-test';
import {describe, expect, test} from 'vitest';
import {api, internal} from './_generated/api';
import schema from './schema';
import {modules} from './test.setup';

const ISSUER = 'https://gatehouse-test.kinde.com';

async function withRun() {
  const t = convexTest(schema, modules);
  const runId = await t.mutation(internal.runs.create, {
    sub: 'kp_user_a',
    message: 'list my projects',
    model: 'm'
  });
  await t.mutation(internal.runs.addStep, {
    runId,
    kind: 'assistant',
    text: 'Looking.'
  });
  return {t, runId};
}

describe('runs', () => {
  test('the owner sees their runs and steps', async () => {
    const {t, runId} = await withRun();
    const owner = t.withIdentity({subject: 'kp_user_a', issuer: ISSUER});
    expect(await owner.query(api.runs.mine, {})).toHaveLength(1);
    const steps = await owner.query(api.runs.steps, {runId});
    expect(steps?.[0]).toMatchObject({
      kind: 'assistant',
      text: 'Looking.',
      index: 0
    });
  });

  test('another user and anonymous callers see nothing', async () => {
    const {t, runId} = await withRun();
    const other = t.withIdentity({subject: 'kp_user_b', issuer: ISSUER});
    expect(await other.query(api.runs.mine, {})).toEqual([]);
    expect(await other.query(api.runs.steps, {runId})).toBeNull();
    expect(await t.query(api.runs.mine, {})).toEqual([]);
  });

  test('a new run supersedes a running one', async () => {
    const {t} = await withRun();
    await t.mutation(internal.runs.create, {
      sub: 'kp_user_a',
      message: 'second',
      model: 'm'
    });
    const runs = await t.run((ctx) => ctx.db.query('runs').collect());
    expect(runs.map((r) => r.status).sort()).toEqual(['failed', 'running']);
  });

  test('the active run is only the recent running one', async () => {
    const {t, runId} = await withRun();
    const now = Date.now();
    expect(
      await t.query(internal.runs.activeForSub, {sub: 'kp_user_a', now})
    ).toMatchObject({runId});
    expect(
      await t.query(internal.runs.activeForSub, {
        sub: 'kp_user_a',
        now: now + 11 * 60 * 1000
      })
    ).toBeNull();
    await t.mutation(internal.runs.finish, {
      runId,
      status: 'done',
      finalText: 'ok',
      turns: 1,
      costUsd: 0
    });
    expect(
      await t.query(internal.runs.activeForSub, {sub: 'kp_user_a', now})
    ).toBeNull();
  });
});
