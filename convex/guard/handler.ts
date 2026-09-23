import {ConvexError} from 'convex/values';
import {internal} from '../_generated/api';
import type {Id} from '../_generated/dataModel';
import {env, httpAction, type ActionCtx} from '../_generated/server';
import {matchOperation, type Operation} from '../api/operations';
import {checkKinde, decide, POLICY_VERSION} from './policy';
import {bearerToken, remoteJwks, verifyKindeToken} from './token';

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
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) {
    return {
      ok: false,
      message: 'Send a JSON body with content-type application/json.'
    };
  }
  const text = await request.text();
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
  if (!issuer || !audience) {
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
  const args: JsonObject = {...body.body, ...params};

  const kinde = checkKinde(operation, claims);
  const decision = decide(operation, kinde);

  let recorded: {decisionId: Id<'decisions'>; workspaceId: Id<'workspaces'>};
  try {
    recorded = await ctx.runMutation(internal.ledger.begin, {
      sub: claims.sub,
      clientId: claims.azp ?? undefined,
      operationId: operation.operationId,
      tier: operation.tier,
      method: operation.method,
      path: url.pathname,
      argsJson: argsForLog(args),
      kinde: {
        permission: kinde.permission,
        permissionGranted: kinde.permissionGranted,
        flag: kinde.flag ?? undefined,
        flagEnabled: kinde.flagEnabled ?? undefined
      },
      verdict: decision.verdict,
      reasonCode: decision.reasonCode,
      policyVersion: POLICY_VERSION,
      guardMs: Date.now() - started
    });
  } catch {
    return errorResponse(
      503,
      'audit_unavailable',
      'The decision could not be recorded, so the call did not run.'
    );
  }
  const {decisionId, workspaceId} = recorded;

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
