import {userError} from '../lib/errors';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {env, type ActionCtx} from '../_generated/server';
import {remoteJwks, verifyKindeToken} from '../guard/token';
import type {LoopResult, Step} from './loop';

export const MAX_MESSAGE = 1000;

/**
 * Checks the caller of an agent run: signed in to Convex, and the Kinde
 * access token belongs to the same user. The token is never stored.
 */
export async function openAgentSession(ctx: ActionCtx, accessToken: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity)
    throw userError('unauthenticated', 'Sign in to run the agent.');

  const issuer = env.KINDE_ISSUER_URL;
  const audience = env.GATEHOUSE_AUDIENCE;
  const mcpUrl = env.GATEHOUSE_MCP_URL;
  if (!issuer || !audience || !mcpUrl)
    throw userError('not_configured', 'The agent is not configured.');

  const token = await verifyKindeToken(accessToken, {
    issuer,
    audience,
    jwks: remoteJwks(issuer)
  });
  if (!token.ok || token.claims.sub !== identity.subject) {
    throw userError('token_mismatch', 'Your session changed. Sign in again.');
  }
  const rate = await ctx.runMutation(internal.rateLimit.hit, {
    bucket: 'run',
    sub: identity.subject,
    now: Date.now()
  });
  if (!rate.ok) {
    const minutes = Math.ceil(rate.retryAfterMs / 60_000);
    throw userError(
      'rate_limited',
      `You started too many runs. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
  }
  return {sub: identity.subject, mcpUrl};
}

export async function recordStep(
  ctx: ActionCtx,
  runId: Id<'runs'>,
  step: Step
) {
  if (step.kind === 'assistant') {
    await ctx.runMutation(internal.runs.addStep, {
      runId,
      kind: 'assistant',
      text: step.text
    });
    return;
  }
  await ctx.runMutation(internal.runs.addStep, {
    runId,
    kind: 'tool',
    tool: step.tool,
    argsJson: step.argsJson,
    ok: step.outcome.ok,
    httpStatus: step.outcome.httpStatus,
    code: step.outcome.code ?? undefined,
    decisionId: step.outcome.decisionId ?? undefined,
    heldCallId: step.outcome.approval?.id,
    approvalUrl: step.outcome.approval?.url ?? undefined,
    resultPreview: step.preview
  });
}

export async function finishRun(
  ctx: ActionCtx,
  runId: Id<'runs'>,
  result: LoopResult | null
) {
  await ctx.runMutation(
    internal.runs.finish,
    result
      ? {runId, ...result}
      : {
          runId,
          status: 'failed',
          finalText: 'The agent could not finish this run.',
          turns: 0,
          costUsd: 0,
          errorCode: 'agent_error'
        }
  );
}
