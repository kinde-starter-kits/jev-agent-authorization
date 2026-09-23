import {ConvexError} from 'convex/values';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {env, httpAction, type ActionCtx} from '../_generated/server';
import {
  matchOperation,
  reasonLocation,
  type Operation
} from '../api/operations';
import {
  accessFromToken,
  fetchOrgAccess,
  type Access,
  type AccessFailure
} from './access';
import {askJev, type JevResult} from '../jev/client';
import {askJudge, type JudgeResult} from '../jev/judge';
import {judgeWithJev, type Judgment} from './judgment';
import {checkKinde, decideKinde, POLICY_VERSION, type Decision} from './policy';
import {buildState, intentSourceOf, type Intent} from './state';
import {
  bearerToken,
  remoteJwks,
  verifyKindeToken,
  type KindeClaims
} from './token';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_LOGGED_STRING = 500;
const SERVER_FIELDS = ['workspaceId', 'actorSub'];

type JsonObject = Record<string, unknown>;

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return Response.json(body, {status, headers});
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  extra: {decisionId?: Id<'decisions'>; headers?: Record<string, string>} = {}
) {
  const headers = {...extra.headers};
  if (extra.decisionId) headers['X-Gatehouse-Decision'] = extra.decisionId;
  return json(
    status,
    {
      error: {code, message},
      ...(extra.decisionId ? {decision: {id: extra.decisionId}} : {})
    },
    headers
  );
}

async function readBody(
  request: Request,
  operation: Operation
): Promise<{ok: true; body: JsonObject} | {ok: false; message: string}> {
  if (!operation.body) return {ok: true, body: {}};
  const text = await request.text();
  if (text.trim().length === 0) return {ok: true, body: {}};
  if (text.length > MAX_BODY_BYTES) {
    return {ok: false, message: 'The request body is too large.'};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {ok: false, message: 'The request body is not valid JSON.'};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {ok: false, message: 'The request body must be a JSON object.'};
  }
  const body = parsed as JsonObject;
  if (SERVER_FIELDS.some((field) => field in body)) {
    return {ok: false, message: 'The request body contains a reserved field.'};
  }
  return {ok: true, body};
}

function statedReason(operation: Operation, url: URL, body: JsonObject) {
  const location = reasonLocation(operation);
  const raw =
    location === 'query'
      ? url.searchParams.get('reason')
      : location === 'body'
        ? body.reason
        : null;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_LOGGED_STRING) : undefined;
}

async function resolveAccess(
  ctx: ActionCtx,
  claims: KindeClaims,
  orgCode: string
): Promise<Access | AccessFailure> {
  const fromToken = accessFromToken(claims, orgCode);
  if (fromToken !== null) return fromToken;

  const cached = await ctx.runQuery(internal.kindeAccess.get, {
    sub: claims.sub,
    orgCode,
    now: Date.now()
  });
  if (cached) return {orgCode, ...cached, source: 'kinde_api'};

  const clientId = env.KINDE_M2M_CLIENT_ID;
  const clientSecret = env.KINDE_M2M_CLIENT_SECRET;
  const issuer = env.KINDE_ISSUER_URL;
  if (!clientId || !clientSecret || !issuer) return 'kinde_not_configured';

  try {
    const access = await fetchOrgAccess(
      {issuer, clientId, clientSecret},
      orgCode,
      claims.sub
    );
    await ctx.runMutation(internal.kindeAccess.put, {
      sub: claims.sub,
      orgCode,
      permissions: access.permissions,
      featureFlags: access.featureFlags
    });
    return access;
  } catch {
    return 'kinde_unavailable';
  }
}

function argsForLog(args: JsonObject) {
  return JSON.stringify(args, (_key, value: unknown) =>
    typeof value === 'string' && value.length > MAX_LOGGED_STRING
      ? `${value.slice(0, MAX_LOGGED_STRING)}…`
      : value
  );
}

function operationError(error: unknown) {
  if (error instanceof ConvexError) {
    const data = error.data as {code?: string; message?: string};
    const status =
      data.code === 'not_found' ? 404 : data.code === 'conflict' ? 409 : 400;
    return {
      status,
      code: data.code ?? 'invalid_argument',
      message: data.message ?? 'The operation failed.'
    };
  }
  if (
    error instanceof Error &&
    error.message.includes('ArgumentValidationError')
  ) {
    return {
      status: 400,
      code: 'invalid_argument',
      message: 'The arguments do not match the operation schema.'
    };
  }
  return {
    status: 500,
    code: 'operation_failed',
    message: 'The operation failed.'
  };
}

