import {v} from 'convex/values';
import {internalMutation, internalQuery} from './_generated/server';

const EXCERPT_LENGTH = 1500;
const SERVED_LIMIT = 5;
const DECISION_LIMIT = 10;

export const recordServed = internalMutation({
  args: {
    sub: v.string(),
    source: v.string(),
    title: v.string(),
    content: v.string()
  },
  returns: v.null(),
  handler: async (ctx, {sub, source, title, content}) => {
    await ctx.db.insert('servedContent', {
      sub,
      source,
      title,
      excerpt: content.slice(0, EXCERPT_LENGTH)
    });
    return null;
  }
});

export const forSub = internalQuery({
  args: {sub: v.string(), now: v.number()},
  handler: async (ctx, {sub, now}) => {
    const served = await ctx.db
      .query('servedContent')
      .withIndex('by_sub', (q) => q.eq('sub', sub))
      .order('desc')
      .take(SERVED_LIMIT);
    const decisions = await ctx.db
      .query('decisions')
      .withIndex('by_sub', (q) => q.eq('sub', sub))
      .order('desc')
      .take(DECISION_LIMIT);
    return {
      served: served.map((s) => ({
        source: s.source,
        title: s.title,
        excerpt: s.excerpt,
        secondsAgo: Math.round((now - s._creationTime) / 1000)
      })),
      recent: decisions.map((d) => ({
        operation: d.operationId,
        verdict: d.verdict,
        secondsAgo: Math.round((now - d._creationTime) / 1000)
      }))
    };
  }
});
