import {v} from 'convex/values';
import {internalMutation, internalQuery} from './_generated/server';

export const ACCESS_TTL_MS = 60_000;

export const get = internalQuery({
  args: {sub: v.string(), orgCode: v.string(), now: v.number()},
  handler: async (ctx, {sub, orgCode, now}) => {
    const row = await ctx.db
      .query('kindeAccessCache')
      .withIndex('by_sub_and_orgCode', (q) =>
        q.eq('sub', sub).eq('orgCode', orgCode)
      )
      .unique();
    if (!row || row.expiresAt <= now) return null;
    return {permissions: row.permissions, featureFlags: row.featureFlags};
  }
});

export const put = internalMutation({
  args: {
    sub: v.string(),
    orgCode: v.string(),
    permissions: v.array(v.string()),
    featureFlags: v.record(v.string(), v.boolean())
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expiresAt = Date.now() + ACCESS_TTL_MS;
    const existing = await ctx.db
      .query('kindeAccessCache')
      .withIndex('by_sub_and_orgCode', (q) =>
        q.eq('sub', args.sub).eq('orgCode', args.orgCode)
      )
      .unique();
    if (existing) {
      await ctx.db.patch('kindeAccessCache', existing._id, {
        ...args,
        expiresAt
      });
    } else {
      await ctx.db.insert('kindeAccessCache', {...args, expiresAt});
    }
    return null;
  }
});
