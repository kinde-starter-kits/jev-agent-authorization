import {v} from 'convex/values';
import {internalQuery, query} from '../_generated/server';
import type {BenchSummary} from './metrics';

/** Latest finished benchmark run, for the benchmark page. */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const run = await ctx.db
      .query('benchRuns')
      .withIndex('by_status', (q) => q.eq('status', 'done'))
      .order('desc')
      .first();
    if (!run?.summaryJson) return null;
    return {
      id: run._id,
      finishedAt: run.finishedAt ?? run._creationTime,
      repeats: run.repeats,
      caseCount: run.caseCount,
      jevModel: run.jevModel,
      llmModel: run.llmModel,
      policyVersion: run.policyVersion,
      summary: JSON.parse(run.summaryJson) as BenchSummary
    };
  }
});

/** Progress of the newest run, running or not. */
export const progress = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      chunksDone: v.number(),
      chunksTotal: v.number()
    })
  ),
  handler: async (ctx) => {
    const run = await ctx.db.query('benchRuns').order('desc').first();
    return run
      ? {
          status: run.status,
          chunksDone: run.chunksDone,
          chunksTotal: run.chunksTotal
        }
      : null;
  }
});

/** Error texts of the newest run, counted per arm: `npx convex run bench/results:errors`. */
export const errors = internalQuery({
  args: {},
  returns: v.array(
    v.object({arm: v.string(), note: v.string(), count: v.number()})
  ),
  handler: async (ctx) => {
    const run = await ctx.db.query('benchRuns').order('desc').first();
    if (!run) return [];
    const counts = new Map<
      string,
      {arm: string; note: string; count: number}
    >();
    for await (const row of ctx.db
      .query('benchResults')
      .withIndex('by_runId', (q) => q.eq('runId', run._id))) {
      if (!row.error) continue;
      const note = row.note ?? 'no note';
      const key = `${row.arm}|${note}`;
      const entry = counts.get(key) ?? {arm: row.arm, note, count: 0};
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }
});
