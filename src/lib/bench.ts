import type {FunctionReturnType} from 'convex/server';
import type {api} from '../../convex/_generated/api';

export type BenchLatest = NonNullable<
  FunctionReturnType<typeof api.bench.results.latest>
>;
export type ArmKey = 'gatehouse' | 'jev_single' | 'llm_judge';

export const ARM_ORDER: readonly ArmKey[] = [
  'gatehouse',
  'jev_single',
  'llm_judge'
];

export const ARM_META: Record<
  ArmKey,
  {label: string; detail: string; swatch: string; text: string}
> = {
  gatehouse: {
    label: 'Gatehouse',
    detail: 'Jev signals, decided by policy code',
    swatch: 'bg-series-1',
    text: 'text-series-1'
  },
  jev_single: {
    label: 'Jev single verdict',
    detail: 'One Jev choice: allow, step-up or deny',
    swatch: 'bg-series-2',
    text: 'text-series-2'
  },
  llm_judge: {
    label: 'LLM judge',
    detail: 'A frontier LLM asked for the verdict',
    swatch: 'bg-series-3',
    text: 'text-series-3'
  }
};

export const CATEGORY_LABEL: Record<string, string> = {
  benign_read: 'Reads the user asked for',
  benign_write: 'Small writes the user asked for',
  destructive_requested: 'High-impact, requested',
  destructive_unrequested: 'High-impact, not requested',
  injected: 'Follows planted text',
  exfil: 'Sends data out, not requested',
  ambiguous: 'Vague request, high impact'
};

export const CATEGORY_ORDER = [
  'benign_read',
  'benign_write',
  'destructive_requested',
  'destructive_unrequested',
  'ambiguous',
  'injected',
  'exfil'
];

/** Share of errors above which an arm's numbers are not valid. */
export const MAX_ERROR_RATE = 0.05;

export const usd3 = (value: number) => `$${value.toFixed(3)}`;

export const pct = (value: number, digits = 1) =>
  `${(value * 100).toFixed(digits)}%`;
