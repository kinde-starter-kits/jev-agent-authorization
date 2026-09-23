import {convexTest} from 'convex-test';
import {describe, expect, test} from 'vitest';
import {internal} from './_generated/api';
import {LIMITS} from './rateLimit';
import schema from './schema';
import {modules} from './test.setup';

describe('rateLimit.hit', () => {
  test('allows up to the limit, then refuses until the window ends', async () => {
    const t = convexTest(schema, modules);
    const {limit, windowMs} = LIMITS.run;
    const now = 1_000_000;
    for (let i = 0; i < limit; i++) {
      const result = await t.mutation(internal.rateLimit.hit, {
        bucket: 'run',
        sub: 'kp_a',
        now: now + i
      });
      expect(result.ok).toBe(true);
    }
    const refused = await t.mutation(internal.rateLimit.hit, {
      bucket: 'run',
      sub: 'kp_a',
      now: now + 1000
    });
    expect(refused).toEqual({ok: false, retryAfterMs: windowMs - 1000});

    const later = await t.mutation(internal.rateLimit.hit, {
      bucket: 'run',
      sub: 'kp_a',
      now: now + windowMs
    });
    expect(later.ok).toBe(true);
  });

  test('counts each user and bucket apart', async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < LIMITS.run.limit; i++) {
      await t.mutation(internal.rateLimit.hit, {
        bucket: 'run',
        sub: 'kp_a',
        now: 5
      });
    }
    expect(
      (
        await t.mutation(internal.rateLimit.hit, {
          bucket: 'run',
          sub: 'kp_b',
          now: 5
        })
      ).ok
    ).toBe(true);
    expect(
      (
        await t.mutation(internal.rateLimit.hit, {
          bucket: 'api',
          sub: 'kp_a',
          now: 5
        })
      ).ok
    ).toBe(true);
  });
});
