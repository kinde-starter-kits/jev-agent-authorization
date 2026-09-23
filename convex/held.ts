import {v} from 'convex/values';
import type {Doc, Id} from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  type MutationCtx
} from './_generated/server';
import {operationById} from './api/operations';

export const MAX_AUTH_AGE_SECONDS = 120;
const CLOCK_SKEW_MS = 5000;
const EXPIRE_BATCH = 100;

type Resolution =
  | {ok: true; status: 'executed'; result: unknown; authAgeSeconds: number}
  | {ok: true; status: 'denied'}
  | {
      ok: false;
      code:
        | 'held_not_found'
        | 'held_not_pending'
        | 'held_expired'
        | 'auth_stale'
        | 'auth_before_hold'
        | 'operation_failed';
      message: string;
    };

async function ownHeld(ctx: MutationCtx, heldId: string, sub: string) {
  const id = ctx.db.normalizeId('heldCalls', heldId);
  if (!id) return null;
  const held = await ctx.db.get('heldCalls', id);
  if (!held || held.sub !== sub) return null;
  return held;
}

async function close(
  ctx: MutationCtx,
  held: Doc<'heldCalls'>,
  status: 'executed' | 'failed' | 'denied' | 'expired',
  extra: {
    authAgeSeconds?: number;
    errorCode?: string;
    operationMs?: number;
  } = {}
) {
  const now = Date.now();
  await ctx.db.patch('heldCalls', held._id, {
    status,
    resolvedAt: now,
    authAgeSeconds: extra.authAgeSeconds,
    errorCode: extra.errorCode
  });
  const decision = await ctx.db.get('decisions', held.decisionId);
  if (decision) {
    await ctx.db.patch('decisions', held.decisionId, {
      status,
      errorCode: extra.errorCode,
      latency:
        extra.operationMs === undefined
          ? decision.latency
          : {...decision.latency, operationMs: extra.operationMs}
    });
  }
}

function errorCodeOf(error: unknown) {
  const data = (error as {data?: {code?: unknown}}).data;
  return typeof data?.code === 'string' ? data.code : 'operation_failed';
}

export const forOwner = internalQuery({
  args: {heldId: v.string(), sub: v.string()},
  handler: async (ctx, {heldId, sub}) => {
    const id = ctx.db.normalizeId('heldCalls', heldId);
    if (!id) return null;
    const held = await ctx.db.get('heldCalls', id);
    if (!held || held.sub !== sub) return null;
    const decision = await ctx.db.get('decisions', held.decisionId);
    const operation = operationById(held.operationId);
    return {
      id: held._id,
      status: held.status,
      createdAt: held._creationTime,
      expiresAt: held.expiresAt,
      resolvedAt: held.resolvedAt ?? null,
      authAgeSeconds: held.authAgeSeconds ?? null,
      errorCode: held.errorCode ?? null,
      operation: {
        id: held.operationId,
        summary: operation?.summary ?? held.operationId,
        effect: operation?.description ?? '',
        tier: operation?.tier ?? null
      },
      args: JSON.parse(held.argsJson) as Record<string, unknown>,
      reason: decision?.reason ?? null,
      reasonCode: decision?.reasonCode ?? null,
      jev: decision?.jev ?? null
    };
  }
});

export const approve = internalMutation({
  args: {heldId: v.string(), sub: v.string(), authTime: v.number()},
  handler: async (ctx, {heldId, sub, authTime}): Promise<Resolution> => {
    const held = await ownHeld(ctx, heldId, sub);
    if (!held) {
      return {
        ok: false,
        code: 'held_not_found',
        message: 'No held call with that id for this user.'
      };
    }
    if (held.status !== 'pending') {
      return {
        ok: false,
        code: 'held_not_pending',
        message: `This call is already ${held.status}.`
      };
    }
    const now = Date.now();
    if (held.expiresAt <= now) {
      await close(ctx, held, 'expired');
      return {
        ok: false,
        code: 'held_expired',
        message: 'This call expired before it was approved.'
      };
    }
    const authAgeSeconds = Math.max(0, Math.round(now / 1000 - authTime));
    if (authAgeSeconds > MAX_AUTH_AGE_SECONDS) {
      return {
        ok: false,
        code: 'auth_stale',
        message: `Sign in again. The sign-in is ${authAgeSeconds} seconds old and the limit is ${MAX_AUTH_AGE_SECONDS}.`
      };
    }

    if (authTime * 1000 < held._creationTime - CLOCK_SKEW_MS) {
      return {
        ok: false,
        code: 'auth_before_hold',
        message:
          'Sign in again. The sign-in must happen after the call was held.'
      };
    }
    const operation = operationById(held.operationId);
    if (!operation || operation.run.kind !== 'mutation') {
      await close(ctx, held, 'failed', {
        authAgeSeconds,
        errorCode: 'operation_unknown'
      });
      return {
        ok: false,
        code: 'operation_failed',
        message: 'The held operation is not known.'
      };
    }
    const args = {
      ...(JSON.parse(held.argsJson) as Record<string, unknown>),
      workspaceId: held.workspaceId as Id<'workspaces'>,
      actorSub: held.sub
    };
    const started = Date.now();
    try {
      const result: unknown = await ctx.runMutation(operation.run.ref, args);
      await close(ctx, held, 'executed', {
        authAgeSeconds,
        operationMs: Date.now() - started
      });
      return {ok: true, status: 'executed', result, authAgeSeconds};
    } catch (error) {
      const errorCode = errorCodeOf(error);
      await close(ctx, held, 'failed', {
        authAgeSeconds,
        errorCode,
        operationMs: Date.now() - started
      });
      return {
        ok: false,
        code: 'operation_failed',
        message: `The operation failed: ${errorCode}.`
      };
    }
  }
});

export const deny = internalMutation({
  args: {heldId: v.string(), sub: v.string()},
  handler: async (ctx, {heldId, sub}): Promise<Resolution> => {
    const held = await ownHeld(ctx, heldId, sub);
    if (!held) {
      return {
        ok: false,
        code: 'held_not_found',
        message: 'No held call with that id for this user.'
      };
    }
    if (held.status !== 'pending') {
      return {
        ok: false,
        code: 'held_not_pending',
        message: `This call is already ${held.status}.`
      };
    }
    await close(ctx, held, 'denied');
    return {ok: true, status: 'denied'};
  }
});

export const expireStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const stale = await ctx.db
      .query('heldCalls')
      .withIndex('by_status_and_expiresAt', (q) =>
        q.eq('status', 'pending').lte('expiresAt', Date.now())
      )
      .take(EXPIRE_BATCH);
    for (const held of stale) await close(ctx, held, 'expired');
    return stale.length;
  }
});
