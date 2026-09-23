import {describe, expect, test, vi} from 'vitest';
import {jevAnswers} from './answers.testing';
import {askJev, parseSignals} from './client';
import {askJudge, parseJudgeVerdict} from './judge';

describe('parseSignals', () => {
  test('reads each typed answer', () => {
    const signals = parseSignals(
      jevAnswers({
        destructive: 0.92,
        risk: 2.46,
        riskConfidence: 0.46,
        hint: 'step_up'
      })
    );
    expect(signals).toMatchObject({
      destructive: 0.92,
      risk: 2.46,
      riskConfidence: 0.46,
      verdictHint: {choice: 'step_up'}
    });
  });

  test('throws on a missing answer', () => {
    const answers: Record<string, unknown> = jevAnswers();
    delete answers.injected;
    expect(() => parseSignals(answers)).toThrow();
  });

  test('throws on an unknown verdict label', () => {
    const answers = jevAnswers() as Record<string, unknown>;
    answers.verdict_hint = {
      type: 'choice',
      choice: 'maybe',
      confidence: 1,
      probabilities: {}
    };
    expect(() => parseSignals(answers)).toThrow();
  });
});

describe('askJev', () => {
  test('sends the state and questions to OpenRouter and reads usage', async () => {
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          questions: object;
        };
        expect(body.model).toBe('typesafe/jev-1.13');
        expect(Object.keys(body.questions)).toContain('injected');
        return Response.json({
          model: 'typesafe/jev-1.13-20260917',
          answers: jevAnswers(),
          usage: {input_tokens: 612, cost: 0.0000257}
        });
      }
    );
    const result = await askJev({a: 1}, {apiKey: 'k', fetchImpl});
    expect(result).toMatchObject({
      model: 'typesafe/jev-1.13-20260917',
      inputTokens: 612,
      costUsd: 0.0000257
    });
  });

  test('throws when OpenRouter fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', {status: 502}));
    await expect(askJev({}, {apiKey: 'k', fetchImpl})).rejects.toThrow();
  });
});

describe('judge', () => {
  test.each([
    ['{"verdict": "allow"}', 'allow'],
    ['Sure. {"verdict":"allow"}', 'allow'],
    ['{"verdict": "step_up"}', 'step_up'],
    ['{"verdict": "deny"}', 'step_up'],
    ['not json', 'step_up'],
    [undefined, 'step_up']
  ])('parses %s as %s', (content, expected) => {
    expect(parseJudgeVerdict(content)).toBe(expected);
  });

  test('asks the configured model', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        model: 'judge-model',
        choices: [{message: {content: '{"verdict":"allow"}'}}],
        usage: {cost: 0.004}
      })
    );
    const result = await askJudge(
      {},
      {apiKey: 'k', model: 'judge-model', fetchImpl}
    );
    expect(result).toMatchObject({
      verdict: 'allow',
      model: 'judge-model',
      costUsd: 0.004
    });
  });
});
