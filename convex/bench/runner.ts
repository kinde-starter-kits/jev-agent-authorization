import {v} from 'convex/values';
import {internal} from '../_generated/api';
import {
  env,
  internalAction,
  internalMutation,
  internalQuery
} from '../_generated/server';
import {DEFAULT_JEV_MODEL, askJev} from '../jev/client';
import {askJudge} from '../jev/judge';
import {POLICY_VERSION} from '../guard/policy';
import {runCase, runLlmCase} from './arms';
import {BENCH_CASES} from './cases';
import {askLlmVerdict, LlmHttpError} from './llmJudge';
import {summarize, type CalibrationRow, type ResultRow} from './metrics';
import {verdict as verdictValidator} from '../schema';

const CHUNK_SIZE = 10;
const CONCURRENCY = 3;
const STAGGER_MS = 8000;
const ATTEMPTS = 4;

/** Retries rate limits and timeouts, so the result measures the model, not the network. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  throw last;
}

/**
 * Starts a benchmark run: `npm run bench`.
 * Each chunk runs as its own action, so no action gets near the time limit.
 */
export const start = internalMutation({
  args: {repeats: v.optional(v.number()), limit: v.optional(v.number())},
  returns: v.id('benchRuns'),
  handler: async (ctx, {repeats = 3, limit}) => {
    const apiKey = env.OPENROUTER_API_KEY;
    const llmModel = env.LLM_JUDGE_MODEL;
    if (!apiKey || !llmModel) {
      throw new Error('Set OPENROUTER_API_KEY and LLM_JUDGE_MODEL first.');
    }
    const caseCount = Math.min(limit ?? BENCH_CASES.length, BENCH_CASES.length);
    const chunksTotal = Math.ceil(caseCount / CHUNK_SIZE);
    const runId = await ctx.db.insert('benchRuns', {
      status: 'running',
      repeats,
      caseCount,
      chunksTotal,
      chunksDone: 0,
      jevModel: env.JEV_MODEL ?? DEFAULT_JEV_MODEL,
      llmModel,
      policyVersion: POLICY_VERSION
    });
    for (let chunk = 0; chunk < chunksTotal; chunk++) {
      await ctx.scheduler.runAfter(
        chunk * STAGGER_MS,
        internal.bench.runner.runChunk,
        {
          runId,
          from: chunk * CHUNK_SIZE,
          to: Math.min((chunk + 1) * CHUNK_SIZE, caseCount),
          repeats
        }
      );
    }
    return runId;
  }
});

async function pool<T>(tasks: (() => Promise<T>)[], size: number) {
  const results: T[] = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  }
  await Promise.all(Array.from({length: size}, worker));
  return results;
}

export const runChunk = internalAction({
  args: {
    runId: v.id('benchRuns'),
    from: v.number(),
    to: v.number(),
    repeats: v.number()
  },
  returns: v.null(),
  handler: async (ctx, {runId, from, to, repeats}) => {
    const apiKey = env.OPENROUTER_API_KEY ?? '';
    const llmModel = env.LLM_JUDGE_MODEL ?? '';
    const jevModel = env.JEV_MODEL;
    const cases = BENCH_CASES.slice(from, to);
    const tasks = cases.flatMap((c) =>
      Array.from(
        {length: repeats},
        (_, repeat) => () =>
          runCase(c, repeat, {
            jev: (state) =>
              withRetry(() => askJev(state, {apiKey, model: jevModel})),
            judge: (state) =>
              withRetry(() => askJudge(state, {apiKey, model: llmModel})),
            llm: (state) =>
              withRetry(() => askLlmVerdict(state, {apiKey, model: llmModel}))
          })
      )
    );
    const outcomes = await pool(tasks, CONCURRENCY);
    await ctx.runMutation(internal.bench.runner.record, {
      runId,
      rows: outcomes.flatMap((o) => o.rows),
      calibration: outcomes.flatMap((o) => o.calibration)
    });
    return null;
  }
});

const resultRow = v.object({
  caseId: v.string(),
  category: v.string(),
  expected: verdictValidator,
  arm: v.union(
    v.literal('gatehouse'),
    v.literal('jev_single'),
    v.literal('llm_judge')
  ),
  repeat: v.number(),
  verdict: verdictValidator,
  ms: v.number(),
  costUsd: v.number(),
  error: v.boolean(),
  parseFailed: v.boolean(),
  note: v.optional(v.string())
});

export const record = internalMutation({
  args: {
    runId: v.id('benchRuns'),
    rows: v.array(resultRow),
    calibration: v.array(
      v.object({
        signal: v.union(v.literal('injected'), v.literal('matchesIntent')),
        predicted: v.number(),
        actual: v.boolean()
      })
    )
  },
  returns: v.null(),
  handler: async (ctx, {runId, rows, calibration}) => {
    const run = await ctx.db.get('benchRuns', runId);
    if (!run || run.status !== 'running') return null;
    for (const row of rows)
      await ctx.db.insert('benchResults', {runId, ...row});
    for (const row of calibration)
      await ctx.db.insert('benchCalibration', {runId, ...row});
    const chunksDone = run.chunksDone + 1;
    await ctx.db.patch('benchRuns', runId, {chunksDone});
    if (chunksDone === run.chunksTotal) {
      await ctx.scheduler.runAfter(0, internal.bench.runner.finalize, {runId});
    }
    return null;
  }
});

