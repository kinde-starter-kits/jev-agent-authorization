import {convexTest} from 'convex-test';
import {describe, expect, test} from 'vitest';
import schema from './schema';
import {modules} from './test.setup';

describe('public routes', () => {
  test('serves the OpenAPI spec to any origin', async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch('/api/openapi.json');
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const spec = (await response.json()) as {paths: Record<string, object>};
    const count = Object.values(spec.paths).reduce(
      (sum, methods) => sum + Object.keys(methods).length,
      0
    );
    expect(count).toBe(14);
  });

  test('serves a health check', async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch('/api/health');
    expect(await response.json()).toEqual({ok: true});
  });
});
