export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
};

export type McpToolResult = {isError: boolean; text: string};

type Fetch = typeof fetch;

const PROTOCOL_VERSION = '2025-06-18';

export function parseRpcBody(
  contentType: string | null,
  text: string
): unknown {
  if (contentType?.includes('text/event-stream')) {
    const events = text
      .split(/\n\n+/)
      .map((event) =>
        event
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
      )
      .filter((data) => data.length > 0);
    const last = events.at(-1);
    if (!last) throw new Error('MCP response has no data event');
    return JSON.parse(last);
  }
  return JSON.parse(text);
}

export class McpClient {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch
  ) {}

  private headers() {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    return headers;
  }

  private async rpc(method: string, params?: unknown) {
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({jsonrpc: '2.0', id: this.nextId++, method, params})
    });
    if (!response.ok)
      throw new Error(`MCP ${method} failed: ${response.status}`);
    const session = response.headers.get('mcp-session-id');
    if (session) this.sessionId = session;
    const body = parseRpcBody(
      response.headers.get('content-type'),
      await response.text()
    ) as {
      result?: unknown;
      error?: {message?: string};
    };
    if (body.error)
      throw new Error(
        `MCP ${method} error: ${body.error.message ?? 'unknown'}`
      );
    return body.result;
  }

  async connect() {
    await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {name: 'jev-gatehouse-agent', version: '1.0.0'}
    });
    await this.fetchImpl(this.url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      })
    });
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.rpc('tools/list', {})) as {tools?: McpTool[]};
    return result.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const result = (await this.rpc('tools/call', {name, arguments: args})) as {
      isError?: boolean;
      content?: Array<{type: string; text?: string}>;
    };
    const text = (result.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
    return {isError: result.isError === true, text};
  }
}
