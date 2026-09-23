import {describe, expect, test} from 'vitest';
import {armSummary, calibration, type ResultRow} from './metrics';

function row(overrides: Partial<ResultRow>): ResultRow {
  return {
    caseId: 'c1',
    category: 'injected',
    expected: 'deny',
    arm: 'gatehouse',
    repeat: 0,
    verdict: 'deny',
    ms: 200,
    costUsd: 0.00004,
    error: false,
    parseFailed: false,
    ...overrides
  };
}

describe('armSummary', () => {
  test('false-allow counts allows on cases that should not be allowed', () => {
    const summary = armSummary([
      row({caseId: 'a', verdict: 'deny'}),
      row({caseId: 'b', verdict: 'allow'}),
      row({caseId: 'c', expected: 'step_up', verdict: 'step_up'}),
      row({caseId: 'd', expected: 'step_up', verdict: 'allow'}),
      row({caseId: 'e', expected: 'allow', verdict: 'allow'})
    ]);
    expect(summary.falseAllowRate).toBe(0.5);
    expect(summary.falseBlockRate).toBe(0);
    expect(summary.accuracy).toBeCloseTo(3 / 5);
    expect(summary.confusion.step_up.allow).toBe(1);
  });

  test('false-block counts safe cases that were not allowed', () => {
    const summary = armSummary([
      row({caseId: 'a', expected: 'allow', verdict: 'step_up'}),
      row({caseId: 'b', expected: 'allow', verdict: 'allow'})
    ]);
    expect(summary.falseBlockRate).toBe(0.5);
  });

  test('flip rate counts cases whose repeats disagree', () => {
    const summary = armSummary([
      row({caseId: 'a', repeat: 0, verdict: 'deny'}),
      row({caseId: 'a', repeat: 1, verdict: 'step_up'}),
      row({caseId: 'b', repeat: 0}),
      row({caseId: 'b', repeat: 1})
    ]);
    expect(summary.flipRate).toBe(0.5);
    expect(summary.cases).toBe(2);
  });

  test('latency ignores rows with no model call; cost includes them', () => {
    const summary = armSummary([
      row({caseId: 'a', ms: 0, costUsd: 0}),
      row({caseId: 'b', ms: 100, costUsd: 0.002}),
      row({caseId: 'c', ms: 300, costUsd: 0.002})
    ]);
    expect(summary.p50Ms).toBe(100);
    expect(summary.p95Ms).toBe(300);
    expect(summary.costPer1000Usd).toBeCloseTo((0.004 / 3) * 1000);
  });

  test('errors and parse failures are counted', () => {
    const summary = armSummary([
      row({caseId: 'a', error: true, verdict: 'step_up'}),
      row({caseId: 'b', parseFailed: true, verdict: 'step_up'})
    ]);
    expect(summary.errorRate).toBe(0.5);
    expect(summary.parseFailRate).toBe(0.5);
  });
});

describe('calibration', () => {
  test('a perfectly calibrated signal has zero error', () => {
    const rows = [
      {signal: 'injected' as const, predicted: 0.05, actual: false},
      {signal: 'injected' as const, predicted: 0.95, actual: true}
    ];
    const result = calibration(rows);
    expect(result.points).toHaveLength(2);
    expect(result.ece).toBeCloseTo(0.05);
  });

  test('an overconfident signal shows the gap', () => {
    const rows = Array.from({length: 10}, (_, i) => ({
      signal: 'injected' as const,
      predicted: 0.9,
      actual: i < 5
    }));
    const [point] = calibration(rows).points;
    expect(point).toMatchObject({observed: 0.5, n: 10});
    expect(point?.predicted).toBeCloseTo(0.9);
  });

  test('a probability of 1 lands in the top bin', () => {
    const [point] = calibration([
      {signal: 'injected', predicted: 1, actual: true}
    ]).points;
    expect(point?.low).toBe(0.9);
  });
});
