import {v} from 'convex/values';
import type {Id} from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx
} from './_generated/server';

const RUN_LIMIT = 20;
const STEP_LIMIT = 100;
export const ACTIVE_RUN_MS = 10 * 60 * 1000;

async function viewerSub(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

export const create = internalMutation({
  args: {sub: v.string(), message: v.string(), model: v.string()},
  returns: v.id('runs'),
  handler: async (ctx, {sub, message, model}) => {
    const running = await ctx.db
      .query('runs')
      .withIndex('by_sub_and_status', (q) =>
        q.eq('sub', sub).eq('status', 'running')
      )
      .take(10);
    for (const run of running) {
      await ctx.db.patch('runs', run._id, {
        status: 'failed',
        errorCode: 'superseded',
        endedAt: Date.now()
      });
    }
    return await ctx.db.insert('runs', {
      sub,
      message,
      status: 'running',
      model,
      turns: 0,
      costUsd: 0
    });
  }
});

export const addStep = internalMutation({
  args: {
    runId: v.id('runs'),
    kind: v.union(v.literal('assistant'), v.literal('tool')),
    text: v.optional(v.string()),
    tool: v.optional(v.string()),
    argsJson: v.optional(v.string()),
    ok: v.optional(v.boolean()),
    httpStatus: v.optional(v.number()),
    code: v.optional(v.string()),
    decisionId: v.optional(v.string()),
    heldCallId: v.optional(v.string()),
    approvalUrl: v.optional(v.string()),
    resultPreview: v.optional(v.string())
  },
  returns: v.null(),
  handler: async (ctx, {runId, decisionId, heldCallId, ...step}) => {
    const last = await ctx.db
      .query('runSteps')
      .withIndex('by_runId_and_index', (q) => q.eq('runId', runId))
      .order('desc')
      .first();
    await ctx.db.insert('runSteps', {
      ...step,
      runId,
      index: (last?.index ?? -1) + 1,
      decisionId: decisionId
        ? (ctx.db.normalizeId('decisions', decisionId) ?? undefined)
        : undefined,
      heldCallId: heldCallId
        ? (ctx.db.normalizeId('heldCalls', heldCallId) ?? undefined)
        : undefined
    });
    return null;
  }
});

export const finish = internalMutation({
  args: {
    runId: v.id('runs'),
    status: v.union(
      v.literal('done'),
      v.literal('held'),
      v.literal('refused'),
      v.literal('failed')
    ),
    finalText: v.string(),
    turns: v.number(),
    costUsd: v.number(),
    errorCode: v.optional(v.string())
  },
  returns: v.null(),
  handler: async (ctx, {runId, ...result}) => {
    const run = await ctx.db.get('runs', runId);
    if (!run || run.status !== 'running') return null;
    await ctx.db.patch('runs', runId, {...result, endedAt: Date.now()});
    return null;
  }
});

export const activeForSub = internalQuery({
  args: {sub: v.string(), now: v.number()},
  returns: v.union(
    v.null(),
    v.object({runId: v.id('runs'), message: v.string()})
  ),
  handler: async (ctx, {sub, now}) => {
    const run = await ctx.db
      .query('runs')
      .withIndex('by_sub_and_status', (q) =>
        q.eq('sub', sub).eq('status', 'running')
      )
      .order('desc')
      .first();
    if (!run || now - run._creationTime > ACTIVE_RUN_MS) return null;
    return {runId: run._id, message: run.message};
  }
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const sub = await viewerSub(ctx);
    if (!sub) return [];
    const runs = await ctx.db
      .query('runs')
      .withIndex('by_sub', (q) => q.eq('sub', sub))
      .order('desc')
      .take(RUN_LIMIT);
    return runs.map((r) => ({
      id: r._id,
      message: r.message,
      status: r.status,
      model: r.model,
      turns: r.turns,
      costUsd: r.costUsd,
      finalText: r.finalText ?? null,
      createdAt: r._creationTime,
      endedAt: r.endedAt ?? null
    }));
  }
});

export const steps = query({
  args: {runId: v.string()},
  handler: async (ctx, {runId}) => {
    const sub = await viewerSub(ctx);
    const id = ctx.db.normalizeId('runs', runId);
    if (!sub || !id) return null;
    const run = await ctx.db.get('runs', id);
    if (!run || run.sub !== sub) return null;
    const rows = await ctx.db
      .query('runSteps')
      .withIndex('by_runId_and_index', (q) => q.eq('runId', id))
      .take(STEP_LIMIT);
    return Promise.all(
      rows.map(async (step) => {
        const decision = step.decisionId
          ? await ctx.db.get('decisions', step.decisionId as Id<'decisions'>)
          : null;
        const held = step.heldCallId
          ? await ctx.db.get('heldCalls', step.heldCallId as Id<'heldCalls'>)
          : null;
        return {
          id: step._id,
          index: step.index,
          kind: step.kind,
          text: step.text ?? null,
          tool: step.tool ?? null,
          argsJson: step.argsJson ?? null,
          ok: step.ok ?? null,
          code: step.code ?? null,
          approvalUrl: step.approvalUrl ?? null,
          heldStatus: held?.status ?? null,
          decision: decision
            ? {
                verdict: decision.verdict,
                reasonCode: decision.reasonCode,
                status: decision.status,
                intentSource: decision.intentSource ?? null,
                guardMs: decision.latency.guardMs,
                jev: decision.jev ?? null,
                judge: decision.judge ?? null
              }
            : null
        };
      })
    );
  }
});
