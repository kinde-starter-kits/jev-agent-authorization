import {internal} from '../_generated/api';
import {env, httpAction} from '../_generated/server';
import {bearerToken, remoteJwks, verifyKindeToken} from './token';

export const HELD_PREFIX = '/api/held/';

const STATUS_FOR: Record<string, number> = {
  held_not_found: 404,
  held_not_pending: 409,
  held_expired: 410,
  auth_stale: 401,
  auth_before_hold: 401,
  operation_failed: 422
};

function error(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {}
) {
  return Response.json({error: {code, message}}, {status, headers});
}

export const handleHeldRequest = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const rest = url.pathname.slice(HELD_PREFIX.length).split('/');
  const [heldId, action] = rest;
  if (!heldId || rest.length > 2) {
    return error(404, 'route_not_found', 'No route matches this path.');
  }
  const route =
    request.method === 'GET' && action === undefined
      ? 'view'
      : request.method === 'POST' && (action === 'approve' || action === 'deny')
        ? action
        : null;
  if (!route)
    return error(404, 'route_not_found', 'No route matches this path.');

  const issuer = env.KINDE_ISSUER_URL;
  const clientId = env.KINDE_WEB_CLIENT_ID;
  if (!issuer || !clientId) {
    return error(
      503,
      'approvals_not_configured',
      'Approvals are not configured.'
    );
  }
  const token = await verifyKindeToken(
    bearerToken(request.headers.get('authorization')),
    {
      issuer,
      audience: clientId,
      jwks: remoteJwks(issuer)
    }
  );
  if (!token.ok) {
    return error(
      401,
      token.code,
      'A valid Kinde ID token from the Gatehouse app is required.',
      {
        'WWW-Authenticate': 'Bearer error="invalid_token"'
      }
    );
  }
  const {sub, authTime} = token.claims;

  if (route === 'view') {
    const held = await ctx.runQuery(internal.held.forOwner, {heldId, sub});
    if (!held)
      return error(
        404,
        'held_not_found',
        'No held call with that id for this user.'
      );
    return Response.json({data: held});
  }

  if (route === 'deny') {
    const result = await ctx.runMutation(internal.held.deny, {heldId, sub});
    if (!result.ok)
      return error(STATUS_FOR[result.code] ?? 400, result.code, result.message);
    return Response.json({data: {status: result.status}});
  }

  if (authTime === null) {
    return error(
      401,
      'auth_time_missing',
      'The ID token has no auth_time claim.'
    );
  }
  const result = await ctx.runMutation(internal.held.approve, {
    heldId,
    sub,
    authTime
  });
  if (!result.ok)
    return error(STATUS_FOR[result.code] ?? 400, result.code, result.message);
  return Response.json({data: result});
});
