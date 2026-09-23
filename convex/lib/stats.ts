import type {Doc} from '../_generated/dataModel';
import type {MutationCtx} from '../_generated/server';

type Counted = Pick<Doc<'decisions'>, 'verdict' | 'jev' | 'judge'>;

export const EMPTY_STATS = {
  total: 0,
  allowed: 0,
  steppedUp: 0,
  denied: 0,
  judged: 0,
  jevCostUsd: 0,
  judgeCalls: 0,
  judgeCostUsd: 0
};

export type StatCounts = typeof EMPTY_STATS;

export function addDecision(counts: StatCounts, decision: Counted): StatCounts {
  return {
    total: counts.total + 1,
    allowed: counts.allowed + (decision.verdict === 'allow' ? 1 : 0),
    steppedUp: counts.steppedUp + (decision.verdict === 'step_up' ? 1 : 0),
    denied: counts.denied + (decision.verdict === 'deny' ? 1 : 0),
    judged: counts.judged + (decision.jev ? 1 : 0),
    jevCostUsd: counts.jevCostUsd + (decision.jev?.costUsd ?? 0),
    judgeCalls: counts.judgeCalls + (decision.judge ? 1 : 0),
    judgeCostUsd: counts.judgeCostUsd + (decision.judge?.costUsd ?? 0)
  };
}

export async function countDecision(ctx: MutationCtx, decision: Counted) {
  const row = await ctx.db
    .query('stats')
    .withIndex('by_key', (q) => q.eq('key', 'global'))
    .unique();
  if (!row) {
    await ctx.db.insert('stats', {
      key: 'global',
      ...addDecision(EMPTY_STATS, decision)
    });
    return;
  }
  await ctx.db.patch('stats', row._id, addDecision(row, decision));
}