async function runOperation(
  ctx: ActionCtx,
  operation: Operation,
  args: JsonObject
): Promise<unknown> {
  if (operation.run.kind === 'query') {
    return await ctx.runQuery(operation.run.ref, args);
  }
  return await ctx.runMutation(operation.run.ref, args);
}

function jevForLedger(jev: JevResult) {
  return {
    model: jev.model,
    ms: jev.ms,
    inputTokens: jev.inputTokens,
    costUsd: jev.costUsd ?? undefined,
    matchesIntent: jev.signals.matchesIntent,
    destructive: jev.signals.destructive,
    injected: jev.signals.injected,
    exfiltration: jev.signals.exfiltration,
    risk: jev.signals.risk,
    riskConfidence: jev.signals.riskConfidence,
    verdictHint: jev.signals.verdictHint.choice,
    verdictHintConfidence: jev.signals.verdictHint.confidence
  };
}

async function intentFor(ctx: ActionCtx, claims: KindeClaims): Promise<Intent> {
  const webClient = env.KINDE_WEB_CLIENT_ID;
  if (!webClient || claims.azp !== webClient) return {source: 'none'};
  const run = await ctx.runQuery(internal.runs.activeForSub, {
    sub: claims.sub,
    now: Date.now()
  });
  return run
    ? {source: 'verified', userRequest: run.message}
    : {source: 'none'};
}

async function judgeCall(
  ctx: ActionCtx,
  operation: Operation,
  args: JsonObject,
  reason: string | undefined,
  sub: string,
  intent: Intent
): Promise<Judgment> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {decision: {verdict: 'step_up', reasonCode: 'jev_not_configured'}};
  }
  const context = await ctx.runQuery(internal.guardContext.forSub, {
    sub,
    now: Date.now()
  });
  const state = buildState(operation, args, reason, context, intent);

  const judgeModel = env.LLM_JUDGE_MODEL;
  return judgeWithJev(
    operation,
    reason !== undefined || intent.source === 'verified',
    {
      jev: () => askJev(state, {apiKey, model: env.JEV_MODEL}),
      judge: judgeModel
        ? () => askJudge(state, {apiKey, model: judgeModel})
        : null
    }
  );
}

