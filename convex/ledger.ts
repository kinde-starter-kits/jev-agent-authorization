import {v} from 'convex/values';
import {internalMutation} from './_generated/server';
import {decisionStatus, kindeCheck, tier, verdict} from './schema';
import {seedWorkspace} from './seed';

export const begin = internalMutation({
  args: {
    sub: v.string(),
    clientId: v.optional(v.string()),
    operationId: v.string(),
    tier,
    method: v.string(),
    path: v.string(),
    argsJson: v.string(),
    kinde: kindeCheck,
    reason: v.optional(v.string()),
    verdict,
    reasonCode: v.string(),
    policyVersion: v.string(),
    guardMs: v.number()
  },
  returns: v.object({
    decisionId: v.id('decisions'),
    workspaceId: v.id('workspaces')
  }),
  handler: async (ctx, {guardMs, ...decision}) => {
    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_ownerSub', (q) => q.eq('ownerSub', decision.sub))
      .unique();
    const workspaceId =
      existing?._id ?? (await seedWorkspace(ctx, decision.sub));
    const decisionId = await ctx.db.insert('decisions', {
      ...decision,
      workspaceId,
      status: decision.verdict === 'allow' ? 'pending' : 'refused',
      latency: {guardMs}
    });
    return {decisionId, workspaceId};
  }
});

export const complete = internalMutation({
  args: {
    decisionId: v.id('decisions'),
    status: decisionStatus,
    errorCode: v.optional(v.string()),
    operationMs: v.number()
  },
  returns: v.null(),
  handler: async (ctx, {decisionId, status, errorCode, operationMs}) => {
    const decision = await ctx.db.get('decisions', decisionId);
    if (!decision) return null;
    await ctx.db.patch('decisions', decisionId, {
      status,
      errorCode,
      latency: {...decision.latency, operationMs}
    });
    return null;
  }
});
