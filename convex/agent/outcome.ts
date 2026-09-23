export type ToolOutcome = {
  ok: boolean;
  httpStatus: number;
  code: string | null;
  decisionId: string | null;
  verdict: 'allow' | 'step_up' | 'deny' | null;
  approval: {id: string; url: string | null} | null;
  message: string | null;
};

type GuardBody = {
  error?: {code?: string; message?: string};
  decision?: {id?: string; verdict?: string};
  approval?: {id?: string; url?: string | null};
};

const UPSTREAM = /^Upstream error (\d{3}):\s*/;

export function readToolOutcome(isError: boolean, text: string): ToolOutcome {
  const match = UPSTREAM.exec(text);
  const httpStatus = match ? Number(match[1]) : isError ? 500 : 200;
  const payload = match ? text.slice(match[0].length) : text;
  let body: GuardBody = {};
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed && typeof parsed === 'object') body = parsed as GuardBody;
  } catch {
    body = {};
  }
  const verdict = body.decision?.verdict;
  return {
    ok: !isError && httpStatus < 400,
    httpStatus,
    code: body.error?.code ?? null,
    decisionId: body.decision?.id ?? null,
    verdict:
      verdict === 'allow' || verdict === 'step_up' || verdict === 'deny'
        ? verdict
        : null,
    approval: body.approval?.id
      ? {id: body.approval.id, url: body.approval.url ?? null}
      : null,
    message: body.error?.message ?? null
  };
}

export function isHeld(outcome: ToolOutcome) {
  return outcome.approval !== null;
}

export function isGuardRefusal(outcome: ToolOutcome) {
  return outcome.httpStatus === 403 && outcome.approval === null;
}
