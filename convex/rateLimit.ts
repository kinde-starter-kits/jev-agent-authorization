import {v} from 'convex/values';
import {internalMutation} from './_generated/server';

export const LIMITS = {
  /** Guarded API calls, per user. Protects Jev spend from a looping agent. */
  api: {limit: 60, windowMs: 60_000},
  /** In-app agent and playground runs, per user. */
  run: {limit: 10, windowMs: 10 * 60_000}
} as const;

export type Bucket = keyof typeof LIMITS;

/** Fixed-window counter. One row per user and bucket. */
export const hit = internalMutation({
  args: {
    bucket: v.union(v.literal('api'), v.literal('run')),
    sub: v.string(),
    now: v.number()
  },
  returns: v.object({ok: v.boolean(), retryAfterMs: v.number()}),
  handler: async (ctx, {bucket, sub, now}) => {
    const {limit, windowMs} = LIMITS[bucket];
    const key = `${bucket}:${sub}`;
    const row = await ctx.db
      .query('rateLimits')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (!row) {
      await ctx.db.insert('rateLimits', {key, windowStart: now, count: 1});
      return {ok: true, retryAfterMs: 0};
    }
    if (now - row.windowStart >= windowMs) {
      await ctx.db.patch('rateLimits', row._id, {windowStart: now, count: 1});
      return {ok: true, retryAfterMs: 0};
    }
    if (row.count >= limit) {
      return {ok: false, retryAfterMs: row.windowStart + windowMs - now};
    }
    await ctx.db.patch('rateLimits', row._id, {count: row.count + 1});
    return {ok: true, retryAfterMs: 0};
  }
});
