import {describe, expect, test} from 'vitest';
import {buildOpenApi} from './openapi';
import {matchOperation, operations, reasonLocation} from './operations';

describe('operations', () => {
  test('operation ids are unique', () => {
    const ids = operations.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('reads take no reason, deletes take it in the query, other writes in the body', () => {
    for (const op of operations) {
      const location = reasonLocation(op);
      if (op.method === 'GET') {
        expect(location, op.operationId).toBeNull();
        expect(op.body, op.operationId).toBeUndefined();
        expect(op.run.kind, op.operationId).toBe('query');
      } else if (op.method === 'DELETE') {
        expect(location, op.operationId).toBe('query');
        expect(op.body, op.operationId).toBeUndefined();
        expect(op.run.kind, op.operationId).toBe('mutation');
      } else {
        expect(location, op.operationId).toBe('body');
        expect(op.body?.properties.reason, op.operationId).toBeDefined();
        expect(op.body?.required, op.operationId).not.toContain('reason');
        expect(op.run.kind, op.operationId).toBe('mutation');
      }
    }
  });

  test('path params in the template match the declared list', () => {
    for (const op of operations) {
      const inPath = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      expect(inPath, op.operationId).toEqual([...op.pathParams]);
    }
  });
});

describe('matchOperation', () => {
  test('matches method and path, and decodes params', () => {
    const match = matchOperation(
      'DELETE',
      '/api/v1/members/noah%40harborpine.example'
    );
    expect(match?.operation.operationId).toBe('removeMember');
    expect(match?.params).toEqual({email: 'noah@harborpine.example'});
  });

  test('uses the method to pick between operations on one path', () => {
    expect(
      matchOperation('GET', '/api/v1/projects/acme-rebrand')?.operation
        .operationId
    ).toBe('getProject');
    expect(
      matchOperation('DELETE', '/api/v1/projects/acme-rebrand')?.operation
        .operationId
    ).toBe('deleteProject');
  });

  test('returns null for unknown routes', () => {
    expect(matchOperation('GET', '/api/v1/unknown')).toBeNull();
    expect(matchOperation('PATCH', '/api/v1/projects')).toBeNull();
    expect(matchOperation('GET', '/api/v1/projects/a/b')).toBeNull();
  });
});

describe('buildOpenApi', () => {
  test('describes every operation once', () => {
    const spec = buildOpenApi('https://example.convex.site');
    const described = Object.values(spec.paths).flatMap((methods) =>
      Object.values(methods).map(
        (e) => (e as {operationId: string}).operationId
      )
    );
    expect(described.sort()).toEqual(
      operations.map((o) => o.operationId).sort()
    );
    expect(spec.servers[0]?.url).toBe('https://example.convex.site');
  });
});

describe('buildOpenApi reason parameter', () => {
  test('documents the reason as an optional query parameter on deletes', () => {
    const spec = buildOpenApi('https://example.convex.site');
    const entry = spec.paths['/api/v1/projects/{slug}']?.delete as {
      parameters: Array<{name: string; in: string; required: boolean}>;
      requestBody?: unknown;
    };
    expect(entry.requestBody).toBeUndefined();
    expect(entry.parameters).toContainEqual(
      expect.objectContaining({name: 'reason', in: 'query', required: false})
    );
  });
});
