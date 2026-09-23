import {httpRouter} from 'convex/server';
import {env, httpAction} from './_generated/server';
import {API_PREFIX} from './api/operations';
import {buildOpenApi} from './api/openapi';
import {handleApiRequest} from './guard/handler';

const http = httpRouter();

http.route({
  path: '/api/openapi.json',
  method: 'GET',
  handler: httpAction(async () =>
    Response.json(buildOpenApi(env.CONVEX_SITE_URL), {
      headers: {'Access-Control-Allow-Origin': '*'}
    })
  )
});

http.route({
  path: '/api/health',
  method: 'GET',
  handler: httpAction(async () => Response.json({ok: true}))
});

for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
  http.route({pathPrefix: API_PREFIX, method, handler: handleApiRequest});
}

export default http;