export const finalize = internalMutation({
  args: {runId: v.id('benchRuns')},
  returns: v.null(),
  handler: async (ctx, {runId}) => {
    const rows: ResultRow[] = [];
    for await (const r of ctx.db
      .query('benchResults')
      .withIndex('by_runId', (q) => q.eq('runId', runId))) {
      rows.push(r);
    }
    const calibration: CalibrationRow[] = [];
    for await (const r of ctx.db
      .query('benchCalibration')
      .withIndex('by_runId', (q) => q.eq('runId', runId))) {
      calibration.push(r);
    }
    await ctx.db.patch('benchRuns', runId, {
      status: 'done',
      finishedAt: Date.now(),
      summaryJson: JSON.stringify(summarize(rows, calibration))
    });
    return null;
  }
});

// ---- Paced LLM pass ------------------------------------------------------
// The LLM provider rate-limits hard. This pass reruns only the llm_judge arm,
// one chunk at a time, and waits out every 429 before it counts an error.

const LLM_CHUNK = 10;
const LLM_CONCURRENCY = 2;
const LLM_ATTEMPTS = 8;
const LLM_MAX_WAIT_MS = 60_000;

async function patient<T>(call: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < LLM_ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (error) {
      last = error;
      const retryAfter =
        error instanceof LlmHttpError ? error.retryAfter : null;
      const wait = Math.min(
        retryAfter !== null ? retryAfter * 1000 : 2000 * 2 ** attempt,
        LLM_MAX_WAIT_MS
      );
      await new Promise((resolve) =>
        setTimeout(resolve, wait + Math.random() * 500)
      );
    }
  }
  throw last;
}

/** `npx convex run bench/runner:rerunLlm` — reruns the LLM arm of the newest run. */
export const rerunLlm = internalMutation({
  args: {},
  returns: v.id('benchRuns'),
  handler: async (ctx) => {
    const run = await ctx.db.query('benchRuns').order('desc').first();
    if (!run || run.status === 'running') {
      throw new Error('No finished run to repair.');
    }
    const old = await ctx.db
      .query('benchResults')
      .withIndex('by_runId', (q) => q.eq('runId', run._id))
      .collect();
    for (const row of old) {
      if (row.arm === 'llm_judge') await ctx.db.delete('benchResults', row._id);
    }
    await ctx.db.patch('benchRuns', run._id, {
      status: 'running',
      chunksDone: 0,
      chunksTotal: Math.ceil(run.caseCount / LLM_CHUNK)
    });
    await ctx.scheduler.runAfter(0, internal.bench.runner.runLlmChunk, {
      runId: run._id,
      from: 0
    });
    return run._id;
  }
});

export const runLlmChunk = internalAction({
  args: {runId: v.id('benchRuns'), from: v.number()},
  returns: v.null(),
  handler: async (ctx, {runId, from}) => {
    const apiKey = env.OPENROUTER_API_KEY ?? '';
    const llmModel = env.LLM_JUDGE_MODEL ?? '';
    const run = await ctx.runQuery(internal.bench.runner.runInfo, {runId});
    if (!run) return null;
    const to = Math.min(from + LLM_CHUNK, run.caseCount);
    const tasks = BENCH_CASES.slice(from, to).flatMap((c) =>
      Array.from(
        {length: run.repeats},
        (_, repeat) => () =>
          runLlmCase(c, repeat, (state) =>
            patient(() => askLlmVerdict(state, {apiKey, model: llmModel}))
          )
      )
    );
    const rows = await pool(tasks, LLM_CONCURRENCY);
    await ctx.runMutation(internal.bench.runner.recordLlm, {
      runId,
      rows,
      next: to < run.caseCount ? to : null
    });
    return null;
  }
});

export const runInfo = internalQuery({
  args: {runId: v.id('benchRuns')},
  returns: v.union(
    v.null(),
    v.object({caseCount: v.number(), repeats: v.number()})
  ),
  handler: async (ctx, {runId}) => {
    const run = await ctx.db.get('benchRuns', runId);
    return run ? {caseCount: run.caseCount, repeats: run.repeats} : null;
  }
});

export const recordLlm = internalMutation({
  args: {
    runId: v.id('benchRuns'),
    rows: v.array(resultRow),
    next: v.union(v.number(), v.null())
  },
  returns: v.null(),
  handler: async (ctx, {runId, rows, next}) => {
    const run = await ctx.db.get('benchRuns', runId);
    if (!run || run.status !== 'running') return null;
    for (const row of rows)
      await ctx.db.insert('benchResults', {runId, ...row});
    await ctx.db.patch('benchRuns', runId, {chunksDone: run.chunksDone + 1});
    if (next === null) {
      await ctx.scheduler.runAfter(0, internal.bench.runner.finalize, {runId});
    } else {
      await ctx.scheduler.runAfter(0, internal.bench.runner.runLlmChunk, {
        runId,
        from: next
      });
    }
    return null;
  }
});
