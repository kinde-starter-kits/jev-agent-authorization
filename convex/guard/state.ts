import type {Operation} from '../api/operations';

export type GuardContext = {
  served: Array<{
    source: string;
    title: string;
    excerpt: string;
    secondsAgo: number;
  }>;
  recent: Array<{operation: string; verdict: string; secondsAgo: number}>;
};

export type Intent =
  {source: 'verified'; userRequest: string} | {source: 'claimed' | 'none'};

export function intentSourceOf(intent: Intent, reason: string | undefined) {
  if (intent.source === 'verified') return 'verified' as const;
  return reason ? ('claimed' as const) : ('none' as const);
}

export function buildState(
  operation: Operation,
  args: Record<string, unknown>,
  reason: string | undefined,
  context: GuardContext,
  intent: Intent = {source: 'none'}
) {
  const callArguments = Object.fromEntries(
    Object.entries(args).filter(([key]) => key !== 'reason')
  );
  return {
    tool_call: {
      operation: operation.operationId,
      method: operation.method,
      summary: operation.summary,
      effect: operation.description,
      arguments: callArguments
    },
    user_request:
      intent.source === 'verified'
        ? {
            text: intent.userRequest,
            source:
              'what the signed-in user typed in the Gatehouse console, verified by the server'
          }
        : null,
    stated_reason: reason ?? null,
    stated_reason_source: reason
      ? 'written by the agent in the request, not verified'
      : 'none given',
    content_the_agent_read: context.served.map((s) => ({
      from: s.source,
      title: s.title,
      text: s.excerpt,
      seconds_ago: s.secondsAgo
    })),
    recent_calls_by_this_user: context.recent.map((r) => ({
      operation: r.operation,
      verdict: r.verdict,
      seconds_ago: r.secondsAgo
    }))
  };
}
