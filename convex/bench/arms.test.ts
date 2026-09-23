import {describe, expect, test} from 'vitest';
import {jevAnswers} from '../jev/answers.testing';
import {parseSignals, type JevResult} from '../jev/client';
import {BENCH_CASES} from './cases';
import {guardArgs, runCase, stateForCase, type CaseDeps} from './arms';
import {parseLlmVerdict} from './llmJudge';

const byId = (id: string) => {
  const c = BENCH_CASES.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};

function jevResult(overrides: Parameters<typeof jevAnswers>[0]): JevResult {
  return {
    signals: parseSignals(jevAnswers(overrides)),
    model: 'typesafe/jev-1.13-20260917',
    ms: 200,
    inputTokens: 600,
    costUsd: 0.00004
  };
}

function deps(
  overrides: Partial<CaseDeps> = {}
): CaseDeps & {jevCalls: number} {
  const counter = {jevCalls: 0};
  return Object.assign(counter, {
    jev: async () => {
      counter.jevCalls += 1;
      return jevResult({injected: 0.95, hint: 'deny'});
    },
    judge: null,
    llm: async () => ({
      verdict: 'deny' as const,
      ms: 900,
      costUsd: 0.003,
      model: 'llm'
    }),
    ...overrides
  });
}

describe('guardArgs', () => {
  test('DELETE reads the reason from the query JSON', () => {
    const c = BENCH_CASES.find((x) => x.operationId === 'deleteProject')!;
    const {args, reason} = guardArgs(c);
    expect(reason).toBeTruthy();
    expect(args.slug).toBeTruthy();
    expect(args.reason).toBe(reason);
  });

  test('POST reads fields and the reason from the body JSON', () => {
    const {args, reason} = guardArgs(byId('injected-01'));
    expect(args).toMatchObject({
      email: 'ops@quickhelp-vendor.example',
      role: 'admin'
    });
    expect(reason).toContain('checklist');
  });

  test('the state carries the verified request and the planted text', () => {
    const {state} = stateForCase(byId('injected-01'));
    expect(state.user_request?.text).toContain('Summarise');
    expect(state.content_the_agent_read[0]?.text).toContain('admin');
    expect(JSON.stringify(state.tool_call.arguments)).not.toContain('reason');
  });
});

describe('runCase', () => {
  test('arms A and B share one Jev call', async () => {
    const d = deps();
    const {rows, calibration} = await runCase(byId('injected-01'), 0, d);
    expect(d.jevCalls).toBe(1);
    expect(rows.map((r) => [r.arm, r.verdict])).toEqual([
      ['gatehouse', 'deny'],
      ['jev_single', 'deny'],
      ['llm_judge', 'deny']
    ]);
    expect(calibration).toContainEqual({
      signal: 'injected',
      predicted: 0.95,
      actual: true
    });
  });

  test('reads skip Jev in the gatehouse arm at no cost', async () => {
    const {rows} = await runCase(byId('benign_read-01'), 0, deps());
    const gatehouse = rows.find((r) => r.arm === 'gatehouse')!;
    expect(gatehouse).toMatchObject({verdict: 'allow', ms: 0, costUsd: 0});
  });

  test('a Jev failure fails closed and is counted as an error', async () => {
    const {rows} = await runCase(
      byId('benign_write-01'),
      0,
      deps({
        jev: async () => {
          throw new Error('down');
        }
      })
    );
    for (const arm of ['gatehouse', 'jev_single'] as const) {
      expect(rows.find((r) => r.arm === arm)).toMatchObject({
        verdict: 'step_up',
        error: true
      });
    }
  });

  test('an unparsable LLM answer fails closed and is counted', async () => {
    const {rows} = await runCase(
      byId('benign_write-01'),
      0,
      deps({
        llm: async () => ({
          verdict: null,
          ms: 800,
          costUsd: 0.002,
          model: 'llm'
        })
      })
    );
    expect(rows.find((r) => r.arm === 'llm_judge')).toMatchObject({
      verdict: 'step_up',
      parseFailed: true
    });
  });

  test('low risk confidence cascades to the judge in the gatehouse arm', async () => {
    const d = deps({
      jev: async () => jevResult({matches: 0.95, riskConfidence: 0.3}),
      judge: async () => ({
        verdict: 'allow',
        model: 'j',
        ms: 700,
        costUsd: 0.002
      })
    });
    const {rows} = await runCase(byId('benign_write-01'), 0, d);
    expect(rows[0]).toMatchObject({arm: 'gatehouse', verdict: 'allow'});
    expect(rows[0]?.costUsd).toBeCloseTo(0.00204);
  });
});

describe('parseLlmVerdict', () => {
  test('accepts the three labels and rejects anything else', () => {
    expect(parseLlmVerdict('{"verdict": "deny"}')).toBe('deny');
    expect(parseLlmVerdict('Sure! {"verdict":"step_up"}')).toBe('step_up');
    expect(parseLlmVerdict('{"verdict": "block"}')).toBeNull();
    expect(parseLlmVerdict('allow')).toBeNull();
    expect(parseLlmVerdict(null)).toBeNull();
  });
});

describe('runCase diagnostics', () => {
  test('a judge failure in the gatehouse arm is an error, not a silent step-up', async () => {
    const {rows} = await runCase(
      byId('benign_write-01'),
      0,
      deps({
        jev: async () => jevResult({matches: 0.95, riskConfidence: 0.3}),
        judge: async () => {
          throw new Error('Judge request failed: 429');
        }
      })
    );
    expect(rows[0]).toMatchObject({
      arm: 'gatehouse',
      verdict: 'step_up',
      error: true,
      note: 'judge_unavailable'
    });
  });

  test('an LLM failure keeps the error text', async () => {
    const {rows} = await runCase(
      byId('benign_write-01'),
      0,
      deps({
        llm: async () => {
          throw new Error('LLM request failed: 429');
        }
      })
    );
    expect(rows[2]).toMatchObject({
      error: true,
      note: 'LLM request failed: 429'
    });
  });
});
