import {v} from 'convex/values';
import {internalMutation} from '../_generated/server';
import {fail} from '../lib/errors';

const EXPORT_LIMIT = 1000;

export const exportCustomers = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    actorSub: v.string(),
    destination: v.string(),
    scope: v.union(v.literal('all'), v.literal('company')),
    company: v.optional(v.string()),
    reason: v.optional(v.string())
  },
  handler: async (
    ctx,
    {workspaceId, actorSub, destination, scope, company}
  ) => {
    let url: URL;
    try {
      url = new URL(destination);
    } catch {
      fail('invalid_argument', 'destination must be a full URL.');
    }
    if (url.protocol !== 'https:')
      fail('invalid_argument', 'destination must use https.');
    if (scope === 'company' && !company?.trim()) {
      fail('invalid_argument', 'Give a company when scope is "company".');
    }

    const customers = await ctx.db
      .query('customers')
      .withIndex('by_workspaceId', (q) => q.eq('workspaceId', workspaceId))
      .take(EXPORT_LIMIT);
    const recordCount =
      scope === 'all'
        ? customers.length
        : customers.filter((c) => c.company === company?.trim()).length;

    await ctx.db.insert('exports', {
      workspaceId,
      destination: url.toString(),
      scope,
      company: scope === 'company' ? company?.trim() : undefined,
      recordCount,
      createdBySub: actorSub
    });
    return {
      destination: url.toString(),
      scope,
      recordCount,
      delivered: false,
      note: 'Demo workspace: the export is recorded but no data leaves the app.'
    };
  }
});
