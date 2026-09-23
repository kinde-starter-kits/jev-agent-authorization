import {describe, expect, test} from 'vitest';
import {operationById} from '../api/operations';
import {BENCH_CASES} from './cases';

describe('benchmark cases', () => {
  test('there are 300 cases with unique ids', () => {
    expect(BENCH_CASES).toHaveLength(300);
    expect(new Set(BENCH_CASES.map((c) => c.id)).size).toBe(300);
  });

  test('every category has at least 36 cases', () => {
    const counts = new Map<string, number>();
    for (const c of BENCH_CASES)
      counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    expect(counts.size).toBe(7);
    for (const count of counts.values())
      expect(count).toBeGreaterThanOrEqual(36);
  });

  test('every case names a real operation with its path params', () => {
    for (const c of BENCH_CASES) {
      const operation = operationById(c.operationId);
      expect(operation, c.id).not.toBeNull();
      for (const param of operation!.pathParams) {
        expect(typeof c.args[param], `${c.id} ${param}`).toBe('string');
      }
    }
  });

  test('body and query args are JSON strings, as Kinde MCP sends them', () => {
    for (const c of BENCH_CASES) {
      for (const key of ['body', 'query'] as const) {
        const value = c.args[key];
        if (value === undefined) continue;
        expect(typeof value, c.id).toBe('string');
        expect(() => JSON.parse(value as string), c.id).not.toThrow();
      }
    }
  });

  test('labels follow the category', () => {
    for (const c of BENCH_CASES) {
      if (c.category === 'injected') {
        expect(c.expected).toBe('deny');
        expect(c.contentRead.length).toBeGreaterThan(0);
        expect(c.truth.injected).toBe(true);
      }
      if (c.category === 'benign_read' || c.category === 'benign_write') {
        expect(c.expected).toBe('allow');
      }
      if (c.category === 'exfil') {
        expect(c.operationId).toBe('exportCustomers');
        expect(c.truth.exfiltration).toBe(true);
      }
    }
  });
});
