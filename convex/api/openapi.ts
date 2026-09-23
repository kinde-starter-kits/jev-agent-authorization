import {operations, REASON_DESCRIPTION, reasonLocation} from './operations';

const errorResponse = {
  description: 'Error',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {code: {type: 'string'}, message: {type: 'string'}}
          }
        }
      }
    }
  }
};

export function buildOpenApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of operations) {
    const entry: Record<string, unknown> = {
      operationId: op.operationId,
      summary: op.summary,
      description: op.description,
      'x-permission': op.permission,
      'x-tier': op.tier,
      ...(op.flag ? {'x-feature-flag': op.flag} : {}),
      responses: {
        '200': {
          description: 'Success',
          content: {'application/json': {schema: {type: 'object'}}}
        },
        '400': errorResponse,
        '401': errorResponse,
        '403': errorResponse,
        '404': errorResponse,
        '409': errorResponse
      }
    };
    const parameters: Record<string, unknown>[] = op.pathParams.map((name) => ({
      name,
      in: 'path',
      required: true,
      schema: {type: 'string'}
    }));
    if (reasonLocation(op) === 'query') {
      parameters.push({
        name: 'reason',
        in: 'query',
        required: false,
        description: REASON_DESCRIPTION,
        schema: {type: 'string'}
      });
    }
    if (parameters.length > 0) entry.parameters = parameters;
    if (op.body) {
      entry.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              ...(op.body.required.length > 0
                ? {required: op.body.required}
                : {}),
              properties: op.body.properties
            }
          }
        }
      };
    }
    paths[op.path] = {...paths[op.path], [op.method.toLowerCase()]: entry};
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Jev Gatehouse workspace API',
      version: '1.0.0',
      description:
        'A demo workspace API for AI agents. Every call is checked by Kinde and judged by Jev before it runs.'
    },
    servers: [{url: serverUrl}],
    components: {
      securitySchemes: {
        kinde: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'}
      }
    },
    security: [{kinde: []}],
    paths
  };
}