export const handleApiRequest = httpAction(async (ctx, request) => {
  const started = Date.now();
  const url = new URL(request.url);
  const match = matchOperation(request.method, url.pathname);
  if (!match) {
    return errorResponse(
      404,
      'route_not_found',
      'No operation matches this method and path.'
    );
  }
  const {operation, params} = match;

  const issuer = env.KINDE_ISSUER_URL;
  const audience = env.GATEHOUSE_AUDIENCE;
  const orgCode = env.GATEHOUSE_ORG_CODE;
  if (!issuer || !audience || !orgCode) {
    return errorResponse(
      503,
      'guard_not_configured',
      'The guard is not configured.'
    );
  }

  const token = await verifyKindeToken(
    bearerToken(request.headers.get('authorization')),
    {issuer, audience, jwks: remoteJwks(issuer)}
  );
  if (!token.ok) {
    return errorResponse(
      401,
      token.code,
      'A valid Kinde access token is required.',
      {
        headers: {'WWW-Authenticate': 'Bearer error="invalid_token"'}
      }
    );
  }
  const {claims} = token;

  const headerSub = request.headers.get('x-kinde-user-id');
  if (headerSub && headerSub !== claims.sub) {
    return errorResponse(
      401,
      'identity_mismatch',
      'The user header does not match the token.'
    );
  }

  const body = await readBody(request, operation);
  if (!body.ok) return errorResponse(400, 'invalid_body', body.message);
  const reason = statedReason(operation, url, body.body);
  const args: JsonObject = {...body.body, ...params};
  if (reasonLocation(operation) === 'query' && reason) args.reason = reason;

  const access = await resolveAccess(ctx, claims, orgCode);
  const kinde =
    typeof access === 'string'
      ? {
          permission: operation.permission,
          permissionGranted: false,
          flag: operation.flag ?? null,
          flagEnabled: null
        }
      : checkKinde(operation, access);
  const intent = await intentFor(ctx, claims);
  let decision: Decision;
  let jev: JevResult | undefined;
  let judge: JudgeResult | undefined;
  if (typeof access === 'string') {
    decision = {verdict: 'deny', reasonCode: access};
  } else {
    const kindeDecision = decideKinde(operation, kinde);
    if (kindeDecision) {
      decision = kindeDecision;
    } else {
      const judged = await judgeCall(
        ctx,
        operation,
        args,
        reason,
        claims.sub,
        intent
      );
      decision = judged.decision;
      jev = judged.jev;
      judge = judged.judge;
    }
  }

  let recorded: {
    decisionId: Id<'decisions'>;
    workspaceId: Id<'workspaces'>;
    held?: {heldCallId: Id<'heldCalls'>; expiresAt: number};
  };
  try {
    recorded = await ctx.runMutation(internal.ledger.begin, {
      sub: claims.sub,
      clientId: claims.azp ?? undefined,
      operationId: operation.operationId,
      tier: operation.tier,
      method: operation.method,
      path: url.pathname,
      argsJson: argsForLog(args),
      reason,
      intentSource: intentSourceOf(intent, reason),
      kinde: {
        orgCode: typeof access === 'string' ? undefined : access.orgCode,
        source: typeof access === 'string' ? undefined : access.source,
        permission: kinde.permission,
        permissionGranted: kinde.permissionGranted,
        flag: kinde.flag ?? undefined,
        flagEnabled: kinde.flagEnabled ?? undefined
      },
      jev: jev ? jevForLedger(jev) : undefined,
      judge: judge
        ? {
            model: judge.model,
            ms: judge.ms,
            verdict: judge.verdict,
            costUsd: judge.costUsd ?? undefined
          }
        : undefined,
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
      policyVersion: POLICY_VERSION,
      guardMs: Date.now() - started,
      holdArgsJson:
        decision.verdict === 'step_up' ? JSON.stringify(args) : undefined
    });
  } catch {
    return errorResponse(
      503,
      'audit_unavailable',
      'The decision could not be recorded, so the call did not run.'
    );
  }
  const {decisionId, workspaceId, held} = recorded;

  if (decision.verdict === 'step_up' && held) {
    const appUrl = env.GATEHOUSE_APP_URL;
    const approvalUrl = appUrl
      ? new URL(`/approve/${held.heldCallId}`, appUrl).toString()
      : null;
    return json(
      403,
      {
        error: {
          code: decision.reasonCode,
          message: approvalUrl
            ? `The call is held. It runs only after the user approves it with a fresh sign-in at ${approvalUrl}. Give the user this link and stop.`
            : 'The call is held. It runs only after the user approves it with a fresh sign-in.'
        },
        decision: {id: decisionId, verdict: decision.verdict},
        approval: {
          id: held.heldCallId,
          url: approvalUrl,
          expiresAt: new Date(held.expiresAt).toISOString()
        }
      },
      {'X-Gatehouse-Decision': decisionId}
    );
  }

  if (decision.verdict !== 'allow') {
    return errorResponse(
      403,
      decision.reasonCode,
      'The guard refused this call.',
      {decisionId}
    );
  }

  const operationStarted = Date.now();
  const serverArgs: JsonObject =
    operation.run.kind === 'mutation'
      ? {...args, workspaceId, actorSub: claims.sub}
      : {...args, workspaceId};

  let result: unknown;
  try {
    result = await runOperation(ctx, operation, serverArgs);
  } catch (error) {
    const failure = operationError(error);
    await ctx
      .runMutation(internal.ledger.complete, {
        decisionId,
        status: 'failed',
        errorCode: failure.code,
        operationMs: Date.now() - operationStarted
      })
      .catch(() => null);
    return errorResponse(failure.status, failure.code, failure.message, {
      decisionId
    });
  }

  if (operation.operationId === 'getDocument') {
    const document = result as {title?: unknown; body?: unknown};
    if (
      typeof document.title === 'string' &&
      typeof document.body === 'string'
    ) {
      await ctx
        .runMutation(internal.guardContext.recordServed, {
          sub: claims.sub,
          source: 'getDocument',
          title: document.title,
          content: document.body
        })
        .catch(() => null);
    }
  }

  await ctx
    .runMutation(internal.ledger.complete, {
      decisionId,
      status: 'executed',
      operationMs: Date.now() - operationStarted
    })
    .catch(() => null);

  return json(
    200,
    {data: result, decision: {id: decisionId, verdict: decision.verdict}},
    {'X-Gatehouse-Decision': decisionId}
  );
});
