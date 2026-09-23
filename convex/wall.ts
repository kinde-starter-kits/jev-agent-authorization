import {v} from 'convex/values';
import {env, internalMutation, query} from './_generated/server';
import {publicArgs} from './lib/redact';
import {addDecision, EMPTY_STATS, type StatCounts} from './lib/stats';
import {
  decisionStatus,
  intentSource,
  jevRecord,
  judgeRecord,
  tier,
  verdict
} from './schema';

const WALL_LIMIT = 50;
const LATENCY_SAMPLE = 200;

const publicDecision = v.object({
  id: v.id('decisions'),
  createdAt: v.number(),
  operationId: v.string(),
  tier,
  method: v.string(),
  args: v.record(v.string(), v.string()),
  client: v.union(v.literal('in_app'), v.literal('external')),
  kinde: v.object({
    source: v.optional(v.union(v.literal('token'), v.literal('kinde_api'))),
    permission: v.string(),
    permissionGranted: v.boolean(),
    flag: v.optional(v.string()),
    flagEnabled: v.optional(v.boolean())
  }),
  reasonStated: v.boolean(),
  intentSource: v.optional(intentSource),
  jev: v.optional(jevRecord),
  judge: v.optional(judgeRecord),
  verdict,
  reasonCode: v.string(),
  policyVersion: v.string(),
  status: decisionStatus,
  guardMs: v.number()
});

/** Public ledger wall. No user ids, no reason text, no email local parts. */
export const recent = query({
  args: {},
  returns: v.array(publicDecision),
  handler: async (ctx) => {
    const webClient = env.KINDE_WEB_CLIENT_ID;
    const rows = await ctx.db.query('decisions').order('desc').take(WALL_LIMIT);
    return rows.map((row) => ({
      id: row._id,
      createdAt: row._creationTime,
      operationId: row.operationId,
      tier: row.tier,
      method: row.method,
      args: publicArgs(row.argsJson),
      client:
        webClient && row.clientId === webClient
          ? ('in_app' as const)
          : ('external' as const),
      kinde: {
        source: row.kinde.source,
        permission: row.kinde.permission,
        permissionGranted: row.kinde.permissionGranted,
        flag: row.kinde.flag,
        flagEnabled: row.kinde.flagEnabled
      },
      reasonStated: Boolean(row.reason?.trim()),
      intentSource: row.intentSource,
      jev: row.jev,
      judge: row.judge,
      verdict: row.verdict,
      reasonCode: row.reasonCode,
      policyVersion: row.policyVersion,
      status: row.status,
      guardMs: row.latency.guardMs
    }));
  }
});

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1)
  );
  return sorted[index] ?? null;
}

export const stats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    allowed: v.number(),
    steppedUp: v.number(),
    denied: v.number(),
    judged: v.number(),
    jevCostUsd: v.number(),
    judgeCalls: v.number(),
    judgeCostUsd: v.number(),
    llmEquivalentUsd: v.union(v.number(), v.null()),
    jevP50Ms: v.union(v.number(), v.null()),
    jevP95Ms: v.union(v.number(), v.null())
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query('stats')
      .withIndex('by_key', (q) => q.eq('key', 'global'))
      .unique();
    const counts = row
      ? {
          total: row.total,
          allowed: row.allowed,
          steppedUp: row.steppedUp,
          denied: row.denied,
          judged: row.judged,
          jevCostUsd: row.jevCostUsd,
          judgeCalls: row.judgeCalls,
          judgeCostUsd: row.judgeCostUsd
        }
      : EMPTY_STATS;

    const recentRows = await ctx.db
      .query('decisions')
      .order('desc')
      .take(LATENCY_SAMPLE);
    const jevMs = recentRows
      .flatMap((d) => (d.jev ? [d.jev.ms] : []))
      .sort((a, b) => a - b);

    // Measured, not assumed: the average cost of the LLM judge calls this
    // deployment made, applied to every call Jev judged.
    const llmEquivalentUsd =
      counts.judgeCalls > 0
        ? (counts.judgeCostUsd / counts.judgeCalls) * counts.judged
        : null;

    return {
      ...counts,
      llmEquivalentUsd,
      jevP50Ms: percentile(jevMs, 0.5),
      jevP95Ms: percentile(jevMs, 0.95)
    };
  }
});

/** Recounts the stats row from the ledger. Run once after adding stats. */
export const rebuildStats = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let counts: StatCounts = EMPTY_STATS;
    for await (const decision of ctx.db.query('decisions')) {
      counts = addDecision(counts, decision);
    }
    const row = await ctx.db
      .query('stats')
      .withIndex('by_key', (q) => q.eq('key', 'global'))
      .unique();
    if (row) await ctx.db.patch('stats', row._id, counts);
    else await ctx.db.insert('stats', {key: 'global', ...counts});
    return counts.total;
  }
});
