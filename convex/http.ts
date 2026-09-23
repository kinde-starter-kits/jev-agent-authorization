import {httpRouter} from 'convex/server';
import {env, httpAction} from './_generated/server';
import {buildOpenApi} from './api/openapi';

const http = httpRouter();

http.route({
  path: '/api/openapi.json',
  method: 'GET',
  handler: httpAction(async () =>
    Response.json(buildOpenApi(env.CONVEX_SITE_URL))
  )
});

http.route({
  path: '/api/health',
  method: 'GET',
  handler: httpAction(async () => Response.json({ok: true}))
});

export default http;
