import {v} from 'convex/values';
import {internalMutation} from './_generated/server';
import {
  decisionStatus,
  jevRecord,
  judgeRecord,
  kindeCheck,
  tier,
  verdict
} from './schema';
import {seedWorkspace} from './seed';

export const HOLD_TTL_MS = 10 * 60 * 1000;

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
    jev: v.optional(jevRecord),
    judge: v.optional(judgeRecord),
    verdict,
    reasonCode: v.string(),
    policyVersion: v.string(),
    guardMs: v.number(),
    holdArgsJson: v.optional(v.string())
  },
  returns: v.object({
    decisionId: v.id('decisions'),
    workspaceId: v.id('workspaces'),
    held: v.optional(
      v.object({heldCallId: v.id('heldCalls'), expiresAt: v.number()})
    )
  }),
  handler: async (ctx, {guardMs, holdArgsJson, ...decision}) => {
    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_ownerSub', (q) => q.eq('ownerSub', decision.sub))
      .unique();
    const workspaceId =
      existing?._id ?? (await seedWorkspace(ctx, decision.sub));
    const decisionId = await ctx.db.insert('decisions', {
      ...decision,
      workspaceId,
      status:
        decision.verdict === 'allow'
          ? 'pending'
          : decision.verdict === 'step_up' && holdArgsJson !== undefined
            ? 'held'
            : 'refused',
      latency: {guardMs}
    });
    if (decision.verdict !== 'step_up' || holdArgsJson === undefined) {
      return {decisionId, workspaceId};
    }
    const expiresAt = Date.now() + HOLD_TTL_MS;
    const heldCallId = await ctx.db.insert('heldCalls', {
      decisionId,
      sub: decision.sub,
      workspaceId,
      operationId: decision.operationId,
      argsJson: holdArgsJson,
      status: 'pending',
      expiresAt
    });
    return {decisionId, workspaceId, held: {heldCallId, expiresAt}};
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
