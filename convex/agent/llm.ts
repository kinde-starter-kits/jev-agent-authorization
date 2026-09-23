const OPENROUTER_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 60_000;

export const DEFAULT_AGENT_MODEL = 'anthropic/claude-sonnet-5';

export type ToolCall = {id: string; name: string; argumentsJson: string};

export type ChatMessage =
  | {role: 'system' | 'user'; content: string}
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {name: string; arguments: string};
      }>;
    }
  | {role: 'tool'; tool_call_id: string; content: string};

export type ToolSpec = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmReply = {
  text: string | null;
  toolCalls: ToolCall[];
  costUsd: number;
};

export type Llm = (
  messages: ChatMessage[],
  tools: ToolSpec[]
) => Promise<LlmReply>;

type Fetch = typeof fetch;

export function openRouterLlm(options: {
  apiKey: string;
  model: string;
  fetchImpl?: Fetch;
}): Llm {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (messages, tools) => {
    const response = await fetchImpl(OPENROUTER_CHAT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0,
        max_tokens: 1024,
        usage: {include: true}
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok)
      throw new Error(`Agent model request failed: ${response.status}`);
    const body = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: {name?: string; arguments?: string};
          }>;
        };
      }>;
      usage?: {cost?: unknown};
    };
    const message = body.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? [])
      .filter((c) => c.id && c.function?.name)
      .map((c) => ({
        id: c.id as string,
        name: c.function?.name as string,
        argumentsJson: c.function?.arguments ?? '{}'
      }));
    return {
      text:
        typeof message?.content === 'string' && message.content.trim()
          ? message.content
          : null,
      toolCalls,
      costUsd: typeof body.usage?.cost === 'number' ? body.usage.cost : 0
    };
  };
}
