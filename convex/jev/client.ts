import {QUESTIONS, type JevSignals} from './questions';

export const DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';
const OPENROUTER_SYSTEM_ONE = 'https://openrouter.ai/api/v1/systemone';
const TIMEOUT_MS = 3000;

export type JevResult = {
  signals: JevSignals;
  model: string;
  ms: number;
  inputTokens: number;
  costUsd: number | null;
};

type Fetch = typeof fetch;

function num(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Jev answer ${name} is not a number`);
  }
  return value;
}

function answer(answers: Record<string, unknown>, name: string) {
  const value = answers[name];
  if (!value || typeof value !== 'object')
    throw new Error(`Jev answer ${name} is missing`);
  return value as Record<string, unknown>;
}

export function parseSignals(answers: Record<string, unknown>): JevSignals {
  const risk = answer(answers, 'risk');
  const hint = answer(answers, 'verdict_hint');
  const choice = hint.choice;
  if (choice !== 'allow' && choice !== 'step_up' && choice !== 'deny') {
    throw new Error('Jev verdict_hint choice is not a known label');
  }
  const probabilities = (hint.probabilities ?? {}) as Record<string, unknown>;
  return {
    matchesIntent: num(
      answer(answers, 'matches_intent').noul,
      'matches_intent'
    ),
    destructive: num(answer(answers, 'destructive').noul, 'destructive'),
    injected: num(answer(answers, 'injected').noul, 'injected'),
    exfiltration: num(answer(answers, 'exfiltration').noul, 'exfiltration'),
    risk: num(risk.score, 'risk'),
    riskConfidence: num(risk.confidence, 'risk.confidence'),
    verdictHint: {
      choice,
      confidence: num(hint.confidence, 'verdict_hint.confidence'),
      probabilities: {
        allow: num(probabilities.allow ?? 0, 'allow'),
        step_up: num(probabilities.step_up ?? 0, 'step_up'),
        deny: num(probabilities.deny ?? 0, 'deny')
      }
    }
  };
}

export async function askJev(
  state: Record<string, unknown>,
  options: {
    apiKey: string;
    model?: string;
    fetchImpl?: Fetch;
    timeoutMs?: number;
  }
): Promise<JevResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();
  const response = await fetchImpl(OPENROUTER_SYSTEM_ONE, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_JEV_MODEL,
      state,
      questions: QUESTIONS
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Jev request failed: ${response.status}`);
  const body = (await response.json()) as {
    model?: unknown;
    answers?: Record<string, unknown>;
    usage?: {input_tokens?: unknown; cost?: unknown};
  };
  const signals = parseSignals(body.answers ?? {});
  return {
    signals,
    model:
      typeof body.model === 'string'
        ? body.model
        : (options.model ?? DEFAULT_JEV_MODEL),
    ms: Date.now() - started,
    inputTokens:
      typeof body.usage?.input_tokens === 'number'
        ? body.usage.input_tokens
        : 0,
    costUsd: typeof body.usage?.cost === 'number' ? body.usage.cost : null
  };
}
