import {describe, expect, test, vi} from 'vitest';
import {McpClient, parseRpcBody} from './mcp';
import {readToolOutcome} from './outcome';

describe('parseRpcBody', () => {
  test('reads plain JSON', () => {
    expect(parseRpcBody('application/json', '{"result":1}')).toEqual({
      result: 1
    });
  });

  test('reads the last data event of a stream', () => {
    const text =
      'event: message\ndata: {"result":1}\n\nevent: message\ndata: {"result":2}\n\n';
    expect(parseRpcBody('text/event-stream', text)).toEqual({result: 2});
  });
});

describe('McpClient', () => {
  test('sends the bearer token and keeps the session id', async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init?.headers as Record<string, string>);
        const body = JSON.parse(String(init?.body)) as {
          id?: number;
          method: string;
        };
        const result =
          body.method === 'tools/call'
            ? {content: [{type: 'text', text: '{"data":1}'}]}
            : body.method === 'tools/list'
              ? {tools: [{name: 'listProjects', inputSchema: {}}]}
              : {};
        return Response.json(
          {jsonrpc: '2.0', id: body.id, result},
          {headers: {'mcp-session-id': 's-1'}}
        );
      }
    );
    const client = new McpClient('https://mcp.example', 'tok', fetchImpl);
    await client.connect();
    expect(await client.listTools()).toHaveLength(1);
    expect(await client.callTool('listProjects', {})).toEqual({
      isError: false,
      text: '{"data":1}'
    });
    expect(seen[0]?.authorization).toBe('Bearer tok');
    expect(seen.at(-1)?.['mcp-session-id']).toBe('s-1');
  });
});

describe('readToolOutcome', () => {
  test('reads a Kinde upstream error with the guard body', () => {
    const outcome = readToolOutcome(
      true,
      'Upstream error 403: {"error":{"code":"jev_injection"},"decision":{"id":"d1","verdict":"deny"}}'
    );
    expect(outcome).toMatchObject({
      ok: false,
      httpStatus: 403,
      code: 'jev_injection',
      decisionId: 'd1',
      verdict: 'deny',
      approval: null
    });
  });

  test('reads a success body', () => {
    expect(
      readToolOutcome(
        false,
        '{"data":{},"decision":{"id":"d2","verdict":"allow"}}'
      )
    ).toMatchObject({
      ok: true,
      httpStatus: 200,
      verdict: 'allow'
    });
  });

  test('survives text that is not JSON', () => {
    expect(readToolOutcome(true, 'Something broke')).toMatchObject({
      ok: false,
      httpStatus: 500,
      code: null
    });
  });
});
